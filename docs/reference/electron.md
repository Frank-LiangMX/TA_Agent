# Electron 桌面应用架构

> 最后更新：2026-05-29

---

## 一、目录结构

```
electron/
├── main.js              # 主进程（窗口管理、后端启动、IPC 注册）
├── preload.js           # 预加载脚本（暴露 API 到渲染进程）
├── package.json         # 依赖与 electron-builder 配置
├── scripts/
│   └── start-electron.js  # 启动辅助（UTF-8 编码设置）
├── assets/
│   ├── icon.ico
│   └── icon.png
├── wechat/              # 微信 Bridge 模块（新增）
│   ├── bridge.js        # iLink API 客户端 + Bridge 状态机
│   └── config.js        # 配置管理（凭证加密存储）
└── dist/                # 前端构建产物（Vite 输出）
```

## 二、进程模型

```
┌─────────────────────────────────────────────┐
│              Electron 主进程 (main.js)       │
│  - 窗口管理 (BrowserWindow)                 │
│  - Python 后端生命周期                       │
│  - IPC 处理器注册                            │
│  - 微信 Bridge（可选）                       │
└──────────────┬──────────────────────────────┘
               │ IPC (contextBridge)
┌──────────────▼──────────────────────────────┐
│           Preload 脚本 (preload.js)          │
│  - window.electronAPI 暴露                  │
│  - 安全的 IPC 桥接                          │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│           渲染进程 (React)                   │
│  - 开发模式: localhost:5175 (Vite)          │
│  - 打包模式: localhost:8080 (Python 后端)   │
└─────────────────────────────────────────────┘
```

## 三、IPC 通道

### 现有通道

| 通道 | 类型 | 说明 |
|------|------|------|
| `get-app-version` | invoke | 获取应用版本 |
| `backend-log-path` | invoke | 获取后端日志路径 |
| `open-backend-log` | invoke | 打开日志文件 |
| `open-user-data-dir` | invoke | 打开数据目录 |
| `get-config` | invoke | 读取配置 |
| `save-config` | invoke | 保存配置 |
| `get-mode` | invoke | 获取模式 |
| `set-mode` | invoke | 设置模式 |
| `update-available` | event | 更新可用通知 |
| `update-downloaded` | event | 更新已下载通知 |

### 微信 Bridge 通道（新增）

| 通道 | 类型 | 说明 |
|------|------|------|
| `wechat:get-config` | invoke | 获取微信配置 |
| `wechat:start-login` | invoke | 开始扫码登录 |
| `wechat:logout` | invoke | 登出 |
| `wechat:start-bridge` | invoke | 启动消息 Bridge |
| `wechat:stop-bridge` | invoke | 停止消息 Bridge |
| `wechat:get-status` | invoke | 获取连接状态 |
| `wechat:status-changed` | event | 状态变化推送 |

## 四、打包流程

```
build-electron.bat
  [1/5] npm run build（Vite 构建前端）
  [2/5] 复制到 fronted/dist（供 PyInstaller）
  [3/5] PyInstaller 打包 Python 后端
  [4/5] 复制到 electron/dist
  [5/5] electron-builder 打包安装包
  [清理] 删除中间产物
```

输出：
- `dist/electron-release/TAgent Setup x.x.x.exe` — NSIS 安装包
- `dist/electron-release/win-unpacked/` — 免安装版

版本号统一管理：`python bump_version.py x.y.z`

## 五、数据目录

| 模式 | 路径 |
|------|------|
| 开发模式 | `F:\ta_agent\.ta_agent\` |
| 打包模式 | `%APPDATA%\tagent-desktop\agent-running-data\` |

环境变量 `ELECTRON_USER_DATA` 传递给 Python 后端。

## 六、Bridge 扩展点

微信 Bridge 作为 Electron 主进程的可选模块运行：
- 启动条件：配置中 `wechat.enabled === true` 且有有效凭证
- 生命周期：跟随应用启动/退出
- 消息路由：通过 HTTP 调用本地 Python 后端的 Agent API
- 状态推送：通过 IPC 事件推送到渲染进程

未来可扩展：飞书、钉钉等 IM 平台的 Bridge。
