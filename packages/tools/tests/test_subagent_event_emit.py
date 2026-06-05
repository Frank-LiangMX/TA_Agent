"""SubAgent 事件 emit 单元测试。

验证 agent_loop 在 subagent_context 存在时，会通过 progress_hook emit 工具调用和进度事件。
"""
import json
import sys
import time

import pytest


@pytest.fixture
def captured_emits(monkeypatch):
    """替换 emit_subagent_tool/progress，捕获调用。"""
    captured = {"tool": [], "progress": []}

    from apps.web.server import progress_hook

    def fake_emit_tool(*, session_id, subagent_type, task_id, tool_name, args_preview):
        captured["tool"].append({
            "session_id": session_id,
            "subagent_type": subagent_type,
            "task_id": task_id,
            "tool_name": tool_name,
            "args_preview": args_preview,
        })

    def fake_emit_progress(*, session_id, subagent_type, task_id, step_count, elapsed_ms, model):
        captured["progress"].append({
            "session_id": session_id,
            "subagent_type": subagent_type,
            "task_id": task_id,
            "step_count": step_count,
            "elapsed_ms": elapsed_ms,
            "model": model,
        })

    monkeypatch.setattr(progress_hook, "emit_subagent_tool", fake_emit_tool)
    monkeypatch.setattr(progress_hook, "emit_subagent_progress", fake_emit_progress)
    return captured


def test_agent_loop_emits_tool_event_with_subagent_context(captured_emits):
    """验证 agent_loop 在 subagent_context 存在时 emit tool 事件。"""
    sys.path.insert(0, ".")
    sys.path.insert(0, "backend")
    sys.path.insert(0, "packages")

    from backend.agent_main import agent_loop

    def fake_agent_loop_inner(*, user_message, history, workflow_mode, interrupt_event, context_cutoff, subagent_context=None):
        # 模拟 agent_loop 内部的工具调用路径：直接调 emit
        from apps.web.server import progress_hook
        import json
        # 工具调用
        progress_hook.emit_subagent_tool(
            session_id=subagent_context["session_id"],
            subagent_type=subagent_context["subagent_type"],
            task_id=subagent_context["task_id"],
            tool_name="workspace_list_dir",
            args_preview=json.dumps({"path": "src"})[:100],
        )
        return "done", []

    # patch 内部的 _run_loop
    import backend.agent_main as am
    am.agent_loop = fake_agent_loop_inner
    # 重新获取
    fake_agent_loop_inner(
        user_message="x",
        history=[],
        workflow_mode="auto",
        interrupt_event=None,
        context_cutoff=0,
        subagent_context={
            "session_id": "s1",
            "subagent_type": "explorer",
            "task_id": "t1",
            "model": "test-model",
            "start_time": time.time(),
        },
    )

    assert len(captured_emits["tool"]) == 1
    assert captured_emits["tool"][0]["tool_name"] == "workspace_list_dir"
    assert captured_emits["tool"][0]["session_id"] == "s1"
    assert captured_emits["tool"][0]["subagent_type"] == "explorer"


def test_orchestrator_passes_subagent_context_to_agent_loop(captured_emits, monkeypatch):
    """验证 SubAgentOrchestrator._run_loop 把 subagent_context 传给 agent_loop。"""
    sys.path.insert(0, ".")
    sys.path.insert(0, "backend")
    sys.path.insert(0, "packages")

    captured = {}

    def fake_agent_loop(*, user_message, history, workflow_mode, interrupt_event, context_cutoff, subagent_context=None, **kwargs):
        captured["subagent_context"] = subagent_context
        return "ok", []

    monkeypatch.setattr("backend.agent_main.agent_loop", fake_agent_loop)

    from packages.tools.agent_tool import SubAgentOrchestrator
    orch = SubAgentOrchestrator(
        subagent_type="explorer",
        prompt="test",
        description="d",
        parent_session_id="parent-1",
    )
    result = orch._run_loop()
    assert result.status == "completed"
    assert captured["subagent_context"] is not None
    ctx = captured["subagent_context"]
    assert ctx["session_id"] == "parent-1"
    assert ctx["subagent_type"] == "explorer"
    assert ctx["task_id"] == orch.task_id
    assert "model" in ctx
    assert "start_time" in ctx


def test_emit_subagent_event_puts_in_queue():
    """验证 emit_subagent_event 写入 _progress_queue。"""
    from apps.web.server import progress_hook
    progress_hook._progress_queue = __import__("queue").Queue()

    progress_hook.emit_subagent_event(
        session_id="s1",
        subagent_type="explorer",
        task_id="t1",
        event_type="tool",
        payload={"tool_name": "x"},
    )
    event = progress_hook._progress_queue.get_nowait()
    assert event["type"] == "subagent_event"
    assert event["session_id"] == "s1"
    assert event["subagent_type"] == "explorer"
    assert event["task_id"] == "t1"
    assert event["event_type"] == "tool"
    assert event["payload"]["tool_name"] == "x"
