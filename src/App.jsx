import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowDownToLine, FolderOpen, Undo2, FolderSearch, Check, Minus, X, Copy, Zap, Wand2, Sparkles, Lock } from 'lucide-react'
import { api, Switch, CatIcon, meta, bytes } from './ui.jsx'
import Preview from './Preview.jsx'
import History from './History.jsx'
import Settings from './Settings.jsx'

const TABS = [['inicio', 'Inicio'], ['historial', 'Historial'], ['ajustes', 'Ajustes']]

export default function App() {
  const [cfg, setCfg] = useState(null)
  const [tab, setTab] = useState('inicio')
  const [hover, setHover] = useState(false)
  const [busy, setBusy] = useState(null) // null | 'plan' | 'run'
  const [cancelling, setCancelling] = useState(false)
  const [progress, setProgress] = useState({ index: 0, total: 0 })
  const [aiName, setAiName] = useState(null)
  const [settingsSec, setSettingsSec] = useState(null)
  const [log, setLog] = useState([])
  const [counts, setCounts] = useState({})
  const [canUndo, setCanUndo] = useState(false)
  const [plan, setPlan] = useState(null)
  const [toast, setToast] = useState(null)
  const [updateReady, setUpdateReady] = useState(null)
  const depth = useRef(0)
  const toastTimer = useRef()
  const cfgRef = useRef(null)
  cfgRef.current = cfg

  const refreshStats = useCallback(() => api.stats().then(setCounts), [])
  const say = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3400)
  }, [])
  const set = useCallback(async (patch) => setCfg(await api.setConfig(patch)), [])

  const execute = useCallback(async (p, ids) => {
    setPlan(null)
    setBusy('run')
    setProgress({ index: 0, total: ids?.length || 0 })
    try {
      const s = await api.execute(p.planId, ids)
      if (!s) return
      setCanUndo(s.moved > 0)
      const verb = p.forceMove ? 'apartados' : p.copy ? 'copiados' : 'ordenados'
      const parts = [`${s.moved} ${verb}`]
      if (s.errors) parts.push(`${s.errors} con error`)
      say(parts.join(' · '))
    } finally {
      setBusy(null)
      refreshStats()
    }
  }, [refreshStats, say])

  const start = useCallback(async (getPlan) => {
    if (busy) return
    setTab('inicio')
    setBusy('plan')
    setProgress({ index: 0, total: 0 })
    let p
    try { p = await getPlan() } finally { setBusy(null); setAiName(null); setCancelling(false) }
    if (!p) return
    if (p.cancelled) { say(p.memo?.aiCached + p.memo?.aiNew ? 'Cancelado. Lo que ya analizó la IA queda en memoria.' : 'Cancelado'); return }
    const valid = p.items.filter((i) => !i.skip && !i.dismissed)
    if (!valid.length) { say(p.forceMove ? 'No hay duplicados en el destino' : p.items.length ? 'Nada que mover: ya estaba ordenado' : 'No había archivos que ordenar'); return }
    if (cfgRef.current.preview || p.forceMove) setPlan(p)
    else execute(p, valid.map((i) => i.id))
  }, [busy, execute, say])

  useEffect(() => {
    api.getConfig().then(setCfg)
    refreshStats()
    api.ready()
    const offs = [
      api.onProgress((p) => {
        setProgress({ index: p.index, total: p.total })
        setAiName(p.phase === 'ai' ? p.name : null)
        if (p.result) setLog((l) => [p.result, ...l].slice(0, 400))
      }),
      api.onAuto(() => { setCanUndo(true); refreshStats() }),
      api.onConfig(setCfg),
      api.onUpdate((u) => u.status === 'ready' && setUpdateReady(u.version)),
    ]
    return () => offs.forEach((f) => f())
  }, [refreshStats])

  // Peticiones externas: clic derecho del Explorador y "Ordenar ya" de Ajustes
  useEffect(() => {
    const off = api.onOpenPaths(({ paths, contentsOnly }) => start(() => api.plan(paths, contentsOnly)))
    const h = (e) => start(() => api.plan([e.detail], true))
    window.addEventListener('ordena:organize', h)
    return () => { off(); window.removeEventListener('ordena:organize', h) }
  }, [start])

  // Toda la ventana acepta archivos
  useEffect(() => {
    const has = (e) => [...(e.dataTransfer?.types || [])].includes('Files')
    const enter = (e) => { if (!has(e)) return; e.preventDefault(); depth.current++; setHover(true) }
    const over = (e) => { if (!has(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = cfgRef.current?.copy ? 'copy' : 'move' }
    const leave = () => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setHover(false) }
    const drop = (e) => {
      e.preventDefault(); depth.current = 0; setHover(false)
      const paths = [...e.dataTransfer.files].map((f) => api.pathFor(f)).filter(Boolean)
      if (paths.length) start(() => api.plan(paths, false))
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [start])

  if (!cfg) return null

  const changeDest = async () => { const d = await api.chooseDest(); if (d) { setCfg(await api.getConfig()); refreshStats() } }
  const organizeFolder = async () => {
    const f = await api.chooseFolder('Elige la carpeta a ordenar')
    if (f) start(() => api.plan([f], true))
  }
  const doUndo = async () => {
    const r = await api.undo()
    setCanUndo(false)
    say(`${r.restored} devueltos a su sitio${r.failed ? ` · ${r.failed} ya no estaban` : ''}`)
    refreshStats()
  }

  const cats = ['Proyectos', ...Object.keys(cfg.categories), 'Otros', 'Carpetas', 'Duplicados']
  const shownCats = [...cats, 'Privado'].filter((c) => !['Carpetas', 'Duplicados', 'Privado'].includes(c) || counts[c])
  const pct = progress.total ? Math.round((progress.index / progress.total) * 100) : 0
  const dropTitle = busy === 'plan' && aiName ? 'La IA está mirando tus archivos…' : busy === 'plan' ? 'Analizando…' : busy === 'run' ? 'Ordenando…' : hover ? 'Suelta para ordenar' : 'Arrastra archivos o carpetas'
  const dropSub = busy
    ? (aiName ? `${aiName} · ${progress.index} de ${progress.total}` : progress.total ? `${progress.index} de ${progress.total}` : 'Un momento')
    : `Se ${cfg.copy ? 'copian' : 'mueven'} a su carpeta según el tipo${cfg.preview ? ' · verás una vista previa' : ''}`

  return (
    <div className="app">
      <header className="titlebar">
        <span className="brand">ordena</span>
        <nav className="tabs">
          {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
        </nav>
        {cfg.ai.enabled && (
          <button className="live ai-live" onClick={() => { setSettingsSec('ia'); setTab('ajustes') }} title="Ordenar con IA activado">
            <Sparkles size={12} /> IA
          </button>
        )}
        {cfg.watch.enabled && (
          <button className="live" onClick={() => setTab('ajustes')} title={`Vigilando: ${cfg.watch.folders.join(', ')}`}>
            <span className="pulse" /> Automático
          </button>
        )}
      </header>

      {updateReady && (
        <div className="banner">
          Nueva versión {updateReady} lista.
          <button className="link" onClick={() => api.installUpdate()}>Reiniciar y actualizar</button>
        </div>
      )}

      <main>
        {tab === 'inicio' && (
          <div className="page home">
            <section className="dest">
              <div className="dest-info">
                <span className="eyebrow">Destino</span>
                <span className="path" title={cfg.dest}>{cfg.dest}</span>
              </div>
              <div className="row">
                <button className="ghost" onClick={changeDest}>Cambiar</button>
                <button className="ghost icon" onClick={() => api.openDest()} title="Abrir carpeta"><FolderOpen size={16} /></button>
              </div>
            </section>

            <section className={`drop ${hover ? 'hover' : ''} ${busy ? 'busy' : ''}`}>
              <div className="drop-icon"><ArrowDownToLine size={26} strokeWidth={1.6} /></div>
              <h2>{dropTitle}</h2>
              <p>{dropSub}</p>
              {busy === 'plan' && <button className="ghost sm cancel" disabled={cancelling} onClick={() => { setCancelling(true); api.cancelPlan() }}>{cancelling ? 'Cancelando…' : 'Cancelar'}</button>}
              {busy && <div className="bar"><span style={{ width: `${progress.total ? pct : 15}%` }} className={progress.total ? '' : 'indet'} /></div>}
            </section>

            <section className="options">
              <div className="switches">
                <Switch checked={cfg.preview} onChange={(v) => set({ preview: v })} label="Vista previa" />
                <Switch checked={cfg.copy} onChange={(v) => set({ copy: v })} label="Copiar" />
                <Switch checked={cfg.onTop} onChange={(v) => set({ onTop: v })} label="Siempre visible" />
              </div>
              <div className="row">
                <button className="ghost" disabled={!!busy} onClick={() => start(() => api.planDuplicates())} title="Buscar archivos idénticos en el destino">
                  <Copy size={15} /> Duplicados
                </button>
                <button className="ghost" disabled={!!busy} onClick={organizeFolder}>
                  <FolderSearch size={15} /> Ordenar una carpeta
                </button>
              </div>
            </section>

            <section className="grid">
              {shownCats.map((c) => {
                const n = counts[c]
                return (
                  <button key={c} className={`cat ${n ? '' : 'empty'}`} onClick={() => n && api.openDest(c)}
                    title={cfg.categories[c]?.length ? cfg.categories[c].map((e) => '.' + e).join('  ') : c === 'Proyectos' ? 'React, VB.NET, Python, Rust, Tauri… se mueven enteros' : c === 'Otros' ? 'Todo lo demás' : c}>
                    <CatIcon cat={c} />
                    <span className="cat-name">{c}</span>
                    <span className="cat-count">{n ?? 0}</span>
                  </button>
                )
              })}
            </section>

            {counts.projectTypes && Object.keys(counts.projectTypes).length > 0 && (
              <section className="projects">
                <span className="eyebrow">Proyectos</span>
                <div className="chips">
                  {Object.entries(counts.projectTypes).map(([t, n]) => (
                    <button key={t} className="chip" onClick={() => api.openDest('Proyectos/' + t)}>{t}<span>{n}</span></button>
                  ))}
                </div>
              </section>
            )}

            <section className="activity">
              <div className="activity-head">
                <span className="eyebrow">Actividad</span>
                {canUndo && !busy && <button className="link" onClick={doUndo}><Undo2 size={14} /> Deshacer último</button>}
              </div>
              {log.length === 0 ? (
                <div className="empty-log">Aquí verás lo que se va ordenando.</div>
              ) : (
                <ul className="log">
                  {log.map((r) => (
                    <li key={r.id} className={r.status} onClick={() => r.to && api.showFile(r.to)}>
                      <span className="dot" style={{ background: meta(r.rel?.split(/[\\/]/)[0] || r.category).color }} />
                      <span className="fname" title={r.src}>
                        {r.auto && <Zap size={12} className="auto-ic" />}
                        {r.name}
                      </span>
                      <span className="fcat" title={r.rel}>
                        {r.private && <Lock size={12} />}{r.ai && <Sparkles size={12} />}{r.duplicate && <Copy size={12} />}{r.rule && <Wand2 size={12} />}
                        {(r.rel || r.category).split(/[\\/]+/).join(' / ')}
                      </span>
                      <span className="fstatus" title={r.note || ''}>
                        {r.project && r.size ? <em className="muted">{bytes(r.size)}</em> : null}
                        {r.status === 'ok' ? <Check size={14} /> : r.status === 'skipped' ? <Minus size={14} /> : <><X size={14} /><em>{r.note}</em></>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {tab === 'historial' && <History say={say} onChanged={refreshStats} />}
        {tab === 'ajustes' && <Settings key={settingsSec || 'x'} initial={settingsSec} cfg={cfg} set={set} say={say} />}
      </main>

      {plan && <Preview plan={plan} onCancel={() => setPlan(null)} onConfirm={(ids) => execute(plan, ids)} />}
      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </div>
  )
}
