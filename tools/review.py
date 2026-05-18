"""
tools/review.py - 人工审核工作流

支持分级审核：
- 高置信度资产：批量快速通过
- 低置信度资产：逐个查看详情后确认
"""
from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Optional

from tags.store import TagStore
from tags.schema import AssetTags
from tools.memory_tools import get_memory_provider


# ========== 工具实现 ==========

def _build_review_criteria(tags: AssetTags) -> dict:
    """按资产类型构建审核维度"""
    asset_type = tags.asset_type

    if asset_type in ("static_mesh", "skeletal_mesh", "mesh"):
        # 模型：面数、材质、风格、状态
        return {
            "type_label": "模型",
            "criteria": {
                "category": {"value": f"{tags.category.category}/{tags.category.subcategory}", "confidence": tags.category.confidence, "label": "分类"},
                "material": {"value": ", ".join(tags.material_structure.primary) or "无", "confidence": tags.material_structure.confidence, "label": "材质"},
                "style": {"value": tags.visual.style or "-", "confidence": tags.visual.style_confidence, "label": "风格"},
                "condition": {"value": tags.visual.condition or "-", "confidence": tags.visual.condition_confidence, "label": "状态"},
            },
            "determined": {
                "tri_count": {"value": tags.mesh.tri_count, "label": "面数"},
                "vertex_count": {"value": tags.mesh.vertex_count, "label": "顶点数"},
                "has_skeleton": {"value": tags.mesh.has_skeleton, "label": "骨骼"},
                "material_count": {"value": tags.mesh.material_count, "label": "材质数"},
                "has_uv": {"value": tags.mesh.has_uv, "label": "UV"},
                "material_names": {"value": ", ".join(tags.mesh.material_names) or "-", "label": "材质名"},
            },
        }

    elif asset_type == "texture":
        # 贴图：分辨率、格式、命名
        tex = tags.textures
        max_res = tex.max_resolution or "未知"
        is_compliant = True
        issues = []
        # 检查分辨率是否超标
        try:
            w, h = max_res.split("x") if "x" in max_res else (0, 0)
            w, h = int(w), int(h)
            if w > 2048 or h > 2048:
                is_compliant = False
                issues.append(f"分辨率 {max_res} 超过 2048")
            if w > 0 and (w & (w - 1)) != 0:
                issues.append("宽度不是 2 的幂次")
            if h > 0 and (h & (h - 1)) != 0:
                issues.append("高度不是 2 的幂次")
        except (ValueError, TypeError):
            pass

        naming_ok = tags.meta.naming_compliant
        return {
            "type_label": "贴图",
            "criteria": {
                "resolution": {"value": max_res, "confidence": 1.0 if is_compliant else 0.5, "label": "分辨率", "issues": issues},
                "format": {"value": ", ".join(tex.formats_used) or "-", "confidence": 1.0, "label": "格式"},
                "naming": {"value": tags.asset_name, "confidence": 1.0 if naming_ok else 0.3, "label": "命名", "issues": tags.meta.naming_issues},
            },
            "determined": {
                "count": {"value": tex.count, "label": "贴图数"},
                "color_spaces": {"value": ", ".join(tex.color_spaces) or "-", "label": "色彩空间"},
            },
        }

    elif asset_type == "animation":
        # 动画：命名、骨骼
        naming_ok = tags.meta.naming_compliant
        return {
            "type_label": "动画",
            "criteria": {
                "naming": {"value": tags.asset_name, "confidence": 1.0 if naming_ok else 0.3, "label": "命名", "issues": tags.meta.naming_issues},
                "has_skeleton": {"value": tags.mesh.has_skeleton, "confidence": 1.0 if tags.mesh.has_skeleton else 0.2, "label": "骨骼"},
                "bone_count": {"value": tags.mesh.bone_count, "confidence": 1.0 if tags.mesh.bone_count > 0 else 0.2, "label": "骨骼数"},
            },
            "determined": {
                "has_skeleton": {"value": tags.mesh.has_skeleton, "label": "有骨骼"},
                "bone_count": {"value": tags.mesh.bone_count, "label": "骨骼数"},
            },
        }

    elif asset_type in ("material", "material_instance"):
        # 材质：命名
        naming_ok = tags.meta.naming_compliant
        return {
            "type_label": "材质",
            "criteria": {
                "naming": {"value": tags.asset_name, "confidence": 1.0 if naming_ok else 0.3, "label": "命名", "issues": tags.meta.naming_issues},
            },
            "determined": {
                "material_names": {"value": ", ".join(tags.mesh.material_names) or "-", "label": "材质名"},
            },
        }

    else:
        # 未知类型：通用审核
        return {
            "type_label": asset_type,
            "criteria": {
                "naming": {"value": tags.asset_name, "confidence": 1.0 if tags.meta.naming_compliant else 0.3, "label": "命名"},
            },
            "determined": {},
        }


