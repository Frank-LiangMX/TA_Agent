"""
用量统计 API
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from pydantic import BaseModel

from database.models import UsageLog, UserStats

router = APIRouter(prefix="/api/usage", tags=["usage"])


class LogUsageRequest(BaseModel):
    """记录用量请求"""
    user_id: str
    model: str = ""
    tokens_input: int = 0
    tokens_output: int = 0
    tokens_total: int = 0


# 数据库实例（由 main.py 注入）
_db = None

# 配置
LIMIT_5H = 1500  # 每 5 小时调用上限


def set_db(db):
    global _db
    _db = db


@router.post("/log")
async def log_usage(request: LogUsageRequest):
    """记录用量"""
    if not _db:
        raise HTTPException(status_code=500, detail="数据库未初始化")

    # 检查是否超限
    stats = _db.get_user_stats(request.user_id)
    if stats.call_count_5h >= LIMIT_5H:
        raise HTTPException(
            status_code=429,
            detail=f"调用次数已达上限（{LIMIT_5H}次/5小时），请稍后再试"
        )

    import uuid
    from datetime import datetime

    log = UsageLog(
        log_id=uuid.uuid4().hex[:12],
        user_id=request.user_id,
        model=request.model,
        tokens_input=request.tokens_input,
        tokens_output=request.tokens_output,
        tokens_total=request.tokens_total,
        created_at=datetime.now().isoformat(timespec="seconds"),
    )

    _db.log_usage(log)
    return {"success": True, "remaining": LIMIT_5H - stats.call_count_5h - 1}


@router.get("/stats/{user_id}")
async def get_user_stats(user_id: str):
    """获取用户统计"""
    if not _db:
        raise HTTPException(status_code=500, detail="数据库未初始化")

    stats = _db.get_user_stats(user_id)
    return {
        **stats.to_dict(),
        "limit_5h": LIMIT_5H,
        "remaining_5h": LIMIT_5H - stats.call_count_5h,
    }


@router.get("/stats")
async def get_all_stats():
    """获取所有用户统计（管理员用）"""
    if not _db:
        raise HTTPException(status_code=500, detail="数据库未初始化")

    all_stats = _db.get_all_stats()
    return {
        "users": [
            {
                **s.to_dict(),
                "limit_5h": LIMIT_5H,
                "remaining_5h": LIMIT_5H - s.call_count_5h,
            }
            for s in all_stats
        ],
        "total_users": len(all_stats),
        "total_calls_today": sum(s.call_count_today for s in all_stats),
        "total_tokens_today": sum(s.tokens_today for s in all_stats),
    }


@router.get("/check/{user_id}")
async def check_limit(user_id: str):
    """检查用户是否超限"""
    if not _db:
        raise HTTPException(status_code=500, detail="数据库未初始化")

    stats = _db.get_user_stats(user_id)
    return {
        "user_id": user_id,
        "allowed": stats.call_count_5h < LIMIT_5H,
        "call_count_5h": stats.call_count_5h,
        "limit_5h": LIMIT_5H,
        "remaining_5h": LIMIT_5H - stats.call_count_5h,
    }
