# Electron 桌面应用

TAgent 的 Electron 桌面应用壳。

## 目录结构

```
electron/
├── main.js          # 主进程
├── preload.js       # 预加载脚本
├── package.json     # 依赖配置
├── assets/          # 图标等资源
└── dist/            # 前端构建产物（打包时需要）
```

## 开发模式

**开发启动**：

统一从项目根目录启动：

```bash
cd F:\ta_agent
dev-electron.bat
```

`dev-electron.bat` 会自动确保 Web UI 开发服务已启动。

**说明**：
- 开发模式加载 `http://localhost:5175`（Vite 开发服务器）
- 打包模式加载 `http://localhost:8080`（后端静态文件）

## 打包流程

### 打包 Electron
```bash
cd F:\ta_agent
build-electron.bat
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
