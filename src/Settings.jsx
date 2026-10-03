import { useState } from 'react'
import { Plus, X, Trash2, RotateCcw, FolderPlus, Play, RefreshCw, ChevronDown } from 'lucide-react'
import { api, Switch, CatIcon } from './ui.jsx'
import AISettings from './AISettings.jsx'

const SECTIONS = [
  ['general', 'General'],
  ['ia', 'Inteligencia artificial'],
  ['auto', 'Automático'],
  ['reglas', 'Reglas'],
  ['categorias', 'Categorías'],
  ['windows', 'Windows'],
  ['acerca', 'Actualizaciones'],
]

function ExtChips({ exts, onRemove, onAdd, placeholder = '+ extensión' }) {
  const [v, setV] = useState('')
  const add = () => {
    const list = v.split(/[\s,;]+/).map((x) => x.trim().toLowerCase().replace(/^\.+/, '')).filter(Boolean)
    if (list.length) onAdd(list)
    setV('')
  }
  return (
    <div className="chips-edit">
      {exts.map((e) => (
        <span key={e} className="xchip">.{e}<button onClick={() => onRemove(e)} title="Quitar"><X size={11} /></button></span>
      ))}
      <input value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }} onBlur={add} />
    </div>
  )
}

function CatPicker({ all, value, onChange }) {
  const label = !value?.length ? 'Cualquier tipo' : value.length <= 2 ? value.join(', ') : `${value.length} tipos`
  return (
    <details className="picker">
      <summary>{label}<ChevronDown size={13} /></summary>
      <div className="picker-pop">
        <label><input type="checkbox" checked={!value?.length} onChange={() => onChange([])} /> Cualquier tipo</label>
        {all.map((c) => (
          <label key={c}>
            <input type="checkbox" checked={value?.includes(c) || false}
              onChange={(e) => onChange(e.target.checked ? [...(value || []), c] : (value || []).filter((x) => x !== c))} />
            {c}
          </label>
        ))}
      </div>
    </details>
  )
}

