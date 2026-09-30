/**
 * SwissTargetPrediction batch panel — browser half.
 *
 * Registers one `conversation.view` tab. The panel collects SMILES and batch
 * options, runs them on the Host through the session command `/swiss` (the same
 * implementation the `swiss_target_batch` tool uses), and renders the returned
 * prediction table. Styles use only `--dsw-alias-*` theme tokens and no Harness
 * Client package; React comes from the loader's module table.
 * @module @yumeayai/dsh-swiss-target/client
 */
window.__ModuleLoader__.load({
  id: '@yumeayai/dsh-swiss-target',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'swiss-target'
    /** Separator the Host command uses between its summary and the JSON payload. */
    const RESULT_MARKER = '__SWISS_RESULT__'
    /** The Host command this panel drives. */
    const COMMAND_NAME = 'swiss'
    /** Organisms the service accepts. */
    const ORGANISMS = ['Homo_sapiens', 'Mus_musculus', 'Rattus_norvegicus']
    /** CSV columns, matching the Host exporter. */
    const CSV_COLUMNS = [
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
    ]
    /** Table columns, referenced by locale key. */
    const DISPLAY_COLUMNS = [
      { key: 'target', label: 'column.target' },
      { key: 'commonName', label: 'column.commonName' },
      { key: 'uniprotId', label: 'column.uniprotId' },
      { key: 'chemblId', label: 'column.chemblId' },
      { key: 'targetClass', label: 'column.targetClass' },
      { key: 'probability', label: 'column.probability' },
      { key: 'actives', label: 'column.actives' },
      { key: 'inputSmiles', label: 'column.inputSmiles' },
    ]

    const en = {
      'view.label': 'SwissTarget',
      'panel.title': 'SwissTargetPrediction batch',
      'panel.description': 'Predict protein targets for small molecules. Unofficial client of the SwissTargetPrediction web service; predictions belong to the SIB.',
      'form.smiles': 'Molecules (one SMILES per line, # comments ignored)',
      'form.placeholder': 'CC(=O)OC1=CC=CC=C1C(=O)O\nCN1C=NC2=C1C(=O)N(C(=O)N2C)C',
      'form.organism': 'Organism',
      'form.run': 'Run batch',
      'form.running': 'Predicting…',
      'form.count': '{count} molecule(s) queued',
      'form.export': 'Export CSV',
      'form.clear': 'Clear',
      'state.noSession': 'Open a session to run predictions.',
      'state.empty': 'Paste at least one SMILES string to start.',
      'state.idle': 'No batch has run in this panel yet.',
      'progress.title': 'Running batch — {count} molecule(s), {elapsed}s elapsed',
      'progress.note': 'Molecules are submitted one at a time and each job is polled until it finishes, so 5–60 s per molecule is normal. Keep this view or session open; switching away is safe, the run continues.',
      'summary.molecules': '{succeeded}/{requested} molecules',
      'summary.rows': '{count} predictions',
      'summary.csv': 'CSV: {path}',
      'summary.csvFailed': 'CSV could not be written: {reason}',
      'error.title': 'Batch failed',
      'error.unknownCommand': 'the /swiss command is not available in this session',
      'column.target': 'Target',
      'column.commonName': 'Common name',
      'column.uniprotId': 'UniProt',
      'column.chemblId': 'ChEMBL',
      'column.targetClass': 'Class',
      'column.probability': 'Probability',
      'column.actives': 'Actives 3D/2D',
      'column.inputSmiles': 'input_smiles',
      'failures.title': 'Molecules that failed',
      'conversions.title': 'Rewritten before submission (one molecule per query)',
    }

    const zh = {
      'view.label': 'SwissTarget',
      'panel.title': 'SwissTargetPrediction 批量预测',
      'panel.description': '对单个分子批量预测蛋白靶点。SwissTargetPrediction 网页服务的非官方客户端，预测数据归 SIB 所有。',
      'form.smiles': '分子列表（每行一个 SMILES，# 开头的行忽略）',
      'form.placeholder': 'CC(=O)OC1=CC=CC=C1C(=O)O\nCN1C=NC2=C1C(=O)N(C(=O)N2C)C',
      'form.organism': '物种',
      'form.run': '开始预测',
      'form.running': '预测中…',
      'form.count': '已填入 {count} 个分子',
      'form.export': '导出 CSV',
      'form.clear': '清空',
      'state.noSession': '请先打开一个会话再运行预测。',
      'state.empty': '请至少粘贴一个 SMILES。',
      'state.idle': '本面板还没有运行过批量预测。',
      'progress.title': '正在运行 · {count} 个分子 · 已用时 {elapsed}s',
      'progress.note': '逐个分子提交并轮询，单个分子 5–60 秒属正常；切到别的标签页或会话不会中断，回来仍能看到进度和结果。',
      'summary.molecules': '成功 {succeeded}/{requested} 个分子',
      'summary.rows': '{count} 条预测',
      'summary.csv': 'CSV：{path}',
      'summary.csvFailed': 'CSV 写入失败：{reason}',
      'error.title': '批量预测失败',
      'error.unknownCommand': '当前会话没有可用的 /swiss 命令',
      'column.target': '靶点',
      'column.commonName': '基因名',
      'column.uniprotId': 'UniProt',
      'column.chemblId': 'ChEMBL',
      'column.targetClass': '类别',
      'column.probability': '概率',
      'column.actives': '已知活性 3D/2D',
      'column.inputSmiles': '输入 SMILES',
      'failures.title': '失败的分子',
      'conversions.title': '为提交做过转换（服务每次只接受一个分子）',
    }

    /** Required client services: slots, sessions, locale and the commands Remote. */
    const inject = ['slots', 'sessions', 'locale', 'remote', 'remote.commands']

    /** Panel styles; theme tokens only so light/dark follow the Host. */
    const STYLES = `
.dsh-swiss-root { display: flex; flex-direction: column; gap: 12px; padding: 16px 20px 28px; height: 100%; box-sizing: border-box; overflow: auto; color: var(--dsw-alias-label-primary); font-size: 13px; }
.dsh-swiss-title { font-size: 15px; font-weight: 600; margin: 0; }
.dsh-swiss-description { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 1.6; margin: 0; }
.dsh-swiss-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.dsh-swiss-label { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.dsh-swiss-control { display: flex; align-items: center; gap: 8px; min-height: 33px; }
.dsh-swiss-input, .dsh-swiss-select, .dsh-swiss-number { background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; padding: 6px 8px; font-size: 13px; font-family: inherit; box-sizing: border-box; height: 33px; }
.dsh-swiss-input { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; resize: vertical; height: auto; min-height: 96px; line-height: 1.5; }
.dsh-swiss-input:focus, .dsh-swiss-select:focus, .dsh-swiss-number:focus { outline: none; border-color: var(--dsw-alias-state-business-primary); }
.dsh-swiss-input:disabled, .dsh-swiss-select:disabled, .dsh-swiss-number:disabled { color: var(--dsw-alias-label-tertiary); }
.dsh-swiss-controls { display: flex; flex-wrap: wrap; gap: 12px 16px; align-items: flex-end; }
.dsh-swiss-actions { display: flex; gap: 8px; align-items: center; min-height: 33px; }
.dsh-swiss-button { background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; padding: 6px 14px; height: 33px; box-sizing: border-box; font-size: 13px; font-family: inherit; cursor: pointer; }
.dsh-swiss-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-swiss-button:disabled { color: var(--dsw-alias-label-tertiary); cursor: not-allowed; }
.dsh-swiss-button.dsh-swiss-primary { border-color: var(--dsw-alias-state-business-primary); color: var(--dsw-alias-state-business-primary); }
.dsh-swiss-hint { color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.dsh-swiss-progress { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-base); }
.dsh-swiss-progressHead { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dsh-swiss-spinner { flex: none; width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--dsw-alias-border-l3); border-top-color: var(--dsw-alias-state-business-primary); animation: dsh-swiss-spin 0.8s linear infinite; }
.dsh-swiss-progressTrack { height: 4px; border-radius: 2px; overflow: hidden; background: var(--dsw-alias-border-l1); }
.dsh-swiss-progressBar { height: 100%; width: 35%; border-radius: 2px; background: var(--dsw-alias-state-business-primary); animation: dsh-swiss-slide 1.4s ease-in-out infinite; }
@keyframes dsh-swiss-spin { to { transform: rotate(360deg); } }
@keyframes dsh-swiss-slide { from { margin-left: -35%; } to { margin-left: 100%; } }
@media (prefers-reduced-motion: reduce) { .dsh-swiss-spinner { animation: none; } .dsh-swiss-progressBar { width: 100%; animation: none; } }
.dsh-swiss-error { border: 1px solid var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); border-radius: 6px; padding: 8px 10px; font-size: 12px; white-space: pre-wrap; }
.dsh-swiss-summary { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.7; }
.dsh-swiss-tableWrap { border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; overflow: auto; max-height: 60vh; }
.dsh-swiss-table { border-collapse: collapse; width: 100%; font-size: 12px; }
.dsh-swiss-table th, .dsh-swiss-table td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); white-space: nowrap; }
.dsh-swiss-table th { position: sticky; top: 0; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary); font-weight: 500; z-index: 1; }
.dsh-swiss-table tbody tr:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-swiss-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--dsw-alias-label-secondary); }
.dsh-swiss-failures { color: var(--dsw-alias-state-error-primary); font-size: 12px; line-height: 1.7; }
.dsh-swiss-conversions { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.7; }
.dsh-swiss-conversions code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--dsw-alias-label-primary); }
`

    /**
     * Translate with `{name}` interpolation.
     * @param t - bound translator.
     * @param key - dictionary key.
     * @param params - interpolation values.
     * @returns the localized text.
     */
    function translate(t, key, params) {
      const template = t(key)
      if (params === undefined) return template
      return template.replace(/\{(\w+)\}/g, (whole, name) => (params[name] === undefined ? whole : String(params[name])))
    }

    /**
     * The id of the session the main view shows.
     * @param sessions - the client sessions service.
     * @returns the session id, or `undefined` when none is selected.
     */
    function currentSessionId(sessions) {
      const snapshot = sessions?.list?.getSnapshot?.()
      if (snapshot === undefined || snapshot === null) return undefined
      const byId = snapshot.byId ?? {}
      if (typeof snapshot.current === 'string' && byId[snapshot.current] !== undefined) return snapshot.current
      for (const id of snapshot.ids ?? Object.keys(byId)) {
        const row = byId[id]
        if ((row?.retainedBy?.mainView ?? 0) > 0) return id
      }
      return undefined
    }

    /**
     * Recover the Host's structured payload from a command result text.
     * @param text - the verbatim command result text.
     * @returns the parsed payload, or `null` when it carries none.
     */
    function parsePayload(text) {
      if (typeof text !== 'string') return null
      const index = text.lastIndexOf(RESULT_MARKER)
      if (index < 0) return null
      try {
        const parsed = JSON.parse(text.slice(index + RESULT_MARKER.length))
        return parsed !== null && typeof parsed === 'object' ? parsed : null
      } catch {
        return null
      }
    }

    /** Quote one CSV field. */
    function csvField(value) {
      if (value === undefined || value === null) return ''
      const text = String(value)
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
    }

    /**
     * Download the visible result as a CSV without touching the Host.
     * @param rows - prediction rows.
     */
    function downloadCsv(rows) {
      const lines = [CSV_COLUMNS.map(column => csvField(column.header)).join(',')]
      for (const row of rows) lines.push(CSV_COLUMNS.map(column => csvField(row?.[column.key])).join(','))
      const blob = new Blob([`\ufeff${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'swiss_target_results.csv'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    }

    /**
     * Panel state lives outside the component and is keyed by session. The view
     * slot renders only the active tab, so switching tabs or sessions unmounts
     * this component; keeping the draft, the running batch and its result in the
     * store is what lets the panel come back intact instead of empty.
     */
    const PANEL_STATES = new Map()
    const panelListeners = new Set()

    /** The mutable state record for one session (created on first use). */
    function panelState(sessionId) {
      const key = sessionId ?? '(no-session)'
      let state = PANEL_STATES.get(key)
      if (state === undefined) {
        state = {
          smilesText: '',
          organism: ORGANISMS[0],
          busy: false,
          error: '',
          result: null,
          startedAt: 0,
          finishedAt: 0,
        }
        PANEL_STATES.set(key, state)
      }
      return state
    }

    /** Patch one session's panel state and re-render every mounted panel. */
    function updatePanel(sessionId, patch) {
      Object.assign(panelState(sessionId), patch)
      for (const listener of panelListeners) {
        try {
          listener()
        } catch {
          // a dead listener must not break the run that is writing state
        }
      }
    }

    /** Subscribe a mounted panel to store changes; returns its disposer. */
    function subscribePanel(listener) {
      panelListeners.add(listener)
      return () => panelListeners.delete(listener)
    }

    /**
     * Read one session's panel state, re-rendering on changes and ticking while
     * a batch runs so the elapsed counter stays live.
     * @param sessionId - the owning session.
     * @returns the mutable state record (read through this render).
     */
    function usePanel(sessionId) {
      const [, bump] = React.useReducer(count => count + 1, 0)
      const state = panelState(sessionId)
      React.useEffect(() => subscribePanel(bump), [])
      React.useEffect(() => {
        if (state.busy !== true) return undefined
        const timer = setInterval(bump, 500)
        return () => clearInterval(timer)
      }, [state.busy, sessionId])
      return state
    }

    /** Non-empty, non-comment SMILES lines of a draft. */
    function parseSmilesText(text) {
      return String(text ?? '').split(/\r?\n/).map(entry => entry.trim()).filter(entry => entry !== '' && !entry.startsWith('#'))
    }

    /**
     * The SwissTarget prediction panel.
     * @param props - slot props: the owning session id, the command launcher, and the locale seat.
     */
    function SwissTargetPanel(props) {
      const t = typeof props.t === 'function' ? props.t : key => key
      const { sessionId, run } = props
      const state = usePanel(sessionId)
      const smiles = React.useMemo(() => parseSmilesText(state.smilesText), [state.smilesText])
      const rows = state.result?.rows ?? []
      const elapsed = state.busy
        ? Math.max(0, Math.round((Date.now() - state.startedAt) / 1000))
        : Math.max(0, Math.round((state.finishedAt - state.startedAt) / 1000))

      const submit = React.useCallback(async (event) => {
        event?.preventDefault?.()
        if (state.busy === true || smiles.length === 0 || sessionId === undefined) return
        const request = {
          smiles,
          organism: state.organism,
        }
        updatePanel(sessionId, { busy: true, error: '', result: null, startedAt: Date.now(), finishedAt: 0 })
        try {
          const response = await run(request)
          if (response?.ok !== true) {
            throw new Error(response?.error?.message ?? response?.error?.code ?? translate(t, 'error.title'))
          }
          const value = response.value
          if (value === undefined) throw new Error(translate(t, 'error.unknownCommand'))
          const payload = parsePayload(value.result?.text)
          if (payload !== null) updatePanel(sessionId, { result: payload })
          else if (value.result?.kind === 'error') updatePanel(sessionId, { error: value.result.text ?? translate(t, 'error.title') })
        } catch (failure) {
          updatePanel(sessionId, { error: failure?.message ?? String(failure) })
        } finally {
          updatePanel(sessionId, { busy: false, finishedAt: Date.now() })
        }
      }, [state.busy, smiles, sessionId, state.organism, run, t])

      return h(React.Fragment, null,
        h('style', null, STYLES),
        h('div', { className: 'dsh-swiss-root' },
          h('div', null,
            h('h2', { className: 'dsh-swiss-title' }, translate(t, 'panel.title')),
            h('p', { className: 'dsh-swiss-description' }, translate(t, 'panel.description')),
          ),
          h('div', { className: 'dsh-swiss-field' },
            h('label', { className: 'dsh-swiss-label', htmlFor: 'dsh-swiss-smiles' }, translate(t, 'form.smiles')),
            h('textarea', {
              id: 'dsh-swiss-smiles',
              className: 'dsh-swiss-input',
              value: state.smilesText,
              spellCheck: false,
              disabled: state.busy,
              placeholder: translate(t, 'form.placeholder'),
              onChange: event => updatePanel(sessionId, { smilesText: event.target.value }),
            }),
          ),
          h('div', { className: 'dsh-swiss-controls' },
            h('div', { className: 'dsh-swiss-field' },
              h('label', { className: 'dsh-swiss-label' }, translate(t, 'form.organism')),
              h('div', { className: 'dsh-swiss-control' },
                h('select', {
                  className: 'dsh-swiss-select',
                  value: state.organism,
                  disabled: state.busy,
                  onChange: event => updatePanel(sessionId, { organism: event.target.value }),
                }, ORGANISMS.map(candidate => h('option', { key: candidate, value: candidate }, candidate))),
              ),
            ),
            h('div', { className: 'dsh-swiss-field' },
              h('span', { className: 'dsh-swiss-label', 'aria-hidden': true }, '\u00a0'),
              h('div', { className: 'dsh-swiss-actions' },
                h('button', {
                  type: 'button',
                  className: 'dsh-swiss-button dsh-swiss-primary',
                  disabled: state.busy || smiles.length === 0 || sessionId === undefined,
                  onClick: submit,
                }, state.busy ? translate(t, 'form.running') : translate(t, 'form.run')),
                h('button', {
                  type: 'button',
                  className: 'dsh-swiss-button',
                  disabled: state.busy || state.smilesText === '',
                  onClick: () => updatePanel(sessionId, { smilesText: '', error: '', result: null }),
                }, translate(t, 'form.clear')),
                h('button', {
                  type: 'button',
                  className: 'dsh-swiss-button',
                  disabled: rows.length === 0,
                  onClick: () => downloadCsv(rows),
                }, translate(t, 'form.export')),
              ),
            ),
          ),
          state.busy
            ? h('div', { className: 'dsh-swiss-progress' },
              h('div', { className: 'dsh-swiss-progressHead' },
                h('span', { className: 'dsh-swiss-spinner', 'aria-hidden': true }),
                translate(t, 'progress.title', { count: smiles.length, elapsed }),
              ),
              h('div', { className: 'dsh-swiss-progressTrack' }, h('div', { className: 'dsh-swiss-progressBar' })),
              h('div', { className: 'dsh-swiss-hint' }, translate(t, 'progress.note')),
            )
            : h('div', { className: 'dsh-swiss-hint' },
              sessionId === undefined
                ? translate(t, 'state.noSession')
                : smiles.length === 0
                  ? translate(t, 'state.empty')
                  : translate(t, 'form.count', { count: smiles.length }),
            ),
          state.error === '' ? null : h('div', { className: 'dsh-swiss-error' }, `${translate(t, 'error.title')}: ${state.error}`),
          state.result === null
            ? (state.busy ? null : h('div', { className: 'dsh-swiss-hint' }, translate(t, 'state.idle')))
            : h(React.Fragment, null,
              h('div', { className: 'dsh-swiss-summary' },
                `${translate(t, 'summary.molecules', { succeeded: state.result.succeeded, requested: state.result.requested })} · ${translate(t, 'summary.rows', { count: rows.length })} · ${(state.result.elapsedMs / 1000).toFixed(1)}s`,
                state.result.csvPath ? h('div', null, translate(t, 'summary.csv', { path: state.result.csvPath })) : null,
                state.result.csvError ? h('div', null, translate(t, 'summary.csvFailed', { reason: state.result.csvError })) : null,
              ),
              rows.length === 0 ? null : h('div', { className: 'dsh-swiss-tableWrap' },
                h('table', { className: 'dsh-swiss-table' },
                  h('thead', null, h('tr', null, DISPLAY_COLUMNS.map(column =>
                    h('th', { key: column.key }, translate(t, column.label))))),
                  h('tbody', null, rows.map((row, index) => h('tr', { key: `${row.jobId}-${index}` },
                    DISPLAY_COLUMNS.map(column => h('td', {
                      key: column.key,
                      className: column.key === 'inputSmiles' ? 'dsh-swiss-mono' : undefined,
                    }, column.key === 'actives'
                      ? `${row.knownActives3d}/${row.knownActives2d}`
                      : column.key === 'probability'
                        ? Number(row.probability).toFixed(4)
                        : String(row[column.key] ?? '')))))),
                ),
              ),
              (state.result.conversions ?? []).length === 0 ? null : h('div', { className: 'dsh-swiss-conversions' },
                h('div', null, translate(t, 'conversions.title')),
                state.result.conversions.map(entry => h('div', { key: entry.input },
                  h('code', null, entry.input), ' → ', h('code', null, entry.submitted),
                  entry.note === '' ? null : ` (${entry.note})`)),
              ),
              (state.result.errors ?? []).length === 0 ? null : h('div', { className: 'dsh-swiss-failures' },
                h('div', null, translate(t, 'failures.title')),
                state.result.errors.map(entry => h('div', { key: entry.smiles }, `${entry.smiles}: ${entry.message}`)),
              ),
            ),
        ),
      )
    }

    /**
     * Mount the dictionaries and the SwissTarget view tab.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'swiss-target: dictionaries')
      const t = ctx.locale.bind(NS)
      ctx.slots.inject('conversation.view', () => ctx.slots.register({
        name: 'conversation.view',
        id: 'swiss-target',
        order: 25,
        locale: NS,
        label: () => t('view.label'),
        inject: sessionId => ({
          sessionId,
          run: request => ctx.remote.commands.execute(sessionId, `/${COMMAND_NAME} ${JSON.stringify(request)}`, []),
        }),
      }, SwissTargetPanel))
    }

    return { inject, apply }
  },
})
