"""将 ~、中文目录别名等解析为本机绝对路径（仅用于工具执行，不写入系统提示）。"""
import os
import sys

_CN_ALIASES: dict[str, list[str]] = {
    "桌面": ["Desktop", "桌面"],
    "文档": ["Documents", "文档"],
    "下载": ["Downloads", "下载"],
    "图片": ["Pictures", "图片"],
    "视频": ["Videos", "视频"],
    "音乐": ["Music", "音乐"],
}

_PATH_ARG_KEYS = frozenset({
    "path",
    "file_path",
    "dir_path",
    "directory",
    "folder",
    "workspace",
    "workspace_path",
    "source_path",
    "dest_path",
    "target_dir",
    "target_path",
    "root_path",
    "asset_path",
    "output_dir",
    "input_dir",
    "config_path",
})


def _home() -> str:
    return os.path.expanduser("~")


def _resolve_cn_alias(text: str) -> str | None:
    """「桌面/foo」或「桌面」→ 绝对路径；无法解析返回 None。"""
    raw = text.strip()
    if not raw:
        return None
    for alias, candidates in _CN_ALIASES.items():
        if raw == alias:
            for sub in candidates:
                p = os.path.join(_home(), sub)
                if os.path.isdir(p):
                    return os.path.abspath(p)
            return os.path.abspath(os.path.join(_home(), candidates[0]))
        prefix = alias + os.sep
        prefix_slash = alias + "/"
        if raw.startswith(prefix) or raw.startswith(prefix_slash):
            rest = raw[len(alias) :].lstrip("/\\")
            base = _resolve_cn_alias(alias)
            if base:
                return os.path.abspath(os.path.join(base, rest)) if rest else base
    return None


def expand_user_path(path: str) -> str:
    """展开 ~ 与中文别名；已是绝对路径则规范化后返回。"""
    if not path or not isinstance(path, str):
        return path
    raw = path.strip().strip('"').strip("'")
    if not raw:
        return raw

    cn = _resolve_cn_alias(raw)
    if cn:
        return cn

    if raw == "~":
        return _home()
    if raw.startswith("~/") or raw.startswith("~\\"):
        return os.path.abspath(os.path.expanduser(raw))

    return os.path.abspath(os.path.expanduser(raw))


def normalize_tool_arguments(arguments: dict) -> dict:
    """复制参数并规范化其中的路径字段。"""
    if not arguments:
        return arguments
    out = dict(arguments)
    for key, val in out.items():
        if key in _PATH_ARG_KEYS and isinstance(val, str):
            out[key] = expand_user_path(val)
    return out
