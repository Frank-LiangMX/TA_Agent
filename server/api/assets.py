"""
资产 API
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from pydantic import BaseModel

from database.models import Asset

router = APIRouter(prefix="/api/assets", tags=["assets"])


class AssetSyncRequest(BaseModel):
    """资产同步请求"""
    asset_id: str
    asset_name: str
    asset_type: str = ""
    file_path: str = ""
    tri_count: int = 0
    vertex_count: int = 0
    material_count: int = 0
    category: str = ""
    subcategory: str = ""
    style: str = ""
    condition: str = ""
    confidence: float = 0.0
    preview_thumbnail: str = ""
    preview_front: str = ""
    preview_side: str = ""
    created_by: str = ""
    metadata: dict = {}


class AssetResponse(BaseModel):
    """资产响应"""
    asset_id: str
    asset_name: str
    asset_type: str
    file_path: str
    tri_count: int
    vertex_count: int
    material_count: int
    category: str
    subcategory: str
    style: str
    condition: str
    confidence: float
    status: str
    preview_thumbnail: str
    preview_front: str
    preview_side: str
    created_by: str
    created_at: str
    updated_at: str
    metadata: dict


# 数据库实例（由 main.py 注入）
_db = None


def set_db(db):
    global _db
    _db = db


@router.post("/sync")
async def sync_asset(request: AssetSyncRequest):
    """同步资产数据"""
    if not _db:
        raise HTTPException(status_code=500, detail="数据库未初始化")

    asset = Asset(
        asset_id=request.asset_id,
        asset_name=request.asset_name,
        asset_type=request.asset_type,
        file_path=request.file_path,
        tri_count=request.tri_count,
        vertex_count=request.vertex_count,
        material_count=request.material_count,
        category=request.category,
        subcategory=request.subcategory,
        style=request.style,
        condition=request.condition,
        confidence=request.confidence,
        preview_thumbnail=request.preview_thumbnail,
        preview_front=request.preview_front,
        preview_side=request.preview_side,
        created_by=request.created_by,
        metadata=request.metadata,
    )

    _db.save_asset(asset)
    return {"success": True, "asset_id": asset.asset_id}


@router.get("")
async def list_assets(
    status: Optional[str] = Query(None, description="资产状态"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    """列出资产"""
    if not _db:
        raise HTTPException(status_code=500, detail="数据库未初始化")

    assets = _db.list_assets(status=status, limit=limit, offset=offset)
    total = _db.count_assets(status=status)

    return {
        "assets": [a.to_dict() for a in assets],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{asset_id}")
async def get_asset(asset_id: str):
    """获取资产详情"""
    if not _db:
        raise HTTPException(status_code=500, detail="数据库未初始化")

    asset = _db.get_asset(asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="资产不存在")

    return asset.to_dict()


@router.delete("/{asset_id}")
async def delete_asset(asset_id: str):
    """删除资产"""
    if not _db:
        raise HTTPException(status_code=500, detail="数据库未初始化")

    success = _db.delete_asset(asset_id)
    if not success:
        raise HTTPException(status_code=404, detail="资产不存在")

    return {"success": True}
