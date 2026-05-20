/**
 * TAgent Electron 主进程
 */

// 设置控制台编码为 UTF-8
process.stdout.setDefaultEncoding?.('utf8')
process.stderr.setDefaultEncoding?.('utf8')

const { app, BrowserWindow, Menu, Tray, nativeImage } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const http = require('http')

const SERVER_HOST = '127.0.0.1'
const SERVER_PORT = 8080
const SERVER_URL = `http://${SERVER_HOST}:${SERVER_PORT}`
const DEV_FRONTEND_URL = 'http://localhost:5175'  // Vite 开发服务器
const STARTUP_TIMEOUT = 30000

let mainWindow = null
let pythonProcess = null
let tray = null
let isQuitting = false

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
  const logPath = path.join(app.getPath('userData'), 'backend.log')
  console.log(`[Electron] 后端日志: ${logPath}`)
  
  pythonProcess = spawn(exePath, [], {
    cwd: path.dirname(exePath),
    stdio: ['ignore', 'pipe', 'pipe'],  // 分离输出
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
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
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'TAgent - 游戏技术美术 AI Agent',
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

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    console.log('[Electron] 窗口已显示')
  })

  // 开发模式自动打开 DevTools
  if (!app.isPackaged) mainWindow.webContents.openDevTools()

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png')
  let icon = fs.existsSync(iconPath) 
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

app.whenReady().then(startApp)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') quitApp() })
app.on('activate', () => mainWindow?.show())
app.on('before-quit', () => { isQuitting = true; stopPythonBackend() })
