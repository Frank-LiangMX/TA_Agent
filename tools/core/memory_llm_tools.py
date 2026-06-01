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


def append_profile_fact(fact: str, section: str = "") -> dict:
    """向 L0 画像追加一条事实（合并写入，不覆盖已有内容）。"""
    memory = get_memory_provider()
    if not memory:
        return {"error": "记忆系统未初始化"}

    text = (fact or "").strip()
    if not text:
        return {"error": "fact 不能为空"}

    line = text if text.startswith("-") else f"- {text}"
    existing = (memory.get_project_profile() or "").strip()
    sec = (section or "").strip()

    if sec:
        header = f"## {sec}"
        if header in existing:
            parts = existing.split(header, 1)
            before = parts[0].rstrip()
            rest = parts[1]
            if "\n## " in rest:
                body, after = rest.split("\n## ", 1)
                body = body.rstrip() + "\n" + line
                new_profile = f"{before}\n\n{header}{body}\n## {after}".strip()
            else:
                new_profile = f"{before}\n\n{header}{rest.rstrip()}\n{line}".strip()
        else:
            block = f"{header}\n{line}"
            new_profile = f"{existing}\n\n{block}".strip() if existing else block
    else:
        new_profile = f"{existing}\n{line}".strip() if existing else line

    if hasattr(memory, "update_project_profile"):
        memory.update_project_profile(new_profile)
        return {
            "success": True,
            "message": "已追加到 L0 记忆",
            "profile_chars": len(new_profile),
        }
    return {"error": "当前记忆实现不支持更新项目画像"}


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

APPEND_PROFILE_FACT_DEF = {
    "type": "function",
    "function": {
        "name": "append_profile_fact",
        "description": "向 L0 长期记忆追加一条用户环境事实（如 Blender 路径、常用命令）。优先于 update_project_profile，避免覆盖已有记忆。",
        "parameters": {
            "type": "object",
            "properties": {
                "fact": {
                    "type": "string",
                    "description": "要记住的事实，建议一行，如「Blender: ~/AppData/.../blender.exe」",
                },
                "section": {
                    "type": "string",
                    "description": "可选分组标题，如「工具路径」「习惯偏好」",
                },
            },
            "required": ["fact"],
        },
    },
}

UPDATE_PROJECT_PROFILE_DEF = {
    "type": "function",
    "function": {
        "name": "update_project_profile",
        "description": "更新 L0 长期记忆（项目画像/用户环境）。TA：命名规范、质量阈值等；通用：Blender/UE 等工具路径、常用命令、技术栈偏好。须合并保留已有条目，勿整段覆盖。",
        "parameters": {
            "type": "object",
            "properties": {
                "profile_content": {
                    "type": "string",
                    "description": "合并后的完整 L0 文本（简洁，建议不超过 500 tokens）。包含旧内容 + 新增事实。"
                }
            },
            "required": ["profile_content"]
        }
    }
}
