"""
权限系统：会话白名单（内存） + 永久白名单（app-config.json 持久化）

app-config.json 中的存储格式：
{
  "permanentWhitelist": [
    {"tool": "workspace_write_file", "pattern": "*", "granted_at": "2026-06-03T..."}
  ]
}
"""

import json
import os
import time
import uuid
import asyncio

from config import _get_runtime_app_config, CONFIGS_DIR

# 会话级白名单（in-memory）
_session_whitelist: dict[str, set[str]] = {}


def _match_pattern(pattern: str, args: dict) -> bool:
    """简单 pattern 匹配：'*' 匹配任何；JSON 字符串精确匹配"""
    if pattern == "*" or not pattern:
        return True
    return json.dumps(args, sort_keys=True, ensure_ascii=False) == pattern


def _get_permanent_whitelist() -> list:
    cfg = _get_runtime_app_config()
    return cfg.get("permanentWhitelist", [])


def _save_permanent_whitelist(items: list) -> None:
    cfg = _get_runtime_app_config()
    cfg["permanentWhitelist"] = items
    config_path = os.path.join(CONFIGS_DIR, "app-config.json")
    os.makedirs(CONFIGS_DIR, exist_ok=True)
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


def is_session_whitelisted(session_id: str, tool_name: str, args: dict) -> bool:
    items = _session_whitelist.get(session_id, set())
    for entry in items:
        if "|" not in entry:
            continue
        tool, pattern = entry.split("|", 1)
        if tool == tool_name and _match_pattern(pattern, args):
            return True
    return False


def add_session_whitelist(session_id: str, tool_name: str, pattern: str) -> None:
    _session_whitelist.setdefault(session_id, set()).add(f"{tool_name}|{pattern}")


def is_permanently_whitelisted(tool_name: str, args: dict) -> bool:
    items = _get_permanent_whitelist()
    for item in items:
        if item.get("tool") == tool_name and _match_pattern(item.get("pattern", "*"), args):
            return True
    return False


def add_permanent(tool_name: str, pattern: str) -> None:
    items = _get_permanent_whitelist()
    items.append({
        "tool": tool_name,
        "pattern": pattern,
        "granted_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    })
    _save_permanent_whitelist(items)


def remove_permanent(tool_name: str, pattern: str) -> None:
    items = _get_permanent_whitelist()
    items = [i for i in items if not (i.get("tool") == tool_name and i.get("pattern", "*") == pattern)]
    _save_permanent_whitelist(items)


def list_permanent() -> list:
    return _get_permanent_whitelist()


# === 工具执行路径需要的能力 ===

_pending_permission_events: dict[str, asyncio.Event] = {}
_pending_permission_results: dict[str, bool] = {}
_pending_permission_meta: dict[str, dict] = {}


def get_tool_permission_level(tool_name: str, default: str) -> str:
    """从 server._permission_config 读（如果存在）"""
    try:
        from server import _permission_config
        return _permission_config["tool_permissions"].get(tool_name, default)
    except Exception:
        return default


async def request_permission_and_wait(
    ws,
    session_id: str,
    tool_call_id: str,
    tool_name: str,
    args: dict,
    classification: str,
    timeout: float = 300.0,
) -> bool:
    """
    发 tool_permission_request 事件，阻塞等用户的 respondPermission RPC。
    返回 True=允许, False=拒绝或超时。
    """
    request_id = uuid.uuid4().hex[:12]
    event = asyncio.Event()
    _pending_permission_events[request_id] = event
    _pending_permission_meta[request_id] = {
        "sessionId": session_id,
        "toolName": tool_name,
        "toolCallId": tool_call_id,
        "arguments": args,
    }

    try:
        await ws.send_json({
            "type": "event",
            "event": "tool_permission_request",
            "payload": {
                "requestId": request_id,
                "sessionId": session_id,
                "toolCallId": tool_call_id,
                "toolName": tool_name,
                "arguments": args,
                "classification": classification,
            },
        })
    except Exception:
        _pending_permission_events.pop(request_id, None)
        _pending_permission_meta.pop(request_id, None)
        return False

    try:
        await asyncio.wait_for(event.wait(), timeout=timeout)
    except asyncio.TimeoutError:
        _pending_permission_results[request_id] = False

    approved = _pending_permission_results.pop(request_id, False)
    _pending_permission_events.pop(request_id, None)
    _pending_permission_meta.pop(request_id, None)
    return approved


def resolve_permission(request_id: str, decision: str) -> bool:
    """
    由 respondPermission RPC handler 调用，唤醒等待中的 request。
    返回 True=成功唤醒, False=未知 requestId。
    """
    if request_id not in _pending_permission_events:
        return False

    approved = decision != "deny"
    _pending_permission_results[request_id] = approved

    if decision == "allow-session":
        meta = _pending_permission_meta.get(request_id, {})
        pattern = json.dumps(meta.get("arguments", {}), sort_keys=True, ensure_ascii=False)
        add_session_whitelist(meta.get("sessionId", ""), meta.get("toolName", ""), pattern)
    elif decision == "allow-permanent":
        meta = _pending_permission_meta.get(request_id, {})
        pattern = json.dumps(meta.get("arguments", {}), sort_keys=True, ensure_ascii=False)
        add_permanent(meta.get("toolName", ""), pattern)

    _pending_permission_events[request_id].set()
    return True
