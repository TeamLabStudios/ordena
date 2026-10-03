// IA local de Ordena.
//  · Fotos y vídeos  → modelo de visión (Ollama o LM Studio) elige la subcarpeta.
//  · Documentos      → Laya (si está activo) o el mismo modelo, leyendo el texto.
//  · Contenido íntimo → clasificador NSFW pequeño (nsfwjs) en la GPU → carpeta Privado.
// Todo se ejecuta en el propio PC; no se envía nada a internet.
const path = require('path')
const fs = require('fs')
const fsp = fs.promises
const crypto = require('crypto')
const { pathToFileURL } = require('url')
const { execFile } = require('child_process')

const DEFAULT_LABELS = {
  image: [
    { name: 'Personas', hint: 'retratos, selfies, grupos de amigos o familia' },
    { name: 'Paisajes y viajes', hint: 'naturaleza, playa, montaña, ciudades, monumentos' },
    { name: 'Mascotas y animales', hint: 'perros, gatos y cualquier animal' },
    { name: 'Comida', hint: 'platos, bebidas, restaurantes, recetas' },
    { name: 'Capturas de pantalla', hint: 'capturas de móvil u ordenador, chats, webs, programas' },
    { name: 'Documentos y recibos', hint: 'fotos de papeles, tickets, DNI, apuntes, pizarras' },
    { name: 'Memes', hint: 'imágenes de humor con texto, stickers' },
    { name: 'Arte y diseño', hint: 'ilustraciones, logos, renders, fondos de pantalla' },
    { name: 'Vehículos', hint: 'coches, motos, bicis' },
    { name: 'Otros', hint: 'nada de lo anterior' },
  ],
  video: [
    { name: 'Personas y familia', hint: 'momentos con gente, fiestas, celebraciones' },
    { name: 'Viajes y paisajes', hint: 'lugares, naturaleza, ciudades' },
    { name: 'Grabaciones de pantalla', hint: 'tutoriales, capturas de escritorio o móvil' },
    { name: 'Videojuegos', hint: 'partidas, clips de juegos' },
    { name: 'Música y conciertos', hint: 'actuaciones, instrumentos, videoclips' },
    { name: 'Deporte', hint: 'partidos, entrenamientos, gimnasio' },
    { name: 'Mascotas y animales', hint: 'animales' },
    { name: 'Otros', hint: 'nada de lo anterior' },
  ],
  document: [
    { name: 'Facturas y recibos', hint: 'facturas, tickets, recibos de luz, agua, teléfono' },
    { name: 'Bancos y finanzas', hint: 'extractos, préstamos, hipoteca, inversiones, impuestos' },
    { name: 'Contratos y legal', hint: 'contratos, alquiler, condiciones, documentos legales' },
    { name: 'Trabajo y nóminas', hint: 'nóminas, contratos laborales, vida laboral, informes de trabajo' },
    { name: 'Salud', hint: 'informes médicos, recetas, análisis, citas' },
    { name: 'Estudios', hint: 'apuntes, exámenes, trabajos de clase, títulos, certificados de cursos' },
    { name: 'Currículums', hint: 'CV y cartas de presentación' },
    { name: 'Administración pública', hint: 'Hacienda, Seguridad Social, DGT, ayuntamiento, multas, certificados oficiales' },
    { name: 'Manuales y guías', hint: 'instrucciones, manuales de producto, documentación técnica' },
    { name: 'Otros', hint: 'nada de lo anterior' },
  ],
}

const MODELS = [
  { id: 'qwen3-vl:4b-instruct', size: '3.3 GB', vram: 6, label: 'Ligero', note: 'Para tarjetas de 6–8 GB. Rápido, algo menos preciso.' },
  { id: 'qwen3-vl:8b-instruct', size: '6.1 GB', vram: 10, label: 'Recomendado', note: 'El mejor equilibrio. Ve fotos, lee texto en imágenes y documentos.' },
  { id: 'gemma4:26b', size: '18 GB', vram: 16, label: 'Máxima calidad', note: 'Más listo pero más lento. Con 16 GB usa también la RAM.' },
]

