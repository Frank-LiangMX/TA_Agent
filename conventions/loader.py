"""
conventions/loader.py - 规范文档加载器

加载规范文档内容，支持：
  - 本地文件：md, txt, json, csv, yaml
  - 在线URL：http/https（预留，需要时接入 WebFetch）
  - WPS 在线文档：365.kdocs.cn（预留，需要时接入 MCP 工具）
"""
from __future__ import annotations

import os
import json
from typing import Optional


def load_convention_doc(file_path_or_url: str) -> dict:
    """
    加载单个规范文档的内容。

    参数:
        file_path_or_url: 本地文件路径或在线 URL

    返回:
        {
            "source": str,       # 来源路径/URL
            "type": str,         # "local_file" / "online_url" / "wps_doc"
            "content": str,      # 文档文本内容
            "error": str | None, # 错误信息（如果有）
        }
    """
    if not file_path_or_url:
        return {"error": "未提供文件路径或 URL"}

    # 在线 URL
    if file_path_or_url.startswith(("http://", "https://")):
        return _load_online(file_path_or_url)

    # 本地文件
    return _load_local(file_path_or_url)


def load_convention_docs(file_paths_or_urls: list[str]) -> dict:
    """
    批量加载多个规范文档。

    参数:
        file_paths_or_urls: 文件路径或 URL 列表

    返回:
        {
            "total": int,
            "loaded": int,
            "failed": int,
            "documents": [
                {"source": str, "type": str, "content": str, "error": str|None},
                ...
            ],
            "combined_context": str,  # 所有文档合并后的文本（用于注入 Agent 上下文）
        }
    """
    docs = []
    for path in file_paths_or_urls:
        doc = load_convention_doc(path)
        docs.append(doc)

    loaded = [d for d in docs if d.get("content") and not d.get("error")]
    failed = [d for d in docs if d.get("error")]

    # 合并所有文档内容为一份上下文
    combined_parts = []
    for doc in loaded:
        header = f"=== 规范文档: {doc['source']} ==="
        combined_parts.append(f"{header}\n{doc['content']}\n")
    combined_context = "\n".join(combined_parts) if combined_parts else ""

    return {
        "total": len(docs),
        "loaded": len(loaded),
        "failed": len(failed),
        "documents": docs,
        "combined_context": combined_context,
    }


def _load_local(file_path: str) -> dict:
    """加载本地文件"""
    if not os.path.exists(file_path):
        return {
            "source": file_path,
            "type": "local_file",
            "content": None,
            "error": f"文件不存在: {file_path}",
        }

    if not os.path.isfile(file_path):
        return {
            "source": file_path,
            "type": "local_file",
            "content": None,
            "error": f"不是文件: {file_path}",
        }

    ext = os.path.splitext(file_path)[1].lower()

    try:
        if ext == ".json":
            content = _read_json(file_path)
        elif ext == ".csv":
            content = _read_csv(file_path)
        elif ext in (".yaml", ".yml"):
            content = _read_yaml(file_path)
        else:
            # md, txt, rst, adoc, tex 等纯文本
            content = _read_text(file_path)

        return {
            "source": file_path,
            "type": "local_file",
            "content": content,
            "error": None,
        }
    except Exception as e:
        return {
            "source": file_path,
            "type": "local_file",
            "content": None,
            "error": f"读取失败: {str(e)}",
        }


def _load_online(url: str) -> dict:
    """
    加载在线文档。
    注意：实际的 HTTP 请求需要通过 Agent 的 WebFetch 工具完成。
    这里返回一个标记，让 Agent 知道需要用 WebFetch 去获取内容。
    """
    # WPS 文档
    if "365.kdocs.cn" in url:
        return {
            "source": url,
            "type": "wps_doc",
            "content": None,
            "error": None,
            "need_fetch": True,
            "fetch_method": "wps_mcp",
            "instruction": f"请使用 WPS MCP 工具获取文档内容: {url}",
        }

    # 其他在线文档
    return {
        "source": url,
        "type": "online_url",
        "content": None,
        "error": None,
        "need_fetch": True,
        "fetch_method": "web_fetch",
        "instruction": f"请使用 WebFetch 工具获取文档内容: {url}",
    }


def _read_text(file_path: str) -> str:
    """读取纯文本文件"""
    encodings = ["utf-8", "utf-8-sig", "gbk", "gb2312", "latin-1"]
    for enc in encodings:
        try:
            with open(file_path, "r", encoding=enc) as f:
                return f.read()
        except (UnicodeDecodeError, UnicodeError):
            continue
    raise ValueError("无法识别文件编码")


def _read_json(file_path: str) -> str:
    """读取 JSON 文件并格式化为可读文本"""
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return json.dumps(data, ensure_ascii=False, indent=2)


def _read_csv(file_path: str) -> str:
    """读取 CSV 文件并转换为文本表格"""
    import csv
    encodings = ["utf-8", "utf-8-sig", "gbk", "gb2312"]
    for enc in encodings:
        try:
            with open(file_path, "r", encoding=enc, newline="") as f:
                reader = csv.reader(f)
                rows = list(reader)
            # 转为 Markdown 表格
            if not rows:
                return "(空文件)"
            lines = []
            # 表头
            lines.append("| " + " | ".join(rows[0]) + " |")
            lines.append("| " + " | ".join(["---"] * len(rows[0])) + " |")
            for row in rows[1:]:
                lines.append("| " + " | ".join(row) + " |")
            return "\n".join(lines)
        except (UnicodeDecodeError, UnicodeError):
            continue
    raise ValueError("无法识别 CSV 文件编码")


def _read_yaml(file_path: str) -> str:
    """读取 YAML 文件"""
    try:
        import yaml
        with open(file_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return json.dumps(data, ensure_ascii=False, indent=2)
    except ImportError:
        # 没有 PyYAML，按纯文本读
        return _read_text(file_path)
