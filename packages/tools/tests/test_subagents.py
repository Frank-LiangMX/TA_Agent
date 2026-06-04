from packages.tools.subagents import SubAgentSpec, SUBAGENTS, get_subagent_spec


def test_explorer_spec_exists():
    spec = get_subagent_spec("explorer")
    assert spec is not None
    assert spec.name == "explorer"
    assert spec.display_name == "代码探索"
    assert spec.model_tier == "haiku"
    assert "workspace_read_file" in spec.allowed_tools


def test_researcher_spec_exists():
    spec = get_subagent_spec("researcher")
    assert spec is not None
    assert spec.model_tier == "haiku"


def test_code_reviewer_spec_exists():
    spec = get_subagent_spec("code-reviewer")
    assert spec is not None
    assert spec.model_tier == "sonnet"


def test_unknown_subagent_returns_none():
    assert get_subagent_spec("nope") is None


def test_all_specs_have_required_fields():
    for name, spec in SUBAGENTS.items():
        assert spec.name == name
        assert spec.display_name
        assert spec.description_for_parent
        assert spec.system_prompt
        assert spec.allowed_tools
        assert spec.model_tier in ("haiku", "sonnet", "opus")


def test_no_subagent_can_recursively_call_agent():
    """子 agent 的工具白名单不能包含 Agent/TaskOutput/TaskStop"""
    forbidden = {"Agent", "TaskOutput", "TaskStop"}
    for name, spec in SUBAGENTS.items():
        bad = forbidden & set(spec.allowed_tools)
        assert not bad, f"{name} 不应在 allowed_tools 中包含 {bad}"
