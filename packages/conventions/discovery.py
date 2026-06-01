"""
conventions/discovery.py - 规范文档发现器

扫描项目目录，按文件名关键词、文件类型、内容特征
找出疑似规范文档的文件，返回候选列表供用户确认。
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field, asdict
from typing import Optional


# 文件名关键词（中英文，大小写不敏感）
_NAME_KEYWORDS = [
    # 中文
    "规范", "规则", "标准", "命名", "约定", "导则", "指南",
    # 英文
    "convention", "standard", "naming", "rule", "guide", "guideline",
    "spec", "specification", "conventions", "standards", "rules",
    "pipeline", "workflow", "规范文档", "制作规范",
]

# 支持的文件扩展名
_SUPPORTED_EXTENSIONS = {
    ".md", ".txt", ".json", ".csv", ".yaml", ".yml",
    ".rst", ".adoc", ".tex",
}

# 忽略的目录名
_IGNORE_DIRS = {
    "__pycache__", ".git", ".svn", ".hg", "node_modules",
    ".vs", ".vscode", ".idea", "bin", "obj", "Build",
    "Intermediate", "DerivedDataCache", ".claude",
}

# 忽略的文件名
_IGNORE_FILES = {
    "requirements.txt", "package.json", "package-lock.json",
    ".gitignore", ".gitattributes", "LICENSE", "CHANGELOG.md",
    "README.md",  # README 通常不是规范文档
}


@dataclass
class ConventionCandidate:
    """一个疑似规范文档的候选"""
    path: str              # 文件绝对路径
    filename: str          # 文件名
    extension: str         # 扩展名
    match_reason: str      # 为什么被选中（关键词匹配 or 内容特征）
    preview: str = ""      # 文件前 500 字符预览
    size_kb: float = 0.0   # 文件大小 KB

    def to_dict(self) -> dict:
        return asdict(self)


def discover_convention_docs(
    dir_path: str,
    extra_keywords: list[str] = None,
    max_depth: int = 3,
) -> dict:
    """
    扫描目录，发现疑似规范文档。

    参数:
        dir_path: 要扫描的目录路径
        extra_keywords: 额外的文件名关键词（可选）
        max_depth: 最大扫描深度（默认 3 层）

    返回:
        {
            "dir_path": str,
            "candidates": [ConventionCandidate.to_dict(), ...],
            "total_scanned": int,
        }
    """
    if not os.path.exists(dir_path):
        return {"error": f"目录不存在: {dir_path}"}

    if not os.path.isdir(dir_path):
        return {"error": f"不是目录: {dir_path}"}

    keywords = list(_NAME_KEYWORDS)
    if extra_keywords:
        keywords.extend(extra_keywords)

    candidates: list[ConventionCandidate] = []
    total_scanned = 0

    for root, dirs, files in os.walk(dir_path):
        # 控制扫描深度
        depth = root.replace(dir_path, "").count(os.sep)
        if depth >= max_depth:
            dirs.clear()
            continue

        # 过滤忽略的目录
        dirs[:] = [d for d in dirs if d not in _IGNORE_DIRS]

        for filename in files:
            total_scanned += 1

            # 跳过忽略的文件
            if filename in _IGNORE_FILES:
                continue

            name_lower = filename.lower()
            ext = os.path.splitext(filename)[1].lower()

            # 检查 1：文件扩展名是否支持
            if ext not in _SUPPORTED_EXTENSIONS:
                continue

            # 检查 2：文件名是否包含关键词
            match_reason = _match_keyword(name_lower, keywords)
            if not match_reason:
                # 检查 3：文件名模式（如 "XX_rules", "XX_standard"）
                match_reason = _match_pattern(name_lower)

            if not match_reason:
                continue

            filepath = os.path.join(root, filename)

            # 读取预览
            preview = _read_preview(filepath)
            size_kb = os.path.getsize(filepath) / 1024

            candidates.append(ConventionCandidate(
                path=filepath,
                filename=filename,
                extension=ext,
                match_reason=match_reason,
                preview=preview,
                size_kb=round(size_kb, 1),
            ))

    return {
        "dir_path": dir_path,
        "candidates": [c.to_dict() for c in candidates],
        "total_scanned": total_scanned,
    }


def _match_keyword(name_lower: str, keywords: list[str]) -> Optional[str]:
    """检查文件名是否包含关键词"""
    for kw in keywords:
        if kw.lower() in name_lower:
            return f"文件名包含关键词: '{kw}'"
    return None


def _match_pattern(name_lower: str) -> Optional[str]:
    """检查文件名是否符合常见规范文档命名模式"""
    patterns = [
        (r"^(readme|说明|文档|doc).*\.(md|txt)$", "README/说明文档"),
        (r".*(config|conf|配置).*\.(json|yaml|yml)$", "配置文件"),
        (r"^(todo|task|任务).*", "任务清单"),
        (r".*_(v\d+|rev\d+).*", "版本化文档"),
        (r"^\d{4}[-_]?\d{2}[-_]?\d{2}.*", "日期前缀文档"),
    ]
    for pattern, reason in patterns:
        if re.match(pattern, name_lower):
            return reason
    return None


def _read_preview(filepath: str, max_chars: int = 500) -> str:
    """读取文件前 max_chars 个字符作为预览"""
    try:
        ext = os.path.splitext(filepath)[1].lower()
        if ext == ".json":
            import json
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
                preview = json.dumps(data, ensure_ascii=False, indent=2)[:max_chars]
                return preview
        elif ext in (".csv",):
            with open(filepath, "r", encoding="utf-8") as f:
                return f.read(max_chars)
        else:
            with open(filepath, "r", encoding="utf-8") as f:
                return f.read(max_chars)
    except Exception:
        return "(无法预览)"
