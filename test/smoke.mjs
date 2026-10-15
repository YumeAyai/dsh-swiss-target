/**
 * Offline smoke test: no network, no dependencies, no framework.
 *
 * It pins the contracts the plugin is published under — the tool surface the
 * model sees, the SMILES conversions the service requires, the CSV columns — so a
 * broken description or a regressed desalter fails the pipeline instead of the
 * user. Run with `npm test` or `node test/smoke.mjs`.
 */
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const plugin = await import(join(root, 'index.js'))
const { normalizeSubmission, isCounterIon } = await import(join(root, 'lib/smiles.js'))
const { prepareSubmissions } = await import(join(root, 'lib/batch.js'))
const { toCsv, CSV_COLUMNS } = await import(join(root, 'lib/csv.js'))

let tool
let command
plugin.apply({
  tools: { register: definition => { tool = definition } },
  inject: (names, callback) => { if (names.includes('commands')) callback({ commands: { register: definition => { command = definition } } }) },
})

const check = (name, body) => {
  try {
    body()
    console.log(`ok   ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}: ${error.message}`)
    process.exitCode = 1
  }
}

check('plugin identity and injection', () => {
  assert.equal(plugin.name, 'swiss-target-batch')
  assert.deepEqual(plugin.inject, ['tools'])
})

check('tool surface is exactly the documented options', () => {
  assert.equal(tool.name, 'swiss_target_batch')
  assert.deepEqual(Object.keys(tool.parameters.properties).sort(),
    ['delay_seconds', 'organism', 'output_csv', 'poll_interval_seconds', 'smiles', 'timeout_seconds'])
  assert.deepEqual(tool.parameters.required, ['smiles'])
  assert.equal(typeof tool.output.render, 'function')
  assert.deepEqual(tool.output.schema.required.sort(),
    ['conversions', 'csvError', 'csvPath', 'elapsedMs', 'errors', 'failed', 'molecules', 'organism', 'requested', 'rows', 'succeeded'])
})

check('the description claims the client and names the throttle remedy', () => {
  const text = tool.description
  assert.ok(text.includes('is the SwissTargetPrediction client'), 'must claim the tool is the client')
  assert.ok(text.includes('Do not reproduce it yourself'), 'must forbid hand-rolled HTTP/browser work')
  assert.ok(text.includes('wait about a minute, and call this tool again'), 'must say what to do when throttled')
})

check('unknown query flags are rejected, real SMILES are not', () => {
  assert.throws(() => plugin.requestFrom({ smiles: ['CCO'], top_n: 5 }), /unknown option/)
  assert.throws(() => plugin.requestFrom({ smiles: ['CCO'], minProbability: 0.5 }), /unknown option/)
  assert.deepEqual(plugin.requestFrom({ smiles: ['CCO'], organism: 'Mus_musculus' }).smiles, ['CCO'])
  // a SMILES that merely contains "=" must survive the option-line guard
  assert.deepEqual(plugin.parseCommandInput('CC(=O)OC1=CC=CC=C1C(=O)O\nCN1C=NC2=C1C(=O)N(C(=O)N2C)C').smiles,
    ['CC(=O)OC1=CC=CC=C1C(=O)O', 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C'])
  assert.throws(() => plugin.parseCommandInput('topN=25'), /takes SMILES lines, not options/)
})

check('desalting and neutralisation', () => {
  const cases = [
    ['CC(=O)Oc1ccccc1C(=O)O', 'CC(=O)Oc1ccccc1C(=O)O', false],
    ['[Cl-].CC(=O)Oc1ccccc1C(=O)O', 'CC(=O)Oc1ccccc1C(=O)O', true],
    ['CN(C)CCOC(c1ccccc1)c1ccccc1.Cl', 'CN(C)CCOC(c1ccccc1)c1ccccc1', true],
    ['CC(=O)[O-].[Na+]', 'CC(=O)O', true],
    ['[Na+].[O-]C(=O)c1ccccc1O', 'OC(=O)c1ccccc1O', true],
    ['[NH3+]CC(=O)[O-]', 'NCC(=O)O', true],
    ['c1cc[nH+]cc1', 'c1ccncc1', true],
    // a quaternary ammonium keeps its charge: there is no hydrogen to lose
    ['C[N+](C)(C)CCOC(c1ccccc1)c1ccccc1.[Cl-]', 'C[N+](C)(C)CCOC(c1ccccc1)c1ccccc1', true],
    // a nitro group must block the oxygen neutralisation
    ['O=C([O-])c1ccccc1[N+](=O)[O-].[Na+]', 'O=C([O-])c1ccccc1[N+](=O)[O-]', true],
    ['  "CCO" \n', 'CCO', true],
  ]
  for (const [input, expected, changed] of cases) {
    const result = normalizeSubmission(input)
    assert.equal(result.submitted, expected, `${input} -> ${result.submitted}`)
    assert.equal(result.changed, changed, `${input} changed flag`)
    assert.equal(result.error, '', `${input} error`)
  }
  // an all-ion line is not a batch error: it becomes a per-molecule failure with its reason
  const allIons = prepareSubmissions(['[Na+].[Cl-]'])
  assert.deepEqual(allIons.submissions, [])
  assert.match(allIons.invalid[0].message, /counter-ion/)
  assert.match(normalizeSubmission('[Na+].[Cl-]').error, /counter-ion/)
  assert.equal(isCounterIon('[NH4+]'), true)
  assert.equal(isCounterIon('CC(=O)[O-]'), false)
})

check('batching dedupes by the submitted form', () => {
  const prepared = prepareSubmissions(['[Cl-].CC(=O)Oc1ccccc1C(=O)O', 'CC(=O)Oc1ccccc1C(=O)O', 'CC(=O)[O-].[Na+]'], 25)
  assert.deepEqual(prepared.submissions.map(s => s.submitted), ['CC(=O)Oc1ccccc1C(=O)O', 'CC(=O)O'])
  assert.equal(prepared.conversions.length, 2)
  assert.throws(() => prepareSubmissions(['CCO', 'CCC'], 1), /ceiling/)
})

check('csv carries input and submitted smiles', () => {
  const headers = CSV_COLUMNS.map(c => c.header)
  assert.ok(headers.includes('input_smiles') && headers.includes('submitted_smiles'))
  const line = toCsv([{ target: 'a,b', inputSmiles: 'CCO', submittedSmiles: 'CCO', probability: 1 }]).split('\r\n')[1]
  assert.ok(line.startsWith('"a,b"'), 'fields with commas are quoted')
})

check('the command handler reports usage errors as errors', async () => {
  const result = await command.handler({ rawInput: '', agent: { session: { header: { cwd: '/tmp' } } }, signal: undefined })
  assert.equal(result.kind, 'error')
  assert.ok(result.text.includes('usage:'))
})

check('published files exist', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert.equal(manifest.private, undefined, 'private blocks npm publish')
  assert.equal(manifest.publishConfig?.access, 'public')
  assert.ok(manifest.repository?.url?.includes('dsh-swiss-target'))
  assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh?.client?.platform, 'web')
})

if (process.exitCode === 1) console.error('\nsmoke test failed')
else console.log('\nsmoke test passed')
