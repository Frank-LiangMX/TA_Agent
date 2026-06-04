"""
通用模式文件工具（读写列目录，路径无硬边界，行为参考 Proma）。

绝对路径直接使用；相对路径基于工作区根目录解析。
"""
import os

from tools.workspace_context import get_workspace_path

MAX_READ_CHARS = 80_000
MAX_WRITE_CHARS = 120_000
MAX_LIST_ITEMS = 500

TEXT_EXTENSIONS = {
    ".py", ".pyi", ".js", ".jsx", ".ts", ".tsx", ".json", ".md", ".txt",
    ".yaml", ".yml", ".toml", ".html", ".css", ".scss", ".xml", ".csv",
    ".sh", ".bat", ".ps1", ".sql", ".ini", ".cfg", ".env", ".gitignore",
    ".rs", ".go", ".java", ".kt", ".c", ".cpp", ".h", ".hpp", ".cs",
    ".vue", ".svelte", ".lua", ".rb", ".php",
}


def _is_probably_text(path: str) -> bool:
    ext = os.path.splitext(path)[1].lower()
    if ext in TEXT_EXTENSIONS:
        return True
    try:
        with open(path, "rb") as f:
            chunk = f.read(512)
        return b"\x00" not in chunk
    except OSError:
        return False


def _resolve_target(path: str) -> tuple[str | None, str | None]:
    """解析路径：绝对路径直接用；相对路径基于工作区。"""
    raw = (path or "").strip()
    if not raw:
        return None, "路径不能为空"
    if os.path.isabs(raw):
        return os.path.abspath(raw), None
    ws = get_workspace_path()
    if not ws:
        # 相对路径但没工作区，回退到 cwd
        return os.path.abspath(raw), None
    return os.path.abspath(os.path.join(os.path.abspath(ws), raw)), None


WORKSPACE_READ_FILE_DEF = {
    "type": "function",
    "function": {
        "name": "workspace_read_file",
        "description": "读取文本文件内容。绝对路径直接用；相对路径基于工作区根目录解析。没有『工作区内』的硬限制。",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "文件路径（相对工作区根目录或绝对路径）",
                },
                "max_chars": {
                    "type": "integer",
                    "description": "最多读取字符数",
                    "default": 12000,
                },
            },
            "required": ["path"],
        },
    },
}

WORKSPACE_WRITE_FILE_DEF = {
    "type": "function",
    "function": {
        "name": "workspace_write_file",
        "description": "写入或覆盖文本文件。绝对路径直接用；相对路径基于工作区根目录解析。没有『工作区内』的硬限制。",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "文件路径（相对工作区根目录或绝对路径）",
                },
                "content": {
                    "type": "string",
                    "description": "要写入的完整文件内容",
                },
            },
            "required": ["path", "content"],
        },
    },
}

WORKSPACE_LIST_DIR_DEF = {
    "type": "function",
    "function": {
        "name": "workspace_list_dir",
        "description": "列出目录下的文件和子目录。绝对路径直接用；相对路径基于工作区根目录解析。",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "相对工作区根目录的子目录，默认 '.' 表示根目录",
                    "default": ".",
                },
                "recursive": {
                    "type": "boolean",
                    "description": "是否递归列出",
                    "default": False,
                },
            },
            "required": [],
        },
    },
}


def workspace_read_file(path: str, max_chars: int = 12000) -> dict:
    target, err = _resolve_target(path)
    if err:
        return {"error": err}
    if not os.path.isfile(target):
        return {"error": f"文件不存在: {path}"}
    if not _is_probably_text(target):
        return {"error": "该文件可能为二进制，请让用户用专用工具打开"}
    limit = min(max(int(max_chars or 12000), 1), MAX_READ_CHARS)
    try:
        with open(target, "r", encoding="utf-8", errors="replace") as f:
            content = f.read(limit + 1)
    except OSError as e:
        return {"error": str(e)}
    truncated = len(content) > limit
    if truncated:
        content = content[:limit]
    return {
        "path": target,
        "workspace": get_workspace_path(),
        "content": content,
        "truncated": truncated,
        "size_bytes": os.path.getsize(target),
    }


def workspace_write_file(path: str, content: str) -> dict:
    target, err = _resolve_target(path)
    if err:
        return {"error": err}
    text = content if content is not None else ""
    if len(text) > MAX_WRITE_CHARS:
        return {"error": f"内容过长（>{MAX_WRITE_CHARS} 字符），请拆分写入"}
    parent = os.path.dirname(target)
    if parent:
        os.makedirs(parent, exist_ok=True)
    try:
        with open(target, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
    except OSError as e:
        return {"error": str(e)}
    return {
        "path": target,
        "workspace": get_workspace_path(),
        "bytes_written": len(text.encode("utf-8")),
        "ok": True,
    }


def workspace_list_dir(path: str = ".", recursive: bool = False) -> dict:
    target, err = _resolve_target(path or ".")
    if err:
        return {"error": err}
    if not os.path.isdir(target):
        return {"error": f"目录不存在: {path}"}

    entries: list[dict] = []

    def add_entry(full: str, name: str, is_dir: bool) -> None:
        rel = os.path.relpath(full, target).replace("\\", "/")
        if is_dir:
            entries.append({"name": name, "path": rel, "type": "dir"})
        else:
            entries.append({
                "name": name,
                "path": rel,
                "type": "file",
                "size_bytes": os.path.getsize(full),
            })

    if recursive:
        for root, dirs, files in os.walk(target):
            if len(entries) >= MAX_LIST_ITEMS:
                break
            for d in sorted(dirs):
                if d.startswith("."):
                    continue
                add_entry(os.path.join(root, d), d, True)
                if len(entries) >= MAX_LIST_ITEMS:
                    break
            for fn in sorted(files):
                if fn.startswith("."):
                    continue
                add_entry(os.path.join(root, fn), fn, False)
                if len(entries) >= MAX_LIST_ITEMS:
                    break
    else:
        try:
            names = sorted(os.listdir(target))
        except OSError as e:
            return {"error": str(e)}
        for name in names:
            if name.startswith("."):
                continue
            full = os.path.join(target, name)
            add_entry(full, name, os.path.isdir(full))
            if len(entries) >= MAX_LIST_ITEMS:
                break

    return {
        "workspace": get_workspace_path(),
        "directory": target,
        "entries": entries,
        "truncated": len(entries) >= MAX_LIST_ITEMS,
        "count": len(entries),
    }
