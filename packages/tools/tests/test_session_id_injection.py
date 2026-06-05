"""验证 Agent 工具支持 session_id 参数（用于按会话过滤 SubAgentCard）。"""
import pytest
from unittest.mock import patch, MagicMock

from packages.tools.agent_tool import (
    SubAgentOrchestrator,
    SubAgentResult,
    _agent_tool_function,
    AGENT_TOOL_SCHEMA,
)


def test_agent_tool_schema_includes_session_id():
    """Agent 工具 schema 应包含 session_id 参数。"""
    props = AGENT_TOOL_SCHEMA["function"]["parameters"]["properties"]
    assert "session_id" in props
    assert props["session_id"]["type"] == "string"


def test_agent_tool_function_uses_session_id_arg():
    """_agent_tool_function 接受 session_id 参数并传给 SubAgentOrchestrator。"""
    captured = {}

    class FakeOrch:
        def __init__(self, **kwargs):
            captured.update(kwargs)
        def run(self):
            return SubAgentResult(task_id="t1", status="completed", result_preview="ok")

    with patch("packages.tools.agent_tool.SubAgentOrchestrator", FakeOrch):
        result = _agent_tool_function(
            subagent_type="explorer",
            prompt="x",
            description="d",
            session_id="real-session-123",
        )

    assert captured["parent_session_id"] == "real-session-123"


def test_agent_tool_function_default_session_id():
    """不传 session_id 时使用 fallback "parent"（保留向后兼容）。"""
    captured = {}

    class FakeOrch:
        def __init__(self, **kwargs):
            captured.update(kwargs)
        def run(self):
            return SubAgentResult(task_id="t1", status="completed", result_preview="ok")

    with patch("packages.tools.agent_tool.SubAgentOrchestrator", FakeOrch):
        result = _agent_tool_function(
            subagent_type="explorer",
            prompt="x",
            description="d",
        )

    assert captured["parent_session_id"] == "parent"


def test_orchestrator_constructor_stores_session_id():
    """SubAgentOrchestrator.__init__ 应正确存储 parent_session_id。"""
    orch = SubAgentOrchestrator(
        subagent_type="explorer",
        prompt="x",
        description="d",
        parent_session_id="my-real-session",
    )
    assert orch.parent_session_id == "my-real-session"

