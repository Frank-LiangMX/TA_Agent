/**
 * TAgent Electron 主进程
 */

// 设置控制台编码为 UTF-8
process.stdout.setDefaultEncoding?.('utf8')
process.stderr.setDefaultEncoding?.('utf8')

const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, shell } = require('electron')
const { spawn, spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const http = require('http')

// 微信 Bridge（延迟加载）
let wechatBridge = null

const SERVER_HOST = '127.0.0.1'
const SERVER_PORT = 8080
const SERVER_URL = `http://${SERVER_HOST}:${SERVER_PORT}`
const DEV_FRONTEND_URL = 'http://localhost:5175'  // Vite 开发服务器
const STARTUP_TIMEOUT = 30000

if (process.platform === 'win32') {
  app.setAppUserModelId('com.tagent.desktop')
  try {
    spawnSync('chcp', ['65001'], { shell: true, stdio: 'ignore' })
  } catch {
    // 控制台编码设置失败不影响应用启动。
  }
}

let mainWindow = null
let pythonProcess = null
let tray = null
let isQuitting = false

function getAppIconPath() {
  const icoPath = path.join(__dirname, 'assets', 'icon.ico')
  const pngPath = path.join(__dirname, 'assets', 'icon.png')
  if (process.platform === 'win32' && fs.existsSync(icoPath)) return icoPath
  if (fs.existsSync(pngPath)) return pngPath
  return undefined
}

function getConfigPath() {
  return path.join(getAgentDataDir(), 'configs', 'app-config.json')
}

function getAgentDataDir() {
  // 开发模式：使用项目内的 .ta_agent 目录（与 Python 后端一致）
  if (!app.isPackaged) {
    return path.join(__dirname, '..', '.ta_agent')
  }
  // 打包模式：使用 AppData 目录
  return path.join(app.getPath('userData'), 'agent-running-data')
}

function loadConfig() {
  const configPath = getConfigPath()
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'))
    } catch (err) {
      console.error('[Electron] 读取配置失败:', err)
    }
  }
  // 默认配置
  return {
    mode: 'local',
    local: {
      llm_provider: 'glm',
      llm_api_key: '',
      llm_base_url: '',
      llm_model: 'glm-5',
      blender_path: '',
    },
    online: {
      server_host: '',
      server_port: 8081,
      user_id: '',
      user_name: '',
    },
  }
}

function saveConfig(config) {
  const configPath = getConfigPath()
  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
    console.log('[Electron] 配置已保存:', configPath)
    return { success: true }
  } catch (err) {
    console.error('[Electron] 保存配置失败:', err)
    return { success: false, error: err.message }
  }
}

function getBackendLogPath() {
  return path.join(getAgentDataDir(), 'backend.log')
}

