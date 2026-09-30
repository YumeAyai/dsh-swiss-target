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
      'state.idle': 'Your next discovery starts with a molecule. Paste SMILES above to begin.',
      'progress.title': 'Running batch — {count} molecule(s), {elapsed}s elapsed',
      'progress.note': 'Molecules are submitted one at a time and each job is polled until it finishes, so 5–60 s per molecule is normal. Keep this view or session open; switching away is safe, the run continues.',
      'stats.molecules': 'Molecules completed',
      'stats.rows': 'Predicted targets',
      'stats.time': 'Elapsed seconds',
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
      'state.idle': '从一个分子，开启下一步探索。粘贴 SMILES 即可开始。',
      'progress.title': '正在运行 · {count} 个分子 · 已用时 {elapsed}s',
      'progress.note': '逐个分子提交并轮询，单个分子 5–60 秒属正常；切到别的标签页或会话不会中断，回来仍能看到进度和结果。',
      'stats.molecules': '完成分子',
      'stats.rows': '预测结果',
      'stats.time': '用时 / 秒',
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
 .dsh-swiss-root { --swiss-accent: var(--dsw-alias-state-business-primary, #087f8c); display:flex; flex-direction:column; gap:18px; padding:28px; height:100%; box-sizing:border-box; overflow:auto; color:var(--dsw-alias-label-primary); font:13px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:var(--dsw-alias-bg-base); }
.dsh-swiss-hero { display:flex; align-items:center; gap:18px; padding-bottom:20px; border-bottom:1px solid var(--dsw-alias-border-l1); }
.dsh-swiss-mark { display:grid; place-items:center; width:58px; height:58px; flex:none; border-radius:18px; color:var(--swiss-accent); background:color-mix(in srgb,var(--swiss-accent) 10%,transparent); }
.dsh-swiss-eyebrow { color:var(--swiss-accent); font-size:10px; font-weight:700; letter-spacing:2px; margin-bottom:4px; }
.dsh-swiss-title { font-size:25px; font-weight:650; letter-spacing:-.8px; margin:0 0 5px; line-height:1.3; }
.dsh-swiss-description { color:var(--dsw-alias-label-tertiary); font-size:12px; line-height:1.7; margin:0; max-width:760px; }
.dsh-swiss-field { display:flex; flex-direction:column; gap:8px; min-width:0; }
.dsh-swiss-label { color:var(--dsw-alias-label-secondary); font-size:12px; font-weight:600; }
.dsh-swiss-control { display:flex; align-items:center; gap:8px; }
.dsh-swiss-input,.dsh-swiss-select { background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); border:1px solid var(--dsw-alias-border-l2); border-radius:10px; padding:10px 14px; font:inherit; box-sizing:border-box; }
.dsh-swiss-input { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; resize:vertical; min-height:140px; line-height:1.9; background:color-mix(in srgb,var(--swiss-accent) 3%,var(--dsw-alias-bg-base)); }
.dsh-swiss-select { height:42px; min-width:190px; }
.dsh-swiss-input:focus,.dsh-swiss-select:focus { outline:2px solid color-mix(in srgb,var(--swiss-accent) 25%,transparent); outline-offset:2px; border-color:var(--swiss-accent); }
.dsh-swiss-controls { display:flex; flex-wrap:wrap; gap:12px 20px; align-items:flex-end; }
.dsh-swiss-actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.dsh-swiss-button { background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); border:1px solid var(--dsw-alias-border-l2); border-radius:10px; padding:9px 18px; min-height:42px; font-size:12px; font-weight:600; line-height:1.6; font-family:inherit; cursor:pointer; transition:background .15s,transform .15s; }
.dsh-swiss-button:hover:not(:disabled) { background:var(--dsw-alias-interactive-bg-hover); transform:translateY(-1px); }
.dsh-swiss-button:focus-visible { outline:2px solid var(--swiss-accent); outline-offset:3px; }
.dsh-swiss-button:disabled { opacity:.45; cursor:not-allowed; }
.dsh-swiss-button.dsh-swiss-primary { background:var(--swiss-accent); border-color:var(--swiss-accent); color:var(--dsw-alias-bg-base); }
.dsh-swiss-button.dsh-swiss-primary:hover:not(:disabled) { background:color-mix(in srgb,var(--swiss-accent) 85%,var(--dsw-alias-label-primary)); }
.dsh-swiss-hint { color:var(--dsw-alias-label-tertiary); font-size:12px; }
.dsh-swiss-empty { text-align:center; padding:32px 20px; border:1px dashed var(--dsw-alias-border-l2); border-radius:14px; color:var(--dsw-alias-label-tertiary); }
.dsh-swiss-progress { display:flex; flex-direction:column; gap:10px; padding:18px; border:1px solid var(--dsw-alias-border-l1); border-radius:12px; }
.dsh-swiss-progressHead { display:flex; align-items:center; gap:10px; font-weight:600; }
.dsh-swiss-spinner { flex:none; width:14px; height:14px; border-radius:50%; border:2px solid var(--dsw-alias-border-l2); border-top-color:var(--swiss-accent); animation:dsh-swiss-spin .8s linear infinite; }
.dsh-swiss-progressTrack { height:5px; border-radius:3px; overflow:hidden; background:var(--dsw-alias-border-l1); }
.dsh-swiss-progressBar { height:100%; width:35%; border-radius:3px; background:var(--swiss-accent); animation:dsh-swiss-slide 1.4s ease-in-out infinite; }
@keyframes dsh-swiss-spin { to { transform:rotate(360deg); } }
@keyframes dsh-swiss-slide { from { margin-left:-35%; } to { margin-left:100%; } }
@media(prefers-reduced-motion:reduce) { .dsh-swiss-spinner,.dsh-swiss-progressBar { animation:none; } .dsh-swiss-button { transition:none; } }
.dsh-swiss-error,.dsh-swiss-failures { border:1px solid var(--dsw-alias-state-error-primary); color:var(--dsw-alias-state-error-primary); border-radius:10px; padding:12px 16px; font-size:12px; white-space:pre-wrap; overflow-wrap:anywhere; }
.dsh-swiss-summary { color:var(--dsw-alias-label-secondary); font-size:12px; }
.dsh-swiss-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:12px; }
.dsh-swiss-stat { border:1px solid var(--dsw-alias-border-l1); border-radius:12px; padding:14px 18px; }
.dsh-swiss-stat strong { display:block; font-size:24px; font-weight:650; letter-spacing:-.6px; color:var(--dsw-alias-label-primary); }
.dsh-swiss-tableWrap { border:1px solid var(--dsw-alias-border-l1); border-radius:12px; overflow:auto; max-height:60vh; }
.dsh-swiss-table { border-collapse:collapse; width:100%; font-size:12px; }
.dsh-swiss-table th,.dsh-swiss-table td { text-align:left; padding:12px 16px; border-bottom:1px solid var(--dsw-alias-border-l1); white-space:nowrap; }
.dsh-swiss-table th { position:sticky; top:0; background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-tertiary); font-size:11px; font-weight:600; z-index:1; }
.dsh-swiss-table tbody tr:hover { background:var(--dsw-alias-interactive-bg-hover); }
.dsh-swiss-table tbody tr:last-child td { border-bottom:0; }
.dsh-swiss-table td:first-child { font-weight:600; }
.dsh-swiss-mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; color:var(--dsw-alias-label-secondary); }
.dsh-swiss-probability { display:inline-flex; align-items:center; gap:9px; font-variant-numeric:tabular-nums; }
.dsh-swiss-probabilityTrack { width:48px; height:5px; border-radius:3px; overflow:hidden; background:var(--dsw-alias-border-l1); }
.dsh-swiss-probabilityFill { display:block; height:100%; background:var(--swiss-accent); border-radius:3px; }
.dsh-swiss-conversions { color:var(--dsw-alias-label-secondary); font-size:12px; padding:14px 18px; border-radius:12px; background:color-mix(in srgb,var(--swiss-accent) 5%,transparent); overflow-wrap:anywhere; }
.dsh-swiss-conversions code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; color:var(--dsw-alias-label-primary); }
@media(max-width:600px) { .dsh-swiss-root { padding:18px; gap:14px; } .dsh-swiss-title { font-size:20px; } .dsh-swiss-mark { width:44px; height:44px; border-radius:12px; } .dsh-swiss-hero { gap:12px; align-items:flex-start; } .dsh-swiss-stats { gap:6px; } .dsh-swiss-stat { padding:10px; } .dsh-swiss-stat strong { font-size:20px; } .dsh-swiss-select { width:100%; } }

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
          h('div', { className: 'dsh-swiss-hero' },
            h('div', { className: 'dsh-swiss-mark', 'aria-hidden': true }, h('svg', { width: 32, height: 32, viewBox: '0 0 32 32', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7 }, h('path', { d: 'M16 3 27 9.5v13L16 29 5 22.5v-13Z M16 3v12m11-5.5-11 6-11-6m11 6V29' }), h('circle', { cx: 16, cy: 15.5, r: 3, fill: 'currentColor' }))),
            h('div', null, h('div', { className: 'dsh-swiss-eyebrow' }, 'MOLECULE → TARGET'),
            h('h2', { className: 'dsh-swiss-title' }, translate(t, 'panel.title')),
            h('p', { className: 'dsh-swiss-description' }, translate(t, 'panel.description'))),
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
              h('label', { className: 'dsh-swiss-label', htmlFor: 'dsh-swiss-organism' }, translate(t, 'form.organism')),
              h('div', { className: 'dsh-swiss-control' },
                h('select', {
                  id: 'dsh-swiss-organism',
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
            ? h('div', { className: 'dsh-swiss-progress', role: 'status' },
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
          state.error === '' ? null : h('div', { className: 'dsh-swiss-error', role: 'alert' }, `${translate(t, 'error.title')}: ${state.error}`),
          state.result === null
            ? (state.busy ? null : h('div', { className: 'dsh-swiss-empty' }, translate(t, 'state.idle')))
            : h(React.Fragment, null,
              h('div', { className: 'dsh-swiss-summary' },
                h('div', { className: 'dsh-swiss-stats' }, [[`${state.result.succeeded}/${state.result.requested}`, 'stats.molecules'], [rows.length, 'stats.rows'], [(state.result.elapsedMs / 1000).toFixed(1), 'stats.time']].map(([value, label]) => h('div', { key: label, className: 'dsh-swiss-stat' }, h('strong', null, value), translate(t, label)))),
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
                        ? h('span', { className: 'dsh-swiss-probability' }, Number(row.probability).toFixed(4), h('span', { className: 'dsh-swiss-probabilityTrack', 'aria-hidden': true }, h('span', { className: 'dsh-swiss-probabilityFill', style: { width: `${Math.max(0, Math.min(1, Number(row.probability) || 0)) * 100}%` } })))
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
