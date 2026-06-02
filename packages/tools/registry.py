"""
工具注册中心
汇总所有模块的 Schema 和执行函数，提供统一的 TOOLS 列表和 execute_tool 分发器

新增工具只需：
1. 在对应模块中定义 SCHEMA 和执行函数
2. 在本文件的 _register_all() 中注册

插件扩展：
在 tools/plugins/ 目录下放置 .py 文件，启动时自动扫描注册。
插件必须导出 SCHEMA（dict）和与 Schema.function.name 同名的函数。
"""
import json
import os
import importlib
import sys

# 导入所有工具模块
from tools.core.naming import check_naming, suggest_naming
from tools.core.directory import check_directory_structure
from tools.core.file_info import check_file_info, scan_directory
from tools.core.mesh import check_mesh_budget
from tools.core.mesh_fbx import check_fbx_info, check_blender
from tools.core.texture import check_texture_info, check_texture_batch
from tools.core.report import generate_report
from tools.core.identity import analyze_assets, run_ai_inference, update_asset_type, update_asset, search_assets, get_asset_detail, list_assets
from tools.core.convention_tools import discover_conventions, load_conventions
from tools.core.memory_llm_tools import (
    record_correction,
    get_memory_stats,
    update_project_profile,
    append_profile_fact,
    memory_read_facts,
    memory_read_sop,
)
from tools.core.renderer import render_asset_preview
from tools.core.review import get_pending_reviews, get_review_detail, submit_review, batch_approve
from tools.core.review_schema import GET_PENDING_REVIEWS_DEF, GET_REVIEW_DETAIL_DEF, SUBMIT_REVIEW_DEF, BATCH_APPROVE_DEF
from tools.core.config_tools import (
    check_project_config_tool, list_project_configs_tool,
    create_project_config_tool, load_project_config_tool,
    CHECK_PROJECT_CONFIG_DEF, LIST_PROJECT_CONFIGS_DEF,
    CREATE_PROJECT_CONFIG_DEF, LOAD_PROJECT_CONFIG_DEF,
    ADD_CUSTOM_RULE_DEF, add_custom_rule,
)
from tools.core.asset_operations import (
    suggest_rename, rename_asset, batch_rename, create_directory, move_asset,
    SUGGEST_RENAME_DEF, RENAME_ASSET_DEF, BATCH_RENAME_DEF,
    CREATE_DIRECTORY_DEF, MOVE_ASSET_DEF,
)
from tools.core.intake import (
    intake_asset, intake_batch, intake_approved,
    INTAKE_ASSET_DEF, INTAKE_BATCH_DEF, INTAKE_APPROVED_DEF,
)
from tools.extensions.ue5_bridge import (
    UE5_TOOLS, UE5_TOOL_FUNCTIONS,
)
from tools.mcp_bridge import (
    MCP_TOOLS, MCP_TOOL_FUNCTIONS,
)
from tools.core.workspace_tools import (
    WORKSPACE_READ_FILE_DEF,
    WORKSPACE_WRITE_FILE_DEF,
    WORKSPACE_LIST_DIR_DEF,
    workspace_read_file,
    workspace_write_file,
    workspace_list_dir,
)
from config import get_agent_runtime_mode
from tools.path_resolve import normalize_tool_arguments


# ========== Schema 注册 ==========
# 每个模块导出 SCHEMA 变量，这里汇总

from tools.core.naming import SCHEMA as NAMING_SCHEMA, SUGGEST_SCHEMA
from tools.core.directory import SCHEMA as DIR_SCHEMA
from tools.core.file_info import CHECK_FILE_INFO_SCHEMA, SCAN_DIRECTORY_SCHEMA
from tools.core.mesh import SCHEMA as MESH_SCHEMA
from tools.core.mesh_fbx import SCHEMA as FBX_SCHEMA, CHECK_BLENDER_SCHEMA
from tools.core.texture import SCHEMA as TEX_SCHEMA, BATCH_SCAN_SCHEMA
from tools.core.report import SCHEMA as REPORT_SCHEMA
from tools.core.identity import (
    ANALYZE_ASSETS_DEF, RUN_INFERENCE_DEF, UPDATE_ASSET_TYPE_DEF, UPDATE_ASSET_DEF,
    SEARCH_ASSETS_DEF, GET_ASSET_DETAIL_DEF, LIST_ASSETS_DEF,
)
from tools.core.convention_tools import DISCOVER_CONVENTIONS_DEF, LOAD_CONVENTIONS_DEF
from tools.core.memory_llm_tools import (
    RECORD_CORRECTION_DEF,
    GET_MEMORY_STATS_DEF,
    UPDATE_PROJECT_PROFILE_DEF,
    APPEND_PROFILE_FACT_DEF,
    MEMORY_READ_FACTS_DEF,
    MEMORY_READ_SOP_DEF,
)
from tools.core.renderer import SCHEMA as RENDERER_SCHEMA

