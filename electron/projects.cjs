// Detecta si una carpeta es la raíz de un proyecto de software.
// Si lo es, se mueve ENTERA (nunca se separan sus archivos).
const path = require('path')
const fsp = require('fs').promises

const readJson = (p) => fsp.readFile(p, 'utf8').then(JSON.parse, () => null)
const readText = (p) => fsp.readFile(p, 'utf8').catch(() => '')

function fromPackageJson(pkg, dirs) {
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) }
  const has = (d) => d in deps
  if (dirs.includes('src-tauri') || has('@tauri-apps/api') || has('@tauri-apps/cli')) return 'Tauri'
  if (has('react-native') || has('expo')) return 'React Native'
  if (has('next')) return 'Next.js'
  if (has('electron')) return 'Electron'
  if (has('react')) return 'React'
  if (has('nuxt')) return 'Nuxt'
  if (has('vue')) return 'Vue'
  if (has('@angular/core')) return 'Angular'
  if (has('svelte') || has('@sveltejs/kit')) return 'Svelte'
  if (has('astro')) return 'Astro'
  if (has('vite')) return 'Vite'
  if (has('express') || has('fastify') || has('@nestjs/core')) return 'Node.js'
  return 'Node.js'
}

function dotnetFromFiles(names) {
  if (names.some((n) => n.endsWith('.vbproj'))) return 'VB.NET'
  if (names.some((n) => n.endsWith('.csproj'))) return 'C#'
  if (names.some((n) => n.endsWith('.fsproj'))) return 'F#'
  return null
}

async function detectProject(dir) {
  let entries
  try { entries = await fsp.readdir(dir, { withFileTypes: true }) } catch { return null }
  const files = entries.filter((e) => e.isFile()).map((e) => e.name.toLowerCase())
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name.toLowerCase())
  const f = (n) => files.includes(n)
  const ext = (x) => files.some((n) => n.endsWith(x))

  // .NET (solución o proyecto suelto)
  const dn = dotnetFromFiles(files)
  if (dn) return dn
  if (ext('.sln') || ext('.slnx')) {
    for (const d of entries.filter((e) => e.isDirectory())) {
      const sub = await fsp.readdir(path.join(dir, d.name)).catch(() => [])
      const t = dotnetFromFiles(sub.map((s) => s.toLowerCase()))
      if (t) return t
    }
    return '.NET'
  }

  if (f('pubspec.yaml')) return 'Flutter'
  if (f('artisan') && f('composer.json')) return 'Laravel'
  if (f('package.json')) return fromPackageJson(await readJson(path.join(dir, 'package.json')), dirs)
  if (f('cargo.toml')) return 'Rust'
  if (f('go.mod')) return 'Go'
  if (f('manage.py')) return 'Django'
  if (f('pyproject.toml') || f('setup.py') || f('requirements.txt') || f('pipfile') || f('environment.yml') || f('setup.cfg')) return 'Python'
  if (f('pom.xml') || f('build.gradle') || f('build.gradle.kts') || f('settings.gradle') || f('settings.gradle.kts')) {
    const g = (await readText(path.join(dir, 'build.gradle'))) + (await readText(path.join(dir, 'build.gradle.kts'))) + (await readText(path.join(dir, 'pom.xml')))
    if (g.includes('spring-boot') || g.includes('org.springframework')) return 'Spring'
    if (g.includes('com.android') || (dirs.includes('app') && !f('pom.xml'))) return 'Android'
    return 'Java'
  }
  if (f('composer.json')) return 'PHP'
  if (f('gemfile')) return 'Ruby'
  if (f('project.godot')) return 'Godot'
  if (dirs.includes('assets') && dirs.includes('projectsettings')) return 'Unity'
  if (ext('.uproject')) return 'Unreal'
  if (dirs.some((d) => d.endsWith('.xcodeproj')) || dirs.some((d) => d.endsWith('.xcworkspace'))) return 'iOS'
  if (f('cmakelists.txt') || f('makefile') || f('meson.build')) return 'C-C++'
  if (dirs.includes('.git')) return 'Otros'
  return null
}

// Carpetas que nunca se recorren por dentro al buscar archivos sueltos
const SKIP_DIRS = new Set(['node_modules', '.git', '.venv', 'venv', '__pycache__', '.idea', '.vs', '.vscode'])
// Carpetas de dependencias/compilación que se pueden omitir al COPIAR un proyecto
const BUILD_DIRS = new Set(['node_modules', 'bin', 'obj', 'target', 'dist', 'build', '.next', '.nuxt', '.svelte-kit', '__pycache__', '.venv', 'venv', '.gradle', '.dart_tool', 'library', 'temp'])

// Tamaño de una carpeta (con límite para no tardar demasiado en proyectos enormes)
async function dirSize(dir, { exclude = null, limit = 400000 } = {}) {
  let total = 0, count = 0, partial = false
  const stack = [dir]
  while (stack.length) {
    const d = stack.pop()
    let entries
    try { entries = await fsp.readdir(d, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      if (++count > limit) { partial = true; return { bytes: total, partial } }
      const full = path.join(d, e.name)
      if (e.isDirectory()) { if (!exclude || !exclude.has(e.name.toLowerCase())) stack.push(full) }
      else if (e.isFile()) { try { total += (await fsp.stat(full)).size } catch {} }
    }
  }
  return { bytes: total, partial }
}

module.exports = { detectProject, dirSize, SKIP_DIRS, BUILD_DIRS }
