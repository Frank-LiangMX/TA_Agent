"""
记忆工具 - TA Agent 记忆系统的 LLM 工具接口

提供给 LLM 调用的工具：
  - record_correction: 记录用户纠正
  - get_memory_stats: 查看记忆状态
  - update_project_profile: 更新项目画像
"""

from __future__ import annotations

import json
from typing import Optional

from tools.memory import (
    MemoryProvider,
    CorrectionRecord,
    record_user_correction,
    extract_asset_features,
)


# ========== 全局记忆实例（由 agent.py 初始化） ==========

_memory_instance: Optional[MemoryProvider] = None


def set_memory_provider(memory: MemoryProvider) -> None:
    """设置全局记忆实例（由 agent.py 调用）"""
    global _memory_instance
    _memory_instance = memory


def get_memory_provider() -> Optional[MemoryProvider]:
    """获取全局记忆实例"""
    return _memory_instance


# ========== 工具执行函数 ==========

def record_correction(
    asset_name: str,
    wrong_result: str,
    correct_result: str,
    reason: str = "",
    face_count: int = 0,
    material_name: str = "",
) -> dict:
    """记录用户对资产分析结果的纠正。

    参数:
        asset_name: 资产名称
        wrong_result: 错误的分析结果
        correct_result: 正确的分析结果
        reason: 纠正原因
        face_count: 面数（可选，用于特征匹配）
        material_name: 材质名（可选，用于特征匹配）

    返回:
        记录结果
    """
    memory = get_memory_provider()
    if not memory:
        return {"error": "记忆系统未初始化"}

    # 提取资产特征
    asset_features = extract_asset_features(
        asset_name=asset_name,
        face_count=face_count,
        material_name=material_name if material_name else None,
    )

    result = record_user_correction(
        memory=memory,
        asset_name=asset_name,
        asset_features=asset_features,
        wrong_result=wrong_result,
        correct_result=correct_result,
        reason=reason,
    )

    return {"success": True, "message": result}


def get_memory_stats() -> dict:
    """查看当前记忆系统的状态。

    返回:
        记忆统计信息
    """
    memory = get_memory_provider()
    if not memory:
        return {"error": "记忆系统未初始化"}

    return memory.get_memory_stats()


def update_project_profile(profile_content: str) -> dict:
    """更新项目画像（L0 记忆）。

    参数:
        profile_content: 项目画像内容（应简洁，不超过 500 tokens）

    返回:
        更新结果
    """
    memory = get_memory_provider()
    if not memory:
        return {"error": "记忆系统未初始化"}

    # 检查是否有 update_project_profile 方法
    if hasattr(memory, 'update_project_profile'):
        memory.update_project_profile(profile_content)
        return {"success": True, "message": "项目画像已更新"}
    else:
        return {"error": "当前记忆实现不支持更新项目画像"}


# ========== Schema 定义 ==========

RECORD_CORRECTION_DEF = {
    "type": "function",
    "function": {
        "name": "record_correction",
        "description": "记录用户对资产分析结果的纠正。当用户指出分析错误时调用此工具。",
        "parameters": {
            "type": "object",
            "properties": {
                "asset_name": {
                    "type": "string",
                    "description": "资产名称"
                },
                "wrong_result": {
                    "type": "string",
                    "description": "错误的分析结果（如：building/wall）"
                },
                "correct_result": {
                    "type": "string",
                    "description": "正确的分析结果（如：weapon/sword）"
                },
                "reason": {
                    "type": "string",
                    "description": "纠正原因（可选）"
                },
                "face_count": {
                    "type": "integer",
                    "description": "面数（可选，用于特征匹配）"
                },
                "material_name": {
                    "type": "string",
                    "description": "材质名（可选，用于特征匹配）"
                }
            },
            "required": ["asset_name", "wrong_result", "correct_result"]
        }
    }
}

GET_MEMORY_STATS_DEF = {
    "type": "function",
    "function": {
        "name": "get_memory_stats",
        "description": "查看当前记忆系统的状态，包括项目画像、规则数量、纠正记录等。",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    }
}

UPDATE_PROJECT_PROFILE_DEF = {
    "type": "function",
    "function": {
        "name": "update_project_profile",
        "description": "更新项目画像（L0 记忆）。用于记录项目的整体风格、命名约定、目录结构等。",
        "parameters": {
            "type": "object",
            "properties": {
                "profile_content": {
                    "type": "string",
                    "description": "项目画像内容（应简洁，不超过 500 tokens）"
                }
            },
            "required": ["profile_content"]
        }
    }
}
