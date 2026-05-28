# MCP 集成方案

> 日期：2026-05-19 | 状态：已完成 ✅

---

## 目标

让 TA Agent 消费外部 MCP 服务器，支持 UI 管理和 Agent 对话两种配置方式。

---

## 架构

```
mcp.json ←── UI（增删改查）──┐
    ↓                       │
mcp_bridge.py               │
    ├── 启动加载             │
    ├── Schema 转换（MCP→OpenAI Function Calling）  
    ├── 热加载/reload        │
    ├── 管理工具注册（Agent 对话中可调用）──┘
    └── 工具执行（asyncio.run 适配同步）
```

---

## 实现

### 后端

| 文件 | 说明 |
|------|------|
| `mcp.json` | MCP 服务器配置（MCP 标准格式），UI 和 Agent 均可读写 |
| `tools/mcp_bridge.py` | 核心桥接：连接、发现、Schema 转换、CRUD、热加载、工具注册 |
| `tools/registry.py` | `_load_mcp_servers()` 启动加载 + `MCP_TOOLS` / `MCP_TOOL_FUNCTIONS` 注册 |
| `fronted/server/server.py` | 7 个 REST 端点（状态/CRUD/测试/reload）|
| `agent.py` | System Prompt 中新增 MCP 管理指引 + 常用服务器速查表 |
| `requirements.txt` | `mcp` 依赖 |

### 前端

| 文件 | 说明 |
|------|------|
| `fronted/src/components/settings/McpSettings.tsx` | MCP 管理页：列表、添加/删除、启用/禁用、测试连接、重新加载 |
| `fronted/src/components/settings/SettingsView.tsx` | 注册"MCP 服务器"标签（第 13 个标签）|

### Agent 工具（LLM 可调用）

| 工具 | 说明 |
|------|------|
| `mcp_list_servers` | 列出所有 MCP 服务器及状态 |
| `mcp_add_server` | 添加服务器（name/command/args/env）|
| `mcp_remove_server` | 删除服务器 |
| `mcp_toggle_server` | 启用/禁用 |
| `mcp_test_connection` | 测试连接（不保存）|
| `mcp_reload_servers` | 热加载所有已启用服务器 |

### REST API

| 端点 | 说明 |
|------|------|
| `GET /api/mcp` | 连接状态 |
| `GET /api/mcp/servers` | 配置列表 |
| `POST /api/mcp/servers` | 添加 |
| `PATCH /api/mcp/servers/{name}` | 更新 |
| `DELETE /api/mcp/servers/{name}` | 删除 |
| `POST /api/mcp/test` | 测试连接 |
| `POST /api/mcp/reload` | 热加载 |

---

## 进度

- [x] 方案确认
- [x] mcp.json 配置（MCP 标准格式）
- [x] `tools/mcp_bridge.py` — 连接/发现/转换/执行/CRUD/热加载/工具注册
- [x] `tools/registry.py` — 启动加载 + MCP 管理工具注册
- [x] `McpSettings.tsx` — 添加/删除/启用禁用/测试连接/重新加载
- [x] `SettingsView.tsx` — MCP 标签注册
- [x] `server.py` — 7 个 REST 端点
- [x] `agent.py` — System Prompt MCP 管理指引 + 速查表
- [x] E2E 测试 — sequential-thinking/playwright 连接 + 工具注入验证
- [x] Agent 自我意识 — 对话中可安装/管理 MCP 服务器
