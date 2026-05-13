# -*- coding: utf-8 -*-
"""
SVN 版本控制工具（多工具插件示例）
"""
import subprocess


def _run_svn(args: list, timeout: int = 60) -> dict:
    """执行 SVN 命令"""
    try:
        result = subprocess.run(
            ["svn"] + args,
            capture_output=True, text=True, timeout=timeout,
            encoding="utf-8", errors="replace",
        )
        return {
            "success": result.returncode == 0,
            "output": result.stdout[-3000:],
            "error": result.stderr[-500:] if result.returncode != 0 else "",
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "SVN command timed out"}
    except FileNotFoundError:
        return {"success": False, "error": "SVN not found. Please install SVN client."}


SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "svn_status",
            "description": "Check SVN status of a directory. Shows modified, added, deleted files.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Directory or file path"},
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "svn_log",
            "description": "Get SVN commit history of a file or directory. Shows revision, author, date, and commit message.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File or directory path"},
                    "limit": {"type": "integer", "description": "Max number of log entries to return (default 10)", "default": 10},
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "svn_info",
            "description": "Get SVN info of a file or directory. Shows URL, revision, last changed author, last changed date.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File or directory path"},
                },
                "required": ["path"]
            }
        }
    },
]


def svn_status(path: str) -> dict:
    result = _run_svn(["status", path])
    if result["success"]:
        lines = [l for l in result["output"].strip().split("\n") if l.strip()]
        result["changed_files"] = len(lines)
        result["path"] = path
    return result


def svn_log(path: str, limit: int = 10) -> dict:
    result = _run_svn(["log", "-v", f"-l{limit}", path])
    if result["success"]:
        result["path"] = path
        result["limit"] = limit
    return result


def svn_info(path: str) -> dict:
    result = _run_svn(["info", path])
    if result["success"]:
        result["path"] = path
    return result


TOOL_FUNCTIONS = {
    "svn_status": svn_status,
    "svn_log": svn_log,
    "svn_info": svn_info,
}
