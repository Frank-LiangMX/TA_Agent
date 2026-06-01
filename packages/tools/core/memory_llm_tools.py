"""
记忆工具 - TA Agent 记忆系统的 LLM 工具接口

Layout v1: index（每轮注入）+ facts（按需读）+ sops/（开发者说明书）
"""

from __future__ import annotations

from typing import Optional

from tools.memory import (
    MemoryProvider,
    CorrectionRecord,
    record_user_correction,
    extract_asset_features,
)


_memory_instance: Optional[MemoryProvider] = None


def set_memory_provider(memory: MemoryProvider) -> None:
    global _memory_instance
    _memory_instance = memory


def get_memory_provider() -> Optional[MemoryProvider]:
    return _memory_instance


def record_correction(
    asset_name: str,
    wrong_result: str,
    correct_result: str,
    reason: str = "",
    face_count: int = 0,
    material_name: str = "",
) -> dict:
    memory = get_memory_provider()
    if not memory:
        return {"error": "记忆系统未初始化"}

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
    memory = get_memory_provider()
    if not memory:
        return {"error": "记忆系统未初始化"}

    stats = memory.get_memory_stats()
    index = ""
    facts = ""
    if hasattr(memory, "get_memory_index"):
        index = (memory.get_memory_index() or "").strip()
    else:
        index = (memory.get_project_profile() or "").strip()
    if hasattr(memory, "get_memory_facts"):
        facts = (memory.get_memory_facts() or "").strip()

    stats["index_preview"] = index[:800]
    stats["facts_preview"] = facts[:1200]
    if len(index) > 800:
        stats["index_preview_truncated"] = True
    if len(facts) > 1200:
        stats["facts_preview_truncated"] = True
    stats["profile_preview"] = stats.get("facts_preview", "")
    return stats


def append_profile_fact(fact: str, section: str = "") -> dict:
    memory = get_memory_provider()
    if not memory:
        return {"error": "记忆系统未初始化"}

    if hasattr(memory, "append_fact"):
        result = memory.append_fact(fact, section=section)
        if result.get("success"):
            result["message"] = "已写入 facts 记忆"
        return result

    return {"error": "当前记忆实现不支持 append_fact"}


def memory_read_facts(section: str = "") -> dict:
    memory = get_memory_provider()
    if not memory:
        return {"error": "记忆系统未初始化"}
    if not hasattr(memory, "get_memory_facts"):
        content = memory.get_project_profile() or ""
        return {"content": content, "section": section or None}

    sec = (section or "").strip()
    if sec:
        content = memory.get_memory_facts_section(sec)
        if content is None:
            return {"error": f"facts 中无 section「{sec}」", "section": sec}
        return {"content": content, "section": sec}

    content = memory.get_memory_facts() or ""
    if not content:
        return {"content": "", "message": "facts 为空"}
    return {"content": content}


def memory_read_sop(name: str) -> dict:
    memory = get_memory_provider()
    if not memory:
        return {"error": "记忆系统未初始化"}
    if not hasattr(memory, "read_sop"):
        return {"error": "当前记忆实现不支持 SOP"}

    raw = (name or "").strip()
    if not raw:
        return {"error": "name 不能为空"}

    content = memory.read_sop(raw)
    if content is None:
        available = memory.list_sops() if hasattr(memory, "list_sops") else []
        return {
            "error": f"未找到 SOP「{raw}」",
            "available_sops": available,
        }
    return {"name": raw.replace(".md", ""), "content": content}


def update_project_profile(profile_content: str) -> dict:
    memory = get_memory_provider()
    if not memory:
        return {"error": "记忆系统未初始化"}

    text = (profile_content or "").strip()
    if not text:
        return {"error": "profile_content 不能为空"}

    if hasattr(memory, "update_memory_facts"):
        memory.update_memory_facts(text)
        return {"success": True, "message": "facts 已更新（index 导航已同步）"}

    if hasattr(memory, "update_project_profile"):
        memory.update_project_profile(text)
        return {"success": True, "message": "项目画像已更新"}
    return {"error": "当前记忆实现不支持更新"}


RECORD_CORRECTION_DEF = {
    "type": "function",
    "function": {
        "name": "record_correction",
        "description": "记录用户对资产分析结果的纠正。当用户指出分析错误时调用此工具。",
        "parameters": {
            "type": "object",
            "properties": {
                "asset_name": {"type": "string", "description": "资产名称"},
                "wrong_result": {"type": "string", "description": "错误的分析结果"},
                "correct_result": {"type": "string", "description": "正确的分析结果"},
                "reason": {"type": "string", "description": "纠正原因（可选）"},
                "face_count": {"type": "integer", "description": "面数（可选）"},
                "material_name": {"type": "string", "description": "材质名（可选）"},
            },
            "required": ["asset_name", "wrong_result", "correct_result"],
        },
    },
}

GET_MEMORY_STATS_DEF = {
    "type": "function",
    "function": {
        "name": "get_memory_stats",
        "description": "查看记忆：index/facts 字符数、L1/L2 统计、index_preview 与 facts_preview。写入后核对，勿声称 preview 中不存在的内容。",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
}

APPEND_PROFILE_FACT_DEF = {
    "type": "function",
    "function": {
        "name": "append_profile_fact",
        "description": "向 facts 长期记忆追加/更新一条事实（工具路径、习惯偏好等）。section 如「工具路径」「习惯偏好」。同键（如 Blender:）会覆盖旧行。不确定是否该记时先问用户。",
        "parameters": {
            "type": "object",
            "properties": {
                "fact": {"type": "string", "description": "一行事实，如 Blender: ~/bin/blender"},
                "section": {"type": "string", "description": "分组，如 工具路径、习惯偏好、项目约定"},
            },
            "required": ["fact"],
        },
    },
}

MEMORY_READ_FACTS_DEF = {
    "type": "function",
    "function": {
        "name": "memory_read_facts",
        "description": "读取 facts 长期记忆。需要具体路径或偏好时调用；section 为空则返回全文。",
        "parameters": {
            "type": "object",
            "properties": {
                "section": {
                    "type": "string",
                    "description": "可选，如 工具路径、习惯偏好；留空读全文",
                },
            },
            "required": [],
        },
    },
}

MEMORY_READ_SOP_DEF = {
    "type": "function",
    "function": {
        "name": "memory_read_sop",
        "description": "读取 sops/ 下开发者写的操作说明书（不含 .md 后缀）。复杂流程执行前先读。",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "SOP 文件名，如 tagent_memory_sop"},
            },
            "required": ["name"],
        },
    },
}

UPDATE_PROJECT_PROFILE_DEF = {
    "type": "function",
    "function": {
        "name": "update_project_profile",
        "description": "合并更新 facts 全文（非 index）。大批量整理时用；须保留已有条目。",
        "parameters": {
            "type": "object",
            "properties": {
                "profile_content": {
                    "type": "string",
                    "description": "合并后的 facts 正文",
                },
            },
            "required": ["profile_content"],
        },
    },
}
