/**
 * TAgent Electron preload script.
 *
 * Exposes a small, safe API surface to the renderer process.
 */

const { contextBridge, ipcRenderer } = require('electron')

const runtimeHost = process.env.TAGENT_RUNTIME_HOST || '127.0.0.1'
const runtimePort = Number(process.env.TAGENT_RUNTIME_PORT || 8080)
const runtimeEndpoint = {
  host: runtimeHost,
  port: runtimePort,
  apiBase: process.env.TAGENT_RUNTIME_URL || `http://${runtimeHost}:${runtimePort}`,
  wsUrl: `ws://${runtimeHost}:${runtimePort}/ws`,
}

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  runtimeEndpoint,

  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getRuntimeEndpoint: () => ipcRenderer.invoke('runtime-endpoint'),
  restartRuntime: () => ipcRenderer.invoke('runtime-restart'),
  getBackendLogPath: () => ipcRenderer.invoke('backend-log-path'),
  openBackendLog: () => ipcRenderer.invoke('open-backend-log'),
  openUserDataDir: () => ipcRenderer.invoke('open-user-data-dir'),

  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getMode: () => ipcRenderer.invoke('get-mode'),
  setMode: (mode) => ipcRenderer.invoke('set-mode', mode),

  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  openFile: () => ipcRenderer.invoke('dialog-open-file'),
  openFolder: () => ipcRenderer.invoke('dialog-open-folder'),

  // 更新器 API
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:check'),
    quitAndInstall: () => ipcRenderer.invoke('updater:quit-install'),
    getStatus: () => ipcRenderer.invoke('updater:get-status'),
    onStatusChanged: (callback) => ipcRenderer.on('updater:status-changed', (_event, status) => callback(status)),
  },

  // 微信 Bridge API
  wechat: {
    getConfig: () => ipcRenderer.invoke('wechat:get-config'),
    startLogin: () => ipcRenderer.invoke('wechat:start-login'),
    logout: () => ipcRenderer.invoke('wechat:logout'),
    startBridge: () => ipcRenderer.invoke('wechat:start-bridge'),
    stopBridge: () => ipcRenderer.invoke('wechat:stop-bridge'),
    getStatus: () => ipcRenderer.invoke('wechat:get-status'),
    setupListener: () => ipcRenderer.invoke('wechat:setup-listener'),
    onStatusChanged: (callback) => ipcRenderer.on('wechat:status-changed', (_event, state) => callback(state)),
  },
})

console.log('[Preload] API injected')
