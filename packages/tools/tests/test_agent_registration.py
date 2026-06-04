def test_agent_tool_registered_in_general_mode():
    from packages.tools import registry
    tools = registry.get_tools_for_mode(agent_mode="general")
    names = {t["function"]["name"] for t in tools}
    assert "Agent" in names


def test_agent_tool_not_in_ta_mode():
    from packages.tools import registry
    tools = registry.get_tools_for_mode(agent_mode="ta")
    names = {t["function"]["name"] for t in tools}
    assert "Agent" not in names
