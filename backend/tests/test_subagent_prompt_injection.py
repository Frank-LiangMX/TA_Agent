from backend.agent_main import build_system_prompt


def test_general_prompt_includes_subagent_section():
    prompt = build_system_prompt(workflow_mode="auto", agent_mode="general")
    assert "## 可用的 SubAgent" in prompt
    assert "explorer" in prompt
    assert "researcher" in prompt
    assert "code-reviewer" in prompt


def test_ta_prompt_excludes_subagent_section():
    prompt = build_system_prompt(workflow_mode="auto", agent_mode="ta")
    assert "## 可用的 SubAgent" not in prompt


def test_general_prompt_includes_subagent_usage_tip():
    prompt = build_system_prompt(workflow_mode="auto", agent_mode="general")
    # 提示何时该用 subagent
    assert "Agent" in prompt
    assert "委派" in prompt or "subagent" in prompt.lower()
