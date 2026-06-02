"""
审核 API
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from pydantic import BaseModel

from database.models import Review

router = APIRouter(prefix="/api/reviews", tags=["reviews"])


class ReviewSubmitRequest(BaseModel):
    """审核提交请求"""
    asset_id: str
    action: str  # approve, reject, modify
    comment: str = ""
    reviewer_id: str = ""


# 数据库实例（由 main.py 注入）
_db = None


def set_db(db):
    global _db
    _db = db


@router.post("")
async def submit_review(request: ReviewSubmitRequest):
    """提交审核"""
    if not _db:
        raise HTTPException(status_code=500, detail="数据库未初始化")

    import uuid
    from datetime import datetime

    review = Review(
        review_id=uuid.uuid4().hex[:12],
        asset_id=request.asset_id,
        reviewer_id=request.reviewer_id,
        action=request.action,
        comment=request.comment,
        created_at=datetime.now().isoformat(timespec="seconds"),
    )

    _db.save_review(review)

    # 更新资产状态
    asset = _db.get_asset(request.asset_id)
    if asset:
        if request.action == "approve":
            asset.status = "approved"
        elif request.action == "reject":
            asset.status = "rejected"
        _db.save_asset(asset)

    return {"success": True, "review_id": review.review_id}


@router.get("")
async def list_reviews(
    asset_id: Optional[str] = Query(None, description="资产ID"),
    limit: int = Query(100, ge=1, le=1000),
):
    """列出审核记录"""
    if not _db:
        raise HTTPException(status_code=500, detail="数据库未初始化")

    reviews = _db.get_reviews(asset_id=asset_id, limit=limit)
    return {
        "reviews": [r.to_dict() for r in reviews],
        "count": len(reviews),
    }


@router.get("/pending")
async def get_pending_reviews(limit: int = Query(100, ge=1, le=1000)):
    """获取待审核资产"""
    if not _db:
        raise HTTPException(status_code=500, detail="数据库未初始化")

    assets = _db.list_assets(status="pending", limit=limit)
    return {
        "assets": [a.to_dict() for a in assets],
        "count": len(assets),
    }
