/**
 * SwissTargetPrediction batch client — Host half.
 *
 * Registers one model-facing tool (`swiss_target_batch`) and one human session
 * command (`/swiss`) over a single implementation, so the agent and the Web
 * panel exercise the same code path. Unofficial client of the public
 * SwissTargetPrediction web service; predictions and data belong to the Swiss
 * Institute of Bioinformatics.
 *
 * Two rules this file lives by, learned the hard way:
 *
 * - **Nothing here imports `@deepseek-ai/*`.** A bundle installed into a profile
 *   cannot resolve those specifiers at runtime; the row then fails to activate
 *   with `failed to import` and nothing about it reaches the terminal — the
 *   bundle looks installed and does nothing. The tool is therefore defined
 *   against the registry's public contract, by hand.
 * - **The host keeps the module generation it loaded.** Re-installing or
 *   toggling the row re-runs `apply()` but does not re-evaluate this file, so a
 *   change here needs a Harness restart before it is live. (The browser half,
 *   `client.js`, is served per boot payload: a page reload picks it up.)
 * @module @yumeayai/dsh-swiss-target
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import { BATCH_DEFAULTS, runBatch } from './lib/batch.js'
import { toCsv } from './lib/csv.js'
import { ORGANISMS } from './lib/swiss-api.js'

/** Plugin identity. */
export const name = 'swiss-target-batch'

/** Required services: the tool registry. The command registry stays optional. */
export const inject = ['tools']

/** Marker separating the human summary from the panel's JSON payload. */
const RESULT_MARKER = '__SWISS_RESULT__'

/** Default CSV file name inside the session workspace. */
const DEFAULT_CSV_NAME = 'swiss_target_results.csv'

/** The session command that drives the Web panel. */
const COMMAND_NAME = 'swiss'

/** The options this client accepts, as written in documentation and errors. */
const ACCEPTED_OPTIONS = ['smiles', 'organism', 'outputCsv', 'timeoutSeconds', 'pollIntervalSeconds', 'delaySeconds', 'maxMolecules']

/** Normalized lookup set of {@link ACCEPTED_OPTIONS}. */
const KNOWN_OPTIONS = new Set(ACCEPTED_OPTIONS.map(normalizeOptionName))

/**
 * Option-looking names that must never be read as a molecule line: the accepted
 * options plus the query flags this client is most often asked for and does not
 * have, so `/swiss topN=25` explains itself instead of submitting `topN=25` as a
 * SMILES string.
 */
const OPTION_LINE_NAMES = new Set([...KNOWN_OPTIONS, 'minprobability', 'topn', 'probability', 'topprobability', 'limit'])

/** Fold snake_case, kebab-case and camelCase spellings onto one comparison key. */
function normalizeOptionName(name) {
  return String(name).toLowerCase().replace(/[_-]/g, '')
}

const TOOL_DESCRIPTION = [
  'Predict protein targets of small molecules with the SwissTargetPrediction web service, in batch.',
  'Submit one SMILES per molecule, wait for each prediction job, and return the predicted targets with UniProt and ChEMBL ids, target class, probability, and the number of known actives (3D/2D).',
  'Use it for target fishing and off-target hypotheses; results are predictions, not experimental evidence.',
  'The service refuses anything that reads as more than one molecule, so salt forms are converted before submission: counter-ions (chloride, sodium, potassium, …) are dropped, the largest fragment is kept from a mixture, and simple charges are neutralised; every change is reported back.',
  `The service returns at most its top 100 targets per molecule and throttles bursts, so one call submits at most ${BATCH_DEFAULTS.maxMolecules} molecules with a polite delay in between.`,
  `Results are also written to a CSV in the session workspace (default ${DEFAULT_CSV_NAME}).`,
].join(' ')

/**
 * Model-facing parameters as standard JSON Schema, the dialect the tool
 * registry enforces (`type`/`properties`/`required`/`items`/`enum` plus
 * annotations). Written by hand because `@deepseek-ai/dsh-tools` cannot be
 * imported from a profile bundle — see the module note above.
 */
