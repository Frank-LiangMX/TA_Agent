# -*- coding: utf-8 -*-
"""
Plastic SCM 版本控制工具
"""
import subprocess

SCHEMA = {
    "type": "function",
    "function": {
        "name": "plastic_status",
        "description": "Check Plastic SCM (Unity Version Control) status. Shows pending changes.",
        "parameters": {
            "type": "object",
            "properties": {
                "workspace": {"type": "string", "description": "Workspace or directory path"},
            },
            "required": ["workspace"]
        }
    }
}


def plastic_status(workspace: str) -> dict:
    result = subprocess.run(
        ["cm", "status", workspace],
        capture_output=True, text=True, timeout=60
    )
    lines = result.stdout.strip().split("\n") if result.stdout.strip() else []
    return {
        "success": result.returncode == 0,
        "workspace": workspace,
        "changed_files": len(lines),
        "output": result.stdout[-2000:],
    }