def get_pending_reviews(store_dir: str = None, confidence_threshold: float = 0.9, include_animation: bool = False) -> dict:
    """
    获取待审核列表，按置信度分组。

    参数:
        store_dir: 数据库目录（可选，默认使用 tag_store）
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
    if store_dir is None:
        store_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tag_store")
    store = TagStore(store_dir)

    # 查询所有 pending 状态的资产
    pending_assets = store.search({"status": "pending"})

    # 过滤动画文件（动画不需要 AI 推断和审核）
    if not include_animation:
        pending_assets = [t for t in pending_assets if t.asset_type != "animation"]

    high_conf = []
    low_conf = []

    for tags in pending_assets:
        # 按资产类型构建审核维度
        review_criteria = _build_review_criteria(tags)

        # 计算综合置信度（取所有 criteria 的平均值）
        criteria_confidences = [c["confidence"] for c in review_criteria["criteria"].values() if c["confidence"] > 0]
        avg_confidence = sum(criteria_confidences) / len(criteria_confidences) if criteria_confidences else 0

        item = {
            "asset_id": tags.asset_id,
            "asset_name": tags.asset_name,
            "file_path": tags.file_path,
            "asset_type": tags.asset_type,
            "tri_count": tags.mesh.tri_count,
            "avg_confidence": round(avg_confidence, 2),
            "review_type": review_criteria["type_label"],
            "review_criteria": review_criteria["criteria"],
            "review_determined": review_criteria["determined"],
        }

        if avg_confidence >= confidence_threshold:
            high_conf.append(item)
        else:
            low_conf.append(item)

    # 按置信度排序
    high_conf.sort(key=lambda x: x["avg_confidence"], reverse=True)
    low_conf.sort(key=lambda x: x["avg_confidence"])

    total = len(high_conf) + len(low_conf)

    # 截断：只返回前 20 个详情，避免上下文过大导致 LLM 响应慢
    MAX_DETAIL = 20
    return {
        "total_pending": total,
        "high_confidence_count": len(high_conf),
        "low_confidence_count": len(low_conf),
        "high_confidence": high_conf[:MAX_DETAIL],
        "high_confidence_truncated": len(high_conf) > MAX_DETAIL,
        "low_confidence": low_conf[:MAX_DETAIL],
        "low_confidence_truncated": len(low_conf) > MAX_DETAIL,
        "high_confidence_ids": [a["asset_id"] for a in high_conf],  # 全量 ID 供批量操作用
        "summary": f"共 {total} 个待审核：{len(high_conf)} 高置信度，{len(low_conf)} 低置信度" + (
            f"（高置信度仅显示前 {MAX_DETAIL} 个）" if len(high_conf) > MAX_DETAIL else ""
        ),
    }


def get_review_detail(asset_id: str, store_dir: str = None) -> dict:
    """
    获取单个资产的完整审核详情。

    返回:
        资产完整信息 + 置信度 + 审核建议
    """
    if store_dir is None:
        store_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tag_store")
    store = TagStore(store_dir)
    tags = store.load(asset_id)

    if tags is None:
        return {"error": f"资产不存在: {asset_id}"}

    # 按资产类型构建审核维度
    review_criteria = _build_review_criteria(tags)

    # 计算综合置信度
    criteria_confidences = [c["confidence"] for c in review_criteria["criteria"].values() if c["confidence"] > 0]
    avg_confidence = sum(criteria_confidences) / len(criteria_confidences) if criteria_confidences else 0

    # 生成审核建议
    suggestions = []
    if avg_confidence >= 0.9:
        suggestions.append("✅ 各项指标均正常，建议直接通过")
    elif avg_confidence >= 0.7:
        suggestions.append("⚠️ 部分指标需要确认")
    else:
        suggestions.append("❌ 多项指标异常，建议仔细审核")

    # 检查哪些字段需要重点关注
    low_fields = [c["label"] for c in review_criteria["criteria"].values() if 0 < c["confidence"] < 0.7]
    if low_fields:
        suggestions.append(f"需重点关注: {', '.join(low_fields)}")

    # 检查确定层的问题
    determined_issues = []
    for key, info in review_criteria.get("determined", {}).items():
        if info.get("issues"):
            determined_issues.extend(info["issues"])
    if determined_issues:
        suggestions.append(f"确定层问题: {'; '.join(determined_issues)}")

    return {
        "asset_id": tags.asset_id,
        "asset_name": tags.asset_name,
        "file_path": tags.file_path,
        "asset_type": tags.asset_type,
        "review_type": review_criteria["type_label"],
        # 按类型的审核维度
        "review_criteria": review_criteria["criteria"],
        # 确定层数据
        "determined": review_criteria.get("determined", {}),
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
            "suggestions": suggestions,
        },
    }


def submit_review(
    asset_id: str,
    action: str,
    store_dir: str = None,
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
    if store_dir is None:
        store_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tag_store")
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
    store_dir: str = None,
    reviewer: str = "",
) -> dict:
    """
    批量通过多个资产。

    返回:
        批量审核结果
    """
    if store_dir is None:
        store_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tag_store")
    store = TagStore(store_dir)

    # 使用批量更新（单次事务，比逐个 load+save 快得多）
    result = store.batch_update_status(asset_ids, "approved", reviewer)

    return {
        "total": len(asset_ids),
        "approved": result["success"],
        "failed": result["failed"],
        "not_found": result["not_found"],
        "message": f"批量审核完成：{result['success']} 个通过，{result['failed']} 个失败",
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