export default function Settings({ cfg, set, say, initial }) {
  const [sec, setSec] = useState(initial || 'general')
  const [newCat, setNewCat] = useState('')
  const [upd, setUpd] = useState(null)
  const cats = Object.keys(cfg.categories)

  // --- categorías ---
  const setCats = (c) => set({ categories: c })
  const addExts = (cat, list) => {
    const next = {}
    for (const [k, v] of Object.entries(cfg.categories)) next[k] = v.filter((e) => !list.includes(e))
    next[cat] = [...new Set([...(next[cat] || []), ...list])]
    setCats(next)
  }
  const removeExt = (cat, e) => setCats({ ...cfg.categories, [cat]: cfg.categories[cat].filter((x) => x !== e) })
  const renameCat = (oldName, name) => {
    name = name.trim().replace(/[<>:"/\\|?*]/g, '')
    if (!name || name === oldName || cfg.categories[name] || cfg.special.includes(name)) return
    const next = {}
    for (const [k, v] of Object.entries(cfg.categories)) next[k === oldName ? name : k] = v
    setCats(next)
  }
  const deleteCat = (c) => { const n = { ...cfg.categories }; delete n[c]; setCats(n) }
  const addCat = () => {
    const name = newCat.trim().replace(/[<>:"/\\|?*]/g, '')
    if (!name || cfg.categories[name] || cfg.special.includes(name)) return
    setCats({ ...cfg.categories, [name]: [] })
    setNewCat('')
  }

  // --- reglas ---
  const setRule = (id, patch) => set({ rules: cfg.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) })
  const addRule = () => set({ rules: [...cfg.rules, { id: 'r' + Date.now(), enabled: true, name: '', match: '', categories: [], target: '' }] })
  const delRule = (id) => set({ rules: cfg.rules.filter((r) => r.id !== id) })

  // --- automático ---
  const w = cfg.watch
  const setWatch = (patch) => set({ watch: { ...w, ...patch } })
  const addWatchFolder = async () => {
    const f = await api.chooseFolder('Carpeta a vigilar')
    if (f && !w.folders.includes(f)) setWatch({ folders: [...w.folders, f] })
  }

  const checkUpd = async () => {
    setUpd({ status: 'checking' })
    setUpd(await api.checkUpdates())
  }
  const updText = {
    checking: 'Buscando…', latest: 'Tienes la última versión.', 'no-feed': 'Añade primero la dirección de actualizaciones.',
    dev: 'Solo funciona en la versión instalada.', downloading: `Descargando la versión ${upd?.version}… te avisaré al terminar.`,
    error: `No se pudo comprobar: ${upd?.message}`,
  }

  return (
    <div className="page settings">
      <nav className="snav">
        {SECTIONS.map(([k, l]) => <button key={k} className={sec === k ? 'on' : ''} onClick={() => setSec(k)}>{l}</button>)}
      </nav>

      <div className="spane">
        {sec === 'ia' && <AISettings cfg={cfg} set={set} say={say} />}

        {sec === 'general' && (
          <>
            <h1>General</h1>
            <div className="card list">
              <Switch checked={cfg.preview} onChange={(v) => set({ preview: v })} label="Vista previa antes de mover" hint="Te enseña a dónde va cada cosa y eliges qué mover." />
              <Switch checked={cfg.dateFolders} onChange={(v) => set({ dateFolders: v })} label="Fotos y vídeos por año y mes" hint="Imágenes / 2026 / 10 Octubre. Usa la fecha de la cámara si la tiene." />
              <Switch checked={cfg.detectDuplicates} onChange={(v) => set({ detectDuplicates: v })} label="Detectar duplicados" hint="Si ya tienes un archivo idéntico, el nuevo va a Duplicados." />
              <Switch checked={cfg.sniffContent} onChange={(v) => set({ sniffContent: v })} label="Reconocer archivos por su contenido" hint="Para archivos sin extensión o con una extensión desconocida." />
              <Switch checked={cfg.recursive} onChange={(v) => set({ recursive: v })} label="Entrar en subcarpetas" hint="Al soltar una carpeta, ordena todo lo que hay dentro (los proyectos se mueven enteros)." />
              <Switch checked={cfg.copy} onChange={(v) => set({ copy: v })} label="Copiar en vez de mover" />
              <Switch checked={cfg.copyExcludeBuild} onChange={(v) => set({ copyExcludeBuild: v })} disabled={!cfg.copy} label="Al copiar proyectos, omitir dependencias" hint="node_modules, bin, obj, target, dist, .venv… (al mover se mueve todo)." />
              <Switch checked={cfg.onTop} onChange={(v) => set({ onTop: v })} label="Ventana siempre visible" />
            </div>
          </>
        )}

        {sec === 'auto' && (
          <>
            <h1>Automático</h1>
            <p className="muted lead">Ordena solo lo que vaya llegando a estas carpetas. Espera a que cada descarga termine antes de moverla.</p>
            <div className="card list">
              <Switch checked={w.enabled} onChange={(v) => setWatch({ enabled: v })} label="Ordenar automáticamente" hint="Al cerrar la ventana, Ordena sigue funcionando junto al reloj." />
              <Switch checked={w.notify} onChange={(v) => setWatch({ notify: v })} label="Avisarme con una notificación" />
              <Switch checked={cfg.startWithWindows} onChange={(v) => set({ startWithWindows: v })} label="Iniciar con Windows" hint="Arranca en segundo plano, sin abrir la ventana." />
            </div>
            <h3>Carpetas vigiladas</h3>
            <div className="card">
              {w.folders.length === 0 && <div className="muted pad">Ninguna carpeta.</div>}
              {w.folders.map((f) => (
                <div key={f} className="frow">
                  <span className="fpath" title={f}>{f}</span>
                  <button className="ghost sm" onClick={() => window.dispatchEvent(new CustomEvent('ordena:organize', { detail: f }))}><Play size={13} /> Ordenar ya</button>
                  <button className="ghost icon sm" title="Dejar de vigilar" onClick={() => setWatch({ folders: w.folders.filter((x) => x !== f) })}><X size={14} /></button>
                </div>
              ))}
              <button className="link pad" onClick={addWatchFolder}><FolderPlus size={14} /> Añadir carpeta</button>
            </div>
          </>
        )}

        {sec === 'reglas' && (
          <>
            <h1>Reglas por nombre</h1>
            <p className="muted lead">
              Si el nombre contiene alguna de las palabras (separadas por comas), va a la carpeta indicada. No importan mayúsculas ni tildes.
              En el destino puedes usar <code>{'{categoria}'}</code>, <code>{'{año}'}</code>, <code>{'{mes}'}</code> y <code>{'{ia}'}</code> (la carpeta que elija la IA). Para expertos: <code>/regex/</code>.
            </p>
            <div className="rules">
              {cfg.rules.map((r) => (
                <div key={r.id} className={`rule card ${r.enabled ? '' : 'off'}`}>
                  <div className="rule-top">
                    <Switch checked={r.enabled} onChange={(v) => setRule(r.id, { enabled: v })} label="" />
                    <input className="rule-name" defaultValue={r.name} placeholder="Nombre de la regla" onBlur={(e) => setRule(r.id, { name: e.target.value })} />
                    <button className="ghost icon sm" title="Borrar regla" onClick={() => delRule(r.id)}><Trash2 size={14} /></button>
                  </div>
                  <div className="rule-grid">
                    <label>Si el nombre contiene</label>
                    <input defaultValue={r.match} placeholder="factura, invoice" onBlur={(e) => setRule(r.id, { match: e.target.value })} />
                    <label>y es de tipo</label>
                    <CatPicker all={cats} value={r.categories} onChange={(v) => setRule(r.id, { categories: v })} />
                    <label>mover a</label>
                    <input defaultValue={r.target} placeholder="Documentos/Facturas/{año}" onBlur={(e) => setRule(r.id, { target: e.target.value })} />
                  </div>
                </div>
              ))}
            </div>
            <button className="ghost" onClick={addRule}><Plus size={15} /> Nueva regla</button>
          </>
        )}

        {sec === 'categorias' && (
          <>
            <div className="page-head">
              <h1>Categorías</h1>
              <button className="ghost" onClick={() => set({ categories: cfg.defaultCategories })}><RotateCcw size={14} /> Restaurar</button>
            </div>
            <p className="muted lead">Cada categoría es una carpeta. Escribe una extensión y pulsa Enter; si ya estaba en otra categoría, se cambia a esta.</p>
            <div className="cats-edit">
              {cats.map((c) => (
                <div key={c} className="card catrow">
                  <div className="catrow-head">
                    <CatIcon cat={c} />
                    <input className="cat-title" defaultValue={c} onBlur={(e) => { if (e.target.value.trim() !== c) renameCat(c, e.target.value) }} />
                    <span className="muted sm">{cfg.categories[c].length}</span>
                    <button className="ghost icon sm" title="Borrar categoría" onClick={() => deleteCat(c)}><Trash2 size={14} /></button>
                  </div>
                  <ExtChips exts={cfg.categories[c]} onAdd={(l) => addExts(c, l)} onRemove={(e) => removeExt(c, e)} />
                </div>
              ))}
            </div>
            <div className="row gap">
              <input className="input" value={newCat} placeholder="Nueva categoría (p. ej. Partituras)" onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCat()} />
              <button className="ghost" onClick={addCat}><Plus size={15} /> Añadir</button>
            </div>
            <h3>Nunca tocar</h3>
            <p className="muted lead">Descargas a medias y temporales. Tampoco se tocan desktop.ini, Thumbs.db ni los archivos ~$ de Office.</p>
            <div className="card pad">
              <ExtChips exts={cfg.ignored} onAdd={(l) => set({ ignored: [...new Set([...cfg.ignored, ...l])] })} onRemove={(e) => set({ ignored: cfg.ignored.filter((x) => x !== e) })} />
            </div>
          </>
        )}

        {sec === 'windows' && (
          <>
            <h1>Integración con Windows</h1>
            <div className="card list">
              <Switch checked={cfg.contextMenu} disabled={!cfg.packaged}
                onChange={async (v) => { const r = await api.setContextMenu(v); if (!r.ok) say('No se pudo cambiar el menú del Explorador'); else set({}) }}
                label="Opción en el clic derecho del Explorador"
                hint="Añade «Ordenar con Ordena» a archivos y carpetas, y «Ordenar esta carpeta con Ordena» al fondo de cualquier carpeta." />
            </div>
            {!cfg.packaged && <p className="muted lead">Disponible en la versión instalada.</p>}
          </>
        )}

        {sec === 'acerca' && (
          <>
            <h1>Actualizaciones</h1>
            <p className="muted lead">Versión {cfg.version}</p>
            <div className="card pad col">
              <label className="muted sm">Dirección de actualizaciones (donde publiques latest.yml y el instalador)</label>
              <input className="input" defaultValue={cfg.updateUrl} placeholder="https://github.com/usuario/ordena/releases/latest/download" onBlur={(e) => set({ updateUrl: e.target.value.trim() })} />
              <div className="row gap">
                <button className="ghost" onClick={checkUpd}><RefreshCw size={14} /> Buscar actualizaciones</button>
                {upd && <span className="muted">{updText[upd.status]}</span>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
