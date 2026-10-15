/**
 * Dependency-free HTTP client for the SwissTargetPrediction web service.
 *
 * The service has no documented API: a browser posts a SMILES string to
 * `predict.php`, the response carries the minted `job` id, and `result.php`
 * renders the prediction table once the job has been computed. This module
 * performs exactly that conversation and parses the rendered table, which is
 * the same strategy the reference `swiss_target_batch.py` client used.
 *
 * The submission request is rejected unless it carries the browser-ish
 * `Origin`/`Referer`/`User-Agent` headers, so they are not decorative.
 * @module @yumeayai/dsh-swiss-target/lib/swiss-api
 */

/** Organisms the service accepts. */
export const ORGANISMS = Object.freeze(['Homo_sapiens', 'Mus_musculus', 'Rattus_norvegicus'])

/** Default organism when a caller names none. */
export const DEFAULT_ORGANISM = 'Homo_sapiens'

const BASE_URL = 'https://www.swisstargetprediction.ch'
const PREDICT_URL = `${BASE_URL}/predict.php`
const RESULT_URL = `${BASE_URL}/result.php`

/** Headers the service expects on both the submission and the result fetch. */
const BROWSER_HEADERS = Object.freeze({
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: BASE_URL,
  Referer: `${BASE_URL}/`,
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
})

/** Markers the service renders while a job is still queued or running. */
const PENDING_MARKERS = [
  'Calculations can take up to one minute',
  'Target prediction has been submitted',
]

/**
 * Attempts to mint a job for one molecule. The service answers a burst
 * submission with its jobless template page instead of an error, so a missing
 * job id is retried before it is reported as a refusal.
 */
const SUBMIT_ATTEMPTS = 3
/** Pause between two submission attempts of the same molecule. */
const SUBMIT_RETRY_MS = 10_000

/** Raised for a service-side refusal, a malformed response, or a timeout. */
export class SwissTargetError extends Error {
  /**
   * @param message - human-readable reason.
   * @param options - optional `cause`, plus the raw service excerpt.
   */
  constructor(message, options = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'SwissTargetError'
    this.excerpt = options.excerpt
  }
}

/**
 * Normalize an organism name, rejecting values the service does not accept.
 * @param value - candidate organism; `undefined` selects the default.
 * @returns one of {@link ORGANISMS}.
 */
export function normalizeOrganism(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_ORGANISM
  const text = String(value).trim()
  const match = ORGANISMS.find(organism => organism.toLowerCase() === text.toLowerCase())
  if (match === undefined) {
    throw new SwissTargetError(`unsupported organism ${JSON.stringify(String(value))}; expected one of: ${ORGANISMS.join(', ')}`)
  }
  return match
}

/**
 * Combine the caller's cancellation signal with one request's own deadline.
 * @param signal - caller-owned signal, when any.
 * @param timeoutMs - per-request budget in milliseconds.
 * @returns a signal aborted by either source.
 */
function deadlineSignal(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout])
}

/**
 * Strip tags and decode entities from one HTML fragment.
 * @param html - raw fragment.
 * @returns the collapsed plain text.
 */
export function textOf(html) {
  return decodeEntities(
    String(html)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

const NAMED_ENTITIES = Object.freeze({
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
  times: '\u00d7',
  deg: '\u00b0',
})

/**
 * Decode the HTML entities the service actually emits.
 * @param text - text containing entities.
 * @returns decoded text.
 */
export function decodeEntities(text) {
  return String(text).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    const named = NAMED_ENTITIES[body.toLowerCase()]
    return named === undefined ? whole : named
  })
}

/** Split one `<tr>` fragment into its cleaned `<td>`/`<th>` cells. */
function cellsOf(rowHtml) {
  const cells = []
  const cellRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi
  let match
  while ((match = cellRe.exec(rowHtml)) !== null) cells.push(textOf(match[1]))
  return cells
}

/**
 * Parse `"13 / 7"` into its two known-active counts. A cell the service left
 * empty counts as zero so every row keeps one shape.
 */
