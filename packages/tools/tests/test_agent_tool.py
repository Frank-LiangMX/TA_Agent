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
