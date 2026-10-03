import { useEffect, useRef, useState } from 'react'
import { Cpu, Cloud, Download, Check, FlaskConical, Lock, Plus, Trash2, RotateCcw, ExternalLink, KeyRound, ShieldCheck, Sparkles } from 'lucide-react'
import { api, Switch, bytes } from './ui.jsx'

const PROVIDERS = [
  { id: 'ollama', name: 'Ollama', local: true, url: 'https://ollama.com/download' },
  { id: 'lmstudio', name: 'LM Studio', local: true, url: 'https://lmstudio.ai' },
  { id: 'openai', name: 'OpenAI / compatible', local: false, url: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic', name: 'Claude', local: false, url: 'https://console.anthropic.com/settings/keys' },
  { id: 'gemini', name: 'Gemini', local: false, url: 'https://aistudio.google.com/apikey' },
]
const KINDS = [['image', 'Fotos'], ['video', 'Vídeos'], ['document', 'Documentos']]
const PRIVATE_MODES = [['off', 'Desactivado'], ['explicit', 'Solo explícito'], ['strict', 'Estricto']]

function Seg({ value, options, onChange }) {
  return (
    <div className="seg">
      {options.map(([v, l]) => <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  )
}

export default function AISettings({ cfg, set, say }) {
  const a = cfg.ai
  const [st, setSt] = useState(null)
  const [gpu, setGpu] = useState(undefined)
  const [pull, setPull] = useState(null)
  const [test, setTest] = useState(null)
  const [kind, setKind] = useState('image')
  const [key, setKey] = useState('')
  const timer = useRef()
  const prov = PROVIDERS.find((p) => p.id === a.provider) || PROVIDERS[0]
  const model = a.models?.[a.provider] || ''

  const setAI = (patch) => set({ ai: { ...a, ...patch } })
  const refresh = () => api.aiStatus().then(setSt)

  useEffect(() => {
    api.aiGpu().then(setGpu)
    const off = api.onAiPull((p) => setPull(p))
    return off
  }, [])
  useEffect(() => {
    setSt(null)
    refresh()
    clearInterval(timer.current)
    timer.current = setInterval(refresh, 6000)
    return () => clearInterval(timer.current)
  }, [a.provider, a.ollamaUrl, a.lmstudioUrl, a.openaiUrl, a.laya.enabled, a.laya.url, model, a.hasKey?.[a.provider]])

  const download = async (id) => {
    setPull({ model: id, status: 'Empezando…' })
    const r = await api.aiPull(id)
    setPull(null)
    if (r.ok) { say(`${id} descargado`); setAI({ models: { ...a.models, ollama: id } }); refresh() } else say(`No se pudo descargar: ${r.error}`)
  }
  const runTest = async () => {
    setTest({ loading: true })
    const r = await api.aiTest()
    setTest(r)
  }
  const saveKey = async () => {
    const c = await api.aiSetKey(a.provider, key)
    setKey('')
    set({ ai: { ...c.ai } })
    say(key ? 'Clave guardada (cifrada)' : 'Clave borrada')
  }

  const labels = a.labels[kind] || []
  const setLabels = (list) => setAI({ labels: { ...a.labels, [kind]: list } })
  const installed = new Set((st?.models || []).map((m) => m.id.replace(/:latest$/, '')))

  let statusEl
  if (!st) statusEl = <span className="muted">Comprobando…</span>
  else if (st.needKey) statusEl = <span className="warn-t">Falta la clave de la API</span>
  else if (!st.running) statusEl = <span className="warn-t">{st.error || (prov.local ? `${prov.name} no está abierto` : 'No se pudo conectar')}</span>
  else statusEl = <span className="ok-t"><span className="dot-ok" />{prov.local ? `${prov.name} funcionando${st.version ? ` · v${st.version}` : ''}` : 'Conectado'}{model ? (st.hasModel ? ` · ${model}` : ` · falta el modelo ${model}`) : ' · elige un modelo'}</span>

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Inteligencia artificial</h1>
          <p className="muted">Mira <em>dentro</em> de cada foto, vídeo o documento para decidir la subcarpeta.</p>
        </div>
      </div>

      <div className="card list">
        <Switch checked={a.enabled} onChange={(v) => setAI({ enabled: v })} label="Ordenar con IA" hint="Las reglas por nombre siguen teniendo prioridad. Siempre verás la propuesta en la vista previa." />
      </div>

      <h3>Motor</h3>
      <div className="card pad col">
        <div className="provs">
          {PROVIDERS.map((p) => (
            <button key={p.id} className={`prov ${a.provider === p.id ? 'on' : ''}`} onClick={() => setAI({ provider: p.id })}>
              {p.local ? <Cpu size={15} /> : <Cloud size={15} />}
              <span>{p.name}</span>
              <small>{p.local ? 'En tu PC' : 'API en la nube'}</small>
            </button>
          ))}
        </div>
        <div className="statusline">{statusEl}<button className="link" onClick={() => api.openUrl(prov.url)}>{prov.local ? `Descargar ${prov.name}` : 'Conseguir clave'} <ExternalLink size={12} /></button></div>

        {prov.local ? (
          <div className="note"><ShieldCheck size={15} /><span>Privado: los archivos se analizan en tu ordenador y no salen de él.</span></div>
        ) : (
          <div className="note warn"><Cloud size={15} /><span>Se envía a {prov.name} una versión reducida de cada foto (o el texto de cada documento). Lo que el filtro local marque como íntimo <strong>nunca</strong> se envía. Cada análisis puede tener coste según tu plan.</span></div>
        )}

        {a.provider === 'openai' && (
          <label className="field">
            <span>Dirección de la API</span>
            <input className="input" defaultValue={a.openaiUrl} placeholder="https://api.openai.com/v1" onBlur={(e) => setAI({ openaiUrl: e.target.value.trim() || 'https://api.openai.com/v1' })} />
            <small className="muted">Sirve cualquier servicio compatible: OpenRouter (https://openrouter.ai/api/v1), Groq, DeepSeek, Together…</small>
          </label>
        )}
        {!prov.local && (
          <label className="field">
            <span>Clave de la API {a.hasKey?.[a.provider] && <span className="tag accent"><KeyRound size={11} /> guardada</span>}</span>
            <div className="row">
              <input className="input" type="password" value={key} placeholder={a.hasKey?.[a.provider] ? '•••••••••••• (escribe otra para cambiarla)' : 'Pega aquí tu clave'} onChange={(e) => setKey(e.target.value)} />
              <button className="ghost" onClick={saveKey}>{key ? 'Guardar' : 'Borrar'}</button>
            </div>
            <small className="muted">Se guarda cifrada con el almacén seguro de Windows.</small>
          </label>
        )}
        {a.provider === 'ollama' && (
          <label className="field"><span>Dirección de Ollama</span><input className="input" defaultValue={a.ollamaUrl} onBlur={(e) => setAI({ ollamaUrl: e.target.value.trim() || 'http://127.0.0.1:11434' })} /></label>
        )}
        {a.provider === 'lmstudio' && (
          <label className="field"><span>Dirección de LM Studio</span><input className="input" defaultValue={a.lmstudioUrl} onBlur={(e) => setAI({ lmstudioUrl: e.target.value.trim() || 'http://127.0.0.1:1234' })} /><small className="muted">En LM Studio: pestaña Developer → Start Server.</small></label>
        )}
      </div>

      <h3>Modelo</h3>
      {a.provider === 'ollama' && (
        <>
          {gpu?.gpu && <p className="muted lead2">Tu tarjeta: <strong>{gpu.gpu.name}</strong> · {gpu.gpu.vramGB} GB. Recomendado: <strong>{gpu.recommended}</strong></p>}
          <div className="models">
            {cfg.aiModels.map((m) => {
              const isOn = model === m.id
              const has = installed.has(m.id)
              const pulling = pull?.model === m.id
              const pct = pulling && pull.total ? Math.round((pull.completed / pull.total) * 100) : null
              return (
                <div key={m.id} className={`model card ${isOn ? 'on' : ''}`} onClick={() => setAI({ models: { ...a.models, ollama: m.id } })}>
                  <div className="model-top">
                    <span className="radio">{isOn && <span />}</span>
                    <strong>{m.label}</strong>
                    {gpu?.recommended === m.id && <span className="tag accent"><Sparkles size={11} /> para tu PC</span>}
                  </div>
                  <code>{m.id}</code>
                  <p className="muted sm">{m.note}</p>
                  <div className="model-foot">
                    <span className="muted sm">{m.size} · {m.vram}+ GB de VRAM</span>
                    {has ? <span className="ok-t sm"><Check size={13} /> Instalado</span>
                      : pulling ? <span className="sm muted">{pct != null ? `${pct}%` : pull.status}</span>
                      : <button className="ghost sm" disabled={!st?.running || !!pull} onClick={(e) => { e.stopPropagation(); download(m.id) }}><Download size={13} /> Descargar</button>}
                  </div>
                  {pulling && pct != null && <div className="mbar"><span style={{ width: `${pct}%` }} /></div>}
                </div>
              )
            })}
          </div>
        </>
      )}
      {(st?.models?.length > 0 || a.provider !== 'ollama') && (
        <label className="field">
          <span>{a.provider === 'ollama' ? 'U otro modelo que ya tengas' : 'Modelo (debe aceptar imágenes para fotos y vídeos)'}</span>
          <div className="row">
            <select className="input" value={model} onChange={(e) => setAI({ models: { ...a.models, [a.provider]: e.target.value } })}>
              <option value="">— Elige —</option>
              {model && !(st?.models || []).some((m) => m.id === model) && <option value={model}>{model}</option>}
              {(st?.models || []).map((m) => <option key={m.id} value={m.id}>{m.name ? `${m.name} (${m.id})` : m.id}{m.vision ? ' · visión' : ''}{m.size ? ` · ${bytes(m.size)}` : ''}</option>)}
            </select>
            <input className="input" placeholder="o escribe el nombre" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { setAI({ models: { ...a.models, [a.provider]: e.target.value.trim() } }); e.target.value = '' } }} />
          </div>
        </label>
      )}

      <h3>Qué analiza</h3>
      <div className="card list">
        <Switch checked={a.images} onChange={(v) => setAI({ images: v })} label="Fotos" hint="Personas, paisajes, mascotas, capturas, documentos fotografiados…" />
        <Switch checked={a.videos} onChange={(v) => setAI({ videos: v })} label="Vídeos" hint="Analiza 3 fotogramas de cada vídeo (MP4, WebM, MOV, MKV)." />
        <Switch checked={a.documents} onChange={(v) => setAI({ documents: v })} label="Documentos" hint="Lee el principio de PDFs, Word y textos: facturas, contratos, nóminas, salud…" />
      </div>

      <h3><Lock size={13} /> Contenido íntimo → carpeta Privado</h3>
      <div className="card pad col">
        <Seg value={a.privateMode} options={PRIVATE_MODES} onChange={(v) => setAI({ privateMode: v })} />
        <small className="muted">Lo detecta un modelo pequeño (NSFW) que funciona en tu tarjeta gráfica, sin internet. Lo que detecte va a <strong>Privado</strong>, con prioridad sobre reglas e IA. «Estricto» incluye también fotos sugerentes o en ropa interior.</small>
      </div>

      <h3>Laya para documentos <span className="tag">opcional</span></h3>
      <div className="card pad col">
        <Switch checked={a.laya.enabled} onChange={(v) => setAI({ laya: { ...a.laya, enabled: v } })} label="Usar Laya para clasificar documentos" hint="Decide la carpeta de un documento en milisegundos. Si no responde, se usa el modelo de arriba." />
        {a.laya.enabled && (
          <>
            <div className="statusline">{st?.laya === 'ok' ? <span className="ok-t"><span className="dot-ok" />Laya funcionando</span> : <span className="warn-t">Laya no responde en {a.laya.url}</span>}</div>
            <pre className="code">pip install "laya[serve]"{'\n'}laya-serve</pre>
            <label className="field"><span>Dirección</span><input className="input" defaultValue={a.laya.url} onBlur={(e) => setAI({ laya: { ...a.laya, url: e.target.value.trim() || 'http://127.0.0.1:8000' } })} /></label>
            <button className="link" onClick={() => api.openUrl('https://github.com/NandhaKishorM/laya')}>Qué es Laya <ExternalLink size={12} /></button>
          </>
        )}
      </div>

      <div className="page-head"><h3>Carpetas que puede elegir la IA</h3>
        <button className="ghost sm" onClick={() => setLabels(cfg.defaultLabels[kind])}><RotateCcw size={13} /> Restaurar</button>
      </div>
      <Seg value={kind} options={KINDS} onChange={setKind} />
      <div className="card labels">
        {labels.map((l, i) => (
          <div key={kind + i + l.name} className="lrow">
            <input className="lname" defaultValue={l.name} placeholder="Carpeta" onBlur={(e) => setLabels(labels.map((x, j) => (j === i ? { ...x, name: e.target.value.replace(/[<>:"/\\|?*]/g, '').trim() } : x)))} />
            <input className="lhint" defaultValue={l.hint} placeholder="Pista para la IA (qué va aquí)" onBlur={(e) => setLabels(labels.map((x, j) => (j === i ? { ...x, hint: e.target.value } : x)))} />
            <button className="ghost icon sm" title="Quitar" onClick={() => setLabels(labels.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
          </div>
        ))}
        <button className="link pad" onClick={() => setLabels([...labels.filter((l) => l.name !== 'Otros'), { name: 'Nueva carpeta', hint: '' }, ...labels.filter((l) => l.name === 'Otros')])}><Plus size={14} /> Añadir carpeta</button>
      </div>
      <p className="muted sm">«Otros» significa: déjalo en la carpeta general. Con «Fotos y vídeos por año y mes» activado queda así: Imágenes / Paisajes y viajes / 2025 / 08 Agosto.</p>

      <h3>Probar</h3>
      <div className="card pad col">
        <div className="row">
          <button className="ghost" onClick={runTest} disabled={test?.loading}><FlaskConical size={15} /> {test?.loading ? 'Analizando…' : 'Probar con un archivo…'}</button>
          <button className="link" onClick={async () => { await api.aiClearCache(); say('Memoria de la IA borrada') }}>Borrar memoria de la IA</button>
        </div>
        {test && !test.loading && (
          <div className="testres">
            <div><strong>{test.file}</strong> <span className="muted">· {test.category} · {(test.ms / 1000).toFixed(1)} s{test.by ? ` · ${test.by}` : ''}</span></div>
            {test.error ? <div className="warn-t">{test.error}</div>
              : test.private ? <div><Lock size={13} /> Iría a <strong>Privado / {test.category}</strong></div>
              : <div>→ <strong>{test.category} / {test.label && test.label !== 'Otros' ? test.label : '(sin subcarpeta)'}</strong>{test.desc && <span className="muted"> — «{test.desc}»</span>}</div>}
            {test.nsfw && <div className="muted sm">Filtro íntimo: {Object.entries(test.nsfw).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(' · ')}</div>}
          </div>
        )}
      </div>
    </>
  )
}
