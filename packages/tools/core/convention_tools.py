"""
tools/convention_tools.py - 规范文档发现与加载工具

提供两个 Agent 工具：
  discover_conventions - 扫描目录，发现疑似规范文档
  load_conventions     - 加载确认的规范文档内容，返回可注入上下文的文本
"""
from __future__ import annotations
import os

from conventions.discovery import discover_convention_docs as _discover
from conventions.loader import load_convention_docs as _load_docs


# ============================================================
# 工具定义（Schema 格式，传给 LLM）
# ============================================================

DISCOVER_CONVENTIONS_DEF = {
    "type": "function",
    "function": {
        "name": "discover_conventions",
        "description": (
            "扫描项目目录，自动发现疑似规范文档（命名规范、制作标准、流程文档等）。"
            "通过文件名关键词（如'规范'、'standard'、'naming'、'rule'）和文件类型来识别。"
            "返回候选列表，包含文件路径、匹配原因和内容预览，供用户确认哪些是需要加载的规范文档。"
            "在分析资产之前应先调用此工具，以确保后续检查基于项目实际规范而非默认规则。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "dir_path": {
                    "type": "string",
                    "description": "要扫描的项目目录路径",
                },
                "extra_keywords": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "额外的文件名关键词（可选），如项目特有的文档命名",
                },
                "max_depth": {
                    "type": "integer",
                    "description": "最大扫描深度（默认 3 层）",
                },
            },
            "required": ["dir_path"],
        },
    },
}

LOAD_CONVENTIONS_DEF = {
    "type": "function",
    "function": {
        "name": "load_conventions",
        "description": (
            "加载已确认的规范文档内容。"
            "接收一个文件路径或 URL 列表（从 discover_conventions 结果中选取，或用户手动指定），"
            "读取所有文档内容并合并为一份结构化的规范上下文。"
            "加载后的规范内容会作为项目规范注入 Agent 的工作上下文，"
            "后续所有资产检查（命名、目录、面数预算等）都将基于这些项目规范执行。"
            "支持本地文件（md/txt/json/csv/yaml）和在线 URL。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "file_paths": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "规范文档的文件路径或 URL 列表",
                },
            },
            "required": ["file_paths"],
        },
    },
}


# ============================================================
# 工具实现
# ============================================================

def discover_conventions(
    dir_path: str,
    extra_keywords: list[str] = None,
    max_depth: int = 3,
) -> dict:
    """扫描目录，发现疑似规范文档"""
    if not dir_path:
        return {"error": "必须提供 dir_path 参数"}

    result = _discover(
        dir_path=dir_path,
        extra_keywords=extra_keywords,
        max_depth=max_depth if max_depth else 3,
    )

    if "error" in result:
        return result

    # 格式化输出，方便 LLM 理解
    candidates = result.get("candidates", [])
    formatted = []
    for c in candidates:
        formatted.append({
            "path": c["path"],
            "filename": c["filename"],
            "reason": c["match_reason"],
            "size_kb": c["size_kb"],
            "preview": c["preview"][:300] if c["preview"] else "",
        })

    return {
        "dir_path": result["dir_path"],
        "total_scanned": result["total_scanned"],
        "found": len(formatted),
        "candidates": formatted,
        "instruction": (
            "请将以上候选列表展示给用户确认。"
            "用户确认后，将需要加载的文件路径传给 load_conventions 工具。"
            "用户也可以手动补充不在列表中的规范文档路径（包括在线 URL）。"
        ),
    }


def load_conventions(file_paths: list[str]) -> dict:
    """加载已确认的规范文档"""
    if not file_paths:
        return {"error": "必须提供至少一个文件路径"}

    result = _load_docs(file_paths)

    # 对于需要在线获取的文档，返回提示
    need_fetch = []
    for doc in result.get("documents", []):
        if doc.get("need_fetch"):
            need_fetch.append({
                "source": doc["source"],
                "method": doc.get("fetch_method"),
                "instruction": doc.get("instruction"),
            })

    return {
        "total": result["total"],
        "loaded": result["loaded"],
        "failed": result["failed"],
        "need_fetch": need_fetch,
        "combined_context": result.get("combined_context", ""),
        "documents_summary": [
            {
                "source": d["source"],
                "type": d["type"],
                "loaded": d.get("content") is not None and not d.get("error"),
                "error": d.get("error"),
            }
            for d in result.get("documents", [])
        ],
    }
