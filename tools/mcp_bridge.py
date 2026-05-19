"""
MCP 客户端桥接 — 连接外部 MCP 服务器，注入 TA Agent 工具系统。

配置：项目根目录 `mcp.json`，格式参照 Proma Agent mcp.json。
支持运行时热加载（通过 REST API 触发）。
"""

import json
import asyncio
import os
from typing import Any

# MCP 服务器状态追踪
_server_status: dict[str, dict] = {}

# MCP 配置文件路径
def _config_path() -> str:
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "mcp.json")


def _read_config() -> dict:
    """读取 mcp.json"""
    path = _config_path()
    if not os.path.exists(path):
        return {"servers": {}}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_config(config: dict):
    """写入 mcp.json"""
    path = _config_path()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)


def get_mcp_servers() -> dict:
    """返回 mcp.json 中的服务器列表"""
    return _read_config().get("servers", {})


def get_mcp_status() -> dict:
    """返回所有 MCP 服务器的连接状态"""
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


def add_mcp_server(name: str, cfg: dict) -> dict:
    """添加 MCP 服务器"""
    config = _read_config()
    if "servers" not in config:
        config["servers"] = {}
    if name in config["servers"]:
        return {"success": False, "error": f"服务器 {name} 已存在"}
    config["servers"][name] = cfg
    _write_config(config)
    return {"success": True, "message": f"已添加 {name}"}


def remove_mcp_server(name: str) -> dict:
    """删除 MCP 服务器"""
    config = _read_config()
    if name not in config.get("servers", {}):
        return {"success": False, "error": f"服务器 {name} 不存在"}
    del config["servers"][name]
    _write_config(config)
    _server_status.pop(name, None)
    return {"success": True, "message": f"已删除 {name}"}


def update_mcp_server(name: str, cfg: dict) -> dict:
    """更新 MCP 服务器配置（支持切换 enabled）"""
    config = _read_config()
    if name not in config.get("servers", {}):
        return {"success": False, "error": f"服务器 {name} 不存在"}
    config["servers"][name].update(cfg)
    _write_config(config)
    return {"success": True, "message": f"已更新 {name}"}


# ========== Schema 转换 ==========

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


# ========== MCP 连接 ==========

async def _connect_server(name: str, cfg: dict, register_tools: bool = True) -> tuple[list[dict], dict[str, callable]]:
    """连接单个 MCP 服务器，发现工具。如果 register_tools 则注入 TOOLS/TOOL_FUNCTIONS"""
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
                    schemas.append(schema)

                    # 创建同步执行包装器
                    executor = _make_mcp_executor(name, cfg, tool_name)
                    functions[tool_name] = executor

                _server_status[name] = {"connected": True, "tools": len(tools_result.tools)}

                if register_tools:
                    _register_tools(schemas, functions)

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


# ========== 工具注册 / 卸载 ==========

def _register_tools(schemas: list[dict], functions: dict[str, callable]):
    """将 MCP 工具注册到全局 TOOLS / TOOL_FUNCTIONS"""
    from tools.registry import TOOLS, TOOL_FUNCTIONS
    for schema in schemas:
        name = schema["function"]["name"]
        if name not in TOOL_FUNCTIONS:
            TOOLS.append(schema)
            TOOL_FUNCTIONS[name] = functions.get(name)


def _unregister_tools(name: str):
    """按 MCP 服务器名称移除已注册的工具（清除 mcp__ 前缀的工具）"""
    from tools.registry import TOOLS, TOOL_FUNCTIONS
    removed = []
    for schema in list(TOOLS):
        tool_name = schema["function"]["name"]
        if tool_name.startswith("mcp__"):
            TOOLS.remove(schema)
            TOOL_FUNCTIONS.pop(tool_name, None)
            removed.append(tool_name)
    return removed


# ========== 连接测试 ==========

def test_connection(cfg: dict) -> dict:
    """测试 MCP 服务器连接（不注册工具，不保存配置）"""
    try:
        schemas, _ = asyncio.run(_connect_server("_test_", cfg, register_tools=False))
        tool_names = [s["function"]["name"] for s in schemas]
        return {
            "success": True,
            "tools_count": len(schemas),
            "tools": tool_names,
        }
    except Exception as e:
        return {"success": False, "error": str(e)[:300]}


# ========== 启动加载 ==========

def _load_mcp_servers_sync():
    """启动时加载所有启用的 MCP 服务器（同步入口）"""
    servers = get_mcp_servers()
    total = 0
    for name, cfg in servers.items():
        if not cfg.get("enabled"):
            _server_status[name] = {"connected": False, "error": "未启用"}
            continue
        if cfg.get("type") != "stdio":
            _server_status[name] = {"connected": False, "error": f"不支持的类型"}
            continue
        try:
            schemas, _ = asyncio.run(_connect_server(name, cfg, register_tools=True))
            total += len(schemas)
        except Exception as e:
            _server_status[name] = {"connected": False, "error": str(e)[:200]}
    return total


# ========== 运行时热加载（API 调用） ==========

def reload_mcp_servers() -> dict:
    """重新加载所有 MCP 服务器（先卸载旧的，再连接新的）"""
    # 卸载所有现有 MCP 工具
    removed = _unregister_tools("")
    _server_status.clear()

    # 重新加载
    count = _load_mcp_servers_sync()

    return {
        "success": True,
        "removed_tools": len(removed),
        "loaded_tools": count,
        "removed": removed,
        "status": get_mcp_status(),
    }


# ===== Agent 工具注册（LLM 可调用的 MCP 管理工具） =====

