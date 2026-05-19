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
1. Python 后端已启动（`../fronted/Start.bat` 或 `python launcher.py`）
2. Node.js 已安装

**启动**：
```bash
# 方式 1：双击 Start.bat

# 方式 2：命令行
cd electron
npm install
npm start
```

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
