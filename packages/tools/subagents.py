"""SubAgent 声明式定义。

每个 SubAgent 是模式门控的工具（在 agent_mode == 'general' 时通过 Agent 工具调用），
拥有独立的 system prompt、allowed_tools 白名单、model_tier。
"""
from dataclasses import dataclass
from typing import Literal


ModelTier = Literal["haiku", "sonnet", "opus"]


@dataclass(frozen=True)
class SubAgentSpec:
    name: str
    display_name: str
    description_for_parent: str
    system_prompt: str
    allowed_tools: list[str]
    model_tier: ModelTier = "haiku"
    max_iterations: int = 15
    max_runtime_sec: int = 300


SUBAGENTS: dict[str, SubAgentSpec] = {
    "explorer": SubAgentSpec(
        name="explorer",
        display_name="代码探索",
        description_for_parent=(
            "适合：理解代码库结构、定位文件、梳理调用关系。"
            "只能读，不能写。运行快、成本低。"
            "返回时附文件路径和行号。"
        ),
        system_prompt=(
            "你是一个代码探索专家。使用只读工具（workspace_read_file、"
            "workspace_list_dir、scan_directory、discover_conventions）回答问题。"
            "永远不要修改文件。最终返回一段简洁的代码地图 + 文件引用列表。"
        ),
        allowed_tools=[
            "workspace_read_file",
            "workspace_list_dir",
            "scan_directory",
            "discover_conventions",
            "check_file_info",
        ],
        model_tier="haiku",
    ),
    "researcher": SubAgentSpec(
        name="researcher",
        display_name="技术调研",
        description_for_parent=(
            "适合：调研第三方库、API 文档、最佳实践。"
            "返回时附带引用链接。"
        ),
        system_prompt=(
            "你是一个技术调研专家。返回时附带引用链接（来源 URL）。"
            "如果当前没有联网工具，坦诚说明并基于已有知识回答。"
        ),
        allowed_tools=[
            "workspace_read_file",
            "memory_read_facts",
        ],
        model_tier="haiku",
    ),
    "code-reviewer": SubAgentSpec(
        name="code-reviewer",
        display_name="代码评审",
        description_for_parent=(
            "适合：检查代码质量、潜在 bug、安全问题、风格一致性。"
            "输出按文件组织的 findings 列表。"
        ),
        system_prompt=(
            "你是一个严格的代码评审员。按严重程度（critical / warning / nit）"
            "组织发现的问题，每条标注文件路径和行号。"
        ),
        allowed_tools=[
            "workspace_read_file",
            "workspace_list_dir",
            "scan_directory",
        ],
        model_tier="sonnet",
        max_iterations=10,
    ),
}


def get_subagent_spec(name: str) -> SubAgentSpec | None:
    return SUBAGENTS.get(name)


def list_subagent_names() -> list[str]:
    return list(SUBAGENTS.keys())


def resolve_allowed_tools(spec: SubAgentSpec) -> list[str]:
    """把 spec.allowed_tools 里的 mcp__* 通配符展开为当前 mcp_bridge 已注册的具体工具名。"""
    from packages.tools import registry

    # 当前已注册的所有 mcp__* 工具
    mcp_tool_names = [
        t["function"]["name"]
        for t in registry.TOOLS
        if t["function"]["name"].startswith("mcp__")
    ]

    resolved: list[str] = []
    for name in spec.allowed_tools:
        if name == "mcp__*":
            resolved.extend(mcp_tool_names)
        else:
            resolved.append(name)
    # 去重保序
    seen = set()
    out: list[str] = []
    for n in resolved:
        if n not in seen:
            seen.add(n)
            out.append(n)
    return out