# --- Schema 定义 ---

MCP_LIST_SERVERS_DEF = {
    "type": "function",
    "function": {
        "name": "mcp_list_servers",
        "description": "列出所有已配置的 MCP 服务器及其连接状态（启用/禁用、已连接/未连接、工具数量）",
        "parameters": {
            "type": "object",
            "properties": {},
        },
    },
}

MCP_ADD_SERVER_DEF = {
    "type": "function",
    "function": {
        "name": "mcp_add_server",
        "description": "添加一个新的 MCP 服务器。常用的 MCP 服务器：sequential-thinking（多步推理）、context7（文档查询）、playwright（浏览器自动化）、github（GitHub API）。添加后需要调用 mcp_reload_servers 加载工具。",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "服务器名称（唯一标识，如 sequential-thinking）"},
                "command": {"type": "string", "description": "启动命令，通常为 npx 或 uv"},
                "args": {"type": "string", "description": "命令参数，空格分隔。如 '-y @modelcontextprotocol/server-sequential-thinking'"},
                "env": {"type": "string", "description": "环境变量，格式 KEY=value，多个用换行分隔（可选）"},
            },
            "required": ["name", "command", "args"],
        },
    },
}

MCP_REMOVE_SERVER_DEF = {
    "type": "function",
    "function": {
        "name": "mcp_remove_server",
        "description": "删除一个已配置的 MCP 服务器。需要调用 mcp_reload_servers 卸载已注册的工具。",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "要删除的服务器名称"},
            },
            "required": ["name"],
        },
    },
}

MCP_TOGGLE_SERVER_DEF = {
    "type": "function",
    "function": {
        "name": "mcp_toggle_server",
        "description": "启用或禁用一个 MCP 服务器。禁用后工具不可用，启用后可调用 mcp_reload_servers 加载。",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "服务器名称"},
                "enabled": {"type": "boolean", "description": "true=启用, false=禁用"},
            },
            "required": ["name", "enabled"],
        },
    },
}

MCP_RELOAD_SERVERS_DEF = {
    "type": "function",
    "function": {
        "name": "mcp_reload_servers",
        "description": "重新加载所有已启用的 MCP 服务器，先卸载旧的再连接新的。添加/删除/启用/禁用服务器后需要调用此工具才能生效。",
        "parameters": {
            "type": "object",
            "properties": {},
        },
    },
}

MCP_TEST_CONNECTION_DEF = {
    "type": "function",
    "function": {
        "name": "mcp_test_connection",
        "description": "测试 MCP 服务器是否能成功连接并发现工具（不保存配置）。用于在正式添加前验证服务器是否可用。",
        "parameters": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "启动命令"},
                "args": {"type": "string", "description": "命令参数，空格分隔"},
                "env": {"type": "string", "description": "环境变量（可选）"},
            },
            "required": ["command", "args"],
        },
    },
}

MCP_TOOLS = [
    MCP_LIST_SERVERS_DEF,
    MCP_ADD_SERVER_DEF,
    MCP_REMOVE_SERVER_DEF,
    MCP_TOGGLE_SERVER_DEF,
    MCP_RELOAD_SERVERS_DEF,
    MCP_TEST_CONNECTION_DEF,
]


# --- 执行函数 ---

def mcp_list_servers() -> dict:
    status = get_mcp_status()
    servers = get_mcp_servers()
    lines = []
    for name, cfg in servers.items():
        s = status.get(name, {})
        icon = "✓" if s.get("connected") else ("✗" if s.get("error") else "○")
        enabled = cfg.get("enabled", False)
        tool_count = s.get("tools", 0)
        err = f" — {s.get('error')}" if s.get("error") else ""
        lines.append(f"{icon} {name} | {'已启用' if enabled else '已禁用'} | {tool_count} 工具{err}")
    return {
        "servers_count": len(servers),
        "list": lines if lines else ["暂无 MCP 服务器"],
    }


def _parse_env(env_str: str) -> dict | None:
    env = {}
    if env_str and env_str.strip():
        for line in env_str.strip().split("\n"):
            idx = line.find("=")
            if idx > 0:
                env[line[:idx].strip()] = line[idx + 1:].strip()
    return env or None


def mcp_add_server(name: str, command: str, args: str, env: str = "") -> dict:
    arg_list = args.strip().split()
    cfg = {"type": "stdio", "command": command, "args": arg_list, "enabled": True}
    parsed_env = _parse_env(env)
    if parsed_env:
        cfg["env"] = parsed_env
    return add_mcp_server(name, cfg)


def mcp_remove_server(name: str) -> dict:
    return remove_mcp_server(name)


def mcp_toggle_server(name: str, enabled: bool) -> dict:
    return update_mcp_server(name, {"enabled": enabled})


def mcp_reload_servers() -> dict:
    return reload_mcp_servers()


def mcp_test_connection(command: str, args: str, env: str = "") -> dict:
    arg_list = args.strip().split()
    cfg = {"type": "stdio", "command": command, "args": arg_list}
    parsed_env = _parse_env(env)
    if parsed_env:
        cfg["env"] = parsed_env
    return test_connection(cfg)


MCP_TOOL_FUNCTIONS = {
    "mcp_list_servers": mcp_list_servers,
    "mcp_add_server": mcp_add_server,
    "mcp_remove_server": mcp_remove_server,
    "mcp_toggle_server": mcp_toggle_server,
    "mcp_reload_servers": mcp_reload_servers,
    "mcp_test_connection": mcp_test_connection,
}
