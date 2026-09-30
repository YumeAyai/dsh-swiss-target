/**
 * CSV rendering for SwissTargetPrediction batches.
 *
 * The columns keep the upstream reference client's ordering (predictions first,
 * `input_smiles` last) and split the service's combined
 * `Known actives (3D/2D)` cell into two numeric columns so a spreadsheet can
 * sort and filter them.
 * @module @yumeayai/dsh-swiss-target/lib/csv
 */

/** The prediction columns, in file order. */
export const CSV_COLUMNS = Object.freeze([
  { header: 'Target', key: 'target' },
  { header: 'Common name', key: 'commonName' },
  { header: 'Uniprot ID', key: 'uniprotId' },
  { header: 'ChEMBL ID', key: 'chemblId' },
  { header: 'Target Class', key: 'targetClass' },
  { header: 'Probability*', key: 'probability' },
  { header: 'Known actives (3D)', key: 'knownActives3d' },
  { header: 'Known actives (2D)', key: 'knownActives2d' },
  { header: 'input_smiles', key: 'inputSmiles' },
  { header: 'submitted_smiles', key: 'submittedSmiles' },
  { header: 'job_id', key: 'jobId' },
])

/**
 * Quote one CSV field when it needs it.
 * @param value - field value; `undefined` and `null` render empty.
 * @returns the encoded field.
 */
export function csvField(value) {
  if (value === undefined || value === null) return ''
  const text = typeof value === 'number' ? String(value) : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * Render rows as a CSV document.
 * @param rows - prediction rows carrying the {@link CSV_COLUMNS} keys.
 * @param options - `bom` prefixes a UTF-8 byte-order mark for Excel.
 * @returns the complete CSV text.
 */
export function toCsv(rows, options = {}) {
  const { bom = true } = options
  const lines = [CSV_COLUMNS.map(column => csvField(column.header)).join(',')]
  for (const row of rows) lines.push(CSV_COLUMNS.map(column => csvField(row?.[column.key])).join(','))
  return `${bom ? '\ufeff' : ''}${lines.join('\r\n')}\r\n`
}
