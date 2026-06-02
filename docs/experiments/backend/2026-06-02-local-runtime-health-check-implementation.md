# 本地 Runtime 健康检查实施记录

> 日期：2026-06-02  
> 状态：已实施  
> 关联评估：`docs/experiments/backend/2026-06-02-local-runtime-cloud-server-architecture.md`

## 1. 背景

本次改动对应“本地 Runtime 与中心服务器架构评估”中的 Phase 1：连接稳定性修复。

原有启动链路主要通过端口是否监听来判断后端是否可用：

- Web 开发启动器检查 `8080` 是否监听。
- Electron 开发启动器等待 `5175` 前端端口。
- Electron 打包模式访问 `http://127.0.0.1:8080/` 判断后端是否就绪。

这种方式无法区分“8080 上是 TAgent 后端”还是“8080 被其他服务占用”，容易出现前端打开但实际没有连接到正确后端的情况。

## 2. 改动范围

本次只处理本地 Runtime 健康检查，不引入动态端口，不改 WebSocket 协议，也不拆分 cloud/runtime 配置。

改动文件：

- `apps/web/server/server.py`
- `apps/desktop/main.js`
- `scripts/dev-web.bat`
- `scripts/dev-electron.bat`

## 3. 实施内容

### 3.1 后端 `/health` 增加身份标识

`/health` 现在返回明确的本地 Runtime 身份：

```json
{
  "status": "ok",
  "app": "TAgentLocalRuntime",
  "version": "0.1.0",
  "runtime": "local",
  "ws_sessions": 0
}
```

后续启动器和 Electron 不再只判断 HTTP 200，而是校验 `status` 和 `app`。

### 3.2 Web 开发启动器校验 `/health`

`scripts/dev-web.bat` 从“只检查 8080 端口监听”改为：

1. 先请求 `http://127.0.0.1:8080/health`。
2. 如果返回 `app: TAgentLocalRuntime`，复用现有后端。
3. 如果 health 不通过但 8080 已被占用，直接报错并显示占用进程。
4. 如果 8080 未占用，启动本地 Python 后端。

这样可以提前发现端口被其他服务占用，而不是让前端误连。

### 3.3 Electron 开发启动器等待后端健康

`scripts/dev-electron.bat` 在调用 `dev-web.bat` 后新增：

- 如果 `dev-web.bat` 失败，立即退出。
- 等待 TAgent 后端 `/health` 就绪。
- 再等待 Vite 前端 `5175`。
- 最后启动 Electron。

这能避免 Electron 窗口已打开但后端实际不可用的情况。

### 3.4 Electron 打包模式校验 `/health`

`apps/desktop/main.js` 的 `checkServerReady()` 改为请求：

```text
http://127.0.0.1:8080/health
```

并解析 JSON，只有满足以下条件才认为后端就绪：

- HTTP 状态码为 `200`
- `status === "ok"`
- `app === "TAgentLocalRuntime"`

打包后如果 8080 上是其他 HTTP 服务，Electron 不会误加载该服务。

## 4. 风险与边界

本次改动风险较低：

- 不改 API 路径。
- 不改 WebSocket 数据结构。
- 不改前端业务状态。
- 不改打包产物结构。
- 不引入新的 npm 或 Python 依赖。

仍未解决的问题：

- 端口仍然固定为 `8080`。
- 打包模式下如果 8080 被其他进程占用，当前策略是拒绝误判并等待失败；彻底解决需要 Phase 2 动态 Runtime 端口。
- 前端仍通过固定 `window.location.hostname:8080` 连接本地 Runtime，后续需要 Electron 注入 runtime endpoint。

## 5. 验证

已完成静态验证：

- `python -m py_compile apps\web\server\server.py`
- `node --check apps\desktop\main.js`

建议后续人工验证：

- 运行 `scripts\dev-web.bat --no-open`，确认后端和前端能正常启动。
- 运行 `scripts\dev-electron.bat`，确认 Electron 会等待后端 `/health`。
- 手动占用 8080 后运行 `scripts\dev-web.bat`，确认能提示端口冲突。
- 重新执行 Electron 打包，确认 packaged app 能正常启动本地后端。

## 6. 后续建议

下一阶段建议进入 Phase 2：动态 Runtime 端口。

核心方向：

- Electron 选择空闲端口。
- 通过环境变量传给 Python 后端。
- Electron preload 向前端暴露 runtime endpoint。
- 浏览器开发模式保留 `localhost:8080` fallback。

