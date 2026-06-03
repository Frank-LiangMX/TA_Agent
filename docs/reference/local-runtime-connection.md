# 本地 Runtime 连接（统一说明）

> 最后更新：2026-06-02  
> 日常改代码、排障只看本文。实验过程见 `docs/experiments/backend/2026-06-02-*.md`。  
> **其他 Agent**：仓库根目录 [`AGENTS.md`](../../AGENTS.md) 为总入口（进度、约束、文档顺序）。

## 0. 给其他 Agent 的三句话

1. **本地 Runtime 始终存在**；联机时中心服只做协作/同步，聊天 WS 仍连本机。  
2. **禁止**新代码用 `API_BASE`；用 `localApiFetch` / `getApiBase` / `getWsUrl`。  
3. **打包**用 `agent_main`；改后端后 `scripts/build-electron.bat`。

## 1. 架构（一句话）

**桌面 / 浏览器 → 本地 Python Runtime（HTTP + WebSocket）**；联机时部分 REST 走中心服务器，**聊天 WS 与 TA 本机能力仍走本地 Runtime**。  
不采用 Proma 纯 IPC（Agent 在 main 内），因 Blender / UE / TagStore 等依赖 Python 子进程。

```text
React  →  getApiBase() / getWsUrl() / localApiFetch()
       →  127.0.0.1:{port}  (FastAPI + /ws)
Electron main → 选端口、spawn TAgent.exe、preload runtimeEndpoint
中心服务器   →  仅联机协作（另通道）
```

## 2. 四种使用场景

| 场景 | 启动方式 | 端口 |
|------|----------|------|
| dev-web | `scripts/dev-web.bat` | 默认 **8080** |
| dev-electron | `scripts/dev-electron.bat`（勿单独 `npm start`） | **18080–18179** 或已有后端 |
| 打包 Electron | 安装包 | 优先 **8080**；占用则 18080+；**8080 上已是 TAgent 则复用** |
| TA / 通用 | 设置 `agent_mode` | 后端 `TAGENT_AGENT_MODE` + `/health.agentMode` 须一致 |

## 3. 前端规则（必守）

1. **禁止**在新代码里使用静态 `API_BASE` / `WS_URL` 发请求。  
2. 本地 Runtime：`await getApiBase()`、`await getWsUrl()`，或 `localApiFetch('/api/...')`。  
3. 可能走联机的列表/审核：`getDataSource()`（`lib/cache.ts`）。  
4. Electron 重启后端后：`resetRuntimeEndpointCache()`。  
5. 打包切 `agent_mode`：走 `save-config` → 自动重启嵌入后端；**dev 须手动重启 Python 并设 `TAGENT_AGENT_MODE`**。

## 4. 启动顺序（App）

1. `ensureRuntimeConfigSync()`  
2. `ensureRuntimeAgentModeAligned(agent_mode)`  
3. `waitForLocalRuntime()`  
4. `tagentClient.connect(sessionId?)`  

## 5. 连接诊断

**设置 → 账户与连接 → 连接诊断 → 运行诊断**

## 6. 发版前验收（4 格）

| 格 | 操作 | 通过 |
|----|------|------|
| dev-web + TA | `dev-web.bat`，诊断，发一条消息 | 能结束思考态 |
| dev-web + 通用 | 重启后端 `TAGENT_AGENT_MODE=general` | 诊断模式对齐 |
| dev-electron | 仅 `dev-electron.bat` | API 端口与 bat 一致 |
| 打包 | 安装包，TA/通用各切一次 | 聊天 + MCP/设置页正常 |

## 7. 常见问题

| 现象 | 处理 |
|------|------|
| 聊天正常、设置/MCP 404 | 仍有代码用 `API_BASE` → 改 `localApiFetch` |
| 通用模式无会话 | 诊断看 `agentMode`；打包重存配置触发重启 |
| dev-electron 连错 | 必须用 bat；勿裸 `npm start` |
| 打包 `No module named 'agent'` | 已改 `agent_main`；须重新 `build-electron.bat` |
| 标签狂增 / 一直思考中 | 已收紧 connect/connected；`server.py` 后台 `run_agent`；见 `websocket.ts` / `MainPanel.tsx` |

## 7.1 WebSocket / 会话（2026-06 修补，勿回退）

- `sendMessage` → `asyncio.create_task(_run_agent_background)`，避免阻塞收包。  
- `tagentClient.agentInFlight`；断线发 `error` 结束思考态。  
- 新标签：先 REST `createSession`，再 `reconnectWithSession`。  
- 无 `sessionId` 的 `connect` 优先恢复已有会话；生成中少处理 `connected` 建 tab。

## 8. 实施阶段（文档台账）

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 1 | `/health` 身份、启动脚本校验 | ✅ |
| Phase 2 | 动态端口、preload endpoint、前端动态地址 | ✅（2026-06-02 收口 `localApiFetch`） |
| 打包 Agent | `server.py` 导入 `agent_main`（非根目录 `agent` 薄壳） | ✅ |
| Phase 3 | `runtime` / `cloud` 配置拆分 | 未做 |
| Phase 4+ | 中心服同步 | 未做 |

## 9. 关键代码路径

| 用途 | 路径 |
|------|------|
| 地址解析 | `apps/web/src/lib/api.ts` |
| 联机/本地数据源 | `apps/web/src/lib/cache.ts` |
| 诊断 | `apps/web/src/lib/connection-diagnostic.ts` |
| 配置同步 | `apps/web/src/services/config.ts` |
| Electron | `apps/desktop/main.js`, `preload.js` |
| 后端 | `apps/web/server/server.py` |
