#!/usr/bin/env node
/**
 * Verify what the running DeepSeek Harness profile actually loaded.
 *
 * The install CLI prints pnpm output, not activation. This script reads the
 * running app's own local credential record, mints the browser cookie it would
 * mint, and asks the Host for the two authoritative projections:
 *
 *   pluginInventory/list     every loader entry with enabled + fiberPhase
 *   pluginManager/listBundles  selected bundles, their rows, and each error
 *
 * With --client it also fetches the app index and checks `window.__DSH_BOOT__`
 * for the bundle's browser entry, then fetches that entry's served module.
 *
 * The credential secret is read locally and never printed or sent anywhere but
 * 127.0.0.1 of the app named by --url/DSH_WEB_URL.
 *
 * Reading fiberPhase: `active` means the module loaded and apply() ran; `failed`
 * means activation threw; `null` on an enabled row means the row exists with no
 * fiber at all — usually an import failure, and the shape a silently broken
 * bundle takes. When a row is null, --recompose (setBundleEnabled off then on)
 * makes the manager return the diagnostic the install command never prints.
 *
 * Usage:
 *   node verify-plugin.mjs                          # every row, summary
 *   node verify-plugin.mjs --module @you/my-plugin   # one bundle, exit 1 if not active
 *   node verify-plugin.mjs --module @you/my-plugin --client
 *   node verify-plugin.mjs --module @you/my-plugin --recompose   # force + report diagnostics
 *   node verify-plugin.mjs --json
 */
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createHash, createHmac, randomUUID } from 'node:crypto'

const argv = process.argv.slice(2)
const flag = name => argv.includes(`--${name}`)
const option = (name, fallback) => {
  const at = argv.indexOf(`--${name}`)
  return at === -1 || argv[at + 1] === undefined ? fallback : argv[at + 1]
}

const url = option('url', process.env.DSH_WEB_URL ?? 'http://127.0.0.1:19387')
const authority = new URL(url).host
const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const moduleFilter = option('module', undefined)
const asJson = flag('json')
const wantClient = flag('client')
const wantRecompose = flag('recompose')

const b64 = value => Buffer.from(value).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')

/** Read the app's cookie-signing secret for the browser session. */
async function readSecret() {
  const file = join(dshHome, '.credentials.yaml')
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    throw new Error(`cannot read ${file}: ${error.message}. Is DSH_HOME correct?`)
  }
  const block = /^ {2}client-connection\/browser-session:[ \t]*$/m.exec(text)
  if (block === null) throw new Error(`${file} has no client-connection/browser-session record — has the Web app ever started?`)
  const rest = text.slice(block.index + block[0].length)
  const next = /^ {2}\S/m.exec(rest)
  const scoped = next === null ? rest : rest.slice(0, next.index)
  const secret = /^\s+secret:\s*(\S+)\s*$/m.exec(scoped)
  if (secret === null) throw new Error(`${file} has no browser-session secret in that record`)
  return Buffer.from(secret[1].replaceAll('-', '+').replaceAll('_', '/'), 'base64')
}

/** Cookie value the app issues after its own token exchange. */
function cookieFor(secret, host) {
  const now = Date.now()
  const body = b64(Buffer.from(JSON.stringify({ version: 1, authority: host, issuedAt: now, expiresAt: now + 86_400_000 }), 'utf8'))
  const signature = b64(createHmac('sha256', secret).update(body).digest())
  const name = `dsh-auth-${b64(createHash('sha256').update(host).digest())}`
  return `${name}=v1.${body}.${signature}`
}

