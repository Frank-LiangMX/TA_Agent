# Electron 桌面应用实验

> 创建时间：2026-05-19
> 状态：规划中

---

## 目标

将当前"浏览器访问"模式升级为"Electron 原生窗口 + 浏览器访问"双模式。

---

## 背景

当前打包方式：
- PyInstaller 打包 Python 后端 → 启动 FastAPI → 打开浏览器
- 用户体验：需要手动管理浏览器窗口，不够原生

期望：
- 双击 exe → Electron 窗口打开，体验像原生应用
- 同时保留浏览器访问能力（团队远程使用）

---

## 设计方案

### 架构

```
┌─────────────────────────────────────────────────────┐
│                    前端 (React)                      │
│              同一套代码，两种访问方式                  │
└──────────────────────┬──────────────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
┌─────────────────┐         ┌─────────────────┐
│  Electron 窗口   │         │   浏览器访问     │
│  (桌面应用体验)   │         │  (远程访问)      │
└────────┬────────┘         └────────┬────────┘
         │                           │
         ▼                           ▼
┌─────────────────────────────────────────────────────┐
│              Python FastAPI 后端                     │
│              (localhost 或 服务器部署)               │
└─────────────────────────────────────────────────────┘
```

### 目录结构

```
ta_agent/
├── electron/                    # Electron 主进程
│   ├── main.js                  # 启动 Python 后端 + 创建窗口
│   ├── preload.js               # 预加载脚本（可选）
│   └── package.json
├── fronted/                     # 现有前端（不变）
└── launcher.py                  # Python 后端启动器
```

### 核心代码

**electron/main.js**：
```javascript
const { app, BrowserWindow } = require('electron')
const { spawn } = require('child_process')
const path = require('path')

let pythonProcess = null
let mainWindow = null

function startPython() {
  const exePath = path.join(process.resourcesPath, 'backend', 'TAgent.exe')
  pythonProcess = spawn(exePath, [], { stdio: 'inherit' })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: { nodeIntegration: false }
  })
  mainWindow.loadURL('http://localhost:8080')
}

app.whenReady().then(() => {
  startPython()
  setTimeout(createWindow, 2000) // 等 Python 启动
})

app.on('will-quit', () => {
  pythonProcess?.kill()
})
```

### 打包流程

```
1. pyinstaller → 打包 Python 后端为 TAgent.exe
2. npm run build → 打包前端到 electron/dist/
3. electron-builder → 打包整个应用
```

---

## 实验记录

### 2026-05-19 规划

**问题**：当前 launcher.py 打开浏览器，体验不够原生

**方案选择**：
- 方案 A：PyWebView（简单，5 分钟搞定，功能有限）
- 方案 B：Electron（专业，支持系统托盘/快捷键/文件拖拽）

**决定**：选择 Electron，长远更优

**待验证**：
- [ ] Python 后端嵌入 Electron 打包的可行性
- [ ] 端口冲突处理（8080 被占用）
- [ ] 窗口关闭时 Python 进程清理

---

## 风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 打包体积增大 | Electron ~150MB | 可接受，桌面应用正常体积 |
| Python 嵌入复杂 | 打包流程变复杂 | 分步打包，先 Python 后 Electron |
| 端口冲突 | 启动失败 | 检测端口 + 自动换端口 |

---

## 下一步

1. 创建 `electron/` 目录
2. 实现 `main.js` 基础框架
3. 测试 Python 进程启动/关闭
4. 配置 electron-builder 打包
5. 验证成功后，将稳定设计写入 `reference/frontend.md`
