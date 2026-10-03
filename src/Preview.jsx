import { useMemo, useState, useEffect } from 'react'
import { X, Copy as CopyIcon, Wand2, ScanSearch, Sparkles, Lock, AlertTriangle, Brain, EyeOff } from 'lucide-react'
import { CatIcon, bytes } from './ui.jsx'

export default function Preview({ plan, onCancel, onConfirm }) {
  const valid = plan.items.filter((i) => !i.skip && !i.dismissed)
  const dismissed = plan.items.filter((i) => !i.skip && i.dismissed)
  const skipped = plan.items.filter((i) => i.skip)
  const memo = plan.memo || {}
  const [sel, setSel] = useState(() => new Set(valid.map((i) => i.id)))
  const [open, setOpen] = useState(() => new Set())

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onCancel(); if (e.key === 'Enter' && sel.size) onConfirm([...sel]) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [sel, onCancel, onConfirm])

  const groups = useMemo(() => {
    const m = new Map()
    for (const it of valid) {
      if (!m.has(it.rel)) m.set(it.rel, [])
      m.get(it.rel).push(it)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))
  }, [plan])

  const toggle = (ids, on) => setSel((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n })
  const total = plan.items.filter((i) => sel.has(i.id)).reduce((a, i) => a + (i.size || 0), 0)
  const verb = plan.forceMove ? 'Apartar' : plan.copy ? 'Copiar' : 'Mover'

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal">
        <header className="modal-head">
          <div>
            <h2>{plan.forceMove ? 'Duplicados encontrados' : 'Vista previa'}</h2>
            <p>{valid.length} elementos · {groups.length} carpetas de destino{skipped.length ? ` · ${skipped.length} se omiten` : ''}</p>
            {memo.aiCached + memo.aiNew > 0 && (
              <p className="memo"><Brain size={12} /> IA: {memo.aiNew} {memo.aiNew === 1 ? 'nuevo analizado' : 'nuevos analizados'} · {memo.aiCached} ya {memo.aiCached === 1 ? 'conocido' : 'conocidos'} (memoria, al instante)</p>
            )}
          </div>
          <button className="ghost icon" onClick={onCancel} title="Cerrar (Esc)"><X size={16} /></button>
        </header>

        <div className="modal-body">
          {groups.map(([rel, items]) => {
            const ids = items.map((i) => i.id)
            const all = ids.every((id) => sel.has(id))
            const some = !all && ids.some((id) => sel.has(id))
            const expanded = open.has(rel) || items.length <= 6
            const top = rel.split(/[\\/]/)[0]
            return (
              <section key={rel} className="pgroup">
                <div className="pgroup-head">
                  <input type="checkbox" checked={all} ref={(el) => el && (el.indeterminate = some)} onChange={(e) => toggle(ids, e.target.checked)} />
                  <CatIcon cat={top} size={14} />
                  <span className="prel">{rel.split(/[\\/]+/).join(' / ')}</span>
                  <span className="pcount">{items.length}</span>
                </div>
                <ul>
                  {(expanded ? items : items.slice(0, 5)).map((it) => (
                    <li key={it.id}>
                      <input type="checkbox" checked={sel.has(it.id)} onChange={(e) => toggle([it.id], e.target.checked)} />
                      <span className="pname" title={it.src}>{it.name}</span>
                      <span className="ptags">
                        {it.project && <span className="tag accent">{it.project}</span>}
                        {it.rule && <span className="tag"><Wand2 size={11} /> {it.rule}</span>}
                        {it.private && <span className="tag priv"><Lock size={11} /> privado</span>}
                        {it.ai && <span className="tag ai" title={it.aiDesc ? `«${it.aiDesc}» · ${it.aiBy || ''}` : it.aiBy || ''}><Sparkles size={11} /> {it.aiDesc || 'IA'}</span>}
                        {it.aiError && <span className="tag warn" title={it.aiError}><AlertTriangle size={11} /> IA: {it.aiError}</span>}
                        {it.duplicateOf && <span className="tag warn" title={`Igual que ${it.duplicateOf}`}><CopyIcon size={11} /> duplicado</span>}
                        {it.note && <span className="tag"><ScanSearch size={11} /> {it.note}</span>}
                      </span>
                      <span className="psize">{it.size != null ? (it.sizePartial ? '> ' : '') + bytes(it.size) : ''}</span>
                    </li>
                  ))}
                  {!expanded && (
                    <li className="more" onClick={() => setOpen((s) => new Set(s).add(rel))}>Ver {items.length - 5} más…</li>
                  )}
                </ul>
              </section>
            )
          })}
          {dismissed.length > 0 && (
            <details className="pskipped">
              <summary><EyeOff size={13} /> {dismissed.length} que desmarcaste otra vez (márcalos si ahora sí quieres moverlos)</summary>
              <ul>{dismissed.map((it) => (
                <li key={it.id}>
                  <input type="checkbox" checked={sel.has(it.id)} onChange={(e) => toggle([it.id], e.target.checked)} />
                  <span className="pname" title={it.src}>{it.name}</span><span className="tag">{it.rel.split(/[\\/]+/).join(' / ')}</span>
                </li>
              ))}</ul>
            </details>
          )}
          {skipped.length > 0 && (
            <details className="pskipped">
              <summary>{skipped.length} que no se tocan</summary>
              <ul>{skipped.map((it) => <li key={it.id}><span className="pname">{it.name}</span><span className="tag">{it.skip}</span></li>)}</ul>
            </details>
          )}
        </div>

        <footer className="modal-foot">
          <span className="muted">{sel.size} seleccionados · {bytes(total)}</span>
          <div className="row">
            <button className="ghost" onClick={onCancel}>Cancelar</button>
            <button className="primary" disabled={!sel.size} onClick={() => onConfirm([...sel])}>{verb} {sel.size}</button>
          </div>
        </footer>
      </div>
    </div>
  )
}
