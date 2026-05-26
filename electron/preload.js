/**
 * TAgent Electron preload script.
 *
 * Exposes a small, safe API surface to the renderer process.
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,

  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
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

  openFile: () => ipcRenderer.invoke('dialog-open-file'),
  openFolder: () => ipcRenderer.invoke('dialog-open-folder'),

  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', callback),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', callback),
})

console.log('[Preload] API injected')
