"""
全局进度事件队列

用于在不修改 ta_agent 代码的情况下，
将分析进度事件从工具执行层传递到 WebSocket 层。
"""

import queue
import threading

# 全局进度事件队列（线程安全）
_progress_queue: queue.Queue = queue.Queue()

# 当前活跃的 WebSocket 会话 ID
_active_session_id: str | None = None

# per-session 取消信号
_cancel_events: dict[str, threading.Event] = {}


def set_active_session(session_id: str | None):
    """设置当前活跃的 WebSocket 会话 ID"""
    global _active_session_id
    _active_session_id = session_id


def get_active_session() -> str | None:
    """获取当前活跃的 WebSocket 会话 ID"""
    return _active_session_id


def get_or_create_cancel_event(session_id: str) -> threading.Event:
    """获取或创建某个 session 的取消事件。"""
    if session_id not in _cancel_events:
        _cancel_events[session_id] = threading.Event()
    return _cancel_events[session_id]


def set_cancel_event(event: threading.Event | None) -> None:
    """兼容旧 API：直接覆盖为某个 event（仍绑定 active session）。"""
    if _active_session_id is None:
        return
    if event is None:
        _cancel_events.pop(_active_session_id, None)
    else:
        _cancel_events[_active_session_id] = event


def cancel_session(session_id: str) -> None:
    """取消某个 session：设置其 event + 级联取消所有 in-flight subagent。"""
    if ev := _cancel_events.get(session_id):
        ev.set()
    _cascade_cancel_subagents(session_id)


def _cascade_cancel_subagents(session_id: str) -> None:
    """父级取消时，遍历所有 in-flight subagent 并取消。"""
    try:
        from packages.tools.agent_tool import SubAgentOrchestrator
        # 列表化避免迭代时修改 dict
        for orch in list(SubAgentOrchestrator.background_tasks.values()):
            if orch.parent_session_id == session_id:
                SubAgentOrchestrator.background_tasks.pop(orch.task_id, None)
    except ImportError:
        pass


def clear_cancel_event(session_id: str) -> None:
    """会话结束时清理 event。"""
    _cancel_events.pop(session_id, None)


def is_cancelled(session_id: str | None = None) -> bool:
    """检查是否已取消（供工具内部调用）。默认看 active session。"""
    sid = session_id or _active_session_id
    if not sid:
        return False
    ev = _cancel_events.get(sid)
    return ev.is_set() if ev else False


def emit_progress(phase: str, current: int, total: int, detail: str, elapsed: float = 0):
    """发送进度事件到队列（供 analyzer 的 on_progress 回调使用）"""
    _progress_queue.put({
        "type": "analysis_progress",
        "sessionId": _active_session_id or "",
        "phase": phase,
        "current": current,
        "total": total,
        "detail": detail,
        "elapsed": elapsed,
    })


def get_progress_events() -> list:
    """获取并清空所有待处理的进度事件"""
    events = []
    while not _progress_queue.empty():
        try:
            events.append(_progress_queue.get_nowait())
        except queue.Empty:
            break
    return events


def patch_analyzer_progress():
    """
    注入进度回调：设置 identity.py 的 _active_progress_callback。
    不修改原文件，通过模块级回调实现。
    """
    try:
        import tools.core.identity as identity

        # 使用模块级回调注入
        identity.set_progress_callback(emit_progress)
        print("  [进度回调] run_ai_inference 已注入进度回调")
    except Exception as e:
        print(f"  [进度回调] 注入失败: {e}")
