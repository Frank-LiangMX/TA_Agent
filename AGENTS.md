# Agent 协作说明（读仓库请先打开本文件）

> 最后更新：2026-06-03  
> 面向：Cursor / Codex / 其他自动读库的编码 Agent。

## 1. 项目是什么

TAgent：游戏技术美术 AI Agent。桌面端 **Electron + React**，本机 **Python FastAPI/WebSocket Runtime**（`apps/web/server/server.py`），可选 **中心服务器**（`apps/server/`，联机协作数据，**不替代**本机 Agent 执行）。

## 2. 当前状态（2026-06-02）

### 已完成（勿回退）

| 领域 | 说明 |
|------|------|
| **本地连接 Phase 1–2** | `/health` 身份、动态端口、preload `runtimeEndpoint`、前端 `localApiFetch` / `getApiBase` |
| **打包 Agent** | `server.py` 使用 `import agent_main`（根目录 `agent.py` 薄壳**未**打进 PyInstaller） |
| **Electron 端口** | 8080 上已是 `TAgentLocalRuntime` 则复用，否则选空闲端口 |
| **连接诊断** | 设置 → 账户与连接 → 连接诊断；实现 `apps/web/src/lib/connection-diagnostic.ts` |
| **WS/会话修补** | Agent 后台 task 不阻塞 WS；`agentInFlight`；生成中少处理 `connected` 副作用；新 tab 先 REST 建 session |
| **双模式发版验收、reference 补全** | `reference/backend.md` §十三 + `reference/frontend.md` §七 已写；roadmap §5 验收清单全通过；`record_correction` 已从通用白名单移除 |
| **配置拆 `runtime` + `cloud`** | Phase 3 已落地：旧 `mode: local|online` 自动迁移为 `runtime` + `cloud` 结构；本地 Runtime 始终运行；`cloud.enabled` 控制中心服务器连接 |

### 未完成（按文档做，勿假设已实现）

| 项 | 文档 |
|----|------|
| 中心服与本地同步协议 | 架构评估 Phase 4 |
| 微信 Bridge 与通用工作流打通 | roadmap 技术债 |

## 3. 架构原则（易错）

### 联机 ≠ 中心服跑 Agent

```text
本地 Runtime（每台机器，必有）
  - WebSocket 聊天、工具、Blender/UE、TagStore、MCP、会话/记忆

中心服务器（可选，联机时）
  - 登录、团队、资产索引/审核协作、用量、规范下发、同步
  - 不替代本机执行；不在云端跑 Blender/UE
```

详述：`docs/experiments/backend/2026-06-02-local-runtime-cloud-server-architecture.md`  
旧文案 `docs/decisions/client-dual-mode-design.md` 的「本地/联机」表以**数据与配额**为主；**执行路径**以上述为准。

### 不要照搬 Proma 纯 IPC

参考 Proma 的是「单一连接通道、Runtime 状态可见」，不是把 Python Agent 搬进 Electron main。见架构评估 §8。

## 4. 改代码必守

1. **REST（本地）**：`localApiFetch()` / `getApiBase()` — 禁止新业务使用静态 `API_BASE`（`lib/api.ts` 仅保留 deprecated 快照）。
2. **WebSocket**：`getWsUrl()`；客户端 `apps/web/src/services/websocket.ts`。
3. **可能走联机的列表/审核**：`getDataSource()` — `apps/web/src/lib/cache.ts`。
4. **切 TA/通用**：UI `agent_mode`、后端 `TAGENT_AGENT_MODE`、`/health.agentMode` 三者一致；打包保存 config 会重启嵌入后端；**dev 需手动重启 Python**。
5. **打包后端改动**：改 `server.py` / `TAgent.spec` 后须 `scripts/build-electron.bat` 重装包。
6. **目录**：实现代码在 `backend/`、`packages/`、`apps/web/`、`apps/desktop/`；根目录 `agent.py` / `launcher.py` 为薄壳。

## 5. 开发启动（固定方式）

| 场景 | 命令 |
|------|------|
| 浏览器 dev | `scripts/dev-web.bat` → 后端 **8080** + 前端 **5175** |
| Electron dev | `scripts/dev-electron.bat` only（勿在 `apps/desktop` 裸 `npm start`）→ 后端常 **18080+** |
| 打包 | `scripts/build-electron.bat` |

## 6. 文档阅读顺序

1. **连接 / 排障 / 发版验收** → `docs/reference/local-runtime-connection.md`
2. **联机与中心服边界** → `docs/experiments/backend/2026-06-02-local-runtime-cloud-server-architecture.md`
3. **双模式产品与待办** → `docs/experiments/backend/2026-06-01-workbench-dual-mode-roadmap.md`
4. **后端总览** → `docs/reference/backend.md`（§十二已注明联机仍依赖本地 Runtime）
5. **前端 / Electron** → `docs/reference/frontend.md`、`docs/reference/electron.md`
6. **人类进度** → `progress.md`

实验过程记录（只追加）：`docs/experiments/backend/2026-06-02-*.md`

## 7. 关键路径速查

| 用途 | 路径 |
|------|------|
| WS + Agent 循环 | `apps/web/server/server.py` |
| Agent 逻辑 | `backend/agent_main.py` |
| 打包 spec | `TAgent.spec` |
| Electron main | `apps/desktop/main.js` |
| 前端 API | `apps/web/src/lib/api.ts` |
| 配置同步 | `apps/web/src/services/config.ts` |
| 中心服 | `apps/server/` |

## 8. 发版前最小验收

见 `docs/reference/local-runtime-connection.md` §6（dev-web / dev-electron / 打包 / TA+通用 四格）+ 双模式 roadmap §5。

## 9. 发版流程（必读）

**所有发版操作走 `scripts/release.py`，不要手动改版本号或 git tag。**

```bash
# 看现状（发版前必跑）
python scripts/release.py status

# 发版本（一气呵成：bump + commit + push main + tag + push tag）
python scripts/release.py ship 0.30.0 --dry-run   # 先看命令
python scripts/release.py ship 0.30.0 --yes       # 真跑
```

详细：[**`docs/operations/release.md`**](docs/operations/release.md)（单一来源、CI 行为、错误处理、什么时候 ship 什么时候普通 commit）

**关键约束**：
- 版本号源是根目录 `VERSION` 文件。`ship` 会自动同步到 4 个文件，**不要手动改**
- `release/electron/` 是产物，`.gitignore`，**不要在里面改代码**
- 触发 CI = push tag `v*`。普通 `git push origin main` **不会**触发 build
- 改 `.github/workflows/release.yml` 之前本地校验 YAML：
  `python -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"`

## 10. 给 Agent 的文档索引

按这个顺序读可以快速上手：

1. **本文件**（AGENTS.md）— 项目结构、改代码约束
2. [**`docs/operations/release.md`**](docs/operations/release.md) — 发版
3. `docs/reference/local-runtime-connection.md` — 排障、连接、发版验收
4. `docs/experiments/backend/2026-06-02-local-runtime-cloud-server-architecture.md` — 架构
5. `progress.md` — 人类可读里程碑
6. `CLAUDE.md` — Claude Code 特定指令（路径、配置位置、风格）

子目录约定：
- `apps/desktop/` — Electron 壳
- `apps/web/` — React + 嵌入 Python Runtime
- `apps/server/` — 中心服（不参与桌面打包）
- `backend/` — Python Agent 本体（PyInstaller 唯一来源）
- `packages/{conventions,core,tags,tools}/` — 跨端共享纯逻辑
- `docs/{reference,experiments,business,decisions,operations}/` — 文档分类
