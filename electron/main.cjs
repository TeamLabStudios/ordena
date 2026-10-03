const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, Tray, Menu, Notification, nativeImage, safeStorage } = require('electron')
const path = require('path')
const fs = require('fs')
const fsp = fs.promises
const { execFile } = require('child_process')
const { DEFAULT_CATEGORIES, DEFAULT_IGNORED, OTHER, FOLDERS, PROJECTS, DUPLICATES, isIgnored } = require('./categories.cjs')
const { createEngine, isInside, norm } = require('./engine.cjs')
const { createAI, defaultAIConfig, DEFAULT_LABELS, MODELS } = require('./ai.cjs')

const HIDDEN = process.argv.includes('--hidden')
let win, tray, engine, config, ai
let cancelPlan = false
let quitting = false
let rendererReady = false
let pendingOpen = []
const plans = new Map()

// ---------- Configuración ----------
const DEFAULT_RULES = [
  { id: 'r1', enabled: true, name: 'Facturas', match: 'factura, invoice, recibo, ticket', categories: ['Documentos', 'Hojas de cálculo', 'Imágenes'], target: 'Documentos/Facturas/{año}' },
  { id: 'r2', enabled: true, name: 'Nóminas', match: 'nomina, payslip', categories: ['Documentos'], target: 'Documentos/Nóminas/{año}' },
  { id: 'r3', enabled: true, name: 'Contratos', match: 'contrato, contract', categories: ['Documentos'], target: 'Documentos/Contratos' },
  { id: 'r4', enabled: true, name: 'Capturas', match: 'captura de pantalla, screenshot, screen shot, recorte', categories: ['Imágenes', 'Vídeos'], target: '{categoria}/Capturas' },
  { id: 'r5', enabled: true, name: 'WhatsApp', match: 'whatsapp, -wa0', categories: ['Imágenes', 'Vídeos', 'Audio', 'Documentos'], target: '{categoria}/WhatsApp' },
]
const configPath = () => path.join(app.getPath('userData'), 'config.json')
const defaults = () => ({
  dest: path.join(app.getPath('home'), 'Ordenado'),
  copy: false, recursive: true, onTop: false, preview: true,
  dateFolders: true, detectDuplicates: true, sniffContent: true, copyExcludeBuild: true,
  categories: DEFAULT_CATEGORIES, ignored: DEFAULT_IGNORED, rules: DEFAULT_RULES,
  watch: { enabled: false, folders: [app.getPath('downloads')], notify: true },
  startWithWindows: false, contextMenu: false, updateUrl: '',
  ai: defaultAIConfig(),
})
function loadConfig() {
  const d = defaults()
  try {
    const c = JSON.parse(fs.readFileSync(configPath(), 'utf8'))
    const a = { ...d.ai, ...(c.ai || {}) }
    a.laya = { ...d.ai.laya, ...(c.ai?.laya || {}) }
    a.labels = { ...d.ai.labels, ...(c.ai?.labels || {}) }
    return { ...d, ...c, watch: { ...d.watch, ...(c.watch || {}) }, ai: a }
  } catch { return d }
}
function saveConfig() {
  try { fs.mkdirSync(path.dirname(configPath()), { recursive: true }); fs.writeFileSync(configPath(), JSON.stringify(config, null, 2)) } catch {}
}
// Claves de API: cifradas con el almacén seguro del sistema (DPAPI en Windows) y nunca enviadas a la interfaz
function getKey(provider) {
  const v = config.ai.keys?.[provider]
  if (!v) return null
  try { return v.startsWith('enc:') ? safeStorage.decryptString(Buffer.from(v.slice(4), 'base64')) : v.slice(6) } catch { return null }
}
function setKey(provider, key) {
  const keys = { ...(config.ai.keys || {}) }
  if (!key) delete keys[provider]
  else keys[provider] = safeStorage.isEncryptionAvailable() ? 'enc:' + safeStorage.encryptString(key).toString('base64') : 'plain:' + key
  config.ai = { ...config.ai, keys }
  saveConfig()
}
const publicConfig = () => ({ ...config, ai: { ...config.ai, keys: undefined, hasKey: Object.fromEntries(Object.keys(config.ai.keys || {}).map((k) => [k, true])) }, special: [PROJECTS, OTHER, FOLDERS, DUPLICATES, 'Privado'], defaultCategories: DEFAULT_CATEGORIES, defaultLabels: DEFAULT_LABELS, aiModels: MODELS, version: app.getVersion(), packaged: app.isPackaged })

const send = (ch, data) => win && !win.isDestroyed() && win.webContents.send(ch, data)