const TOOL_PARAMETERS = {
  type: 'object',
  properties: {
    smiles: {
      type: 'array',
      items: { type: 'string' },
      description: 'SMILES strings, one per molecule. Split large sets into several calls.',
    },
    organism: {
      type: 'string',
      enum: [...ORGANISMS],
      description: `Organism whose proteome is searched; default ${BATCH_DEFAULTS.organism}.`,
    },
    output_csv: {
      type: 'string',
      description: `CSV destination, relative to the session workspace or absolute; default ${DEFAULT_CSV_NAME}.`,
    },
    timeout_seconds: {
      type: 'number',
      description: `Seconds to wait for one molecule's prediction; default ${BATCH_DEFAULTS.timeoutMs / 1000}.`,
    },
    poll_interval_seconds: {
      type: 'number',
      description: `Seconds between two polls of the same job; default ${BATCH_DEFAULTS.pollIntervalMs / 1000}.`,
    },
    delay_seconds: {
      type: 'number',
      description: `Polite pause between two submissions; default ${BATCH_DEFAULTS.delayMs / 1000}. Do not set 0.`,
    },
  },
  required: ['smiles'],
}

/** One prediction row in the canonical output value. */
const OUTPUT_ROW = {
  type: 'object',
  additionalProperties: false,
  properties: {
    target: { type: 'string' },
    commonName: { type: 'string' },
    uniprotId: { type: 'string' },
    chemblId: { type: 'string' },
    targetClass: { type: 'string' },
    probability: { type: 'number' },
    knownActives3d: { type: 'integer' },
    knownActives2d: { type: 'integer' },
    inputSmiles: { type: 'string' },
    submittedSmiles: { type: 'string' },
    jobId: { type: 'string' },
  },
  required: ['target', 'commonName', 'uniprotId', 'chemblId', 'targetClass', 'probability', 'knownActives3d', 'knownActives2d', 'inputSmiles', 'submittedSmiles', 'jobId'],
}

/** One per-molecule ledger entry in the canonical output value. */
const OUTPUT_MOLECULE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    smiles: { type: 'string' },
    submitted: { type: 'string' },
    note: { type: 'string' },
    jobId: { type: 'string' },
    predictions: { type: 'integer' },
    error: { type: 'string' },
  },
  required: ['smiles', 'submitted', 'note', 'jobId', 'predictions', 'error'],
}

/** One SMILES the client rewrote before submission. */
const OUTPUT_CONVERSION = {
  type: 'object',
  additionalProperties: false,
  properties: {
    input: { type: 'string' },
    submitted: { type: 'string' },
    note: { type: 'string' },
  },
  required: ['input', 'submitted', 'note'],
}

/** One failed molecule in the canonical output value. */
const OUTPUT_ERROR = {
  type: 'object',
  additionalProperties: false,
  properties: {
    smiles: { type: 'string' },
    message: { type: 'string' },
  },
  required: ['smiles', 'message'],
}

/** The canonical value {@link executeBatch} returns. */
const TOOL_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    organism: { type: 'string' },
    requested: { type: 'integer' },
    succeeded: { type: 'integer' },
    failed: { type: 'integer' },
    elapsedMs: { type: 'integer' },
    csvPath: { type: 'string' },
    csvError: { type: 'string' },
    rows: { type: 'array', items: OUTPUT_ROW },
    molecules: { type: 'array', items: OUTPUT_MOLECULE },
    errors: { type: 'array', items: OUTPUT_ERROR },
    conversions: { type: 'array', items: OUTPUT_CONVERSION },
  },
  required: ['organism', 'requested', 'succeeded', 'failed', 'elapsedMs', 'csvPath', 'csvError', 'rows', 'molecules', 'errors', 'conversions'],
}

/** The model-facing tool definition. */
const SWISS_TARGET_TOOL = {
  name: 'swiss_target_batch',
  description: TOOL_DESCRIPTION,
  parameters: TOOL_PARAMETERS,
  output: {
    schema: TOOL_OUTPUT_SCHEMA,
    render: (_args, value) => [{ type: 'text', text: renderReport(value) }],
  },
  async execute(args, exec) {
    const outcome = await executeBatch(requestFrom(args ?? {}), exec)
    return outcome.value
  },
  presentCall: args => ({
    card: 'generic',
    title: `SwissTargetPrediction: ${Array.isArray(args?.smiles) ? args.smiles.length : 0} molecule(s)`,
    kind: 'read',
    rawInput: args?.smiles,
  }),
}

/**
 * Activate the plugin on a context carrying the tool registry.
 * @param ctx - registrant context.
 */
export function apply(ctx) {
  registerSwissTarget(ctx)
}

/**
 * Register the tool and, when the command registry is composed, the session
 * command that drives the panel.
 * @param ctx - registrant context.
 */