function parseKnownActives(text) {
  const match = /(\d+)\s*\/\s*(\d+)/.exec(text)
  if (match === null) return { knownActives3d: 0, knownActives2d: 0 }
  return { knownActives3d: Number(match[1]), knownActives2d: Number(match[2]) }
}

/**
 * Parse the prediction table out of a result page.
 * @param html - the full `result.php` document.
 * @returns the parsed rows, or `undefined` when the page carries no table yet.
 */
export function parseResultRows(html) {
  const start = /<table\b[^>]*id\s*=\s*["']?resultTable["']?/i.exec(html)
  if (start === null) return undefined
  const tableStart = html.lastIndexOf('<table', start.index)
  const tableEnd = html.indexOf('</table>', start.index)
  const table = html.slice(tableStart === -1 ? start.index : tableStart, tableEnd === -1 ? html.length : tableEnd)

  const rows = []
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
  let match
  while ((match = rowRe.exec(table)) !== null) {
    const cells = cellsOf(match[1])
    if (cells.length === 0) continue
    rows.push(cells)
  }
  if (rows.length === 0) return []

  // The service emits a `<thead>` header row; drop it before mapping data rows.
  const first = rows[0]
  const dataRows = first.some(cell => /^target$/i.test(cell)) || first.length !== 7 ? rows.slice(1) : rows

  return dataRows.map((cells) => {
    const [target = '', commonName = '', uniprotId = '', chemblId = '', targetClass = '', probability = '', knownActives = ''] = cells
    const parsedProbability = Number.parseFloat(probability)
    return {
      target,
      commonName,
      uniprotId,
      chemblId,
      targetClass,
      probability: Number.isFinite(parsedProbability) ? parsedProbability : 0,
      ...parseKnownActives(knownActives),
    }
  })
}

/** A short, human-readable excerpt of a service document, for diagnostics. */
function excerptOf(html) {
  const text = textOf(html)
  return text.length > 400 ? `${text.slice(0, 400)}\u2026` : text
}

/**
 * Describe a failed request with the underlying transport cause. Node's `fetch`
 * reports a bare `fetch failed` and hides the useful part (ENOTFOUND, ECONNRESET,
 * ETIMEDOUT, a TLS error) in `error.cause`, which is exactly what a user needs to
 * tell a flaky network from a broken host.
 * @param error - the thrown fetch error.
 * @returns one line naming the cause when it carries one.
 */
export function describeFetchError(error) {
  const cause = error?.cause
  const code = cause?.code ?? cause?.errno
  const detail = cause?.message ?? error?.message ?? String(error)
  return code === undefined || String(detail).includes(String(code)) ? String(detail) : `${code}: ${detail}`
}

/**
 * Submit one SMILES string and return the minted job id.
 *
 * The service's success page carries the job id inside a
 * `location.replace("…result.php?job=N…")` script (the browser-side handoff),
 * so the body is searched for it as well as the final URL. Two transient
 * answers are retried rather than reported as a rejected molecule: a jobless
 * page (the service throttles bursts) and a failed request (a network blip),
 * which otherwise kills a molecule on a one-second outage.
 * @param smiles - the molecule to submit.
 * @param options - organism, cancellation, request timeout, and fetch override.
 * @returns the numeric job id as a string.
 */
export async function submitSmiles(smiles, options = {}) {
  const {
    organism = DEFAULT_ORGANISM,
    signal,
    requestTimeoutMs = 30_000,
    fetchImpl = globalThis.fetch,
  } = options

  const body = new URLSearchParams({
    organism: normalizeOrganism(organism),
    smiles: String(smiles),
    Example: '',
    ioi: '2',
  })

  let excerpt = ''
  let lastReason = ''
  for (let attempt = 1; attempt <= SUBMIT_ATTEMPTS; attempt += 1) {
    let response
    try {
      response = await fetchImpl(PREDICT_URL, {
        method: 'POST',
        headers: { ...BROWSER_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        redirect: 'follow',
        signal: deadlineSignal(signal, requestTimeoutMs),
      })
    } catch (error) {
      if (signal?.aborted === true) throw error
      lastReason = `the request failed (${describeFetchError(error)})`
      if (attempt < SUBMIT_ATTEMPTS) {
        await sleep(SUBMIT_RETRY_MS, signal)
        continue
      }
      throw new SwissTargetError(`submission failed after ${SUBMIT_ATTEMPTS} attempts — ${lastReason}`, { cause: error })
    }

    const html = await response.text().catch(() => '')
    if (!response.ok) {
      lastReason = `HTTP ${response.status}`
      excerpt = excerptOf(html)
      if (response.status >= 500 && attempt < SUBMIT_ATTEMPTS) {
        await sleep(SUBMIT_RETRY_MS, signal)
        continue
      }
      throw new SwissTargetError(`submission failed: HTTP ${response.status}`, { excerpt })
    }

    const fromUrl = /job=(\d+)/.exec(response.url ?? '')
    const fromBody = /job=(\d+)/.exec(html)
    const jobId = (fromUrl ?? fromBody)?.[1]
    if (jobId !== undefined) return jobId

    excerpt = excerptOf(html)
    lastReason = 'the answer carried no job id'
    if (attempt < SUBMIT_ATTEMPTS) await sleep(SUBMIT_RETRY_MS, signal)
  }

  throw new SwissTargetError(
    `no prediction job after ${SUBMIT_ATTEMPTS} attempts (last answer: ${lastReason}) — SwissTargetPrediction throttles bursts per address, so wait about a minute, send no other request to the site meanwhile, and retry. Only if the retry fails too is the SMILES itself the problem.`,
    { excerpt },
  )
}

/**
 * Poll one job until its result table exists.
 * @param jobId - the job id {@link submitSmiles} returned.
 * @param options - organism, cancellation, deadline, poll interval, progress hook.
 * @returns the parsed prediction rows (possibly empty).
 */
export async function fetchPrediction(jobId, options = {}) {
  const {
    organism = DEFAULT_ORGANISM,
    signal,
    timeoutMs = 120_000,
    pollIntervalMs = 5_000,
    requestTimeoutMs = 30_000,
    fetchImpl = globalThis.fetch,
    onProgress,
  } = options

  const resolvedOrganism = normalizeOrganism(organism)
  const url = `${RESULT_URL}?job=${encodeURIComponent(jobId)}&organism=${encodeURIComponent(resolvedOrganism)}`
  const deadline = Date.now() + timeoutMs
  let attempt = 0
  let lastExcerpt = ''

  for (;;) {
    attempt += 1
    let html = ''
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: BROWSER_HEADERS,
        redirect: 'follow',
        signal: deadlineSignal(signal, requestTimeoutMs),
      })
      html = await response.text().catch(() => '')
      if (response.ok) {
        const rows = parseResultRows(html)
        if (rows !== undefined) return rows
        lastExcerpt = excerptOf(html)
      } else {
        lastExcerpt = `HTTP ${response.status}: ${excerptOf(html)}`
      }
    } catch (error) {
      if (signal?.aborted === true) throw error
      lastExcerpt = describeFetchError(error)
    }

    if (Date.now() + pollIntervalMs > deadline) {
      const pending = PENDING_MARKERS.some(marker => html.includes(marker))
      const reason = pending ? 'the service still reports the job as running' : `last answer: ${lastExcerpt || 'no table'}`
      throw new SwissTargetError(
        `job ${jobId} returned no prediction within ${Math.round(timeoutMs / 1000)}s (${reason})`,
        { excerpt: lastExcerpt },
      )
    }
    onProgress?.({ jobId, attempt, elapsedMs: timeoutMs - (deadline - Date.now()) })
    await sleep(pollIntervalMs, signal)
  }
}

/**
 * Sleep for a bounded interval, honoring cancellation.
 * @param ms - milliseconds to wait.
 * @param signal - optional cancellation.
 */
export function sleep(ms, signal) {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(signal.reason ?? new Error('aborted'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal.reason ?? new Error('aborted'))
    }
    signal?.addEventListener?.('abort', onAbort, { once: true })
  })
}