# ========== 工具层级分类 ==========
# tier: core | extension | mcp(内置管理) | mcp_remote(外部服务器) | plugin
# core+extension 启动即注册，mcp 从 mcp.json 加载，plugin 从 plugins/ 加载

TOOL_TIER: dict[str, str] = {}  # tool_name → tier


def _tag_tier(name: str, tier: str):
    TOOL_TIER[name] = tier


def tag_mcp_remote_tools():
    """为外部 MCP 服务器注入的 mcp__* 工具标注层级（reload 后调用）。"""
    for schema in TOOLS:
        name = schema["function"]["name"]
        if name.startswith("mcp__"):
            _tag_tier(name, "mcp_remote")


# ========== Schema 注册 ==========

# 通用模式允许的核心工具（不含动态 mcp__*）
GENERAL_CORE_TOOL_NAMES = frozenset({
    "workspace_read_file",
    "workspace_write_file",
    "workspace_list_dir",
    "scan_directory",
    "check_file_info",
    "record_correction",
    "get_memory_stats",
    "update_project_profile",
    "append_profile_fact",
    "memory_read_facts",
    "memory_read_sop",
    "discover_conventions",
    "load_conventions",
    "mcp_list_servers",
    "mcp_add_server",
    "mcp_remove_server",
    "mcp_toggle_server",
    "mcp_reload_servers",
    "mcp_test_connection",
})

TOOLS = [
    WORKSPACE_READ_FILE_DEF,
    WORKSPACE_WRITE_FILE_DEF,
    WORKSPACE_LIST_DIR_DEF,
    NAMING_SCHEMA,
    SUGGEST_SCHEMA,
    DIR_SCHEMA,
    CHECK_FILE_INFO_SCHEMA,
    SCAN_DIRECTORY_SCHEMA,
    MESH_SCHEMA,
    FBX_SCHEMA,
    CHECK_BLENDER_SCHEMA,
    TEX_SCHEMA,
    BATCH_SCAN_SCHEMA,
    REPORT_SCHEMA,
    ANALYZE_ASSETS_DEF,
    RUN_INFERENCE_DEF,
    UPDATE_ASSET_TYPE_DEF,
    UPDATE_ASSET_DEF,
    SEARCH_ASSETS_DEF,
    GET_ASSET_DETAIL_DEF,
    LIST_ASSETS_DEF,
    DISCOVER_CONVENTIONS_DEF,
    LOAD_CONVENTIONS_DEF,
    RECORD_CORRECTION_DEF,
    GET_MEMORY_STATS_DEF,
    UPDATE_PROJECT_PROFILE_DEF,
    APPEND_PROFILE_FACT_DEF,
    MEMORY_READ_FACTS_DEF,
    MEMORY_READ_SOP_DEF,
    RENDERER_SCHEMA,
    GET_PENDING_REVIEWS_DEF,
    GET_REVIEW_DETAIL_DEF,
    SUBMIT_REVIEW_DEF,
    BATCH_APPROVE_DEF,
    CHECK_PROJECT_CONFIG_DEF,
    LIST_PROJECT_CONFIGS_DEF,
    CREATE_PROJECT_CONFIG_DEF,
    LOAD_PROJECT_CONFIG_DEF,
    ADD_CUSTOM_RULE_DEF,
    SUGGEST_RENAME_DEF,
    RENAME_ASSET_DEF,
    BATCH_RENAME_DEF,
    CREATE_DIRECTORY_DEF,
    MOVE_ASSET_DEF,
    INTAKE_ASSET_DEF,
    INTAKE_BATCH_DEF,
    INTAKE_APPROVED_DEF,
    *UE5_TOOLS,
    *MCP_TOOLS,
]


