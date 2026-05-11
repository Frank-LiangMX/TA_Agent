"""
tools/asset_operations.py - 资产文件操作工具

支持：
- 根据 ProjectConfig 生成规范名称
- 重命名文件
- 创建目录结构
- 移动文件到目标位置
"""
from __future__ import annotations

import json
import os
import re
import shutil
from datetime import datetime
from typing import Optional

from core.project_config import ProjectConfig, find_project_config


# ========== Schema 定义 ==========

SUGGEST_RENAME_DEF = {
    "type": "function",
    "function": {
        "name": "suggest_rename",
        "description": "根据项目配置的命名规则，为资产生成规范名称建议。",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "资产文件路径",
                },
                "category": {
                    "type": "string",
                    "description": "资产类型（weapon, character, building 等）",
                },
                "name": {
                    "type": "string",
                    "description": "资产名称（如 sword, house）",
                },
                "variant": {
                    "type": "string",
                    "description": "变体编号（默认 01）",
                    "default": "01",
                },
            },
            "required": ["file_path", "category", "name"],
        },
    },
}

RENAME_ASSET_DEF = {
    "type": "function",
    "function": {
        "name": "rename_asset",
        "description": "重命名单个资产文件。会检查目标名称是否已存在。",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "原文件路径",
                },
                "new_name": {
                    "type": "string",
                    "description": "新文件名（不含扩展名）",
                },
                "dry_run": {
                    "type": "boolean",
                    "description": "试运行模式，只显示结果不实际操作（默认 false）",
                    "default": False,
                },
            },
            "required": ["file_path", "new_name"],
        },
    },
}

BATCH_RENAME_DEF = {
    "type": "function",
    "function": {
        "name": "batch_rename",
        "description": "批量重命名资产文件。接受一个重命名列表。",
        "parameters": {
            "type": "object",
            "properties": {
                "rename_list": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "file_path": {"type": "string"},
                            "new_name": {"type": "string"},
                        },
                        "required": ["file_path", "new_name"],
                    },
                    "description": "重命名列表：[{file_path, new_name}, ...]",
                },
                "dry_run": {
                    "type": "boolean",
                    "description": "试运行模式（默认 false）",
                    "default": False,
                },
            },
            "required": ["rename_list"],
        },
    },
}

CREATE_DIRECTORY_DEF = {
    "type": "function",
    "function": {
        "name": "create_directory",
        "description": "创建目录结构。支持创建多级目录。",
        "parameters": {
            "type": "object",
            "properties": {
                "dir_path": {
                    "type": "string",
                    "description": "要创建的目录路径",
                },
                "parents": {
                    "type": "boolean",
                    "description": "是否创建父目录（默认 true）",
                    "default": True,
                },
            },
            "required": ["dir_path"],
        },
    },
}

MOVE_ASSET_DEF = {
    "type": "function",
    "function": {
        "name": "move_asset",
        "description": "移动资产文件到目标目录。支持自动创建目标目录。",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "原文件路径",
                },
                "target_dir": {
                    "type": "string",
                    "description": "目标目录",
                },
                "new_name": {
                    "type": "string",
                    "description": "新文件名（可选，不含扩展名）",
                },
                "create_dirs": {
                    "type": "boolean",
                    "description": "是否自动创建目标目录（默认 true）",
                    "default": True,
                },
                "dry_run": {
                    "type": "boolean",
                    "description": "试运行模式（默认 false）",
                    "default": False,
                },
            },
            "required": ["file_path", "target_dir"],
        },
    },
}


# ========== 工具实现 ==========

def suggest_rename(
    file_path: str,
    category: str,
    name: str,
    variant: str = "01",
) -> dict:
    """
    根据项目配置生成规范名称建议

    返回:
        {
            "original_name": str,
            "suggested_name": str,
            "extension": str,
            "full_name": str,
        }
    """
    # 获取文件扩展名
    _, ext = os.path.splitext(file_path)
    original_name = os.path.basename(file_path)

    # 尝试加载项目配置
    config_path = find_project_config()
    if config_path:
        config = ProjectConfig.load(config_path)
        suggested = config.suggest_naming(category, name, variant)
    else:
        # 使用默认命名规则
        prefix_map = {
            "character": "SK_",
            "weapon": "SM_",
            "building": "SM_",
            "prop": "SM_",
            "vehicle": "SK_",
            "texture": "T_",
            "material": "M_",
        }
        prefix = prefix_map.get(category, "SM_")
        suggested = f"{prefix}{category.capitalize()}_{name}_{variant}"

    return {
        "original_name": original_name,
        "suggested_name": suggested,
        "extension": ext,
        "full_name": f"{suggested}{ext}",
    }