function registerIpcHandlers() {
  ipcMain.handle('get-app-version', () => app.getVersion())
  ipcMain.handle('backend-log-path', () => getBackendLogPath())

  // 窗口控制
  ipcMain.on('window-minimize', () => mainWindow?.minimize())
  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.on('window-close', () => mainWindow?.close())
  ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false)

  ipcMain.handle('open-backend-log', async () => {
    const logPath = getBackendLogPath()
    if (!fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, '', 'utf8')
    }

    const error = await shell.openPath(logPath)
    return { ok: !error, error: error || undefined, path: logPath }
  })
  ipcMain.handle('open-user-data-dir', async () => {
    const dir = getAgentDataDir()
    fs.mkdirSync(dir, { recursive: true })
    const error = await shell.openPath(dir)
    return { ok: !error, error: error || undefined, path: dir }
  })

  // 配置管理
  ipcMain.handle('get-config', () => loadConfig())
  ipcMain.handle('save-config', (event, config) => saveConfig(config))
  ipcMain.handle('get-mode', () => {
    const config = loadConfig()
    return config.mode || 'local'
  })
  ipcMain.handle('set-mode', (event, mode) => {
    const config = loadConfig()
    config.mode = mode
    saveConfig(config)
    return config
  })

  // === 微信 Bridge IPC ===
  const { WeChatBridge } = require('./wechat/bridge')

  ipcMain.handle('wechat:get-config', () => {
    const { loadConfig } = require('./wechat/config')
    const config = loadConfig(app)
    return { enabled: config.enabled, hasCredentials: !!config.credentials }
  })

  ipcMain.handle('wechat:start-login', async () => {
    if (!wechatBridge) wechatBridge = new WeChatBridge(app)
    // 设置状态推送监听
    wechatBridge.removeAllListeners('status-changed')
    wechatBridge.on('status-changed', (state) => {
      mainWindow?.webContents.send('wechat:status-changed', state)
    })
    const result = await wechatBridge.startLogin()
    console.log('[WeChat] IPC start-login 返回:', JSON.stringify(result).slice(0, 200))
    return result
  })

  ipcMain.handle('wechat:logout', async () => {
    if (wechatBridge) await wechatBridge.logout()
    return { success: true }
  })

  ipcMain.handle('wechat:start-bridge', async () => {
    if (!wechatBridge) wechatBridge = new WeChatBridge(app)
    // 设置状态推送监听
    wechatBridge.removeAllListeners('status-changed')
    wechatBridge.on('status-changed', (state) => {
      mainWindow?.webContents.send('wechat:status-changed', state)
    })
    wechatBridge.onMessage = async (msg) => {
      // 通过 HTTP 调用本地 Python 后端的 Agent
      try {
        const res = await fetch(`http://127.0.0.1:8080/api/wechat/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msg),
        })
        const data = await res.json()
        return data.reply || ''
      } catch (err) {
        console.error('[WeChat] Agent 调用失败:', err.message)
        return '抱歉，处理消息时出错，请稍后重试。'
      }
    }
    await wechatBridge.startBridge()
    return { success: true }
  })

  ipcMain.handle('wechat:stop-bridge', async () => {
    if (wechatBridge) wechatBridge.stopBridge()
    return { success: true }
  })

  ipcMain.handle('wechat:get-status', () => {
    if (!wechatBridge) return { state: 'idle' }
    return wechatBridge.getState()
  })

  // 微信状态变化推送到渲染进程
  if (wechatBridge) {
    wechatBridge.on('status-changed', (state) => {
      mainWindow?.webContents.send('wechat:status-changed', state)
    })
  } else {
    // 延迟初始化监听
    ipcMain.handle('wechat:setup-listener', () => {
      if (wechatBridge) {
        wechatBridge.removeAllListeners('status-changed')
        wechatBridge.on('status-changed', (state) => {
          mainWindow?.webContents.send('wechat:status-changed', state)
        })
      }
    })
  }
}

function getPythonExePath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend', 'TAgent.exe')
  }
  return path.join(__dirname, '..', 'launcher.py')
}

function checkServerReady() {
  return new Promise((resolve) => {
    const req = http.get(SERVER_URL, (res) => {
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1000, () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function waitForServer(timeout = STARTUP_TIMEOUT) {
  const startTime = Date.now()
  while (Date.now() - startTime < timeout) {
    if (await checkServerReady()) return true
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

function startPythonBackend() {
  if (!app.isPackaged) {
    console.log('[Electron] 开发模式：不自动启动后端')
    return false
  }
  
  const exePath = getPythonExePath()
  if (!fs.existsSync(exePath)) {
    console.error(`[Electron] 后端不存在: ${exePath}`)
    return false
  }

  console.log(`[Electron] 启动后端: ${exePath}`)
  
  // 打包模式下，将后端输出写入日志文件
  const agentDataDir = getAgentDataDir()
  fs.mkdirSync(agentDataDir, { recursive: true })
  const logPath = path.join(agentDataDir, 'backend.log')
  console.log(`[Electron] 后端日志: ${logPath}`)
  
  // 设置数据目录环境变量，让 Python 后端使用统一的路径
  console.log(`[Electron] 数据目录: ${agentDataDir}`)
  
  pythonProcess = spawn(exePath, ['--no-browser'], {
    cwd: path.dirname(exePath),
    stdio: ['ignore', 'pipe', 'pipe'],  // 分离输出
    windowsHide: true,
    env: { 
      ...process.env, 
      PYTHONIOENCODING: 'utf-8',
      ELECTRON_USER_DATA: agentDataDir  // 传给 Python 后端
    }
  })

  // 记录后端输出到日志
  if (pythonProcess.stdout) {
    pythonProcess.stdout.on('data', (data) => {
      fs.appendFileSync(logPath, data)
    })
  }
  if (pythonProcess.stderr) {
    pythonProcess.stderr.on('data', (data) => {
      fs.appendFileSync(logPath, data)
    })
  }

  pythonProcess.on('error', (err) => {
    console.error('[Electron] 后端启动失败:', err)
    fs.appendFileSync(logPath, `[ERROR] ${err}\n`)
  })
  pythonProcess.on('exit', (code) => {
    console.log(`[Electron] 后端已退出: code=${code}`)
    fs.appendFileSync(logPath, `[EXIT] code=${code}\n`)
    pythonProcess = null
  })
  return true
}

function stopPythonBackend() {
  if (pythonProcess) {
    console.log('[Electron] 停止后端...')
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', pythonProcess.pid.toString(), '/f', '/t'])
    } else {
      pythonProcess.kill('SIGTERM')
    }
    pythonProcess = null
  }
}

function createWindow() {
  const iconPath = getAppIconPath()

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false
  })

  // 开发模式：加载 Vite 开发服务器；打包模式：加载后端静态文件
  const url = app.isPackaged ? SERVER_URL : DEV_FRONTEND_URL
  console.log(`[Electron] 加载: ${url}`)
  mainWindow.loadURL(url)

  // 隐藏默认菜单栏
  Menu.setApplicationMenu(null)

  // 注册快捷键打开 DevTools
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools()
      event.preventDefault()
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    console.log('[Electron] 窗口已显示')
  })

  // 开发模式自动打开 DevTools
  if (!app.isPackaged && process.env.TAGENT_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

function createTray() {
  const iconPath = getAppIconPath()
  let icon = iconPath && fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath) 
    : nativeImage.createEmpty()

  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  
  const contextMenu = Menu.buildFromTemplate([
    { label: '显示窗口', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: '退出', click: quitApp }
  ])

  tray.setToolTip('TAgent')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => mainWindow?.show())
}

function quitApp() {
  isQuitting = true
  stopPythonBackend()
  app.quit()
}

async function startApp() {
  console.log('[Electron] 应用启动...')
  console.log(`[Electron] isPackaged: ${app.isPackaged}`)

  // 开发模式：检测前端开发服务器
  if (!app.isPackaged) {
    console.log('[Electron] 检测前端开发服务器 (localhost:5175)...')
    
    const success = await new Promise((resolve) => {
      const req = http.get(DEV_FRONTEND_URL, (res) => {
        resolve(res.statusCode === 200)
      })
      req.on('error', () => resolve(false))
      req.setTimeout(2000, () => {
        req.destroy()
        resolve(false)
      })
    })
    
    if (success) {
      console.log('[Electron] 前端服务器已运行')
      createWindow()
      createTray()
    } else {
      console.log('')
      console.log('========================================')
      console.log('  请先启动前端开发服务器:')
      console.log('  fronted/Start.bat')
      console.log('========================================')
      console.log('')
      app.quit()
    }
    return
  }

  // 打包模式：检测后端
  if (await checkServerReady()) {
    console.log('[Electron] 后端已运行')
    createWindow()
    createTray()
    return
  }

  // 打包模式：启动嵌入的后端
  if (!startPythonBackend()) {
    app.quit()
    return
  }

  console.log('[Electron] 等待后端启动...')
  if (await waitForServer()) {
    console.log('[Electron] 后端已就绪')
    createWindow()
    createTray()
  } else {
    console.error('[Electron] 后端启动超时')
    app.quit()
  }
}

// 单实例锁
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  console.log('[Electron] 已有实例运行')
  app.quit()
} else {
  app.on('second-instance', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  startApp()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') quitApp() })
app.on('activate', () => mainWindow?.show())
app.on('before-quit', () => { isQuitting = true; stopPythonBackend() })