function registerSwissTarget(ctx) {
  ctx.tools.register(SWISS_TARGET_TOOL)

  // The Web panel drives the same implementation through a session command,
  // whose result text carries the structured payload back to the browser.
  ctx.inject(['commands'], (scope) => {
    scope.commands.register({
      name: COMMAND_NAME,
      description: 'Predict protein targets for SMILES with SwissTargetPrediction and show them in the SwissTarget panel',
      input: { hint: '<SMILES per line> | {"smiles":["CCO"],"organism":"Homo_sapiens"}' },
      handler: async (invocation) => {
        let request
        try {
          request = parseCommandInput(invocation.rawInput)
        } catch (error) {
          return { kind: 'error', text: `${error?.message ?? error}` }
        }
        const outcome = await executeBatch(request, invocation)
        const payload = JSON.stringify(outcome.value)
        const failed = outcome.value.succeeded === 0 && outcome.value.failed > 0
        return { kind: failed ? 'error' : 'success', text: `${renderSummary(outcome.value)}\n${RESULT_MARKER}${payload}` }
      },
    })
  })
}

/**
 * Run one batch and persist its CSV.
 * @param request - normalized batch request.
 * @param exec - tool execution or command invocation supplying the session and signal.
 * @returns the canonical output value plus its report.
 */
async function executeBatch(request, exec) {
  const cwd = exec?.agent?.session?.header?.cwd
  const batch = await runBatch({ ...request, signal: exec?.signal }, {})
  const csv = await writeCsv(batch.rows, resolveCsvPath(request.outputCsv, cwd))
  const value = {
    organism: batch.organism,
    requested: batch.requested,
    succeeded: batch.succeeded,
    failed: batch.failed,
    elapsedMs: Math.round(batch.elapsedMs),
    csvPath: csv.path,
    csvError: csv.error,
    rows: batch.rows.map(row => ({
      target: row.target,
      commonName: row.commonName,
      uniprotId: row.uniprotId,
      chemblId: row.chemblId,
      targetClass: row.targetClass,
      probability: row.probability,
      knownActives3d: row.knownActives3d ?? 0,
      knownActives2d: row.knownActives2d ?? 0,
      inputSmiles: row.inputSmiles,
      submittedSmiles: row.submittedSmiles ?? row.inputSmiles,
      jobId: row.jobId,
    })),
    molecules: batch.molecules.map(entry => ({
      smiles: entry.smiles,
      submitted: entry.submitted ?? entry.smiles,
      note: entry.note ?? '',
      jobId: entry.jobId ?? '',
      predictions: entry.predictions,
      error: entry.error ?? '',
    })),
    errors: batch.errors.map(entry => ({ smiles: entry.smiles, message: entry.message })),
    conversions: (batch.conversions ?? []).map(entry => ({ input: entry.input, submitted: entry.submitted, note: entry.note ?? '' })),
  }
  return { value, text: renderReport(value) }
}

/**
 * Read the panel's command grammar: either a JSON payload or raw SMILES lines.
 * @param rawInput - everything after `/swiss `.
 * @returns a normalized batch request.
 */
export function parseCommandInput(rawInput) {
  const text = String(rawInput ?? '').trim()
  if (text === '') {
    throw new Error(`usage: /${COMMAND_NAME} <SMILES per line>, or /${COMMAND_NAME} {"smiles":["CCO"],"organism":"Homo_sapiens"}`)
  }
  if (!text.startsWith('{')) {
    // Plain text is SMILES lines. A recognized `option=value` line is a user
    // reaching for a query option: this client has none beyond the organism and
    // the timing knobs, and submitting it as a molecule produces a confusing
    // service-side refusal. Only known option names are matched, so a SMILES
    // like `CN1C=NC2=C1C(=O)N(C(=O)N2C)C` is never mistaken for one.
    const line = text.split(/\r?\n/).map(entry => entry.trim()).find(entry => {
      const match = /^([A-Za-z][A-Za-z0-9_-]*)\s*=/.exec(entry)
      return match !== null && OPTION_LINE_NAMES.has(normalizeOptionName(match[1]))
    })
    if (line !== undefined) {
      throw new Error(`/${COMMAND_NAME} takes SMILES lines, not options — "${line}" is not a molecule. SwissTargetPrediction exposes no probability, top-N, or other query flag: the service answers with its own top 100 targets per molecule. Options travel only in the JSON payload ({"smiles":["CCO"],"organism":"Homo_sapiens"}).`)
    }
    return { smiles: text.split(/\r?\n/) }
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(`the /${COMMAND_NAME} JSON payload is malformed: ${error?.message ?? error}`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`the /${COMMAND_NAME} payload must be a JSON object with a "smiles" array`)
  }
  return requestFrom(parsed)
}

