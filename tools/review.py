"""
tools/review.py - 人工审核工作流

支持分级审核：
- 高置信度资产：批量快速通过
- 低置信度资产：逐个查看详情后确认
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

from tags.store import TagStore
from tags.schema import AssetTags
from tools.memory_tools import get_memory_provider


# ========== 工具实现 ==========

def get_pending_reviews(store_dir: str, confidence_threshold: float = 0.9, include_animation: bool = False) -> dict:
    """
    获取待审核列表，按置信度分组。

    参数:
        store_dir: 数据库目录
        confidence_threshold: 置信度阈值
        include_animation: 是否包含动画文件（默认 False，动画不需要审核）

    返回:
        {
            "total_pending": int,
            "high_confidence": [...],   # >= threshold，建议批量通过
            "low_confidence": [...],    # < threshold，需要逐个确认
            "summary": str,
        }
    """
    store = TagStore(store_dir)

    # 查询所有 pending 状态的资产
    pending_assets = store.search({"status": "pending"})

    # 过滤动画文件（动画不需要 AI 推断和审核）
    if not include_animation:
        pending_assets = [t for t in pending_assets if t.asset_type != "animation"]

    high_conf = []
    low_conf = []

    for tags in pending_assets:
        # 计算综合置信度（取各推断层置信度的平均值）
        confidences = [
            tags.category.confidence,
            tags.material_structure.confidence,
            tags.visual.style_confidence,
            tags.visual.condition_confidence,
        ]
        # 过滤掉 0 的（未推断的字段）
        valid_confidences = [c for c in confidences if c > 0]
        avg_confidence = sum(valid_confidences) / len(valid_confidences) if valid_confidences else 0

        item = {
            "asset_id": tags.asset_id,
            "asset_name": tags.asset_name,
            "file_path": tags.file_path,
            "category": tags.category.category,
            "subcategory": tags.category.subcategory,
            "style": tags.visual.style,
            "condition": tags.visual.condition,
            "tri_count": tags.mesh.tri_count,
            "avg_confidence": round(avg_confidence, 2),
            "confidence_details": {
                "category": tags.category.confidence,
                "material": tags.material_structure.confidence,
                "style": tags.visual.style_confidence,
                "condition": tags.visual.condition_confidence,
            },
        }

        if avg_confidence >= confidence_threshold:
            high_conf.append(item)
        else:
            low_conf.append(item)

    # 按置信度排序
    high_conf.sort(key=lambda x: x["avg_confidence"], reverse=True)
    low_conf.sort(key=lambda x: x["avg_confidence"])

    total = len(high_conf) + len(low_conf)

    return {
        "total_pending": total,
        "high_confidence_count": len(high_conf),
        "low_confidence_count": len(low_conf),
        "high_confidence": high_conf,
        "low_confidence": low_conf,
        "summary": f"共 {total} 个待审核资产：{len(high_conf)} 个高置信度（建议批量通过），{len(low_conf)} 个低置信度（需逐个确认）",
    }


def get_review_detail(asset_id: str, store_dir: str) -> dict:
    """
    获取单个资产的完整审核详情。

    返回:
        资产完整信息 + 置信度 + 审核建议
    """
    store = TagStore(store_dir)
    tags = store.load(asset_id)

    if tags is None:
        return {"error": f"资产不存在: {asset_id}"}

    # 计算综合置信度
    confidences = {
        "category": tags.category.confidence,
        "material": tags.material_structure.confidence,
        "style": tags.visual.style_confidence,
        "condition": tags.visual.condition_confidence,
    }
    valid_confidences = [c for c in confidences.values() if c > 0]
    avg_confidence = sum(valid_confidences) / len(valid_confidences) if valid_confidences else 0

    # 生成审核建议
    suggestions = []
    if avg_confidence >= 0.9:
        suggestions.append("✅ 各项置信度均较高，建议直接通过")
    elif avg_confidence >= 0.7:
        suggestions.append("⚠️ 部分字段置信度中等，建议确认后通过")
    else:
        suggestions.append("❌ 多项置信度较低，建议仔细审核")

    # 检查哪些字段需要重点关注
    low_fields = [k for k, v in confidences.items() if 0 < v < 0.7]
    if low_fields:
        suggestions.append(f"需重点关注: {', '.join(low_fields)}")

    return {
        "asset_id": tags.asset_id,
        "asset_name": tags.asset_name,
        "file_path": tags.file_path,
        "asset_type": tags.asset_type,
        # 确定层（100%准确，无需审核）
        "determined": {
            "mesh": tags.mesh.to_dict(),
            "textures": tags.textures.to_dict(),
        },
        # 推断层（需审核）
        "inferred": {
            "category": {
                "value": f"{tags.category.category}/{tags.category.subcategory}",
                "confidence": tags.category.confidence,
            },
            "material": {
                "value": {
                    "primary": tags.material_structure.primary,
                    "secondary": tags.material_structure.secondary,
                },
                "confidence": tags.material_structure.confidence,
            },
            "style": {
                "value": tags.visual.style,
                "confidence": tags.visual.style_confidence,
            },
            "condition": {
                "value": tags.visual.condition,
                "confidence": tags.visual.condition_confidence,
            },
            "description": tags.visual.description,
        },
        # 管理层
        "meta": {
            "naming_suggestion": tags.meta.naming_suggestion,
            "naming_compliant": tags.meta.naming_compliant,
            "naming_issues": tags.meta.naming_issues,
            "engine_path": tags.meta.engine_path,
            "status": tags.meta.status,
            "preview_images": tags.meta.preview_images,
        },
        # 审核信息
        "review": {
            "avg_confidence": round(avg_confidence, 2),
            "confidence_details": confidences,
            "suggestions": suggestions,
        },
    }


def submit_review(
    asset_id: str,
    action: str,
    store_dir: str,
    corrections: dict = None,
    reviewer: str = "",
    notes: str = "",
) -> dict:
    """
    提交审核结果。

    参数:
        asset_id: 资产 ID
        action: approve / reject / modify
        store_dir: 数据库目录
        corrections: 修改内容（action=modify 时）
        reviewer: 审核人
        notes: 备注

    返回:
        审核结果
    """
    store = TagStore(store_dir)
    tags = store.load(asset_id)

    if tags is None:
        return {"error": f"资产不存在: {asset_id}"}

    # 记录原始推断（用于学习）
    original_result = {
        "category": f"{tags.category.category}/{tags.category.subcategory}",
        "material_primary": tags.material_structure.primary,
        "style": tags.visual.style,
        "condition": tags.visual.condition,
    }

    # 执行修改
    if action == "modify" and corrections:
        _apply_corrections(tags, corrections)

    # 更新状态
    if action == "approve" or action == "modify":
        tags.meta.status = "approved"
    elif action == "reject":
        tags.meta.status = "rejected"

    tags.meta.reviewer = reviewer

    # 保存
    store.save(tags)

    # 如果是修改操作，记录到记忆系统供学习
    if action == "modify" and corrections:
        try:
            memory = get_memory_provider()
            if memory:
                memory.save_correction(
                    asset_path=tags.file_path,
                    ai_result=original_result,
                    user_correction=corrections,
                )
        except Exception:
            pass  # 记忆系统不影响审核流程

    return {
        "success": True,
        "asset_id": asset_id,
        "asset_name": tags.asset_name,
        "action": action,
        "new_status": tags.meta.status,
        "reviewer": reviewer,
        "corrections_applied": corrections if action == "modify" else None,
        "message": f"已{action}资产 {tags.asset_name}",
    }


def batch_approve(
    asset_ids: list[str],
    store_dir: str,
    reviewer: str = "",
) -> dict:
    """
    批量通过多个资产。

    返回:
        批量审核结果
    """
    store = TagStore(store_dir)

    results = []
    success_count = 0
    fail_count = 0

    for asset_id in asset_ids:
        tags = store.load(asset_id)
        if tags is None:
            results.append({"asset_id": asset_id, "success": False, "error": "资产不存在"})
            fail_count += 1
            continue

        tags.meta.status = "approved"
        tags.meta.reviewer = reviewer
        store.save(tags)

        results.append({
            "asset_id": asset_id,
            "asset_name": tags.asset_name,
            "success": True,
        })
        success_count += 1

    return {
        "total": len(asset_ids),
        "success_count": success_count,
        "fail_count": fail_count,
        "results": results,
        "message": f"批量通过完成：{success_count} 成功，{fail_count} 失败",
    }


def _apply_corrections(tags: AssetTags, corrections: dict):
    """将用户修改应用到资产标签"""
    if "category" in corrections:
        # 格式: "weapon/sword" 或 {"category": "weapon", "subcategory": "sword"}
        val = corrections["category"]
        if isinstance(val, str) and "/" in val:
            parts = val.split("/", 1)
            tags.category.category = parts[0]
            tags.category.subcategory = parts[1] if len(parts) > 1 else ""
        elif isinstance(val, dict):
            tags.category.category = val.get("category", tags.category.category)
            tags.category.subcategory = val.get("subcategory", tags.category.subcategory)
        # 用户修正后置信度设为 1
        tags.category.confidence = 1.0

    if "material_primary" in corrections:
        tags.material_structure.primary = corrections["material_primary"]
        tags.material_structure.confidence = 1.0

    if "material_secondary" in corrections:
        tags.material_structure.secondary = corrections["material_secondary"]

    if "style" in corrections:
        tags.visual.style = corrections["style"]
        tags.visual.style_confidence = 1.0

    if "condition" in corrections:
        tags.visual.condition = corrections["condition"]
        tags.visual.condition_confidence = 1.0

    if "description" in corrections:
        tags.visual.description = corrections["description"]
