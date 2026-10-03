const { contextBridge, ipcRenderer, webUtils } = require('electron')

const on = (ch) => (cb) => {
  const h = (_e, d) => cb(d)
  ipcRenderer.on(ch, h)
  return () => ipcRenderer.removeListener(ch, h)
}

contextBridge.exposeInMainWorld('ordena', {
  ready: () => ipcRenderer.invoke('renderer:ready'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  setContextMenu: (on) => ipcRenderer.invoke('contextmenu:set', on),
  chooseDest: () => ipcRenderer.invoke('dest:choose'),
  chooseFolder: (title) => ipcRenderer.invoke('folder:choose', title),
  openDest: (sub) => ipcRenderer.invoke('dest:open', sub),
  showFile: (p) => ipcRenderer.invoke('file:show', p),
  openUrl: (u) => ipcRenderer.invoke('open:url', u),
  plan: (paths, contentsOnly = false) => ipcRenderer.invoke('plan', { paths, contentsOnly }),
  planDuplicates: () => ipcRenderer.invoke('plan:duplicates'),
  execute: (planId, ids) => ipcRenderer.invoke('execute', { planId, ids }),
  undo: (id) => ipcRenderer.invoke('undo', id),
  history: () => ipcRenderer.invoke('history:get'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  stats: () => ipcRenderer.invoke('stats'),
  checkUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  cancelPlan: () => ipcRenderer.invoke('plan:cancel'),
  memory: () => ipcRenderer.invoke('memory:get'),
  clearDismissed: () => ipcRenderer.invoke('memory:clearDismissed'),
  aiStatus: () => ipcRenderer.invoke('ai:status'),
  aiGpu: () => ipcRenderer.invoke('ai:gpu'),
  aiPull: (model) => ipcRenderer.invoke('ai:pull', model),
  aiTest: () => ipcRenderer.invoke('ai:test'),
  aiClearCache: () => ipcRenderer.invoke('ai:clearCache'),
  aiSetKey: (provider, key) => ipcRenderer.invoke('ai:setKey', provider, key),
  onAiPull: on('ai-pull'),
  pathFor: (file) => webUtils.getPathForFile(file),
  onProgress: on('progress'),
  onAuto: on('auto'),
  onOpenPaths: on('open-paths'),
  onConfig: on('config'),
  onUpdate: on('update'),
})