function defaultAIConfig() {
  return {
    enabled: false,
    provider: 'ollama',
    ollamaUrl: 'http://127.0.0.1:11434',
    lmstudioUrl: 'http://127.0.0.1:1234',
    openaiUrl: 'https://api.openai.com/v1', // vale cualquier API compatible: OpenRouter, Groq, DeepSeek, Together…
    models: { ollama: 'qwen3-vl:8b-instruct', lmstudio: '', openai: '', anthropic: '', gemini: '' },
    keys: {}, // claves cifradas con el almacén seguro de Windows (DPAPI)
    images: true, videos: true, documents: true,
    privateMode: 'explicit', // off | explicit | strict
    laya: { enabled: false, url: 'http://127.0.0.1:8000' },
    labels: DEFAULT_LABELS,
  }
}

const CLOUD = new Set(['openai', 'anthropic', 'gemini'])
const PROVIDER_NAME = { ollama: 'Ollama', lmstudio: 'LM Studio', openai: 'API compatible con OpenAI', anthropic: 'Claude (Anthropic)', gemini: 'Gemini (Google)' }
const modelOf = (c) => c.models?.[c.provider] || ''

const KIND_BY_CAT = { 'Imágenes': 'image', 'Vídeos': 'video', 'Documentos': 'document' }
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'm4v', 'mkv', 'ogv', '3gp'])
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'avif', 'jfif', 'ico', 'svg'])
const DOC_EXT = new Set(['pdf', 'docx', 'txt', 'md', 'rtf', 'odt'])

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function http(url, { method = 'GET', body, timeout = 120000, headers = {}, signal } = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)
  if (signal) { if (signal.aborted) ctrl.abort(); else signal.addEventListener('abort', () => ctrl.abort(), { once: true }) }
  try {
    const r = await fetch(url, { method, signal: ctrl.signal, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined })
    const text = await r.text()
    if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 200)}`)
    return text ? JSON.parse(text) : {}
  } finally { clearTimeout(t) }
}

function createAI({ getConfig, userData, distDir, BrowserWindow, getKey }) {
  const ai = () => getConfig().ai
  // ---------- caché de resultados ----------
  const cacheFile = path.join(userData, 'ai-cache.json')
  let cache = {}
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) } catch {}
  // Limpieza: fuera lo que lleva más de 180 días sin usarse y como mucho 100.000 entradas
  {
    const limit = Date.now() - 180 * 864e5
    let entries = Object.entries(cache).filter(([, v]) => (v.t || 0) > limit || !v.t)
    if (entries.length > 100000) entries = entries.sort((a, b) => (b[1].t || 0) - (a[1].t || 0)).slice(0, 100000)
    cache = Object.fromEntries(entries)
  }
  let saveTimer
  const saveCache = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { fs.writeFileSync(cacheFile, JSON.stringify(cache)) } catch {} }, 1500) }

  // ---------- cancelar ----------
  // Al pulsar «Cancelar» se cortan las peticiones a la IA que estén en marcha.
  let abortCtl = new AbortController()
  const abort = () => { abortCtl.abort(); abortCtl = new AbortController() }
  const CANCELLED = 'cancelled'
  function abortable(promise, signal) {
    if (signal.aborted) return Promise.reject(new Error(CANCELLED))
    return Promise.race([promise, new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error(CANCELLED)), { once: true }))])
  }

  // ---------- huella del contenido ----------
  // Tamaño + primeros y últimos 64 KB: reconoce el archivo aunque lo renombres o lo muevas.
  async function fingerprint(file, size) {
    const fh = await fsp.open(file, 'r')
    try {
      const n = Math.min(65536, size)
      const a = Buffer.alloc(n), b = Buffer.alloc(n)
      await fh.read(a, 0, n, 0)
      await fh.read(b, 0, n, Math.max(0, size - n))
      return crypto.createHash('sha1').update(String(size)).update(a).update(b).digest('hex')
    } finally { await fh.close() }
  }

  // ---------- ventana oculta (Chromium) para imágenes y vídeos ----------
  let worker = null
  async function getWorker() {
    if (worker && !worker.isDestroyed()) return worker
    worker = new BrowserWindow({ show: false, width: 400, height: 300, webPreferences: { webSecurity: false, backgroundThrottling: false, contextIsolation: true, sandbox: true } })
    await worker.loadFile(path.join(distDir, 'worker.html'))
    for (let i = 0; i < 100; i++) { if (await worker.webContents.executeJavaScript('!!window.ordenaWorkerReady')) break; await sleep(50) }
    return worker
  }
  async function analyzeMedia(file, kind, nsfw) {
    const w = await getWorker()
    const fn = kind === 'video' ? 'analyzeVideo' : 'analyzeImage'
    return w.webContents.executeJavaScript(`window.${fn}(${JSON.stringify(pathToFileURL(file).href)}, ${JSON.stringify({ nsfw })})`)
  }

  // ---------- texto de documentos ----------
  let pdfjs = null
  async function docText(file) {
    const ext = path.extname(file).slice(1).toLowerCase()
    try {
      if (ext === 'pdf') {
        pdfjs = pdfjs || (await import('pdfjs-dist/legacy/build/pdf.mjs'))
        const data = new Uint8Array(await fsp.readFile(file))
        const task = pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: false, verbosity: 0 })
        const doc = await task.promise
        let text = ''
        for (let i = 1; i <= Math.min(doc.numPages, 2) && text.length < 3000; i++) {
          const c = await (await doc.getPage(i)).getTextContent()
          text += c.items.map((it) => it.str).join(' ') + '\n'
        }
        await (task.destroy?.() || doc.cleanup?.())
        return text
      }
      if (ext === 'docx') return (await require('mammoth').extractRawText({ path: file })).value
      if (ext === 'rtf') return (await fsp.readFile(file, 'utf8')).replace(/\\[a-z]+-?\d* ?|[{}]/g, ' ')
      if (['txt', 'md'].includes(ext)) { const fh = await fsp.open(file, 'r'); const b = Buffer.alloc(6000); const { bytesRead } = await fh.read(b, 0, 6000, 0); await fh.close(); return b.slice(0, bytesRead).toString('utf8') }
    } catch (e) { console.error('[ordena] no se pudo leer el texto de', path.basename(file), e.message) }
    return ''
  }

  // ---------- proveedores ----------
  const schemaFor = (labels) => ({
    type: 'object',
    properties: { carpeta: { type: 'string', enum: labels.map((l) => l.name) }, descripcion: { type: 'string' } },
    required: ['carpeta', 'descripcion'],
  })
  const listText = (labels) => labels.map((l) => `- ${l.name}${l.hint ? `: ${l.hint}` : ''}`).join('\n')

  const trim = (u) => u.replace(/\/+$/, '')
  const parseJSON = (raw) => {
    const t = String(raw || '').replace(/```(?:json)?/g, '').trim()
    const m = t.match(/\{[\s\S]*\}/)
    return JSON.parse(m ? m[0] : t || '{}')
  }

  async function chat({ prompt, images = [], labels, signal }) {
    const c = ai()
    const model = modelOf(c)
    if (!model) throw new Error('Elige un modelo en Ajustes → IA')
    const schema = schemaFor(labels)
    const key = CLOUD.has(c.provider) ? getKey(c.provider) : null
    if (CLOUD.has(c.provider) && !key) throw new Error('Falta la clave de la API')
    let raw

    if (c.provider === 'ollama') {
      const r = await http(`${trim(c.ollamaUrl)}/api/chat`, {
        method: 'POST',
        body: { model, stream: false, format: schema, keep_alive: '15m', options: { temperature: 0, num_ctx: 4096 }, messages: [{ role: 'user', content: prompt, ...(images.length ? { images } : {}) }] },
        signal,
      })
      raw = r.message?.content
    } else if (c.provider === 'lmstudio' || c.provider === 'openai') {
      const base = c.provider === 'lmstudio' ? `${trim(c.lmstudioUrl)}/v1` : trim(c.openaiUrl)
      const headers = key ? { Authorization: `Bearer ${key}` } : {}
      const content = [{ type: 'text', text: prompt }, ...images.map((b) => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b}` } }))]
      const body = { model, temperature: 0, max_tokens: 300, messages: [{ role: 'user', content }], response_format: { type: 'json_schema', json_schema: { name: 'clasificacion', strict: true, schema: { ...schema, additionalProperties: false } } } }
      let r
      try { r = await http(`${base}/chat/completions`, { method: 'POST', body, headers, signal }) }
      catch (e) {
        if (!/^4\d\d/.test(e.message)) throw e
        delete body.response_format // algunos servicios no aceptan json_schema: pedimos el JSON en el texto
        if (signal?.aborted) throw new Error(CANCELLED)
        r = await http(`${base}/chat/completions`, { method: 'POST', body, headers, signal })
      }
      raw = r.choices?.[0]?.message?.content
    } else if (c.provider === 'anthropic') {
      const content = [...images.map((b) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b } })), { type: 'text', text: prompt + '\nResponde SOLO con un objeto JSON {"carpeta": "...", "descripcion": "..."}.' }]
      const r = await http('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal, headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: { model, max_tokens: 300, temperature: 0, messages: [{ role: 'user', content }] },
      })
      raw = (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')
    } else if (c.provider === 'gemini') {
      const parts = [{ text: prompt + '\nResponde SOLO con un objeto JSON {"carpeta": "...", "descripcion": "..."}.' }, ...images.map((b) => ({ inline_data: { mime_type: 'image/jpeg', data: b } }))]
      const r = await http(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.replace(/^models\//, ''))}:generateContent`, {
        method: 'POST', signal, headers: { 'x-goog-api-key': key },
        body: { contents: [{ role: 'user', parts }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } },
      })
      raw = r.candidates?.[0]?.content?.parts?.map((p) => p.text).join('')
    }
    const parsed = parseJSON(raw)
    const label = labels.find((l) => l.name.toLowerCase() === String(parsed.carpeta || '').toLowerCase())
    return { label: label?.name || null, desc: parsed.descripcion || '' }
  }

  async function laya(text, labels, signal) {
    const c = ai().laya
    const criteria = Object.fromEntries(labels.map((l) => [l.name, l.hint || l.name]))
    const r = await http(`${c.url.replace(/\/$/, '')}/v1/systemone`, {
      method: 'POST', timeout: 30000, signal,
      body: { state: { body: text.slice(0, 3000) }, questions: { carpeta: { type: 'choice', instructions: '¿En qué carpeta guardarías este documento?', criteria } } },
    })
    const a = r.answers?.carpeta
    return { label: a?.choice || null, conf: a?.confidence ?? a?.answer_confidence ?? null }
  }

  function isPrivate(scores) {
    const c = ai()
    const mode = c.privateMode === 'off' && CLOUD.has(c.provider) ? 'explicit' : c.privateMode
    if (!scores || mode === 'off') return false
    const explicit = (scores.Porn || 0) + (scores.Hentai || 0)
    return mode === 'strict' ? explicit + (scores.Sexy || 0) >= 0.6 : explicit >= 0.7
  }

  // ---------- clasificación de un archivo ----------
  // needLabel=false → solo se mira si es contenido íntimo (cuando una regla ya decidió la carpeta)
  async function classify(file, category, st, { needLabel = true } = {}) {
    const c = ai()
    const kind = KIND_BY_CAT[category]
    if (!c?.enabled || !kind) return null
    const ext = path.extname(file).slice(1).toLowerCase()
    if (kind === 'image' && (!c.images || !IMAGE_EXT.has(ext))) return null
    if (kind === 'video' && (!c.videos || !VIDEO_EXT.has(ext))) return null
    if (kind === 'document' && (!c.documents || !DOC_EXT.has(ext))) return null
    const labels = (c.labels?.[kind] || DEFAULT_LABELS[kind]).filter((l) => l.name)
    const signal = abortCtl.signal
    let fp
    try { fp = await fingerprint(file, st.size) } catch { return null }
    const key = crypto.createHash('sha1').update([fp, c.provider, modelOf(c), c.laya.enabled, c.privateMode, JSON.stringify(labels)].join('|')).digest('hex')
    if (cache[key] && (!needLabel || cache[key].full)) {
      cache[key].t = Date.now(); saveCache()
      return { ...cache[key], cached: true }
    }

    const out = { kind }
    try {
      if (kind === 'document') {
        if (!needLabel) return null
        const text = (await docText(file)).replace(/\s+/g, ' ').trim()
        if (text.length < 30) return null
        if (c.laya.enabled) {
          try { Object.assign(out, await laya(text, labels, signal), { by: 'Laya' }) } catch (e) { if (signal.aborted) throw new Error(CANCELLED); out.error = 'Laya no responde' }
        }
        if (!out.label || out.label === 'Otros' || (out.conf != null && out.conf < 0.5)) { // Laya duda → segunda opinión
          const prompt = `Eres el clasificador de documentos de un organizador de archivos. Lee el inicio del documento y elige UNA carpeta.\nCarpetas:\n${listText(labels)}\n\nNombre del archivo: ${path.basename(file)}\nTexto:\n"""${text.slice(0, 2500)}"""\n\nResponde en JSON. En "descripcion" resume en menos de 8 palabras de qué trata.`
          Object.assign(out, await chat({ prompt, labels, signal }), { by: modelOf(c), error: undefined })
        }
      } else {
        const wantNsfw = c.privateMode !== 'off' || CLOUD.has(c.provider) // con APIs en la nube, el filtro local va siempre
        const m = await abortable(analyzeMedia(file, kind, wantNsfw), signal)
        if (!m.ok) { out.error = m.error; return out }
        out.nsfw = m.nsfw
        out.private = isPrivate(m.nsfw)
        if (needLabel && !out.private) {
          const what = kind === 'video' ? `Estas ${m.images.length} imágenes son fotogramas de un mismo vídeo.` : 'Mira la imagen.'
          const prompt = `Eres el clasificador de ${kind === 'video' ? 'vídeos' : 'fotos'} de un organizador de archivos. ${what} Elige UNA carpeta de la lista.\nCarpetas:\n${listText(labels)}\n\nResponde en JSON. En "descripcion" describe lo que se ve en menos de 8 palabras, en español.`
          Object.assign(out, await chat({ prompt, images: m.images, labels, signal }), { by: modelOf(c) })
        }
      }
    } catch (e) {
      if (signal.aborted || e.message === CANCELLED || e.name === 'AbortError') return { kind, cancelled: true }
      out.error = /ECONNREFUSED|fetch failed/.test(e.message) ? `${PROVIDER_NAME[c.provider]} no responde` : /^401|^403/.test(e.message) ? 'Clave de API no válida' : /^429/.test(e.message) ? 'Límite de la API alcanzado' : e.message.slice(0, 160)
      return out
    }
    out.full = needLabel || !!out.private
    if (!out.error) { cache[key] = { ...out, t: Date.now() }; saveCache() }
    return out
  }

  // ---------- estado, modelos, GPU ----------
  async function status() {
    const c = ai()
    const model = modelOf(c)
    const s = { provider: c.provider, cloud: CLOUD.has(c.provider), running: false, models: [], laya: null, model }
    try {
      if (c.provider === 'ollama') {
        const v = await http(`${trim(c.ollamaUrl)}/api/version`, { timeout: 3000 })
        const t = await http(`${trim(c.ollamaUrl)}/api/tags`, { timeout: 3000 })
        s.version = v.version
        s.models = (t.models || []).map((m) => ({ id: m.name, size: m.size, vision: /vl|vision|llava|gemma[34]|moondream|minicpm|pixtral|llama4|mistral-small3/i.test(m.name) }))
      } else if (c.provider === 'lmstudio') {
        const r = await http(`${trim(c.lmstudioUrl)}/v1/models`, { timeout: 3000 })
        s.models = (r.data || []).map((m) => ({ id: m.id }))
      } else {
        const key = getKey(c.provider)
        if (!key) { s.needKey = true; return s }
        if (c.provider === 'openai') {
          const r = await http(`${trim(c.openaiUrl)}/models`, { timeout: 8000, headers: { Authorization: `Bearer ${key}` } })
          s.models = (r.data || []).map((m) => ({ id: m.id })).sort((a, b) => a.id.localeCompare(b.id))
        } else if (c.provider === 'anthropic') {
          const r = await http('https://api.anthropic.com/v1/models?limit=100', { timeout: 8000, headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } })
          s.models = (r.data || []).map((m) => ({ id: m.id, name: m.display_name }))
        } else if (c.provider === 'gemini') {
          const r = await http('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { timeout: 8000, headers: { 'x-goog-api-key': key } })
          s.models = (r.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName }))
        }
      }
      s.running = true
    } catch (e) {
      s.error = /401|403/.test(e.message) ? 'Clave no válida' : null
    }
    if (c.laya.enabled) {
      try { await laya('Factura de la luz del mes de marzo', [{ name: 'Facturas', hint: 'facturas' }, { name: 'Otros', hint: 'otros' }]); s.laya = 'ok' } catch { s.laya = 'off' }
    }
    s.hasModel = !!model && (s.cloud ? s.models.some((m) => m.id === model) || !s.models.length : s.models.some((m) => m.id === model || m.id === model + ':latest'))
    return s
  }

  let pulling = null
  async function pull(model, onProgress) {
    const c = ai()
    if (pulling) return { ok: false, error: 'Ya hay una descarga en curso' }
    pulling = model
    try {
      const r = await fetch(`${c.ollamaUrl.replace(/\/$/, '')}/api/pull`, { method: 'POST', body: JSON.stringify({ model, stream: true }) })
      if (!r.ok || !r.body) throw new Error(`Ollama respondió ${r.status}`)
      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let i
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1)
          if (!line) continue
          const j = JSON.parse(line)
          if (j.error) throw new Error(j.error)
          onProgress?.({ model, status: j.status, completed: j.completed, total: j.total })
        }
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: /ECONNREFUSED|fetch failed/.test(e.message) ? 'Ollama no está abierto' : e.message }
    } finally { pulling = null }
  }

  function gpu() {
    return new Promise((res) => {
      execFile('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], { windowsHide: true, timeout: 5000 }, (err, out) => {
        if (err || !out) return res(null)
        const [name, mem] = out.split('\n')[0].split(',').map((s) => s.trim())
        res({ name, vramGB: Math.round(+mem / 1024) })
      })
    })
  }
  const recommend = (vram) => (!vram ? MODELS[1].id : vram >= 20 ? MODELS[2].id : vram >= 10 ? MODELS[1].id : MODELS[0].id)

  // Probar con un archivo concreto (pantalla de Ajustes)
  async function test(file, category) {
    const st = await fsp.stat(file)
    const t0 = Date.now()
    const r = await classify(file, category, st, { needLabel: true })
    return { ...(r || { error: 'Este tipo de archivo no usa IA' }), ms: Date.now() - t0 }
  }

  const dispose = () => { if (worker && !worker.isDestroyed()) worker.destroy() }
  const clearCache = () => { cache = {}; saveCache() }
  const cacheInfo = () => ({ entries: Object.keys(cache).length })

  return { classify, status, pull, gpu, recommend, test, dispose, clearCache, cacheInfo, abort, KIND_BY_CAT }
}

module.exports = { createAI, defaultAIConfig, DEFAULT_LABELS, MODELS, CLOUD, PROVIDER_NAME }
