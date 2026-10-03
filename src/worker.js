// Ventana oculta de Ordena: usa Chromium para abrir imágenes y vídeos,
// reducirlos de tamaño y pasar el filtro de contenido íntimo (NSFW) en la GPU.
// El proceso principal la llama con executeJavaScript(...).
import * as tf from '@tensorflow/tfjs'
import * as nsfwjs from 'nsfwjs'

let modelPromise = null
async function nsfwModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      try { await tf.setBackend('webgl') } catch { await tf.setBackend('cpu') }
      await tf.ready()
      return nsfwjs.load('MobileNetV2Mid')
    })()
  }
  return modelPromise
}

const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))])

function toCanvas(source, w, h, maxSide) {
  const s = Math.min(1, maxSide / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * s))
  c.height = Math.max(1, Math.round(h * s))
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height)
  return c
}
const jpeg = (c) => c.toDataURL('image/jpeg', 0.85).split(',')[1]

async function nsfwScores(canvas) {
  const model = await nsfwModel()
  const preds = await model.classify(canvas)
  const out = {}
  for (const p of preds) out[p.className] = +p.probability.toFixed(4)
  return out
}

function maxScores(list) {
  const out = {}
  for (const s of list) for (const [k, v] of Object.entries(s)) out[k] = Math.max(out[k] || 0, v)
  return out
}

window.analyzeImage = async (url, { nsfw = true, maxSide = 896 } = {}) => {
  try {
    const img = new Image()
    img.src = url
    await withTimeout(img.decode(), 20000, 'No se pudo abrir la imagen')
    const c = toCanvas(img, img.naturalWidth, img.naturalHeight, maxSide)
    return { ok: true, images: [jpeg(c)], width: img.naturalWidth, height: img.naturalHeight, nsfw: nsfw ? await nsfwScores(c) : null }
  } catch (e) {
    return { ok: false, error: e.message || 'Formato no soportado' }
  }
}

window.analyzeVideo = async (url, { nsfw = true, frames = 3, maxSide = 768 } = {}) => {
  const v = document.createElement('video')
  v.muted = true
  v.preload = 'auto'
  v.src = url
  try {
    await withTimeout(new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('Códec no soportado')) }), 20000, 'El vídeo tarda demasiado en abrir')
    const d = isFinite(v.duration) ? v.duration : 0
    const points = frames === 1 ? [0.5] : Array.from({ length: frames }, (_, i) => 0.15 + (0.7 * i) / (frames - 1))
    const images = [], scores = []
    for (const p of points) {
      v.currentTime = Math.max(0, Math.min(d - 0.1, d * p))
      await withTimeout(new Promise((res) => { v.onseeked = res }), 10000, 'No se pudo leer un fotograma')
      const c = toCanvas(v, v.videoWidth, v.videoHeight, maxSide)
      images.push(jpeg(c))
      if (nsfw) scores.push(await nsfwScores(c))
    }
    return { ok: true, images, duration: d, width: v.videoWidth, height: v.videoHeight, nsfw: nsfw ? maxScores(scores) : null }
  } catch (e) {
    return { ok: false, error: e.message || 'Vídeo no soportado' }
  } finally {
    v.removeAttribute('src'); v.load()
  }
}

window.ordenaWorkerReady = true