// Cola única: nunca se ejecutan dos tandas a la vez (manual y automática)
let queue = Promise.resolve()
const enqueue = (job) => (queue = queue.then(job, job))

// ---------- Vigilancia de carpetas (modo automático) ----------
const watchers = new Map()
const timers = new Map()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function isStable(p) {
  try {
    const a = await fsp.stat(p)
    await sleep(1500)
    const b = await fsp.stat(p)
    return a.isFile() && a.size === b.size && a.mtimeMs === b.mtimeMs
  } catch { return false }
}

function scheduleAuto(file, attempt = 0) {
  clearTimeout(timers.get(file))
  timers.set(file, setTimeout(async () => {
    timers.delete(file)
    if (!config.watch.enabled || isIgnored(path.basename(file), config.ignored)) return
    if (!(await isStable(file))) { if (attempt < 20) scheduleAuto(file, attempt + 1); return }
    enqueue(async () => {
      const p = await engine.plan([file])
      if (!p.items.length || p.items.every((i) => i.skip)) return
      const s = await engine.execute(p, { source: 'auto' })
      const r = s.results[0]
      if (r?.status === 'error' && r.note === 'En uso o sin permiso' && attempt < 20) { scheduleAuto(file, attempt + 1); return }
      send('auto', s)
      if (r?.status === 'ok' && config.watch.notify && Notification.isSupported()) {
        const n = new Notification({ title: 'Ordena', body: `${r.name}\n→ ${r.rel}`, silent: true })
        n.on('click', () => shell.showItemInFolder(r.to))
        n.show()
      }
    })
  }, 2500))
}

function refreshWatchers() {
  for (const w of watchers.values()) w.close()
  watchers.clear()
  if (!config.watch.enabled) return
  for (const folder of config.watch.folders || []) {
    if (isInside(folder, config.dest)) continue // no vigilar subcarpetas ya ordenadas
    try {
      const w = fs.watch(folder, { persistent: true }, (_ev, filename) => {
        if (!filename || filename.includes(path.sep)) return
        scheduleAuto(path.join(folder, filename.toString()))
      })
      w.on('error', () => {})
      watchers.set(folder, w)
    } catch {}
  }
}

// ---------- Bandeja del sistema ----------
const iconPath = (n) => path.join(__dirname, 'assets', n)
function refreshTray() {
  const need = config.watch.enabled || config.startWithWindows
  if (!need) { tray?.destroy(); tray = null; return }
  if (!tray) {
    tray = new Tray(nativeImage.createFromPath(iconPath('tray.png')))
    tray.setToolTip('Ordena')
    tray.on('click', showWindow)
  }
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Ordena', click: showWindow },
    { label: 'Ordenar automáticamente', type: 'checkbox', checked: !!config.watch.enabled, click: (m) => setConfig({ watch: { ...config.watch, enabled: m.checked } }) },
    { type: 'separator' },
    { label: 'Salir', click: () => { quitting = true; app.quit() } },
  ]))
}

// ---------- Menú contextual del Explorador (HKCU, sin admin) ----------
const reg = (args) => new Promise((res) => execFile('reg.exe', args, { windowsHide: true }, (err) => res(!err)))
const MENU_KEYS = ['HKCU\\Software\\Classes\\*\\shell\\Ordena', 'HKCU\\Software\\Classes\\Directory\\shell\\Ordena', 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\Ordena']
async function setContextMenu(on) {
  if (process.platform !== 'win32' || !app.isPackaged) return false
  const exe = process.execPath
  if (!on) { for (const k of MENU_KEYS) await reg(['delete', k, '/f']); return true }
  const items = [
    [MENU_KEYS[0], 'Ordenar con Ordena', `"${exe}" "%1"`],
    [MENU_KEYS[1], 'Ordenar con Ordena', `"${exe}" "%1"`],
    [MENU_KEYS[2], 'Ordenar esta carpeta con Ordena', `"${exe}" --carpeta "%V"`],
  ]
  let ok = true
  for (const [k, label, cmd] of items) {
    ok = (await reg(['add', k, '/v', 'MUIVerb', '/d', label, '/f'])) && ok
    ok = (await reg(['add', k, '/v', 'Icon', '/d', exe, '/f'])) && ok
    ok = (await reg(['add', k, '/v', 'MultiSelectModel', '/d', 'Player', '/f'])) && ok
    ok = (await reg(['add', k + '\\command', '/ve', '/d', cmd, '/f'])) && ok
  }
  return ok
}

// ---------- Argumentos (clic derecho → Ordena) ----------
let argTimer
function handleArgs(argv) {
  const args = argv.slice(app.isPackaged ? 1 : 2)
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--carpeta' && args[i + 1]) { pendingOpen.push({ paths: [args[++i]], contentsOnly: true }); continue }
    if (a.startsWith('--') || a === '.' || norm(a) === norm(app.getAppPath())) continue
    if (fs.existsSync(a)) pendingOpen.push({ paths: [a], contentsOnly: false })
  }
  clearTimeout(argTimer)
  argTimer = setTimeout(flushOpen, 600) // el Explorador lanza un proceso por archivo: los juntamos
}
function flushOpen() {
  if (!pendingOpen.length || !rendererReady) return
  const folders = pendingOpen.filter((p) => p.contentsOnly)
  const loose = pendingOpen.filter((p) => !p.contentsOnly).flatMap((p) => p.paths)
  pendingOpen = []
  showWindow()
  for (const f of folders) send('open-paths', f)
  if (loose.length) send('open-paths', { paths: loose, contentsOnly: false })
}

