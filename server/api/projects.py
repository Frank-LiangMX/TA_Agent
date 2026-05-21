"""
项目配置 API
"""
from fastapi import APIRouter, HTTPException
from typing import Optional
from pydantic import BaseModel

from database.models import ProjectConfig

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectConfigRequest(BaseModel):
    """项目配置请求"""
    project_name: str = ""
    config: dict = {}


# 数据库实例（由 main.py 注入）
_db = None


def set_db(db):
    global _db
    _db = db


@router.get("")
async def list_projects():
    """列出项目"""
    if not _db:
        raise HTTPException(status_code=500, detail="数据库未初始化")

    projects = _db.list_projects()
    return {
        "projects": [p.to_dict() for p in projects],
        "count": len(projects),
    }


@router.get("/{project_id}")
async def get_project_config(project_id: str):
    """获取项目配置"""
    if not _db:
        raise HTTPException(status_code=500, detail="数据库未初始化")

    config = _db.get_project_config(project_id)
    if not config:
        raise HTTPException(status_code=404, detail="项目不存在")

    return config.to_dict()


@router.put("/{project_id}")
async def update_project_config(project_id: str, request: ProjectConfigRequest):
    """更新项目配置"""
    if not _db:
        raise HTTPException(status_code=500, detail="数据库未初始化")

    config = ProjectConfig(
        project_id=project_id,
        project_name=request.project_name,
        config=request.config,
    )

    _db.save_project_config(config)
    return {"success": True, "project_id": project_id}


@router.post("/{project_id}")
async def create_project_config(project_id: str, request: ProjectConfigRequest):
    """创建项目配置"""
    if not _db:
        raise HTTPException(status_code=500, detail="数据库未初始化")

    # 检查是否已存在
    existing = _db.get_project_config(project_id)
    if existing:
        raise HTTPException(status_code=409, detail="项目已存在")

    config = ProjectConfig(
        project_id=project_id,
        project_name=request.project_name or project_id,
        config=request.config,
    )

    _db.save_project_config(config)
    return {"success": True, "project_id": project_id}