# ========== 工具层级标注 ==========
# 四种层级: core(内置) | extension(引擎扩展) | mcp(动态) | plugin(可选插件)

def _build_tier_map():
    mcp_names = {s["function"]["name"] for s in MCP_TOOLS}
    ext_names = {s["function"]["name"] for s in UE5_TOOLS}
    for schema in TOOLS:
        name = schema["function"]["name"]
        if name in mcp_names:
            _tag_tier(name, "mcp")
        elif name in ext_names:
            _tag_tier(name, "extension")
        elif name.startswith("mcp__"):
            _tag_tier(name, "mcp_remote")
        else:
            _tag_tier(name, "core")


_build_tier_map()
del _build_tier_map


def get_tools_by_tier() -> dict[str, list[str]]:
    """返回按层级分组的工具名列表"""
    tiers: dict[str, list[str]] = {"core": [], "extension": [], "mcp": [], "plugin": []}
    for name, tier in TOOL_TIER.items():
        if tier in tiers:
            tiers[tier].append(name)
    return tiers


def get_tier_summary_for_mode(agent_mode: str | None = None) -> dict[str, int]:
    """按运行模式统计各层级可用工具数量（与 get_tools_for_mode 一致）。"""
    summary = {"core": 0, "extension": 0, "mcp": 0, "plugin": 0}
    for schema in get_tools_for_mode(agent_mode):
        name = schema.get("function", {}).get("name", "")
        tier = TOOL_TIER.get(name, "core")
        if tier == "mcp_remote":
            continue
        if tier in summary:
            summary[tier] += 1
    return summary


# ========== 工具执行函数注册 ==========

TOOL_FUNCTIONS = {
    "workspace_read_file":    workspace_read_file,
    "workspace_write_file":   workspace_write_file,
    "workspace_list_dir":     workspace_list_dir,
    "check_naming":           check_naming,
    "suggest_naming":         suggest_naming,
    "check_directory_structure": check_directory_structure,
    "check_file_info":        check_file_info,
    "scan_directory":         scan_directory,
    "check_mesh_budget":      check_mesh_budget,
    "check_fbx_info":         check_fbx_info,
    "check_blender":          check_blender,
    "check_texture_info":     check_texture_info,
    "check_texture_batch":    check_texture_batch,
    "generate_report":        generate_report,
    "analyze_assets":         analyze_assets,
    "run_ai_inference":       run_ai_inference,
    "update_asset_type":      update_asset_type,
    "update_asset":           update_asset,
    "search_assets":          search_assets,
    "get_asset_detail":       get_asset_detail,
    "list_assets":            list_assets,
    "discover_conventions":   discover_conventions,
    "load_conventions":       load_conventions,
    "record_correction":      record_correction,
    "get_memory_stats":       get_memory_stats,
    "update_project_profile": update_project_profile,
    "append_profile_fact":    append_profile_fact,
    "memory_read_facts":      memory_read_facts,
    "memory_read_sop":        memory_read_sop,
    "render_asset_preview":   render_asset_preview,
    "get_pending_reviews":    get_pending_reviews,
    "get_review_detail":      get_review_detail,
    "submit_review":          submit_review,
    "batch_approve":          batch_approve,
    "check_project_config":   check_project_config_tool,
    "list_project_configs":   list_project_configs_tool,
    "create_project_config":  create_project_config_tool,
    "load_project_config":    load_project_config_tool,
    "add_custom_rule":        add_custom_rule,
    "suggest_rename":         suggest_rename,
    "rename_asset":           rename_asset,
    "batch_rename":           batch_rename,
    "create_directory":       create_directory,
    "move_asset":             move_asset,
    "intake_asset":           intake_asset,
    "intake_batch":           intake_batch,
    "intake_approved":        intake_approved,
    **UE5_TOOL_FUNCTIONS,
    **MCP_TOOL_FUNCTIONS,
}


def is_tool_allowed(tool_name: str, agent_mode: str | None = None) -> bool:
    """当前运行模式下是否允许调用该工具。"""
    mode = (agent_mode or get_agent_runtime_mode()).strip().lower()
    if mode != "general":
        return True
    if tool_name in GENERAL_CORE_TOOL_NAMES:
        return True
    if tool_name.startswith("mcp__"):
        return True
    return False


