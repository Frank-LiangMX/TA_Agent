# 动态 Runtime 端口实施记录

> 日期：2026-06-02  
> 状态：已实施  
> 前置改动：`docs/experiments/backend/2026-06-02-local-runtime-health-check-implementation.md`

## 1. 背景

Phase 1 已经让启动器和 Electron 通过 `/health` 校验后端身份，避免把其他 HTTP 服务误判为 TAgent 后端。

但固定 `8080` 仍然存在两个问题：

- 打包模式下如果 `8080` 被其他程序占用，TAgent 后端无法启动。
- Electron 无法明确把“自己启动的 Runtime 地址”传给前端，只能依赖前端固定拼接 `:8080`。

本次改动进入 Phase 2：动态 Runtime 端口。

## 2. 目标

- Electron 打包模式优先使用 `8080`。
- 如果 `8080` 被占用且不是 TAgent Runtime，自动选择空闲端口。
- Electron 将最终 Runtime 地址注入给 preload 和 Python 后端。
- 前端优先使用 Electron 注入的 Runtime endpoint。
- 浏览器开发模式继续兼容 `localhost:8080`。

## 3. 实施内容

### 3.1 Electron 选择 Runtime 端口

`apps/desktop/main.js` 新增：

- `DEFAULT_SERVER_PORT = 8080`
- `runtimePort`
- `getServerUrl()`
- `getHealthUrl()`
- `isPortAvailable()`
- `findAvailablePort()`
- `publishRuntimeEnv()`

启动策略：

1. 先检查默认 `8080` 上是否已有 `TAgentLocalRuntime`。
2. 如果是，则复用 `8080`。
3. 如果不是，则从 `8080` 或 `18080-18179` 中选择空闲端口。
4. 通过环境变量发布：
   - `TAGENT_RUNTIME_HOST`
   - `TAGENT_RUNTIME_PORT`
   - `TAGENT_RUNTIME_URL`

### 3.2 Python 后端读取端口环境变量

`apps/web/server/server.py` 启动时读取：

```text
TAGENT_RUNTIME_HOST
TAGENT_RUNTIME_PORT
```

未设置时保持原开发行为：

```text
host = 0.0.0.0
port = 8080
```

因此开发脚本和浏览器调试不受影响。

### 3.3 preload 暴露 Runtime endpoint

`apps/desktop/preload.js` 新增 `runtimeEndpoint`：

```ts
{
  host: string
  port: number
  apiBase: string
  wsUrl: string
}
```

并保留异步接口：

```ts
getRuntimeEndpoint()
```

### 3.4 前端优先使用 Electron 注入地址

`apps/web/src/lib/api.ts` 从固定 `8080` 改为：

1. 如果 `window.electronAPI.runtimeEndpoint` 存在，使用其中的 `apiBase/wsUrl`。
2. 否则回退到浏览器开发模式：

```text
http://{window.location.hostname}:8080
ws://{window.location.hostname}:8080/ws
```

### 3.5 WeChat Bridge 跟随 Runtime 端口

Electron main process 中微信消息转发原先硬编码：

```text
http://127.0.0.1:8080/api/wechat/message
```

现在改为使用 `getServerUrl()`，避免打包动态端口后微信桥仍打到旧端口。

## 4. 风险与边界

本次改动仍然控制在本地 Runtime 生命周期内：

- 不改变 WebSocket 协议。
- 不改变 REST API 路径。
- 不改变在线/中心服务器配置。
- 不改变开发脚本固定 8080 的行为。
- 不新增第三方依赖。

仍需后续处理：

- 开发模式仍是固定 `8080`，端口冲突时由启动脚本报错。
- 前端配置层仍有 `mode: local | online` 的旧概念，尚未拆成 `runtime/cloud`。
- 打包后完整验证需要重新构建 Electron 产物。

## 5. 验证

已完成：

- `python -m py_compile apps\web\server\server.py`
- `node --check apps\desktop\main.js`
- `node --check apps\desktop\preload.js`
- `npm run typecheck`（目录：`apps\web`）

建议后续人工验证：

- 正常打包启动，确认默认使用 `8080`。
- 手动占用 `8080` 后启动打包版，确认自动选择 `18080+` 端口。
- 在打包版里发送 Agent 消息，确认 WebSocket 连接使用动态端口。
- 启动微信 Bridge，确认消息转发命中动态 Runtime。

## 6. 后续建议

下一阶段进入 Phase 3：配置概念拆分。

建议把旧配置：

```ts
mode: 'local' | 'online'
```

逐步迁移为：

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
```

旧字段保留一段兼容期，避免一次性改动前端状态和设置页。

