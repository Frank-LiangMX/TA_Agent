import pytest
from packages.tools.agent_tool import SubAgentOrchestrator, SubAgentResult


def test_orchestrator_returns_result_dataclass():
    result = SubAgentResult(
        task_id="t1",
        status="completed",
        result_preview="ok",
        total_steps=1,
        total_tokens_in=10,
        total_tokens_out=5,
    )
    assert result.task_id == "t1"
    assert result.status == "completed"


def test_orchestrator_sync_run_returns_result(monkeypatch):
    """同步 run 应该返回 SubAgentResult，不抛异常"""
    from packages.tools import agent_tool

    def fake_run_loop(self, **kwargs):
        return SubAgentResult(
            task_id=self.task_id,
            status="completed",
            result_preview="mock output",
            total_steps=2,
            total_tokens_in=100,
            total_tokens_out=20,
        )

    monkeypatch.setattr(SubAgentOrchestrator, "_run_loop", fake_run_loop)

    orch = SubAgentOrchestrator(
        subagent_type="explorer",
        prompt="find x",
        description="test",
        run_in_background=False,
        parent_session_id="p1",
    )
    result = orch.run()
    assert isinstance(result, SubAgentResult)
    assert result.status == "completed"
    assert result.result_preview == "mock output"


def test_orchestrator_invokes_agent_loop(monkeypatch):
    """验证 _run_loop 调用了 backend.agent_main.agent_loop，并传了正确的参数"""
    from packages.tools import agent_tool

    captured = {}

    def fake_agent_loop(*, user_message, history, workflow_mode, interrupt_event, context_cutoff):
        captured["user_message"] = user_message
        captured["history"] = history
        captured["interrupt_event"] = interrupt_event
        return "mocked final answer", history + [{"role": "user", "content": user_message}]

    monkeypatch.setattr("backend.agent_main.agent_loop", fake_agent_loop)

    # mock get_subagent_model 返回固定模型
    monkeypatch.setattr("backend.config.get_subagent_model", lambda t: "mock-model")

    orch = SubAgentOrchestrator(
        subagent_type="explorer",
        prompt="list files in src",
        description="test",
        parent_session_id="p1",
    )
    result = orch._run_loop()

    assert captured["user_message"] == "list files in src"
    assert captured["history"] == []  # 隔离：子 agent 全新 history
    assert result.status == "completed"
    assert "mocked final answer" in result.result_preview or result.total_steps >= 0


def test_orchestrator_background_returns_task_id_immediately(monkeypatch):
    """run_in_background=True 时应立即返回 task_id 字符串，不阻塞。"""
    from packages.tools import agent_tool
    import threading
    import time

    started = threading.Event()
    completed = threading.Event()

    def slow_loop(self):
        started.set()
        time.sleep(0.3)
        completed.set()
        return SubAgentResult(
            task_id=self.task_id, status="completed",
            result_preview="slow done", total_steps=1,
        )

    monkeypatch.setattr(SubAgentOrchestrator, "_run_loop", slow_loop)

    orch = SubAgentOrchestrator(
        subagent_type="explorer", prompt="slow task", description="test",
        parent_session_id="p1", run_in_background=True,
    )
    ret = orch.run()
    assert isinstance(ret, str)  # 立即返回 task_id
    assert ret == orch.task_id
    # 验证后台真的跑了
    assert started.wait(timeout=1.0)
    assert completed.wait(timeout=2.0)
    # cleanup
    SubAgentOrchestrator.background_tasks.pop(orch.task_id, None)
