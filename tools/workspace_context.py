"""当前会话工作区路径（由 server/agent 在每轮对话前设置）。"""
import os

_workspace_path: str | None = None


def set_workspace_path(path: str | None) -> None:
    global _workspace_path
    if path and str(path).strip():
        _workspace_path = os.path.abspath(str(path).strip())
    else:
        _workspace_path = None


def get_workspace_path() -> str | None:
    if _workspace_path:
        return _workspace_path
    try:
        from config import get_agent_runtime_mode, get_default_workspace_path

        if get_agent_runtime_mode() == "general":
            return get_default_workspace_path()
    except ImportError:
        pass
    return None


def resolve_in_workspace(path: str) -> tuple[str | None, str | None]:
    """将相对/绝对路径解析到工作区内，返回 (abs_path, error)。"""
    ws = get_workspace_path()
    if not ws or not os.path.isdir(ws):
        return None, "工作区目录不可用，请检查默认工作区或重新选择文件夹"

    raw = (path or "").strip()
    if not raw:
        return None, "路径不能为空"

    ws_abs = os.path.abspath(ws)
    target = os.path.abspath(raw if os.path.isabs(raw) else os.path.join(ws_abs, raw))

    try:
        if os.path.commonpath([ws_abs, target]) != ws_abs:
            return None, "禁止访问工作区外的路径"
    except ValueError:
        return None, "无效路径"

    return target, None