def rename_asset(
    file_path: str,
    new_name: str,
    dry_run: bool = False,
) -> dict:
    """
    重命名单个资产文件

    返回:
        {
            "success": bool,
            "old_path": str,
            "new_path": str,
            "message": str,
        }
    """
    if not os.path.exists(file_path):
        return {
            "success": False,
            "old_path": file_path,
            "new_path": None,
            "message": f"文件不存在: {file_path}",
        }

    # 获取目录和扩展名
    dir_path = os.path.dirname(file_path)
    _, ext = os.path.splitext(file_path)
    new_path = os.path.join(dir_path, f"{new_name}{ext}")

    # 检查目标文件是否已存在
    if os.path.exists(new_path):
        return {
            "success": False,
            "old_path": file_path,
            "new_path": new_path,
            "message": f"目标文件已存在: {new_path}",
        }

    if dry_run:
        return {
            "success": True,
            "old_path": file_path,
            "new_path": new_path,
            "dry_run": True,
            "message": f"[试运行] {os.path.basename(file_path)} → {new_name}{ext}",
        }

    try:
        os.rename(file_path, new_path)
        return {
            "success": True,
            "old_path": file_path,
            "new_path": new_path,
            "message": f"重命名成功: {os.path.basename(file_path)} → {new_name}{ext}",
        }
    except Exception as e:
        return {
            "success": False,
            "old_path": file_path,
            "new_path": None,
            "message": f"重命名失败: {str(e)}",
        }


def batch_rename(
    rename_list: list[dict],
    dry_run: bool = False,
) -> dict:
    """
    批量重命名资产文件

    返回:
        {
            "total": int,
            "success": int,
            "failed": int,
            "results": list,
            "message": str,
        }
    """
    results = []
    success_count = 0
    fail_count = 0

    for item in rename_list:
        result = rename_asset(
            file_path=item["file_path"],
            new_name=item["new_name"],
            dry_run=dry_run,
        )
        results.append(result)
        if result["success"]:
            success_count += 1
        else:
            fail_count += 1

    return {
        "total": len(rename_list),
        "success": success_count,
        "failed": fail_count,
        "dry_run": dry_run,
        "results": results,
        "message": f"{'[试运行] ' if dry_run else ''}批量重命名完成: {success_count} 成功, {fail_count} 失败",
    }


def create_directory(
    dir_path: str,
    parents: bool = True,
) -> dict:
    """
    创建目录结构

    返回:
        {
            "success": bool,
            "dir_path": str,
            "created": bool,
            "message": str,
        }
    """
    try:
        if os.path.exists(dir_path):
            return {
                "success": True,
                "dir_path": dir_path,
                "created": False,
                "message": f"目录已存在: {dir_path}",
            }

        if parents:
            os.makedirs(dir_path, exist_ok=True)
        else:
            os.mkdir(dir_path)

        return {
            "success": True,
            "dir_path": dir_path,
            "created": True,
            "message": f"目录已创建: {dir_path}",
        }
    except Exception as e:
        return {
            "success": False,
            "dir_path": dir_path,
            "created": False,
            "message": f"创建目录失败: {str(e)}",
        }


def move_asset(
    file_path: str,
    target_dir: str,
    new_name: str = None,
    create_dirs: bool = True,
    dry_run: bool = False,
) -> dict:
    """
    移动资产文件到目标目录

    返回:
        {
            "success": bool,
            "old_path": str,
            "new_path": str,
            "message": str,
        }
    """
    if not os.path.exists(file_path):
        return {
            "success": False,
            "old_path": file_path,
            "new_path": None,
            "message": f"文件不存在: {file_path}",
        }

    # 获取文件名
    original_name = os.path.basename(file_path)
    _, ext = os.path.splitext(file_path)

    if new_name:
        target_name = f"{new_name}{ext}"
    else:
        target_name = original_name

    new_path = os.path.join(target_dir, target_name)

    # 检查目标文件是否已存在
    if os.path.exists(new_path):
        return {
            "success": False,
            "old_path": file_path,
            "new_path": new_path,
            "message": f"目标文件已存在: {new_path}",
        }

    if dry_run:
        return {
            "success": True,
            "old_path": file_path,
            "new_path": new_path,
            "dry_run": True,
            "message": f"[试运行] {original_name} → {new_path}",
        }

    try:
        # 创建目标目录
        if create_dirs:
            os.makedirs(target_dir, exist_ok=True)

        # 移动文件
        shutil.move(file_path, new_path)

        return {
            "success": True,
            "old_path": file_path,
            "new_path": new_path,
            "message": f"移动成功: {original_name} → {new_path}",
        }
    except Exception as e:
        return {
            "success": False,
            "old_path": file_path,
            "new_path": None,
            "message": f"移动失败: {str(e)}",
        }


# ========== 注册到 Agent ==========

ASSET_OPERATIONS_TOOLS = [
    SUGGEST_RENAME_DEF,
    RENAME_ASSET_DEF,
    BATCH_RENAME_DEF,
    CREATE_DIRECTORY_DEF,
    MOVE_ASSET_DEF,
]

ASSET_OPERATIONS_TOOL_FUNCTIONS = {
    "suggest_rename": suggest_rename,
    "rename_asset": rename_asset,
    "batch_rename": batch_rename,
    "create_directory": create_directory,
    "move_asset": move_asset,
}
