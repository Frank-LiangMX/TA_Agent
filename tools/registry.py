"""
工具注册中心
汇总所有模块的 Schema 和执行函数，提供统一的 TOOLS 列表和 execute_tool 分发器

新增工具只需：
1. 在对应模块中定义 SCHEMA 和执行函数
2. 在本文件的 _register_all() 中注册
"""
import json

# 导入所有工具模块
from tools.naming import check_naming, suggest_naming
from tools.directory import check_directory_structure
from tools.file_info import check_file_info, scan_directory
from tools.mesh import check_mesh_budget
from tools.mesh_fbx import check_fbx_info
from tools.texture import check_texture_info, check_texture_batch
from tools.report import generate_report
from tools.identity import analyze_assets, search_assets, get_asset_detail, list_assets
from tools.convention_tools import discover_conventions, load_conventions
from tools.memory_tools import record_correction, get_memory_stats, update_project_profile
from tools.renderer import render_asset_preview
from tools.review import get_pending_reviews, get_review_detail, submit_review, batch_approve
from tools.review_schema import GET_PENDING_REVIEWS_DEF, GET_REVIEW_DETAIL_DEF, SUBMIT_REVIEW_DEF, BATCH_APPROVE_DEF
from tools.config_tools import (
    check_project_config_tool, list_project_configs_tool,
    create_project_config_tool, load_project_config_tool,
    CHECK_PROJECT_CONFIG_DEF, LIST_PROJECT_CONFIGS_DEF,
    CREATE_PROJECT_CONFIG_DEF, LOAD_PROJECT_CONFIG_DEF,
)
from tools.asset_operations import (
    suggest_rename, rename_asset, batch_rename, create_directory, move_asset,
    SUGGEST_RENAME_DEF, RENAME_ASSET_DEF, BATCH_RENAME_DEF,
    CREATE_DIRECTORY_DEF, MOVE_ASSET_DEF,
)
from tools.intake import (
    intake_asset, intake_batch, intake_approved,
    INTAKE_ASSET_DEF, INTAKE_BATCH_DEF, INTAKE_APPROVED_DEF,
)


# ========== Schema 注册 ==========
# 每个模块导出 SCHEMA 变量，这里汇总

from tools.naming import SCHEMA as NAMING_SCHEMA, SUGGEST_SCHEMA
from tools.directory import SCHEMA as DIR_SCHEMA
from tools.file_info import CHECK_FILE_INFO_SCHEMA, SCAN_DIRECTORY_SCHEMA
from tools.mesh import SCHEMA as MESH_SCHEMA
from tools.mesh_fbx import SCHEMA as FBX_SCHEMA
from tools.texture import SCHEMA as TEX_SCHEMA, BATCH_SCAN_SCHEMA
from tools.report import SCHEMA as REPORT_SCHEMA
from tools.identity import (
    ANALYZE_ASSETS_DEF, SEARCH_ASSETS_DEF,
    GET_ASSET_DETAIL_DEF, LIST_ASSETS_DEF,
)
from tools.convention_tools import DISCOVER_CONVENTIONS_DEF, LOAD_CONVENTIONS_DEF
from tools.memory_tools import RECORD_CORRECTION_DEF, GET_MEMORY_STATS_DEF, UPDATE_PROJECT_PROFILE_DEF
from tools.renderer import SCHEMA as RENDERER_SCHEMA

# 所有工具 Schema 列表（传给 LLM）
TOOLS = [
    NAMING_SCHEMA,
    SUGGEST_SCHEMA,
    DIR_SCHEMA,
    CHECK_FILE_INFO_SCHEMA,
    SCAN_DIRECTORY_SCHEMA,
    MESH_SCHEMA,
    FBX_SCHEMA,
    TEX_SCHEMA,
    BATCH_SCAN_SCHEMA,
    REPORT_SCHEMA,
    ANALYZE_ASSETS_DEF,
    SEARCH_ASSETS_DEF,
    GET_ASSET_DETAIL_DEF,
    LIST_ASSETS_DEF,
    DISCOVER_CONVENTIONS_DEF,
    LOAD_CONVENTIONS_DEF,
    RECORD_CORRECTION_DEF,
    GET_MEMORY_STATS_DEF,
    UPDATE_PROJECT_PROFILE_DEF,
    RENDERER_SCHEMA,
    GET_PENDING_REVIEWS_DEF,
    GET_REVIEW_DETAIL_DEF,
    SUBMIT_REVIEW_DEF,
    BATCH_APPROVE_DEF,
    CHECK_PROJECT_CONFIG_DEF,
    LIST_PROJECT_CONFIGS_DEF,
    CREATE_PROJECT_CONFIG_DEF,
    LOAD_PROJECT_CONFIG_DEF,
    SUGGEST_RENAME_DEF,
    RENAME_ASSET_DEF,
    BATCH_RENAME_DEF,
    CREATE_DIRECTORY_DEF,
    MOVE_ASSET_DEF,
    INTAKE_ASSET_DEF,
    INTAKE_BATCH_DEF,
    INTAKE_APPROVED_DEF,
]


# ========== 工具执行函数注册 ==========

TOOL_FUNCTIONS = {
    "check_naming":           check_naming,
    "suggest_naming":         suggest_naming,
    "check_directory_structure": check_directory_structure,
    "check_file_info":        check_file_info,
    "scan_directory":         scan_directory,
    "check_mesh_budget":      check_mesh_budget,
    "check_fbx_info":         check_fbx_info,
    "check_texture_info":     check_texture_info,
    "check_texture_batch":    check_texture_batch,
    "generate_report":        generate_report,
    "analyze_assets":         analyze_assets,
    "search_assets":          search_assets,
    "get_asset_detail":       get_asset_detail,
    "list_assets":            list_assets,
    "discover_conventions":   discover_conventions,
    "load_conventions":       load_conventions,
    "record_correction":      record_correction,
    "get_memory_stats":       get_memory_stats,
    "update_project_profile": update_project_profile,
    "render_asset_preview":   render_asset_preview,
    "get_pending_reviews":    get_pending_reviews,
    "get_review_detail":      get_review_detail,
    "submit_review":          submit_review,
    "batch_approve":          batch_approve,
    "check_project_config":   check_project_config_tool,
    "list_project_configs":   list_project_configs_tool,
    "create_project_config":  create_project_config_tool,
    "load_project_config":    load_project_config_tool,
    "suggest_rename":         suggest_rename,
    "rename_asset":           rename_asset,
    "batch_rename":           batch_rename,
    "create_directory":       create_directory,
    "move_asset":             move_asset,
    "intake_asset":           intake_asset,
    "intake_batch":           intake_batch,
    "intake_approved":        intake_approved,
}


def execute_tool(tool_name: str, arguments: dict) -> str:
    """执行工具并返回 JSON 字符串结果"""
    func = TOOL_FUNCTIONS.get(tool_name)
    if not func:
        return json.dumps({"error": f"未知工具: {tool_name}"}, ensure_ascii=False)

    try:
        result = func(**arguments)
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": f"工具执行失败: {str(e)}"}, ensure_ascii=False)