// ---------- Actualizaciones ----------
async function checkUpdates() {
  if (!app.isPackaged) return { status: 'dev' }
  try {
    const { autoUpdater } = require('electron-updater')
    // Por defecto: las Releases de GitHub (configuradas en package.json → build.publish).
    // Si el usuario pone otra dirección en Ajustes, se usa esa.
    if (config.updateUrl) autoUpdater.setFeedURL({ provider: 'generic', url: config.updateUrl })
    autoUpdater.autoDownload = true
    const r = await autoUpdater.checkForUpdates()
    const latest = r?.updateInfo?.version
    if (latest && latest !== app.getVersion()) {
      autoUpdater.once('update-downloaded', () => send('update', { status: 'ready', version: latest }))
      return { status: 'downloading', version: latest }
    }
    return { status: 'latest' }
  } catch (e) { return { status: 'error', message: e.message.split('\n')[0].slice(0, 160) } }
}

// ---------- Ventana ----------
function showWindow() {
  if (!win || win.isDestroyed()) createWindow(true)
  else { if (win.isMinimized()) win.restore(); win.show(); win.focus() }
}

function createWindow(forceShow = false) {
  const dark = nativeTheme.shouldUseDarkColors
  win = new BrowserWindow({
    width: 1040, height: 760, minWidth: 760, minHeight: 580,
    title: 'Ordena',
    icon: iconPath('icon.png'),
    backgroundColor: dark ? '#0e0e10' : '#fafafa',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: dark ? '#e7e7ea' : '#18181b', height: 44 },
    alwaysOnTop: !!config.onTop,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: false },
  })
  win.setMenuBarVisibility(false)
  win.once('ready-to-show', () => { if (!HIDDEN || forceShow) win.show() })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.on('close', (e) => {
    if (!quitting && config.watch.enabled) {
      e.preventDefault()
      win.hide()
      if (!config._trayHint && Notification.isSupported()) {
        new Notification({ title: 'Ordena sigue funcionando', body: 'Está ordenando en segundo plano. Lo tienes junto al reloj.' }).show()
        config._trayHint = true; saveConfig()
      }
    }
  })
  win.on('closed', () => { rendererReady = false; if (!config.watch.enabled) { quitting = true; app.quit() } })
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

function setConfig(patch) {
  const prev = config
  if (patch.ai) patch = { ...patch, ai: { ...patch.ai, keys: config.ai.keys, hasKey: undefined } }
  config = { ...config, ...patch }
  saveConfig()
  if ('onTop' in patch) win?.setAlwaysOnTop(!!config.onTop)
  if ('watch' in patch || 'dest' in patch) refreshWatchers()
  if ('watch' in patch || 'startWithWindows' in patch) refreshTray()
  if ('startWithWindows' in patch && app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!config.startWithWindows, args: ['--hidden'], name: 'Ordena' })
  if ('watch' in patch && prev.watch.enabled !== config.watch.enabled) send('config', publicConfig())
  return publicConfig()
}

