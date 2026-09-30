/**
 * Batch orchestration: submit every molecule sequentially, poll each job, and
 * assemble one prediction table. Shared by the agent tool and the panel's
 * session command so both callers run one implementation.
 * @module @yumeayai/dsh-swiss-target/lib/batch
 */

import { fetchPrediction, normalizeOrganism, sleep, submitSmiles } from './swiss-api.js'
import { normalizeSubmission } from './smiles.js'

/** Defaults for one batch run. */
export const BATCH_DEFAULTS = Object.freeze({
  organism: 'Homo_sapiens',
  /** Wait per job for the prediction table. */
  timeoutMs: 120_000,
  /** Interval between two polls of the same job. */
  pollIntervalMs: 5_000,
  /** Polite pause between two submissions (the service throttles bursts). */
  delayMs: 2_000,
  /** Hard ceiling on the molecules one call may submit. */
  maxMolecules: 25,
  /** Per-request HTTP budget. */
  requestTimeoutMs: 30_000,
})

/**
 * Turn caller-supplied lines into the submissions the service accepts: drop
 * blanks and comment lines, desalt and neutralise each molecule (see
 * `smiles.js` — the service refuses anything that reads as more than one
 * molecule), drop duplicates by the *submitted* form so a salt and its parent
 * cost one job rather than two, and reject a batch over the ceiling.
 * @param input - strings or an array of strings.
 * @param maxMolecules - hard ceiling.
 * @returns the usable submissions, the unusable lines, and the conversions.
 */
export function prepareSubmissions(input, maxMolecules = BATCH_DEFAULTS.maxMolecules) {
  const raw = Array.isArray(input) ? input : String(input ?? '').split(/\r?\n/)
  const submissions = []
  const invalid = []
  const conversions = []
  const seen = new Set()

  for (const entry of raw) {
    const line = String(entry ?? '').trim()
    if (line === '' || line.startsWith('#')) continue
    const normalized = normalizeSubmission(line)
    if (normalized.error !== '') {
      invalid.push({ input: line, message: normalized.error })
      continue
    }
    if (seen.has(normalized.submitted)) continue
    seen.add(normalized.submitted)
    if (normalized.changed) conversions.push({ input: line, submitted: normalized.submitted, note: normalized.note })
    submissions.push({ input: line, submitted: normalized.submitted, note: normalized.note })
  }

  if (submissions.length === 0 && invalid.length === 0) throw new Error('no SMILES strings were provided')
  if (submissions.length > maxMolecules) {
    throw new Error(`this batch has ${submissions.length} distinct molecules, above the ${maxMolecules}-molecule ceiling; split it into smaller batches`)
  }
  return { submissions, invalid, conversions }
}

/**
 * Normalize a caller-supplied molecule list to the forms that will be
 * submitted. Kept for callers that only need the strings.
 * @param input - strings or an array of strings.
 * @param maxMolecules - hard ceiling.
 * @returns the submitted SMILES strings.
 */
export function normalizeSmilesList(input, maxMolecules = BATCH_DEFAULTS.maxMolecules) {
  return prepareSubmissions(input, maxMolecules).submissions.map(entry => entry.submitted)
}

/**
 * Run one full batch.
 * @param options - molecules plus the batch knobs; see {@link BATCH_DEFAULTS}.
 * @param hooks - optional progress reporter and clock override.
 * @returns the assembled table, the per-molecule ledger, and timing.
 */
export async function runBatch(options = {}, hooks = {}) {
  const {
    smiles: smilesInput,
    organism: organismInput,
    signal,
    ...overrides
  } = options
  const config = { ...BATCH_DEFAULTS, ...definedOnly(overrides) }
  const organism = normalizeOrganism(organismInput ?? config.organism)
  const { submissions, invalid, conversions } = prepareSubmissions(smilesInput, config.maxMolecules)
  const now = hooks.now ?? Date.now

  const startedAt = now()
  const rows = []
  const molecules = []
  const errors = invalid.map(entry => ({ smiles: entry.input, message: entry.message }))

  for (const [index, submission] of submissions.entries()) {
    hooks.onMolecule?.({ index: index + 1, total: submissions.length, smiles: submission.input })
    if (signal?.aborted === true) throw signal.reason ?? new Error('aborted')
    try {
      const jobId = await submitSmiles(submission.submitted, {
        organism,
        signal,
        requestTimeoutMs: config.requestTimeoutMs,
      })
      hooks.onJob?.({ index: index + 1, total: submissions.length, smiles: submission.input, jobId })
      const predictions = await fetchPrediction(jobId, {
        organism,
        signal,
        timeoutMs: config.timeoutMs,
        pollIntervalMs: config.pollIntervalMs,
        requestTimeoutMs: config.requestTimeoutMs,
        onProgress: progress => hooks.onPoll?.({ ...progress, smiles: submission.input, index: index + 1 }),
      })
      for (const row of predictions) rows.push({ ...row, inputSmiles: submission.input, submittedSmiles: submission.submitted, jobId })
      molecules.push({ smiles: submission.input, submitted: submission.submitted, note: submission.note, jobId, predictions: predictions.length })
    } catch (error) {
      const message = error?.message ?? String(error)
      errors.push({ smiles: submission.input, message })
      molecules.push({ smiles: submission.input, submitted: submission.submitted, note: submission.note, jobId: null, predictions: 0, error: message })
    }
    if (index < submissions.length - 1) await sleep(config.delayMs, signal)
  }

  return {
    organism,
    requested: submissions.length,
    succeeded: molecules.filter(entry => entry.error === undefined).length,
    failed: errors.length,
    rows,
    molecules,
    errors,
    conversions,
    elapsedMs: now() - startedAt,
  }
}

/** Drop keys whose value is `undefined` so defaults survive a spread. */
function definedOnly(source) {
  const result = {}
  for (const [key, value] of Object.entries(source)) if (value !== undefined) result[key] = value
  return result
}
