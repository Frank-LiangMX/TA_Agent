"""WebSocket 转发 SubAgent 事件的测试。"""
import asyncio
import json
import os
import queue
import sys

import pytest


_HERE = os.path.dirname(os.path.abspath(__file__))
_SERVER_DIR = os.path.abspath(os.path.join(_HERE, ".."))  # apps/web/server
_PROJECT_ROOT = os.path.abspath(os.path.join(_HERE, "..", "..", "..", ".."))  # F:\ta_agent-worktrees\subagent-impl


@pytest.fixture(autouse=True)
def setup_server_module():
    """确保 server 模块加载，并使用它内部的 progress_hook 实例。

    server.py 内部用 `from progress_hook import ...`（懒加载）。
    通过 sys.path 注入方式访问 server 模块。
    """
    if _PROJECT_ROOT not in sys.path:
        sys.path.insert(0, _PROJECT_ROOT)
    if _SERVER_DIR not in sys.path:
        sys.path.insert(0, _SERVER_DIR)
    import server
    yield server


class _FakeWS:
    """Mock WebSocket — 同时支持 .send (raw) 和 .send_json (FastAPI WebSocket)。"""
    def __init__(self):
        self.sent = []

    async def send(self, data):
        self.sent.append(json.loads(data))

    async def send_json(self, obj):
        self.sent.append(obj)


def test_forward_subagent_events_filters_by_session(setup_server_module):
    """_forward_subagent_events 只 forward 当前 session 的事件。"""
    server = setup_server_module
    import progress_hook
    progress_hook._progress_queue = queue.Queue()

    events = [
        {"type": "subagent_event", "session_id": "s1", "task_id": "t1",
         "subagent_type": "explorer", "event_type": "tool",
         "payload": {"tool_name": "x", "args_preview": "{}"}},
        {"type": "subagent_event", "session_id": "s1", "task_id": "t1",
         "subagent_type": "explorer", "event_type": "progress",
         "payload": {"step_count": 1, "elapsed_ms": 100, "model": "m"}},
        {"type": "subagent_event", "session_id": "s2", "task_id": "t2",
         "subagent_type": "researcher", "event_type": "tool",
         "payload": {"tool_name": "y"}},
        {"type": "analysis_progress", "sessionId": "s1", "phase": "p1", "current": 1, "total": 1, "detail": "", "elapsed": 0},
    ]
    for e in events:
        progress_hook._progress_queue.put(e)

    ws = _FakeWS()
    n = asyncio.run(server._forward_subagent_events(ws, "s1"))
    assert n == 2, f"expected 2 forwarded, got {n}, sent={ws.sent}"
    assert ws.sent[0]["event"] == "subagent_tool"
    assert ws.sent[0]["payload"]["task_id"] == "t1"
    assert ws.sent[0]["payload"]["tool_name"] == "x"
    assert ws.sent[1]["event"] == "subagent_progress"
    assert ws.sent[1]["payload"]["step_count"] == 1


def test_forward_subagent_events_empty_queue(setup_server_module):
    """空队列时不应崩溃。"""
    server = setup_server_module
    import progress_hook
    progress_hook._progress_queue = queue.Queue()

    ws = _FakeWS()
    n = asyncio.run(server._forward_subagent_events(ws, "s1"))
    assert n == 0
    assert ws.sent == []


def test_forward_subagent_event_format_matches_frontend(setup_server_module):
    """验证 forward 的 WS 消息格式与前端 subagent-events.ts 期望的一致。"""
    server = setup_server_module
    import progress_hook
    progress_hook._progress_queue = queue.Queue()

    progress_hook.emit_subagent_tool(
        session_id="s1",
        subagent_type="explorer",
        task_id="t1",
        tool_name="workspace_list_dir",
        args_preview='{"path": "src"}',
    )

    ws = _FakeWS()
    n = asyncio.run(server._forward_subagent_events(ws, "s1"))
    assert n == 1, f"expected 1 forwarded, got {n}, sent={ws.sent}"
    msg = ws.sent[0]
    assert msg["type"] == "event"
    assert msg["event"] == "subagent_tool"
    assert msg["payload"]["task_id"] == "t1"
    assert msg["payload"]["subagent_type"] == "explorer"
    assert msg["payload"]["tool_name"] == "workspace_list_dir"
    assert msg["payload"]["args_preview"] == '{"path": "src"}'