def get_tools_for_mode(agent_mode: str | None = None) -> list:
    """按运行模式返回可供 LLM 使用的工具 Schema 列表。"""
    mode = (agent_mode or get_agent_runtime_mode()).strip().lower()
    if mode != "general":
        return TOOLS
    return [s for s in TOOLS if is_tool_allowed(s["function"]["name"], mode)]


def execute_tool(tool_name: str, arguments: dict, agent_mode: str | None = None) -> str:
    """执行工具并返回 JSON 字符串结果"""
    if not is_tool_allowed(tool_name, agent_mode):
        return json.dumps(
            {"error": f"工具 {tool_name} 在通用模式下不可用"},
            ensure_ascii=False,
        )
    func = TOOL_FUNCTIONS.get(tool_name)
    if not func:
        return json.dumps({"error": f"未知工具: {tool_name}"}, ensure_ascii=False)

    try:
        result = func(**normalize_tool_arguments(arguments))
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": f"工具执行失败: {str(e)}"}, ensure_ascii=False)


# ========== 插件自动扫描 ==========

def _load_plugins():
    """
    扫描 tools/plugins/ 目录，自动加载插件工具。

    插件格式要求（二选一）：
    1. 单工具：导出 SCHEMA（dict）和与 Schema.function.name 同名的函数
    2. 多工具：导出 SCHEMAS（list[dict]）和 TOOL_FUNCTIONS（dict[str, callable]）
    """
    plugins_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "plugins")
    if not os.path.isdir(plugins_dir):
        os.makedirs(plugins_dir, exist_ok=True)
        return

    loaded = []
    skipped = []

    for filename in sorted(os.listdir(plugins_dir)):
        if not filename.endswith(".py") or filename.startswith("_"):
            continue

        module_name = filename[:-3]
        filepath = os.path.join(plugins_dir, filename)

        try:
            # 动态导入插件模块
            spec = importlib.util.spec_from_file_location(f"tools.plugins.{module_name}", filepath)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            # 格式 1：单工具（SCHEMA + 同名函数）
            schema = getattr(module, "SCHEMA", None)
            if schema and isinstance(schema, dict):
                func_name = schema.get("function", {}).get("name", "")
                func = getattr(module, func_name, None)
                if func_name and callable(func) and func_name not in TOOL_FUNCTIONS:
                    TOOLS.append(schema)
                    TOOL_FUNCTIONS[func_name] = func
                    loaded.append(func_name)
                    _tag_tier(func_name, "plugin")
                    continue

            # 格式 2：多工具（SCHEMAS + TOOL_FUNCTIONS）
            schemas = getattr(module, "SCHEMAS", None)
            tool_funcs = getattr(module, "TOOL_FUNCTIONS", None)
            if schemas and isinstance(schemas, list) and tool_funcs and isinstance(tool_funcs, dict):
                count = 0
                for s in schemas:
                    fname = s.get("function", {}).get("name", "")
                    func = tool_funcs.get(fname)
                    if fname and callable(func) and fname not in TOOL_FUNCTIONS:
                        TOOLS.append(s)
                        TOOL_FUNCTIONS[fname] = func
                        loaded.append(fname)
                        _tag_tier(fname, "plugin")
                        count += 1
                if count > 0:
                    continue
                else:
                    skipped.append((filename, "SCHEMAS 中的工具名与已有工具冲突"))
            else:
                skipped.append((filename, "缺少 SCHEMA 或 SCHEMAS"))

        except Exception as e:
            skipped.append((filename, str(e)))

    if loaded:
        print(f"  插件加载: {len(loaded)} 个已注册 — {', '.join(loaded)}")
    if skipped:
        for name, reason in skipped:
            print(f"  插件跳过: {name} — {reason}")


# 启动时自动加载插件
_load_plugins()

# ========== MCP 服务器加载 ==========

def _load_mcp_servers():
    """加载 MCP 服务器工具（启动时连接所有已启用的服务器）"""
    from tools.mcp_bridge import _load_mcp_servers_sync
    count = _load_mcp_servers_sync()
    # 给动态加载的 MCP 工具标注层级
    for schema in TOOLS:
        name = schema["function"]["name"]
        if name.startswith("mcp__") and name not in TOOL_TIER:
            _tag_tier(name, "mcp_remote")
    if count:
        print(f"  MCP 加载: {count} 个工具已注册")
_load_mcp_servers()
