# Electron 桌面应用架构

> 最后更新：2026-06-02

连接与端口详见 **[local-runtime-connection.md](./local-runtime-connection.md)**。

---

## 一、目录结构

```
apps/desktop/
├── main.js              # 主进程（窗口、后端生命周期、IPC）
├── preload.js           # runtimeEndpoint、配置、微信 Bridge API
├── package.json
├── scripts/start-electron.js
├── assets/
├── wechat/              # 微信 Bridge
└── dist/                # Vite 构建产物（打包加载 file://）
```

前端源码在 `apps/web/`；后端入口 `apps/web/server/server.py`，打包为 `resources/backend/TAgent.exe`。

---

## 二、进程模型

```text
Electron main
  ├─ 打包：spawn TAgent.exe，TAGENT_RUNTIME_PORT / TAGENT_AGENT_MODE
  ├─ 开发：不自动起后端（由 dev-electron.bat 起 Python）
  └─ preload → window.electronAPI.runtimeEndpoint

React 渲染进程
  ├─ 开发：http://localhost:5175 (Vite)
  ├─ 打包：file://.../dist/index.html
  └─ API/WS：getApiBase() / getWsUrl()（非写死 8080）
```

---

## 三、Runtime 端口策略（打包）

1. 若 `8080` 上 `/health` 已是 `TAgentLocalRuntime` → **复用 8080**（不另起进程冲突端口）。  
2. 若 8080 空闲 → 使用 8080。  
3. 若 8080 被占且非 TAgent → 在 `18080–18179` 选空闲端口。  

环境变量：`TAGENT_RUNTIME_HOST`、`TAGENT_RUNTIME_PORT`、`TAGENT_RUNTIME_URL`。

开发模式：`dev-electron.bat` 设置 `TAGENT_RUNTIME_PORT` 后启动 Electron；**不要**在未设 env 时单独 `npm start`。

---

## 四、IPC 通道

| 通道 | 类型 | 说明 |
|------|------|------|
| `get-app-version` | invoke | 应用版本 |
| `runtime-endpoint` | invoke | 当前 apiBase / wsUrl |
| `runtime-restart` | invoke | 打包重启嵌入后端 |
| `get-config` / `save-config` | invoke | 配置；`agent_mode` 变化时打包重启后端 |
| `backend-log-path` / `open-backend-log` | invoke | 日志 |
| `wechat:*` | invoke / event | 微信 Bridge（消息转发 `getServerUrl()`） |
| 窗口控制 | on / invoke | minimize / maximize / close |

---

## 五、配置与数据目录

| 模式 | 配置路径 |
|------|----------|
| 开发 | 项目 `.ta_agent/configs/app-config.json` |
| 打包 | `%APPDATA%/tagent-desktop/agent-running-data/configs/` |

`save-config` 写入后，打包版会 `restartPythonBackend()` 以刷新 `TAGENT_AGENT_MODE`。

---

## 六、打包流程

`scripts/build-electron.bat`：Vite 构建 → PyInstaller → electron-builder。

输出：`dist/electron-release/` 安装包与 `win-unpacked/`。

---

## 七、与中心服务器

Electron 桌面可同时配置联机（`mode: online`）；本地 Runtime **始终存在**用于 Agent 与本机工具。见 `decisions/client-dual-mode-design.md`。
