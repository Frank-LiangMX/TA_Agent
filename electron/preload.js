/**
 * TAgent Electron 预加载脚本
 * 
 * 在渲染进程中安全地暴露 Node.js API
 */

const { contextBridge, ipcRenderer } = require('electron')

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 平台信息
  platform: process.platform,
  isElectron: true,
  
  // 应用信息
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getBackendLogPath: () => ipcRenderer.invoke('backend-log-path'),
  openBackendLog: () => ipcRenderer.invoke('open-backend-log'),
  openUserDataDir: () => ipcRenderer.invoke('open-user-data-dir'),
  
  // 窗口控制
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  
  // 文件对话框
  openFile: () => ipcRenderer.invoke('dialog-open-file'),
  openFolder: () => ipcRenderer.invoke('dialog-open-folder'),
  
  // 事件监听
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', callback),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', callback),
})

console.log('[Preload] API 已注入')
