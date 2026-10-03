import { useEffect, useState } from 'react'
import { Undo2, Zap, Hand, Copy, Trash2 } from 'lucide-react'
import { api, ago } from './ui.jsx'

const SOURCE = {
  manual: { label: 'Manual', icon: Hand },
  auto: { label: 'Automático', icon: Zap },
  duplicados: { label: 'Duplicados', icon: Copy },
}

export default function History({ onChanged, say }) {
  const [list, setList] = useState(null)
  const load = () => api.history().then(setList)
  useEffect(() => { load() }, [])

  const undo = async (b) => {
    const r = await api.undo(b.id)
    say(`${r.restored} devueltos a su sitio${r.failed ? ` · ${r.failed} ya no estaban` : ''}`)
    load(); onChanged()
  }

  if (!list) return null
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Historial</h1>
          <p className="muted">Puedes deshacer cualquier tanda, aunque hayas cerrado la app.</p>
        </div>
        {list.length > 0 && <button className="ghost" onClick={async () => { await api.clearHistory(); load() }}><Trash2 size={15} /> Vaciar</button>}
      </div>
      {list.length === 0 ? (
        <div className="empty-log">Todavía no has ordenado nada.</div>
      ) : (
        <ul className="hist">
          {list.map((b) => {
            const S = SOURCE[b.source] || SOURCE.manual
            return (
              <li key={b.id} className={b.undone ? 'undone' : ''}>
                <span className="hist-icon"><S.icon size={15} /></span>
                <div className="hist-main">
                  <div className="hist-title">
                    <strong>{b.count} {b.count === 1 ? `elemento ${b.copied ? 'copiado' : 'movido'}` : `elementos ${b.copied ? 'copiados' : 'movidos'}`}</strong>
                    <span className="muted"> · {S.label} · {ago(b.date)}</span>
                  </div>
                  <div className="hist-sub muted">
                    {b.sample.join(', ')}{b.count > b.sample.length ? '…' : ''}
                    {b.dirs.length > 0 && <> → {b.dirs.join(', ')}</>}
                  </div>
                </div>
                {b.undone ? <span className="tag">Deshecho</span> : <button className="ghost" onClick={() => undo(b)}><Undo2 size={15} /> Deshacer</button>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
