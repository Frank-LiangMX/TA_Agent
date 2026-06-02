# -*- coding: utf-8 -*-
"""
Git 版本控制工具
"""
import subprocess


def _run_git(args: list, timeout: int = 60) -> dict:
    """执行 Git 命令"""
    try:
        result = subprocess.run(
            ["git"] + args,
            capture_output=True, text=True, timeout=timeout,
            encoding="utf-8", errors="replace",
        )
        return {
            "success": result.returncode == 0,
            "output": result.stdout[-3000:],
            "error": result.stderr[-500:] if result.returncode != 0 else "",
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Git command timed out"}
    except FileNotFoundError:
        return {"success": False, "error": "Git not found. Please install Git."}


SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "git_status",
            "description": "Check Git status of a directory. Shows modified, added, deleted, untracked files.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Repository or directory path"},
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "git_log",
            "description": "Get Git commit history of a file or directory. Shows hash, author, date, and commit message.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File or directory path"},
                    "limit": {"type": "integer", "description": "Max number of log entries (default 10)", "default": 10},
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "git_diff",
            "description": "Show Git diff of a file or directory. Shows what has changed.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File or directory path"},
                    "cached": {"type": "boolean", "description": "Show staged changes (default false)", "default": False},
                },
                "required": ["path"]
            }
        }
    },
]


def git_status(path: str) -> dict:
    result = _run_git(["-C", path, "status", "--short"])
    if result["success"]:
        lines = [l for l in result["output"].strip().split("\n") if l.strip()]
        result["changed_files"] = len(lines)
        result["path"] = path
    return result


def git_log(path: str, limit: int = 10) -> dict:
    result = _run_git(["-C", path, "log", f"-{limit}", "--oneline", "--all"])
    if result["success"]:
        result["path"] = path
        result["limit"] = limit
    return result


def git_diff(path: str, cached: bool = False) -> dict:
    args = ["-C", path, "diff"]
    if cached:
        args.append("--cached")
    args.append(path)
    result = _run_git(args)
    if result["success"]:
        result["path"] = path
        result["cached"] = cached
    return result


TOOL_FUNCTIONS = {
    "git_status": git_status,
    "git_log": git_log,
    "git_diff": git_diff,
}
