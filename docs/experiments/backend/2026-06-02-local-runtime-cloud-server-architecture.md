# 本地 Runtime 与中心服务器架构评估

> 日期：2026-06-02  
> 状态：Phase 1–3 已落地；Phase 4 待定（稳定说明见 `docs/reference/local-runtime-connection.md`）  
> 背景：TAgent 同时需要本地 TA 工具链执行能力和中心服务器协作能力，现有 `local / online` 概念容易把两类职责混在一起。

## 1. 问题背景

当前本地 Web/Electron 链路是三段式：

```text
Electron / Browser
  -> Vite 前端 :5175（开发模式）
  -> Python FastAPI/WebSocket :8080
```

打包后链路是：

```text
Electron app
  -> 启动 resources/backend/TAgent.exe
  -> Python 后端监听 127.0.0.1:8080
  -> Electron 加载 http://127.0.0.1:8080
  -> 前端通过 ws://127.0.0.1:8080/ws 通信
```

这和 Proma 的 Electron IPC 架构不同。Proma 的业务服务主要在 Electron main process 内，通过 preload 暴露 `window.electronAPI`，不依赖独立本地端口。

TAgent 因为有 Blender、UE5、文件系统、资产扫描、入库、MCP 等强本地能力，不适合简单照搬纯 IPC 架构；但当前固定 `8080` 和 `mode: local | online` 也确实会带来连接稳定性和概念混淆。

## 2. 建议架构

将系统明确拆成两类后端：

```text
Frontend / Electron
  |
  | Local Agent Channel
  v
Local Agent Runtime
  - Agent 对话 WebSocket
  - 工具调用
  - 本地资产扫描/分析/入库
  - 本地会话、记忆、工作区
  - Blender / UE / 文件系统 / MCP

  |
  | Cloud Sync / Auth / Team APIs
  v
Cloud / Center Server
  - 用户认证
  - 项目与团队
  - 资产索引与审核协作
  - 用量统计
  - 权限策略
  - 数据同步与规则分发
```

核心原则：

- 中心服务器不直接替代本地 Agent Runtime。
- 即使进入联机模式，本地 Runtime 仍负责执行本机动作。
- 中心服务器负责协作、权限、同步、统计和项目级数据。
- 前端同时理解 Local Runtime 和 Cloud Server 两条通道。

## 3. 职责边界

### Local Agent Runtime

适合放在本地 Runtime：

- Agent 对话流与 Function Calling。
- 工作区文件读写。
- 资产目录扫描。
- FBX / 贴图 / 命名 / 面数检查。
- Blender headless 渲染。
- UE5 导入脚本与本地引擎集成。
- 本地会话、记忆、MCP 工具执行。
- 离线可用能力。

### Cloud / Center Server

适合放在中心服务器：

- 登录、用户、角色、权限。
- 项目配置下发。
- 团队资产索引。
- 审核状态协作。
- 用量统计、账单或配额。
- 公司级记忆、规则、模板分发。
- 数据同步、冲突记录、审计日志。
- 可选远程任务队列。

不建议中心服务器直接执行：

- 用户本机文件读写。
- Blender / UE5 调用。
- 本地绝对路径依赖的资产操作。
- 未授权的工具调用。

## 4. 当前风险

| 风险 | 说明 | 影响 |
|------|------|------|
| 固定 8080 端口 | 开发和打包后都依赖本地 `8080` | 端口冲突时误判后端已运行 |
| 端口检查过弱 | 当前脚本只看端口是否监听，不确认 `/health` 是否是 TAgent | 可能连接到错误服务 |
| Electron 开发模式不托管后端 | `apps/desktop/main.js` 开发模式只检查前端 5175 | Electron 能打开但后端未必可用 |
| `mode` 概念混杂 | `local / online` 同时承载运行环境和协作模式 | 前端初始化、配置、连接逻辑容易耦合 |
| 同步边界未定 | 本地资产与云端资产状态可能冲突 | 后续多人协作风险 |
| 本地路径泄漏 | 云端若保存绝对路径，会暴露本机环境 | 隐私和跨机器复用问题 |

## 5. 分阶段工作量

### Phase 1：连接稳定性修复（低风险，约 0.5-1 天）

目标：不改架构，只让现有本地 Runtime 连接更可靠。

