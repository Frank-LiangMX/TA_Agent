"""
认证 API
"""
from fastapi import APIRouter, HTTPException
from typing import Optional
from pydantic import BaseModel

from database.models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    """登录请求"""
    username: str
    password: str


class UserInfoResponse(BaseModel):
    """用户信息响应"""
    user_id: str
    user_name: str
    role: str
    department: str
    email: str


# 数据库实例（由 main.py 注入）
_db = None


def set_db(db):
    global _db
    _db = db


@router.post("/login")
async def login(request: LoginRequest):
    """登录（简化版，待集成 SSO）"""
    if not _db:
        raise HTTPException(status_code=500, detail="数据库未初始化")

    # TODO: 集成 XSJSSO 登录
    # 目前简化为直接返回用户信息

    user = _db.get_user(request.username)
    if not user:
        # 自动创建用户
        user = User(
            user_id=request.username,
            user_name=request.username,
            role="user",
        )
        _db.save_user(user)

    return {
        "success": True,
        "user": user.to_dict(),
    }


@router.get("/users/{user_id}")
async def get_user_info(user_id: str):
    """获取用户信息"""
    if not _db:
        raise HTTPException(status_code=500, detail="数据库未初始化")

    user = _db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    return user.to_dict()


@router.get("/users")
async def list_users():
    """列出用户（仅管理员）"""
    if not _db:
        raise HTTPException(status_code=500, detail="数据库未初始化")

    users = _db.list_users()
    return {
        "users": [u.to_dict() for u in users],
        "count": len(users),
    }


class AddUserRequest(BaseModel):
    """添加用户请求"""
    user_id: str
    name: Optional[str] = None
    role: str = "user"


@router.post("/users")
async def add_user(request: AddUserRequest):
    """添加用户（仅超级管理员）"""
    if not _db:
        raise HTTPException(status_code=500, detail="数据库未初始化")

    # 检查用户是否已存在
    existing = _db.get_user(request.user_id)
    if existing:
        # 更新用户信息
        existing.name = request.name or existing.name
        existing.role = request.role
        _db.save_user(existing)
        return {"success": True, "user": existing.to_dict()}

    # 创建新用户
    user = User(
        user_id=request.user_id,
        user_name=request.name or request.user_id,
        role=request.role,
    )
    _db.save_user(user)
    return {"success": True, "user": user.to_dict()}


@router.delete("/users/{user_id}")
async def remove_user(user_id: str):
    """移除用户（仅超级管理员）"""
    if not _db:
        raise HTTPException(status_code=500, detail="数据库未初始化")

    # 检查用户是否存在
    user = _db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 不能删除超级管理员
    if user.role == "super_admin":
        raise HTTPException(status_code=400, detail="不能删除超级管理员")

    # 删除用户
    _db.delete_user(user_id)
    return {"success": True}