/** One Remote call over the local Web API. */
async function rpc(cookie, method, args = {}) {
  const response = await fetch(`http://${authority}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args } }),
  })
  const body = await response.json().catch(() => undefined)
  if (body === undefined) throw new Error(`${method}: HTTP ${response.status} ${response.statusText}`)
  const result = body.result
  if (result?.ok !== true) throw new Error(`${method}: ${result?.error?.code ?? 'failed'} ${result?.error?.message ?? ''}`.trim())
  return result.value
}

const phaseMark = phase => phase === 'active' ? 'ok  ' : phase === null || phase === undefined ? 'none' : `${String(phase)}`

async function main() {
  const cookie = cookieFor(await readSecret(), authority)
  const [inventory, bundles] = await Promise.all([
    rpc(cookie, 'pluginInventory/list'),
    rpc(cookie, 'pluginManager/listBundles').catch(() => []),
  ])
  const entries = inventory.entries ?? inventory
  const rows = moduleFilter === undefined ? entries : entries.filter(entry => entry.moduleName === moduleFilter)
  const matched = bundles.filter(bundle => moduleFilter === undefined || bundle.name === moduleFilter || bundle.rows?.some(row => row.moduleName === moduleFilter))

  let recomposed
  if (wantRecompose) {
    if (moduleFilter === undefined) throw new Error('--recompose needs --module <package> to name the bundle')
    const bundle = bundles.find(candidate => candidate.name === moduleFilter)
      ?? bundles.find(candidate => candidate.rows?.some(row => row.moduleName === moduleFilter))
    if (bundle === undefined) throw new Error(`no selected bundle matches ${moduleFilter}`)
    const off = await rpc(cookie, 'pluginManager/setBundleEnabled', { name: bundle.name, enabled: false })
    await new Promise(resolve => setTimeout(resolve, 1500))
    const on = await rpc(cookie, 'pluginManager/setBundleEnabled', { name: bundle.name, enabled: true })
    recomposed = { bundle: bundle.name, off: summariseChange(off), on: summariseChange(on) }
  }

  let client
  if (wantClient) {
    const index = await fetch(`http://${authority}/`, { headers: { cookie } }).then(response => response.text())
    const boot = extractBoot(index)
    const wanted = moduleFilter ?? undefined
    const found = (boot?.entries ?? []).filter(entry => wanted === undefined || entry.id === wanted || entry.id.endsWith(`/${wanted}`))
    client = { bootRevision: boot?.rev, entries: found }
    if (found.length > 0) {
      const served = await fetch(`http://${authority}/${found[0].url}`, { headers: { cookie } })
      const text = await served.text()
      client.served = { status: served.status, bytes: text.length, loader: text.includes('__ModuleLoader__.load') }
    }
  }

  if (asJson) {
    console.log(JSON.stringify({ authority, rows, bundles: matched, client, recomposed }, null, 2))
  } else {
    console.log(`app        ${url}`)
    console.log(`entries    ${rows.length}${moduleFilter === undefined ? '' : ` matching ${moduleFilter}`}`)
    for (const row of rows) {
      console.log(`  ${phaseMark(row.fiberPhase).padEnd(6)} ${row.enabled ? 'on ' : 'off'} ${row.entryId}  ${row.moduleName}${row.error === undefined ? '' : `  ERROR ${JSON.stringify(row.error)}`}`)
    }
    for (const bundle of matched) {
      console.log(`bundle     ${bundle.name}  ${bundle.enabled ? 'enabled' : 'disabled'}${bundle.installed === false ? ' (not installed)' : ''}${bundle.error === undefined ? '' : `  ERROR ${bundle.error.code ?? ''} ${bundle.error.diagnostic ?? ''}`}`)
      for (const row of bundle.rows ?? []) console.log(`  row      ${row.rowId} → ${row.entryId ?? '(no entry)'}${row.error === undefined ? '' : `  ERROR ${JSON.stringify(row.error)}`}`)
    }
    if (recomposed !== undefined) {
      console.log(`recompose  ${recomposed.bundle}`)
      console.log(`  disable  application=${recomposed.off.application} ${recomposed.off.diagnostic ?? ''}`)
      console.log(`  enable   application=${recomposed.on.application} ${recomposed.on.diagnostic ?? ''}`)
    }
    if (client !== undefined) {
      console.log(`client     boot rev ${client.bootRevision ?? '?'}`)
      for (const entry of client.entries) console.log(`  entry    ${entry.id}  immediate=${entry.immediately === true}  inject=${JSON.stringify(entry.inject ?? [])}`)
      if (client.entries.length === 0) console.log('  entry    NONE — the browser half is not in the boot payload')
      if (client.served !== undefined) console.log(`  served   HTTP ${client.served.status}, ${client.served.bytes} bytes, loader call ${client.served.loader}`)
    }
  }

  const failedRow = rows.find(row => row.fiberPhase === 'failed' || row.fiberPhase === undefined || row.fiberPhase === null)
  const failedBundle = matched.find(bundle => bundle.error !== undefined)
  const failedClient = wantClient && client.entries.length === 0
  if (moduleFilter !== undefined && (failedRow !== undefined || failedBundle !== undefined || failedClient)) process.exitCode = 1
}

/** Pull `window.__DSH_BOOT__` out of the index without a DOM. */
function extractBoot(html) {
  const at = html.indexOf('"__DSH_BOOT__"]')
  if (at === -1) return undefined
  const start = html.indexOf('{', at)
  let depth = 0
  for (let index = start; index < html.length; index += 1) {
    const char = html[index]
    if (char === '"') {
      index += 1
      while (index < html.length && html[index] !== '"') {
        if (html[index] === '\\') index += 1
        index += 1
      }
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, index + 1))
        } catch {
          return undefined
        }
      }
    }
  }
  return undefined
}

/** Keep only what a human needs from a ChangeResult. */
function summariseChange(change) {
  return {
    application: change?.application,
    changed: change?.changed,
    diagnostic: change?.error?.diagnostic,
    code: change?.error?.code,
    warnings: change?.warnings,
  }
}

main().catch(error => {
  console.error(`verify-plugin: ${error.message}`)
  process.exitCode = 2
})
