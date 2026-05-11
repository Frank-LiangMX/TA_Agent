"""
tools/config_tools.py - 项目配置工具

让 Agent 可以检测、创建、加载项目配置。
"""
from __future__ import annotations

import json
import os

from core.project_config import (
    ProjectConfig,
    find_project_config,
    check_project_config,
    list_project_configs,
    create_example_config,
)


# ========== Schema 定义 ==========

CHECK_PROJECT_CONFIG_DEF = {
    "type": "function",
    "function": {
        "name": "check_project_config",
        "description": "检查是否存在项目配置文件。如果不存在，提示用户是否需要创建。",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "配置名称（可选，不指定则返回第一个找到的）",
                },
            },
            "required": [],
        },
    },
}

LIST_PROJECT_CONFIGS_DEF = {
    "type": "function",
    "function": {
        "name": "list_project_configs",
        "description": "列出所有已创建的项目配置。",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
}

CREATE_PROJECT_CONFIG_DEF = {
    "type": "function",
    "function": {
        "name": "create_project_config",
        "description": "创建示例项目配置文件。会创建在 .ta_agent/configs/project/ 目录下，并生成详细的填写说明。",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "配置名称（如 my_game）",
                    "default": "example",
                },
                "engine": {
                    "type": "string",
                    "enum": ["UE5", "Unity", "Godot", "Custom"],
                    "description": "游戏引擎类型（默认 UE5）",
                    "default": "UE5",
                },
                "project_name": {
                    "type": "string",
                    "description": "项目名称",
                },
            },
            "required": [],
        },
    },
}

LOAD_PROJECT_CONFIG_DEF = {
    "type": "function",
    "function": {
        "name": "load_project_config",
        "description": "加载项目配置文件。用于获取命名规则、资产类型、导入预设等配置信息。",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "配置名称（可选，不指定则加载第一个找到的）",
                },
            },
            "required": [],
        },
    },
}


# ========== 工具实现 ==========

def check_project_config_tool(name: str = None) -> dict:
    """
    检查项目配置是否存在

    返回:
        {
            "exists": bool,
            "config_path": str | None,
            "config_name": str | None,
            "message": str,
            "suggestion": str,
        }
    """
    result = check_project_config(name)

    if not result["exists"]:
        # 列出已有配置
        configs = list_project_configs()
        if configs:
            config_names = [c["name"] for c in configs]
            result["suggestion"] = (
                f"未找到指定配置。已有配置: {', '.join(config_names)}\n"
                "请使用 load_project_config 加载已有配置，或使用 create_project_config 创建新配置。"
            )
        else:
            result["suggestion"] = (
                "未找到项目配置文件。项目配置用于定义命名规则、资产类型、目录结构等。\n"
                "是否需要创建示例配置？创建后请根据项目实际情况修改。"
            )

    return result


def list_project_configs_tool() -> dict:
    """列出所有项目配置"""
    configs = list_project_configs()
    return {
        "total": len(configs),
        "configs": configs,
        "message": f"共有 {len(configs)} 个配置" if configs else "暂无配置，请先创建。",
    }


def create_project_config_tool(
    name: str = "example",
    engine: str = "UE5",
    project_name: str = "",
) -> dict:
    """
    创建示例项目配置文件

    返回:
        {
            "success": bool,
            "config_path": str,
            "message": str,
            "instructions": str,
        }
    """
    try:
        config_path = create_example_config(name, engine)

        # 如果指定了项目名称，更新配置
        if project_name:
            config = ProjectConfig.load(config_path)
            config.project_name = project_name
            config.save(config_path)

        instructions = _get_config_instructions(name, engine)

        return {
            "success": True,
            "config_path": config_path,
            "config_name": name,
            "message": f"已创建项目配置: {name}",
            "instructions": instructions,
        }
    except Exception as e:
        return {
            "success": False,
            "config_path": None,
            "message": f"创建配置文件失败: {str(e)}",
            "instructions": "",
        }


def load_project_config_tool(name: str = None) -> dict:
    """
    加载项目配置

    返回:
        {
            "success": bool,
            "config": dict | None,
            "message": str,
        }
    """
    try:
        config_path = find_project_config(name)

        if config_path is None:
            configs = list_project_configs()
            if configs:
                config_names = [c["name"] for c in configs]
                return {
                    "success": False,
                    "config": None,
                    "message": f"未找到指定配置。已有配置: {', '.join(config_names)}",
                }
            else:
                return {
                    "success": False,
                    "config": None,
                    "message": "暂无项目配置，请先创建。",
                }

        config = ProjectConfig.load(config_path)

        return {
            "success": True,
            "config": config.to_dict(),
            "config_path": config_path,
            "config_name": os.path.splitext(os.path.basename(config_path))[0],
            "message": f"已加载项目配置: {config.project_name}",
        }
    except Exception as e:
        return {
            "success": False,
            "config": None,
            "message": f"加载配置失败: {str(e)}",
        }


def _get_config_instructions(name: str, engine: str) -> str:
    """获取配置填写说明"""
    return f"""=== 项目配置填写说明 ===

配置文件已创建: .ta_agent/configs/project/{name}.yaml

请根据项目实际情况修改以下内容：

1. 【项目基本信息】
   - project_name: 你的项目名称
   - engine: 游戏引擎（UE5/Unity/Godot）
   - genre: 项目题材（sci-fi/fantasy/modern...）

2. 【资源目录】（支持多目录）
   - textures: 贴图目录路径
   - models: 模型目录路径
   - blender: Blender 工程目录
   - engine: 引擎资源目录

3. 【命名规则】
   - 定义各类资产的命名格式
   - 例如：SM_{{category}}_{{name}}_{{variant}}

4. 【资产类型】
   - 定义项目中有哪些资产类型
   - 每种类型的命名前缀、存放目录

5. 【导入预设】
   - 定义每种资产类型的导入参数
   - 缩放、LOD、碰撞体等

修改完成后，使用 load_project_config 加载配置。
"""


# ========== 注册到 Agent ==========

CONFIG_TOOLS = [
    CHECK_PROJECT_CONFIG_DEF,
    LIST_PROJECT_CONFIGS_DEF,
    CREATE_PROJECT_CONFIG_DEF,
    LOAD_PROJECT_CONFIG_DEF,
]

CONFIG_TOOL_FUNCTIONS = {
    "check_project_config": check_project_config_tool,
    "list_project_configs": list_project_configs_tool,
    "create_project_config": create_project_config_tool,
    "load_project_config": load_project_config_tool,
}
