/**
 * Electron 自动更新模块
 *
 * 使用 electron-updater + GitHub Releases 实现自动更新。
 * 启动后 10 秒首次检查，之后每 4 小时检查一次。
 */

const { autoUpdater } = require('electron-updater')
const log = require('electron-log')

// 配置
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true
autoUpdater.logger = log
autoUpdater.logger.transports.file.level = 'info'

// 状态
let _mainWindow = null
let _status = { state: 'idle' }

function broadcast(status) {
  _status = status
  if (_mainWindow && !_mainWindow.isDestroyed()) {
    _mainWindow.webContents.send('updater:status-changed', status)
  }
}

function getStatus() {
  return _status
}

function checkForUpdates() {
  if (!autoUpdater.isUpdaterActive()) {
    log.info('[Updater] 更新器未激活（可能在开发模式）')
    return
  }
  autoUpdater.checkForUpdates().catch(err => {
    log.error('[Updater] 检查更新失败:', err.message)
    broadcast({ state: 'error', error: err.message })
  })
}

function quitAndInstall() {
  autoUpdater.quitAndInstall(true, true)
}

function initUpdater(mainWindow) {
  _mainWindow = mainWindow

  autoUpdater.on('checking-for-update', () => {
    log.info('[Updater] 正在检查更新...')
    broadcast({ state: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    log.info('[Updater] 发现新版本:', info.version)
    broadcast({ state: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    log.info('[Updater] 已是最新版本')
    broadcast({ state: 'not-available' })
  })

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent)
    log.info(`[Updater] 下载进度: ${percent}%`)
    broadcast({
      state: 'downloading',
      progress: {
        percent,
        transferred: progress.transferred,
        total: progress.total,
        speed: progress.bytesPerSecond,
      }
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info('[Updater] 更新下载完成:', info.version)
    broadcast({ state: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (err) => {
    log.error('[Updater] 错误:', err.message)
    broadcast({ state: 'error', error: err.message })
  })

  log.info('[Updater] 更新器已初始化')
}

module.exports = { initUpdater, checkForUpdates, quitAndInstall, getStatus }
