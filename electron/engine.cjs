// Motor de Ordena: planifica qué va a dónde, lo ejecuta y guarda historial.
const path = require('path')
const fs = require('fs')
const fsp = fs.promises
const crypto = require('crypto')
const { OTHER, FOLDERS, PROJECTS, DUPLICATES, PRIVATE, extOf, buildIndex, isIgnored } = require('./categories.cjs')
const { detectProject, dirSize, SKIP_DIRS, BUILD_DIRS } = require('./projects.cjs')
const { sniff } = require('./sniff.cjs')

let exifr = null
try { exifr = require('exifr') } catch {}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DATE_CATS = new Set(['Imágenes', 'Vídeos'])

// ---------- utilidades ----------
const exists = (p) => fsp.access(p).then(() => true, () => false)
const norm = (p) => path.resolve(p).toLowerCase()
const isInside = (child, parent) => {
  const rel = path.relative(norm(parent), norm(child))
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
}
const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const safeSeg = (s) => s.replace(/[<>:"|?*]/g, '').replace(/\.+$/, '').trim()

async function uniquePath(dir, name, reserved) {
  const ext = path.extname(name)
  const base = ext ? name.slice(0, -ext.length) : name
  let candidate = path.join(dir, name)
  let n = 1
  while ((reserved && reserved.has(norm(candidate))) || (await exists(candidate))) candidate = path.join(dir, `${base} (${n++})${ext}`)
  reserved?.add(norm(candidate))
  return candidate
}

async function moveAny(from, to, isDir) {
  try {
    await fsp.rename(from, to)
  } catch (e) {
    if (e.code !== 'EXDEV') throw e // otro disco: copiar y borrar
    await fsp.cp(from, to, { recursive: isDir, errorOnExist: true, force: false, preserveTimestamps: true })
    await fsp.rm(from, { recursive: isDir, force: true })
  }
}

function hashFile(file) {
  return new Promise((resolve) => {
    const h = crypto.createHash('sha1')
    fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', () => resolve(null))
  })
}

// Fecha para "Año/Mes": EXIF → fecha en el nombre → fecha de modificación
async function fileDate(file, name, stat, category) {
  if (category === 'Imágenes' && exifr) {
    try {
      const t = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate'])
      const d = t?.DateTimeOriginal || t?.CreateDate
      if (d instanceof Date && !isNaN(d) && d.getFullYear() > 1980) return d
    } catch {}
  }
  const m = name.match(/(?<!\d)(19[89]\d|20\d{2})[-_.]?(0[1-9]|1[0-2])(?:[-_.]?(0[1-9]|[12]\d|3[01]))?(?!\d)/)
  if (m) return new Date(+m[1], +m[2] - 1, +(m[3] || 1))
  return stat.mtime
}
const dateSub = (d) => path.join(String(d.getFullYear()), `${String(d.getMonth() + 1).padStart(2, '0')} ${MONTHS[d.getMonth()]}`)

function matchRule(rules, name, category) {
  const n = plain(name)
  for (const r of rules || []) {
    if (!r.enabled || !r.target) continue
    if (r.categories?.length && !r.categories.includes(category)) continue
    const m = (r.match || '').trim()
    if (!m) continue
    let ok = false
    if (m.startsWith('/') && m.lastIndexOf('/') > 0) {
      try { ok = new RegExp(m.slice(1, m.lastIndexOf('/')), m.slice(m.lastIndexOf('/') + 1) || 'i').test(name) } catch {}
    } else ok = m.split(',').map((k) => plain(k.trim())).filter(Boolean).some((k) => n.includes(k))
    if (ok) return r
  }
  return null
}

function createEngine({ getConfig, userData, onProgress, ai = null }) {
  // ---------- historial persistente ----------
  const histFile = path.join(userData, 'history.json')
  let history = []
  try { history = JSON.parse(fs.readFileSync(histFile, 'utf8')) } catch {}
  const saveHistory = () => { try { fs.mkdirSync(userData, { recursive: true }); fs.writeFileSync(histFile, JSON.stringify(history.slice(0, 100))) } catch {} }

  // ---------- recolección ----------
  async function walk(dir, out, deep, cfg) {
    let entries
    try { entries = await fsp.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isFile()) { if (!isIgnored(e.name, cfg.ignored)) out.push({ src: full, isDir: false }) }
      else if (e.isDirectory()) {
        if (norm(full) === norm(cfg.dest)) continue // nunca entrar en el destino
        const project = await detectProject(full)
        if (project) out.push({ src: full, isDir: true, project })
        else if (deep && !SKIP_DIRS.has(e.name.toLowerCase())) await walk(full, out, deep, cfg)
      }
    }
  }

  async function collect(paths, { contentsOnly }, cfg) {
    const items = []
    for (const p of paths) {
      let st
      try { st = await fsp.stat(p) } catch { continue }
      if (st.isFile()) {
        items.push(isIgnored(path.basename(p), cfg.ignored) ? { src: p, isDir: false, skip: 'Temporal o de sistema' } : { src: p, isDir: false })
        continue
      }
      if (!st.isDirectory()) continue
      const project = await detectProject(p)
      if (project && contentsOnly) items.push({ src: p, isDir: true, project, skip: `Es un proyecto ${project}: no se separa` })
      else if (project) items.push({ src: p, isDir: true, project })
      else if (cfg.recursive || contentsOnly) await walk(p, items, cfg.recursive, cfg)
      else items.push({ src: p, isDir: true })
    }
    return items
  }

  // ---------- planificación ----------
  async function plan(paths, opts = {}) {
    const cfg = getConfig()
    const dest = cfg.dest
    const index = buildIndex(cfg.categories)
    const raw = await collect(paths, opts, cfg)
    const dirIndex = new Map() // carpeta destino -> Map(tamaño -> [rutas])
    const hashes = new Map()
    const hashOf = async (p) => { if (!hashes.has(p)) hashes.set(p, await hashFile(p)); return hashes.get(p) }

    // Índice de tamaños de toda la carpeta de categoría (incluye subcarpetas de año/mes, reglas…)
    async function sizeIndex(targetDir) {
      const top = path.join(dest, path.relative(dest, targetDir).split(path.sep)[0])
      if (dirIndex.has(top)) return dirIndex.get(top)
      const m = new Map()
      let budget = 50000
      async function scan(dir) {
        for (const e of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
          if (--budget < 0) return
          const p = path.join(dir, e.name)
          if (e.isDirectory()) await scan(p)
          else if (e.isFile()) { try { const s = (await fsp.stat(p)).size; if (!m.has(s)) m.set(s, []); m.get(s).push(p) } catch {} }
        }
      }
      await scan(top)
      dirIndex.set(top, m)
      return m
    }

    const items = []
    for (let i = 0; i < raw.length; i++) {
      if (opts.isCancelled?.()) return { dest, copy: cfg.copy, items: [], cancelled: true }
      const it = raw[i]
      const name = path.basename(it.src)
      const item = { id: String(i), src: it.src, name, isDir: it.isDir, project: it.project || null, skip: it.skip || null, note: null }

      if (!item.skip && isInside(it.src, dest) && norm(path.dirname(it.src)) !== norm(dest)) item.skip = 'Ya organizado'
      if (!item.skip && it.isDir && (norm(it.src) === norm(dest) || isInside(dest, it.src))) item.skip = 'Contiene el destino'

      if (it.project) {
        item.category = PROJECTS
        item.targetDir = path.join(dest, PROJECTS, it.project)
        if (!item.skip) {
          const s = await dirSize(it.src)
          item.size = s.bytes
          item.sizePartial = s.partial
          if (cfg.copy && cfg.copyExcludeBuild) item.note = 'Sin node_modules/bin/obj'
        }
      } else if (it.isDir) {
        item.category = FOLDERS
        item.targetDir = path.join(dest, FOLDERS)
      } else {
        let st
        try { st = await fsp.stat(it.src) } catch { st = null }
        item.size = st?.size ?? 0
        let ext = extOf(name)
        let category = index[ext]
        if (!category && cfg.sniffContent) {
          const s = await sniff(it.src)
          if (s && index[s.ext]) { category = index[s.ext]; item.note = `Reconocido como .${s.ext}` }
        }
        category = category || OTHER
        item.category = category

        const rule = matchRule(cfg.rules, name, category)

        // IA: subcarpeta por contenido y filtro de contenido íntimo (las reglas tienen prioridad, salvo lo íntimo)
        let aiRes = null
        if (ai && st && !item.skip) {
          onProgress?.({ phase: 'ai', index: i + 1, total: raw.length, name })
          aiRes = await ai.classify(it.src, category, st, { needLabel: !rule })
          if (aiRes) {
            item.aiDesc = aiRes.desc || null
            item.aiError = aiRes.error || null
            item.aiBy = aiRes.by || null
          }
        }

        let target
        if (aiRes?.private) {
          target = path.join(dest, PRIVATE, category)
          item.private = true
        } else if (rule) {
          const d = st ? await fileDate(it.src, name, st, category) : new Date()
          const sub = rule.target
            .replace(/\{categor[ií]a\}/gi, category)
            .replace(/\{a[ñn]o\}/gi, String(d.getFullYear()))
            .replace(/\{mes\}/gi, `${String(d.getMonth() + 1).padStart(2, '0')} ${MONTHS[d.getMonth()]}`)
            .replace(/\{ia\}/gi, aiRes?.label || '')
          target = path.join(dest, ...sub.split(/[\\/]+/).map(safeSeg).filter((s) => s && s !== '..'))
          item.rule = rule.name || rule.match
        } else {
          target = path.join(dest, category)
          if (aiRes?.label && aiRes.label !== 'Otros') { target = path.join(target, safeSeg(aiRes.label)); item.ai = aiRes.label }
          if (cfg.dateFolders && DATE_CATS.has(category) && st) target = path.join(target, dateSub(await fileDate(it.src, name, st, category)))
        }
        item.targetDir = target

        // ¿Duplicado exacto de algo que ya está en esa carpeta (o en esta misma tanda)?
        if (!item.skip && cfg.detectDuplicates && st && st.size > 0) {
          const idx = await sizeIndex(target)
          for (const other of idx.get(st.size) || []) {
            if (norm(other) === norm(it.src)) continue
            const [a, b] = await Promise.all([hashOf(it.src), hashOf(other)])
            if (a && a === b) { item.duplicateOf = other; break }
          }
          if (item.duplicateOf) item.targetDir = item.private ? path.join(dest, PRIVATE, DUPLICATES) : path.join(dest, DUPLICATES, category)
          else { if (!idx.has(st.size)) idx.set(st.size, []); idx.get(st.size).push(it.src) }
        }
      }
      item.rel = path.relative(dest, item.targetDir) || '.'
      items.push(item)
      onProgress?.({ phase: 'plan', index: i + 1, total: raw.length })
    }
    return { dest, copy: cfg.copy, items }
  }

  // ---------- duplicados ya existentes en el destino ----------
  async function planDuplicateScan() {
    const cfg = getConfig()
    const dest = cfg.dest
    const files = []
    async function scan(dir, top) {
      for (const e of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) {
          if (dir === dest && [PROJECTS, DUPLICATES, FOLDERS, PRIVATE].includes(e.name)) continue
          await scan(full, top || e.name)
        } else if (e.isFile()) {
          try { const s = await fsp.stat(full); if (s.size > 0) files.push({ p: full, size: s.size, mtime: s.mtimeMs, top: top || OTHER }) } catch {}
        }
      }
    }
    await scan(dest, null)
    const bySize = new Map()
    for (const f of files) { if (!bySize.has(f.size)) bySize.set(f.size, []); bySize.get(f.size).push(f) }
    const items = []
    let n = 0
    const groups = [...bySize.values()].filter((g) => g.length > 1)
    for (let gi = 0; gi < groups.length; gi++) {
      const byHash = new Map()
      for (const f of groups[gi]) { const h = await hashFile(f.p); if (!h) continue; if (!byHash.has(h)) byHash.set(h, []); byHash.get(h).push(f) }
      for (const same of byHash.values()) {
        if (same.length < 2) continue
        same.sort((a, b) => a.mtime - b.mtime) // conservamos el más antiguo
        for (const d of same.slice(1)) {
          const targetDir = path.join(dest, DUPLICATES, d.top)
          items.push({ id: String(n++), src: d.p, name: path.basename(d.p), isDir: false, category: DUPLICATES, targetDir, rel: path.relative(dest, targetDir), size: d.size, duplicateOf: same[0].p })
        }
      }
      onProgress?.({ phase: 'plan', index: gi + 1, total: groups.length })
    }
    return { dest, copy: false, forceMove: true, items }
  }

  // ---------- ejecución ----------
  async function execute(planned, { source = 'manual', ids = null } = {}) {
    const cfg = getConfig()
    const copy = planned.forceMove ? false : cfg.copy
    const chosen = planned.items.filter((it) => !it.skip && (!ids || ids.includes(it.id)))
    const records = []
    const reserved = new Set()
    const summary = { moved: 0, skipped: planned.items.length - chosen.length, errors: 0, total: chosen.length, results: [] }
    for (let i = 0; i < chosen.length; i++) {
      const it = chosen[i]
      const result = { id: `${Date.now()}-${i}`, name: it.name, category: it.category, project: it.project, rel: it.rel, src: it.src, size: it.size, duplicate: !!it.duplicateOf, rule: it.rule, ai: it.ai, aiDesc: it.aiDesc, private: it.private, auto: source === 'auto' }
      try {
        if (!(await exists(it.src))) throw Object.assign(new Error('Ya no existe'), { code: 'ENOENT' })
        await fsp.mkdir(it.targetDir, { recursive: true })
        const to = await uniquePath(it.targetDir, it.name, reserved)
        if (copy) {
          const filter = it.project && cfg.copyExcludeBuild
            ? (s) => !(BUILD_DIRS.has(path.basename(s).toLowerCase()) && norm(s) !== norm(it.src))
            : undefined
          await fsp.cp(it.src, to, { recursive: it.isDir, errorOnExist: true, force: false, preserveTimestamps: true, filter })
        } else await moveAny(it.src, to, it.isDir)
        records.push({ from: it.src, to, copied: copy, isDir: it.isDir })
        summary.moved++
        Object.assign(result, { status: 'ok', to })
      } catch (e) {
        summary.errors++
        Object.assign(result, { status: 'error', note: e.code === 'EBUSY' || e.code === 'EPERM' ? 'En uso o sin permiso' : e.code === 'ENOENT' ? 'Ya no existe' : e.message })
      }
      summary.results.push(result)
      onProgress?.({ phase: 'run', index: i + 1, total: chosen.length, result })
    }
    if (records.length) {
      history.unshift({ id: String(Date.now()), date: new Date().toISOString(), source, copied: copy, count: records.length, items: records, undone: false })
      saveHistory()
    }
    return summary
  }

  async function undo(batchId) {
    const batch = batchId ? history.find((b) => b.id === batchId) : history.find((b) => !b.undone)
    if (!batch || batch.undone) return { restored: 0, failed: 0 }
    const dest = getConfig().dest
    let restored = 0, failed = 0
    for (const r of [...batch.items].reverse()) {
      try {
        if (!(await exists(r.to))) throw new Error('missing')
        if (r.copied) await fsp.rm(r.to, { recursive: r.isDir, force: true })
        else {
          await fsp.mkdir(path.dirname(r.from), { recursive: true })
          const back = (await exists(r.from)) ? await uniquePath(path.dirname(r.from), path.basename(r.from)) : r.from
          await moveAny(r.to, back, r.isDir)
        }
        restored++
        for (let dir = path.dirname(r.to); isInside(dir, dest); dir = path.dirname(dir)) {
          if ((await fsp.readdir(dir).catch(() => ['x'])).length) break
          await fsp.rmdir(dir).catch(() => {})
        }
      } catch { failed++ }
    }
    batch.undone = true
    saveHistory()
    return { restored, failed }
  }

  const getHistory = () => history.map(({ items, ...b }) => ({ ...b, sample: items.slice(0, 4).map((r) => path.basename(r.to)), dirs: [...new Set(items.map((r) => path.relative(getConfig().dest, path.dirname(r.to))))].slice(0, 4) }))
  const clearHistory = () => { history = []; saveHistory() }

  // ---------- estadísticas ----------
  async function stats() {
    const cfg = getConfig()
    const out = {}
    async function count(dir, budget = { n: 20000 }) {
      let c = 0
      for (const e of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
        if (--budget.n < 0) break
        if (e.isFile()) c++
        else if (e.isDirectory()) c += await count(path.join(dir, e.name), budget)
      }
      return c
    }
    for (const c of [...Object.keys(cfg.categories), OTHER, DUPLICATES, PRIVATE]) {
      const p = path.join(cfg.dest, c)
      if (await exists(p)) out[c] = await count(p)
    }
    const folders = await fsp.readdir(path.join(cfg.dest, FOLDERS)).catch(() => null)
    if (folders) out[FOLDERS] = folders.length
    const types = await fsp.readdir(path.join(cfg.dest, PROJECTS), { withFileTypes: true }).catch(() => null)
    if (types) {
      out[PROJECTS] = 0
      out.projectTypes = {}
      for (const t of types.filter((d) => d.isDirectory())) {
        const n = (await fsp.readdir(path.join(cfg.dest, PROJECTS, t.name)).catch(() => [])).length
        if (!n) continue
        out.projectTypes[t.name] = n
        out[PROJECTS] += n
      }
    }
    return out
  }

  return { plan, planDuplicateScan, execute, undo, getHistory, clearHistory, stats }
}

module.exports = { createEngine, isInside, norm }