/**
 * Normalize a request that may spell its options in snake_case (tool arguments)
 * or camelCase (the panel's payload). Unknown options are rejected rather than
 * ignored, so a caller that reaches for a SwissTargetPrediction query flag this
 * client does not have learns that instead of believing it filtered something.
 * @param source - raw request fields.
 * @returns a normalized batch request.
 */
export function requestFrom(source = {}) {
  const unknown = Object.keys(source).filter(key => !KNOWN_OPTIONS.has(normalizeOptionName(key)))
  if (unknown.length > 0) {
    throw new Error(`unknown option${unknown.length > 1 ? 's' : ''} ${unknown.map(key => JSON.stringify(key)).join(', ')}; this client accepts ${ACCEPTED_OPTIONS.join(', ')} — SwissTargetPrediction has no probability, top-N, or other query flag`)
  }
  const pick = (...names) => {
    for (const candidate of names) if (source[candidate] !== undefined && source[candidate] !== null && source[candidate] !== '') return source[candidate]
    return undefined
  }
  const number = (value, label) => {
    if (value === undefined) return undefined
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative number`)
    return parsed
  }
  const seconds = (value, label) => {
    const parsed = number(value, label)
    return parsed === undefined ? undefined : parsed * 1000
  }
  const smiles = pick('smiles', 'smilesText', 'smiles_text')
  const maxMolecules = number(pick('maxMolecules', 'max_molecules'), 'maxMolecules')
  return {
    smiles: typeof smiles === 'string' ? smiles.split(/\r?\n/) : smiles,
    organism: pick('organism'),
    outputCsv: pick('outputCsv', 'output_csv'),
    timeoutMs: seconds(pick('timeoutSeconds', 'timeout_seconds'), 'timeoutSeconds'),
    pollIntervalMs: seconds(pick('pollIntervalSeconds', 'poll_interval_seconds'), 'pollIntervalSeconds'),
    delayMs: seconds(pick('delaySeconds', 'delay_seconds'), 'delaySeconds'),
    maxMolecules,
  }
}

/**
 * Resolve the CSV destination for one batch.
 * @param requested - caller-supplied path, if any.
 * @param cwd - session workspace.
 * @returns an absolute path.
 */
function resolveCsvPath(requested, cwd) {
  const name = typeof requested === 'string' && requested.trim() !== '' ? requested.trim() : DEFAULT_CSV_NAME
  if (isAbsolute(name)) return name
  return resolve(cwd ?? process.cwd(), name)
}

/**
 * Write the batch to CSV, reporting failure instead of failing the call: the
 * predictions are the result, the file is a convenience.
 * @param rows - prediction rows.
 * @param path - absolute destination.
 * @returns the written path, or the failure reason.
 */
async function writeCsv(rows, path) {
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, toCsv(rows), 'utf8')
    return { path, error: '' }
  } catch (error) {
    return { path: '', error: `${path}: ${error?.message ?? error}` }
  }
}

/** The one-line batch summary shared by both callers. */
export function renderSummary(value) {
  const seconds = (value.elapsedMs / 1000).toFixed(1)
  const parts = [
    `SwissTargetPrediction · ${value.organism}`,
    `${value.succeeded}/${value.requested} molecule(s)`,
    `${value.rows.length} prediction(s)`,
    `${seconds}s`,
  ]
  if (value.csvPath !== '') parts.push(`CSV: ${value.csvPath}`)
  if (value.csvError !== '') parts.push(`CSV failed: ${value.csvError}`)
  return parts.join(' · ')
}

/**
 * The model-facing report: the summary, every prediction, and the failures.
 * @param value - canonical tool output.
 * @returns the rendered text.
 */
export function renderReport(value) {
  const lines = [renderSummary(value)]
  const conversions = value.conversions ?? []
  if (conversions.length > 0) {
    lines.push('', 'Rewritten for submission (the service accepts one molecule per query):')
    for (const entry of conversions) lines.push(`- ${entry.input} → ${entry.submitted}${entry.note === '' ? '' : ` (${entry.note})`}`)
  }
  if (value.rows.length > 0) lines.push('', 'Target | Common name | UniProt | ChEMBL | Class | Probability | Actives 3D/2D | input_smiles')
  for (const row of value.rows) {
    lines.push([
      row.target,
      row.commonName,
      row.uniprotId,
      row.chemblId,
      row.targetClass,
      row.probability,
      `${row.knownActives3d}/${row.knownActives2d}`,
      row.inputSmiles,
    ].join(' | '))
  }
  if (value.errors.length > 0) {
    lines.push('', 'Failed molecules:')
    for (const error of value.errors) lines.push(`- ${error.smiles}: ${error.message}`)
  }
  return lines.join('\n')
}
