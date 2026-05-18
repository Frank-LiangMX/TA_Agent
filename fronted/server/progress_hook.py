"""
全局进度事件队列

用于在不修改 ta_agent 代码的情况下，
将分析进度事件从工具执行层传递到 WebSocket 层。
"""

import queue

# 全局进度事件队列（线程安全）
_progress_queue: queue.Queue = queue.Queue()

# 当前活跃的 WebSocket 会话 ID
_active_session_id: str | None = None


def set_active_session(session_id: str | None):
    """设置当前活跃的 WebSocket 会话 ID"""
    global _active_session_id
    _active_session_id = session_id


def get_active_session() -> str | None:
    """获取当前活跃的 WebSocket 会话 ID"""
    return _active_session_id


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
        import tools.identity as identity

        # 使用模块级回调注入
        identity.set_progress_callback(emit_progress)
        print("  [进度回调] analyze_assets 已注入进度回调")
    except Exception as e:
        print(f"  [进度回调] 注入失败: {e}")
