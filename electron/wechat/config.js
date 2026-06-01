/**
 * 微信 Bridge 配置管理
 *
 * 凭证通过 Electron safeStorage 加密存储。
 */

const { safeStorage } = require('electron')
const path = require('path')
const fs = require('fs')

function getConfigDir(app) {
  return app.isPackaged
    ? path.join(app.getPath('userData'), 'agent-running-data')
    : path.join(__dirname, '..', '..', '.ta_agent')
}

function getConfigPath(app) {
  return path.join(getConfigDir(app), 'configs', 'wechat.json')
}

function getSyncPath(app) {
  return path.join(getConfigDir(app), 'wechat-sync.json')
}

function loadConfig(app) {
  const configPath = getConfigPath(app)
  if (!fs.existsSync(configPath)) {
    return { enabled: false, credentials: null, defaultWorkspace: '' }
  }
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    // 解密凭证
    if (raw.encrypted_credentials) {
      try {
        raw.credentials = JSON.parse(safeStorage.decryptString(Buffer.from(raw.encrypted_credentials, 'base64')))
      } catch {
        raw.credentials = null
      }
    }
    return raw
  } catch {
    return { enabled: false, credentials: null, defaultWorkspace: '' }
  }
}

function saveConfig(app, config) {
  const configPath = getConfigPath(app)
  fs.mkdirSync(path.dirname(configPath), { recursive: true })

  const toSave = { ...config }
  // 加密凭证
  if (toSave.credentials) {
    try {
      toSave.encrypted_credentials = safeStorage.encryptString(JSON.stringify(toSave.credentials)).toString('base64')
    } catch {
      // safeStorage 不可用时明文存储（开发环境）
      toSave.encrypted_credentials = null
    }
    delete toSave.credentials
  }

  fs.writeFileSync(configPath, JSON.stringify(toSave, null, 2), 'utf8')
}

function clearCredentials(app) {
  const config = loadConfig(app)
  config.credentials = null
  config.enabled = false
  saveConfig(app, config)
}

function loadSyncCursor(app) {
  const syncPath = getSyncPath(app)
  if (!fs.existsSync(syncPath)) return null
  try {
    return JSON.parse(fs.readFileSync(syncPath, 'utf8'))
  } catch {
    return null
  }
}

function saveSyncCursor(app, cursor) {
  const syncPath = getSyncPath(app)
  fs.mkdirSync(path.dirname(syncPath), { recursive: true })
  fs.writeFileSync(syncPath, JSON.stringify(cursor), 'utf8')
}

module.exports = {
  loadConfig,
  saveConfig,
  clearCredentials,
  loadSyncCursor,
  saveSyncCursor,
}
