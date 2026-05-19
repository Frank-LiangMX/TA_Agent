"""
MCP 客户端桥接 — 连接外部 MCP 服务器，将其工具注入 TA Agent 工具系统。

架构：
  启动时遍历 config.MCP_SERVERS → 启动子进程 → 发现工具 → 转换 Schema → 注册 TOOLS/TOOL_FUNCTIONS
  复用现有的 _load_plugins() 注册模式。

依赖：pip install mcp
"""

import json
import asyncio
import os
from typing import Any

# MCP 状态追踪（供前端查询）
_server_status: dict[str, dict] = {}


def get_mcp_status() -> dict:
    """返回所有 MCP 服务器的连接状态"""
    from config import get_mcp_servers
    servers = get_mcp_servers()
    result = {}
    for name, cfg in servers.items():
        status = _server_status.get(name, {})
        result[name] = {
            "type": cfg.get("type", "stdio"),
            "command": cfg.get("command", ""),
            "args": cfg.get("args", []),
            "enabled": cfg.get("enabled", False),
            "connected": status.get("connected", False),
            "tools": status.get("tools", 0),
            "error": status.get("error", None),
        }
    return result


def _mcp_schema_to_openai(tool: Any) -> dict:
    """MCP Tool → OpenAI Function Calling Schema"""
    return {
        "type": "function",
        "function": {
            "name": f"mcp__{tool.name}",
            "description": tool.description or "",
            "parameters": tool.inputSchema if tool.inputSchema else {
                "type": "object",
                "properties": {},
            },
        }
    }


async def _connect_server(name: str, cfg: dict) -> tuple[list[dict], dict[str, callable]]:
    """连接单个 MCP 服务器，返回 (schemas, tool_functions)"""
    schemas = []
    functions = {}

    try:
        from mcp import ClientSession
        from mcp.client.stdio import stdio_client, StdioServerParameters

        command = cfg["command"]
        args = cfg.get("args", [])
        env = cfg.get("env", None)
        if env:
            env = {**os.environ, **env}

        params = StdioServerParameters(command=command, args=args, env=env)

        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                tools_result = await session.list_tools()

                if not tools_result or not tools_result.tools:
                    _server_status[name] = {"connected": True, "tools": 0}
                    return schemas, functions

                for tool in tools_result.tools:
                    schema = _mcp_schema_to_openai(tool)
                    tool_name = schema["function"]["name"]

                    # 闭包捕获 session 引用需要保持连接，这里改为进程级单次连接
                    schemas.append(schema)

                _server_status[name] = {"connected": True, "tools": len(tools_result.tools)}

    except ImportError:
        _server_status[name] = {"connected": False, "error": "mcp 包未安装，请 pip install mcp"}
    except Exception as e:
        _server_status[name] = {"connected": False, "error": str(e)[:200]}

    return schemas, functions


def _make_mcp_executor(name: str, cfg: dict, tool_name: str):
    """为 MCP 工具创建同步执行函数"""
    def executor(**kwargs) -> dict:
        return asyncio.run(_call_mcp_tool(name, cfg, tool_name, kwargs))
    return executor


async def _call_mcp_tool(name: str, cfg: dict, tool_name: str, arguments: dict) -> dict:
    """调用 MCP 服务器的工具"""
    try:
        from mcp import ClientSession
        from mcp.client.stdio import stdio_client, StdioServerParameters

        command = cfg["command"]
        args = cfg.get("args", [])
        env = cfg.get("env", None)
        if env:
            env = {**os.environ, **env}

        params = StdioServerParameters(command=command, args=args, env=env)

        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()

                # 去掉 mcp__ 前缀恢复原名
                original_name = tool_name[5:] if tool_name.startswith("mcp__") else tool_name
                result = await session.call_tool(original_name, arguments)

                if result and result.content:
                    texts = []
                    for c in result.content:
                        if hasattr(c, "text"):
                            texts.append(c.text)
                    return {"result": "\n".join(texts) if texts else str(result)}
                return {"result": str(result)}

    except ImportError:
        return {"error": "mcp 包未安装"}
    except Exception as e:
        return {"error": f"MCP 工具调用失败: {e}"}


def _load_mcp_servers_sync() -> tuple[list[dict], dict[str, callable]]:
    """同步入口：遍历 MCP_SERVERS，连接所有启用的服务器"""

    try:
        from config import get_mcp_servers
    except ImportError:
        return [], {}

    all_schemas = []
    all_functions = {}

    servers = get_mcp_servers()
    for name, cfg in servers.items():
        if not cfg.get("enabled"):
            _server_status[name] = {"connected": False, "error": "未启用"}
            continue

        if cfg.get("type") != "stdio":
            _server_status[name] = {"connected": False, "error": f"不支持的类型: {cfg.get('type')}"}
            continue

        try:
            schemas, functions = asyncio.run(_connect_server(name, cfg))
            all_schemas.extend(schemas)

            # 为每个工具创建同步包装器
            for schema in schemas:
                tool_name = schema["function"]["name"]
                executor = _make_mcp_executor(name, cfg, tool_name)
                all_functions[tool_name] = executor

        except RuntimeError as e:
            if "event loop" in str(e):
                _server_status[name] = {"connected": False, "error": "已有事件循环运行"}
            else:
                _server_status[name] = {"connected": False, "error": str(e)[:200]}
        except Exception as e:
            _server_status[name] = {"connected": False, "error": str(e)[:200]}

    return all_schemas, all_functions
