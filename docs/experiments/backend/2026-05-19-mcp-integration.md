# MCP 集成方案

> 日期：2026-05-19 | 状态：方案已定，开发中

---

## 目标

让 TA Agent 能消费外部 MCP 服务器（后续可扩展为双向）。

## 方案

### 配置格式（复用 Proma Agent mcp.json 格式）

```python
# config.py
MCP_SERVERS = {
    "sequential-thinking": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"],
        "enabled": False,
    },
}
```

### 实现文件

| 文件 | 说明 |
|------|------|
| `config.py` | 新增 `MCP_SERVERS` 配置 |
| `tools/mcp_bridge.py` | MCP 客户端桥接（连接、发现、转换、注册） |
| `tools/registry.py` | 启动时调用 `_load_mcp_servers()` |
| `fronted/src/components/settings/McpSettings.tsx` | 前端 MCP 设置页 |
| `fronted/src/components/settings/SettingsView.tsx` | 注册新的 MCP 标签 |
| `fronted/server/server.py` | 新增 `GET /api/mcp` 状态查询 |

### 技术决策

- MCP Python SDK：`pip install mcp`（`/modelcontextprotocol/python-sdk`）
- Schema 转换：MCP `inputSchema` → OpenAI `function.parameters`（直接映射，~15 行）
- 异步适配：`asyncio.run()` 包装 MCP 调用（不改 agent.py 同步结构）
- 复用插件注册模式：`_load_mcp_servers()` 函数结构参照 `_load_plugins()`

### 预期复杂度：低（~250 行总代码量）

---

## 进度

- [x] 方案确认
- [x] `config.py` — MCP_SERVERS 配置项
- [ ] `tools/mcp_bridge.py` — MCP 客户端桥接
- [ ] `tools/registry.py` — 注册 MCP 工具加载
- [ ] `McpSettings.tsx` — 前端设置页
- [ ] `SettingsView.tsx` — 注册标签
- [ ] server API 端点
- [ ] 端到端测试
