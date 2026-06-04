"""
危险模式正则表（HARDLINE / DANGEROUS / SAFE）
参考 hermes-agent 的三层权限模型。

HARDLINE: 绝对禁止，无法绕过
DANGEROUS: 每次询问
SAFE: 自动放行
"""

import re

# HARDLINE：绝对禁止
HARDLINE_PATTERNS = [
    re.compile(r"\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\s+/\s*"),
    re.compile(r"\bmkfs(\.\w+)?\b"),
    re.compile(r"\bshutdown\b"),
    re.compile(r"\bformat\s+[a-zA-Z]:", re.IGNORECASE),
    re.compile(r"\bDROP\s+(DATABASE|SCHEMA)\b", re.IGNORECASE),
    re.compile(r":\(\)\s*\{.*:\|:&\s*\}"),
]

# DANGEROUS：每次询问
DANGEROUS_PATTERNS = [
    re.compile(r"\brm\s+-[a-zA-Z]*r"),
    re.compile(r"\bchmod\s+[0-7]*7[0-7]*\b"),
    re.compile(r"\bgit\s+push\s+--force\b"),
    re.compile(r"\bcurl\s+[^|]*\|\s*(sh|bash)\b"),
    re.compile(r"\bkill\s+-9\s+-1\b"),
    re.compile(r"\bdd\s+[^|]*\bof\s*=\s*/dev/"),
    re.compile(r"\bdel\s+/[sS]\s+"),
    re.compile(r"\brmdir\s+/[sS]\b"),
    re.compile(r":\(\)\s*\{"),
]

# SAFE：自动放行（只读类）
SAFE_TOOL_NAMES = frozenset({
    "workspace_read_file",
    "workspace_list_dir",
    "scan_directory",
    "check_file_info",
    "get_memory_stats",
    "memory_read_facts",
    "memory_read_sop",
    "discover_conventions",
    "load_conventions",
    "get_asset_detail",
    "list_assets",
    "search_assets",
    "get_pending_reviews",
    "get_review_detail",
    "check_project_config",
    "list_project_configs",
    "mcp_list_servers",
    "web_search",
    "web_fetch",
})

# 写类工具：默认 DANGEROUS
WRITE_TOOL_NAMES = frozenset({
    "workspace_write_file",
    "update_project_profile",
    "append_profile_fact",
    "update_asset_type",
    "update_asset",
    "submit_review",
    "batch_approve",
    "create_project_config",
    "load_project_config",
    "add_custom_rule",
    "suggest_rename",
    "rename_asset",
    "batch_rename",
    "create_directory",
    "move_asset",
    "intake_asset",
    "intake_batch",
    "intake_approved",
    "mcp_add_server",
    "mcp_remove_server",
    "mcp_toggle_server",
    "mcp_reload_servers",
    "record_correction",
})


def classify(tool_name: str, arguments: dict) -> str:
    """返回 'hardline' | 'dangerous' | 'safe'"""
    if tool_name in SAFE_TOOL_NAMES:
        return "safe"

    # 检查 arguments 里的 command 字段（针对可能的 bash 类工具）
    command = arguments.get("command") or arguments.get("cmd") or ""
    if isinstance(command, str) and command:
        for pat in HARDLINE_PATTERNS:
            if pat.search(command):
                return "hardline"
        for pat in DANGEROUS_PATTERNS:
            if pat.search(command):
                return "dangerous"

    if tool_name in WRITE_TOOL_NAMES:
        return "dangerous"

    return "safe"
