"""
记忆系统 API
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from pydantic import BaseModel

from database.models import MemoryRule

router = APIRouter(prefix="/api/memory", tags=["memory"])


class RuleRequest(BaseModel):
    """规则请求"""
    pattern: str
    conclusion: str
    confidence: float = 1.0


# 数据库实例（由 main.py 注入）
_db = None


def set_db(db):
    global _db
    _db = db


@router.get("/rules")
async def get_rules(
    project_id: str = Query(..., description="项目ID"),
    limit: int = Query(15, ge=1, le=100),
):
    """获取记忆规则"""
    if not _db:
        raise HTTPException(status_code=500, detail="数据库未初始化")

    rules = _db.get_rules(project_id=project_id, limit=limit)
    return {
        "rules": [r.to_dict() for r in rules],
        "count": len(rules),
    }


@router.post("/rules")
async def create_rule(
    project_id: str = Query(..., description="项目ID"),
    request: RuleRequest = ...,
):
    """创建记忆规则"""
    if not _db:
        raise HTTPException(status_code=500, detail="数据库未初始化")

    import uuid
    from datetime import datetime

    rule = MemoryRule(
        rule_id=uuid.uuid4().hex[:12],
        project_id=project_id,
        pattern=request.pattern,
        conclusion=request.conclusion,
        confidence=request.confidence,
        created_at=datetime.now().isoformat(timespec="seconds"),
    )

    _db.save_rule(rule)
    return {"success": True, "rule_id": rule.rule_id}


@router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: str):
    """删除记忆规则"""
    if not _db:
        raise HTTPException(status_code=500, detail="数据库未初始化")

    success = _db.delete_rule(rule_id)
    if not success:
        raise HTTPException(status_code=404, detail="规则不存在")

    return {"success": True}


@router.get("/stats")
async def get_memory_stats(
    project_id: str = Query(..., description="项目ID"),
):
    """获取记忆系统统计"""
    if not _db:
        raise HTTPException(status_code=500, detail="数据库未初始化")

    rules = _db.get_rules(project_id=project_id, limit=100)
    total_hits = sum(r.hit_count for r in rules)
    total_corrections = sum(r.correction_count for r in rules)

    return {
        "project_id": project_id,
        "rule_count": len(rules),
        "total_hits": total_hits,
        "total_corrections": total_corrections,
    }