- `/health` 返回明确标识，例如 `app: "TAgentLocalRuntime"`。
- `dev-web.bat` 检查 `/health`，不只检查端口监听。
- `dev-electron.bat` 同时等待前端 `5175` 和后端 `/health`。
- Electron packaged 模式用 `/health` 判断后端是否就绪。
- 前端连接状态区分：端口不可达、健康检查失败、WebSocket 断开。

收益：

- 减少“前端在、后端假在线”的情况。
- 能提前发现 8080 被其他进程占用。
- 改动范围小，适合作为第一步。

### Phase 2：动态 Runtime 端口（中低风险，约 1-2 天）

目标：解决固定 `8080` 带来的端口冲突。

- Electron 启动时选择空闲端口。
- 通过环境变量把端口传给 Python 后端，例如 `TAGENT_RUNTIME_PORT`。
- preload 暴露 `getRuntimeEndpoint()`。
- 前端优先使用 Electron 注入的 Runtime 地址。
- 浏览器开发模式保留 `localhost:8080` fallback。

收益：

- 打包后不再怕 8080 被占。
- Electron 能明确知道自己启动的后端是哪一个。

### Phase 3：配置概念拆分（中等风险，约 2-4 天）

目标：把“本地运行时”和“中心服务器”从配置层拆开。

建议配置形态：

```ts
runtime: {
  endpoint: string
  port: number
  status: 'starting' | 'ready' | 'error'
}

cloud: {
  enabled: boolean
  server_url: string
  user_id: string
  token?: string
}

agent_mode: 'ta' | 'general'
```

兼容策略：

- 保留旧 `mode: local | online` 一段时间。
- 读取旧配置时映射到新结构。
- UI 文案从“本地/联机模式”逐步改为“本地运行时 + 中心服务器”。

收益：

- 不再把“是否有中心服务器”和“本地 Agent 是否存在”混为一谈。
- 后续同步、登录、协作更容易分层。

### Phase 4：同步协议与队列（中等偏大，约 3-7 天）

目标：中心服务器真正承担团队协作。

建议先同步：

- 资产摘要：id、name、type、hash、相对路径、状态。
- 审核记录：asset_id、reviewer、decision、comment、timestamp。
- 用量记录：user、model、tokens、latency。
- 项目配置：规则、预算、导入模板。

不建议一开始同步：

- 本地绝对路径。
- 原始大文件。
- 未确认的工具调用过程。
- 依赖本机环境的中间产物。

同步策略：

- 本地优先。
- 离线可继续工作。
- 后台队列上传。
- 失败重试。
- 冲突先记录，不自动覆盖。

### Phase 5：高风险方向（暂不建议）

- 把 Agent 执行迁到中心服务器。
- 让中心服务器直接控制用户本机文件系统。
- 云端执行 Blender / UE5。
- 废掉本地 Runtime。

这些方向会引入安全、权限、环境一致性和隐私问题，应在本地 Runtime 稳定、同步协议成熟后再评估。

## 6. 推荐实施顺序

```text
1. 先修健康检查和启动脚本
2. 再做动态 Runtime 端口
3. 然后拆 runtime / cloud 配置
4. 最后做中心服务器同步
```

第一步建议形成一个小改动包：

- 后端 `/health` 添加 `app` 和 `version`。
- 启动脚本调用 `/health` 判断后端真实性。
- Electron main packaged 模式调用 `/health`。
- 前端连接失败时显示准确原因。

## 7. 待验证问题

- 打包后如果 8080 被占，Electron 当前是否会误加载其他服务。
- 动态端口传给 Python 后端后，静态前端中的 API/WS 地址如何稳定注入。
- 中心服务器已有 `apps/server` 能否直接作为 Cloud Server，还是需要改名为 `apps/center-server`。
- 旧 `mode` 字段兼容期需要持续多久。
- 本地 Runtime 与 Cloud Server 的认证关系：由前端登录后下发 token，还是 Runtime 自己持有 token。

## 8. 当前结论

TAgent 不应简单改成 Proma 的纯 IPC 架构。更合适的方向是：

```text
Electron 管理本地 Runtime 生命周期
Local Runtime 管 Agent 执行和本地工具
Cloud Server 管用户、协作、同步和权限
Frontend 同时理解 Local 与 Cloud 两条通道
```

这样可以保留 TA 本地工具链优势，同时为中心服务器协作能力留下清晰边界。

