/**
 * TAgent Electron 主进程
 * 
 * 职责：
 * 1. 启动 Python 后端进程
 * 2. 创建应用窗口
 * 3. 管理应用生命周期
 */

const { app, BrowserWindow, Menu, Tray, nativeImage } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const http = require('http')

// 配置
const SERVER_HOST = '127.0.0.1'
const SERVER_PORT = 8080
const SERVER_URL = `http://${SERVER_HOST}:${SERVER_PORT}`
const STARTUP_TIMEOUT = 30000 // 30 秒超时

// 全局状态
let mainWindow = null
let pythonProcess = null
let tray = null
let isQuitting = false

/**
 * 获取 Python 后端路径
 */
function getPythonExePath() {
  // 打包后：resources/backend/TAgent.exe
  // 开发环境：使用 launcher.py
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend', 'TAgent.exe')
  } else {
    // 开发环境：返回 launcher.py 路径（需要 Python 环境）
    return path.join(__dirname, '..', 'launcher.py')
  }
}

/**
 * 检查服务器是否已启动
 */
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

/**
 * 等待服务器启动
 */
async function waitForServer(timeout = STARTUP_TIMEOUT) {
  const startTime = Date.now()
  while (Date.now() - startTime < timeout) {
    if (await checkServerReady()) {
      return true
    }
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

/**
 * 启动 Python 后端
 */
function startPythonBackend() {
  const exePath = getPythonExePath()
  
  if (!fs.existsSync(exePath)) {
    console.error(`[Electron] 后端不存在: ${exePath}`)
    return false
  }

  console.log(`[Electron] 启动后端: ${exePath}`)
  
  // 启动进程
  pythonProcess = spawn(exePath, [], {
    cwd: path.dirname(exePath),
    stdio: 'inherit', // 继承控制台输出
    windowsHide: true // Windows 下隐藏控制台窗口
  })

  pythonProcess.on('error', (err) => {
    console.error('[Electron] 后端启动失败:', err)
  })

  pythonProcess.on('exit', (code) => {
    console.log(`[Electron] 后端已退出: code=${code}`)
    pythonProcess = null
  })

  return true
}

/**
 * 停止 Python 后端
 */
function stopPythonBackend() {
  if (pythonProcess) {
    console.log('[Electron] 停止后端...')
    
    // Windows: 使用 taskkill 强制终止进程树
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', pythonProcess.pid.toString(), '/f', '/t'])
    } else {
      pythonProcess.kill('SIGTERM')
    }
    
    pythonProcess = null
  }
}

/**
 * 创建主窗口
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'TAgent - 游戏技术美术 AI Agent',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    // 开发环境显示 DevTools
    show: false // 先隐藏，加载完成后显示
  })

  // 加载前端
  if (app.isPackaged) {
    // 打包后：加载本地服务器
    mainWindow.loadURL(SERVER_URL)
  } else {
    // 开发环境：加载前端开发服务器或本地服务器
    mainWindow.loadURL(SERVER_URL)
  }

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    console.log('[Electron] 窗口已显示')
  })

  // 开发环境打开 DevTools
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools()
  }

  // 关闭窗口时最小化到托盘
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/**
 * 创建系统托盘
 */
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png')
  
  // 如果图标不存在，使用默认图标
  let icon
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath)
  } else {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  
  const contextMenu = Menu.buildFromTemplate([
    { label: '显示窗口', click: () => mainWindow?.show() },
    { label: '重启后端', click: restartBackend },
    { type: 'separator' },
    { label: '退出', click: quitApp }
  ])

  tray.setToolTip('TAgent')
  tray.setContextMenu(contextMenu)

  // 点击托盘图标显示窗口
  tray.on('click', () => {
    mainWindow?.show()
  })
}

/**
 * 重启后端
 */
async function restartBackend() {
  console.log('[Electron] 重启后端...')
  stopPythonBackend()
  await new Promise(r => setTimeout(r, 1000))
  startPythonBackend()
  await waitForServer()
  mainWindow?.reload()
}

/**
 * 退出应用
 */
function quitApp() {
  isQuitting = true
  stopPythonBackend()
  app.quit()
}

/**
 * 应用启动
 */
async function startApp() {
  console.log('[Electron] 应用启动...')
  console.log(`[Electron] isPackaged: ${app.isPackaged}`)
  console.log(`[Electron] 资源目录: ${process.resourcesPath}`)

  // 先检查服务器是否已启动（可能已有实例）
  if (await checkServerReady()) {
    console.log('[Electron] 服务器已运行，直接创建窗口')
  } else {
    // 启动 Python 后端
    if (!startPythonBackend()) {
      console.error('[Electron] 后端启动失败，退出')
      app.quit()
      return
    }

    // 等待服务器启动
    console.log('[Electron] 等待后端启动...')
    const ready = await waitForServer()
    if (!ready) {
      console.error('[Electron] 后端启动超时')
      app.quit()
      return
    }
    console.log('[Electron] 后端已就绪')
  }

  // 创建窗口和托盘
  createWindow()
  createTray()
}

// 应用事件
app.whenReady().then(startApp)

app.on('window-all-closed', () => {
  // macOS: 除非 Cmd+Q，否则保持应用运行
  if (process.platform !== 'darwin') {
    quitApp()
  }
})

app.on('activate', () => {
  // macOS: 点击 Dock 图标时显示窗口
  mainWindow?.show()
})

app.on('before-quit', () => {
  isQuitting = true
  stopPythonBackend()
})

// 单实例锁
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  console.log('[Electron] 已有实例运行，退出')
  app.quit()
} else {
  app.on('second-instance', () => {
    // 第二个实例启动时，聚焦已有窗口
    mainWindow?.show()
    mainWindow?.focus()
  })
}