// ---------- Arranque ----------
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => { handleArgs(argv); if (!pendingOpen.length) showWindow() })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.david.ordena')
    config = loadConfig()
    ai = createAI({ getConfig: () => config, userData: app.getPath('userData'), distDir: path.join(__dirname, '..', 'dist'), BrowserWindow, getKey })
    engine = createEngine({
      getConfig: () => config,
      userData: app.getPath('userData'),
      onProgress: (p) => send('progress', p),
      ai,
    })

    const storePlan = (p) => { const id = String(Date.now() + Math.random()); plans.set(id, p); if (plans.size > 10) plans.delete(plans.keys().next().value); return { planId: id, ...p } }

    ipcMain.handle('renderer:ready', () => { rendererReady = true; setTimeout(flushOpen, 50); return true })
    ipcMain.handle('config:get', () => publicConfig())
    ipcMain.handle('config:set', (_e, patch) => setConfig(patch))
    ipcMain.handle('contextmenu:set', async (_e, on) => { const ok = await setContextMenu(on); if (ok) setConfig({ contextMenu: on }); return { ok, config: publicConfig() } })
    ipcMain.handle('dest:choose', async () => {
      const r = await dialog.showOpenDialog(win, { title: 'Elige la carpeta destino', defaultPath: config.dest, properties: ['openDirectory', 'createDirectory'] })
      if (r.canceled || !r.filePaths[0]) return null
      setConfig({ dest: r.filePaths[0] })
      return config.dest
    })
    ipcMain.handle('folder:choose', async (_e, title) => {
      const r = await dialog.showOpenDialog(win, { title: title || 'Elige una carpeta', properties: ['openDirectory'] })
      return r.canceled ? null : r.filePaths[0] || null
    })
    ipcMain.handle('dest:open', (_e, sub) => shell.openPath(sub ? path.join(config.dest, ...sub.split(/[\\/]/)) : config.dest))
    ipcMain.handle('file:show', (_e, p) => shell.showItemInFolder(p))
    ipcMain.handle('open:url', (_e, u) => { if (/^https:\/\//.test(u)) shell.openExternal(u) })
    ipcMain.handle('plan', (_e, { paths, contentsOnly }) => { cancelPlan = false; return enqueue(() => engine.plan(paths, { contentsOnly, isCancelled: () => cancelPlan })).then(storePlan) })
    ipcMain.handle('plan:cancel', () => { cancelPlan = true })
    ipcMain.handle('ai:status', () => ai.status())
    ipcMain.handle('ai:gpu', () => ai.gpu().then((g) => ({ gpu: g, recommended: ai.recommend(g?.vramGB) })))
    ipcMain.handle('ai:pull', (_e, model) => ai.pull(model, (p) => send('ai-pull', p)))
    ipcMain.handle('ai:clearCache', () => ai.clearCache())
    ipcMain.handle('ai:setKey', (_e, provider, key) => { setKey(provider, (key || '').trim()); return publicConfig() })
    ipcMain.handle('ai:test', async () => {
      const r = await dialog.showOpenDialog(win, { title: 'Elige una foto, vídeo o documento para probar la IA', properties: ['openFile'] })
      if (r.canceled || !r.filePaths[0]) return null
      const f = r.filePaths[0]
      const { buildIndex, extOf } = require('./categories.cjs')
      const category = buildIndex(config.categories)[extOf(path.basename(f))] || OTHER
      const wasEnabled = config.ai.enabled
      config.ai.enabled = true
      try { return { file: path.basename(f), category, ...(await ai.test(f, category)) } } finally { config.ai.enabled = wasEnabled }
    })
    ipcMain.handle('plan:duplicates', () => enqueue(() => engine.planDuplicateScan()).then(storePlan))
    ipcMain.handle('execute', (_e, { planId, ids }) => {
      const p = plans.get(planId)
      if (!p) return null
      plans.delete(planId)
      return enqueue(() => engine.execute(p, { source: p.forceMove ? 'duplicados' : 'manual', ids }))
    })
    ipcMain.handle('undo', (_e, id) => enqueue(() => engine.undo(id)))
    ipcMain.handle('history:get', () => engine.getHistory())
    ipcMain.handle('history:clear', () => engine.clearHistory())
    ipcMain.handle('stats', () => engine.stats())
    ipcMain.handle('update:check', () => checkUpdates())
    ipcMain.handle('update:install', () => { quitting = true; require('electron-updater').autoUpdater.quitAndInstall() })

    nativeTheme.on('updated', () => {
      const d = nativeTheme.shouldUseDarkColors
      if (win && !win.isDestroyed()) {
        win.setTitleBarOverlay({ color: '#00000000', symbolColor: d ? '#e7e7ea' : '#18181b', height: 44 })
        win.setBackgroundColor(d ? '#0e0e10' : '#fafafa')
      }
    })

    createWindow()
    refreshWatchers()
    refreshTray()
    handleArgs(process.argv)
    if (app.isPackaged) setTimeout(checkUpdates, 8000) // busca versiones nuevas en GitHub al arrancar
  })

  app.on('before-quit', () => { quitting = true; ai?.dispose() })
  app.on('window-all-closed', () => { if (!config?.watch?.enabled) app.quit() })
}
