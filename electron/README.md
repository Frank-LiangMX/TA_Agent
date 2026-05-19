# Electron 桌面应用

TAgent 的 Electron 桌面应用壳。

## 目录结构

```
electron/
├── main.js          # 主进程
├── preload.js       # 预加载脚本
├── package.json     # 依赖配置
├── assets/          # 图标等资源
├── Start.bat        # 开发启动
├── Build.bat        # 打包脚本
└── dist/            # 前端构建产物（打包时需要）
```

## 开发模式

**前提条件**：
1. 前端开发服务器已启动（`fronted/Start.bat`）
2. Node.js 已安装

**启动**：
```bash
# 方式 1：先启动前端，再启动 Electron
F:\ta_agent\fronted\Start.bat   # 启动前端 + 后端
F:\ta_agent\electron\Start.bat  # 启动 Electron

# 方式 2：命令行
cd F:\ta_agent\electron
npm install
npm start
```

**说明**：
- 开发模式加载 `http://localhost:5175`（Vite 开发服务器）
- 打包模式加载 `http://localhost:8080`（后端静态文件）

## 打包流程

### 1. 打包 Python 后端
```bash
cd F:\ta_agent
pyinstaller TAgent.spec
```

### 2. 构建前端
```bash
cd F:\ta_agent\fronted
npm run build
# 复制 dist 到 electron/dist
xcopy /E /I dist ..\electron\dist
```

### 3. 打包 Electron
```bash
cd F:\ta_agent\electron
Build.bat
```

安装包输出在 `electron/release/` 目录。

## 功能

- 启动 Python 后端进程
- 创建应用窗口
- 系统托盘（最小化到托盘）
- 单实例锁（防止多开）
- 自动检测后端启动状态

## 配置

在 `main.js` 中修改：

```javascript
const SERVER_PORT = 8080        // 后端端口
const STARTUP_TIMEOUT = 30000   // 启动超时（毫秒）
```
