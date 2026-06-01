"""
数据模型定义
"""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
import json


@dataclass
class Asset:
    """资产数据"""
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
    status: str = "pending"  # pending, approved, imported
    preview_thumbnail: str = ""
    preview_front: str = ""
    preview_side: str = ""
    created_by: str = ""
    created_at: str = ""
    updated_at: str = ""
    metadata: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "asset_id": self.asset_id,
            "asset_name": self.asset_name,
            "asset_type": self.asset_type,
            "file_path": self.file_path,
            "tri_count": self.tri_count,
            "vertex_count": self.vertex_count,
            "material_count": self.material_count,
            "category": self.category,
            "subcategory": self.subcategory,
            "style": self.style,
            "condition": self.condition,
            "confidence": self.confidence,
            "status": self.status,
            "preview_thumbnail": self.preview_thumbnail,
            "preview_front": self.preview_front,
            "preview_side": self.preview_side,
            "created_by": self.created_by,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Asset":
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


@dataclass
class Review:
    """审核记录"""
    review_id: str
    asset_id: str
    reviewer_id: str = ""
    action: str = ""  # approve, reject, modify
    comment: str = ""
    created_at: str = ""

    def to_dict(self) -> dict:
        return {
            "review_id": self.review_id,
            "asset_id": self.asset_id,
            "reviewer_id": self.reviewer_id,
            "action": self.action,
            "comment": self.comment,
            "created_at": self.created_at,
        }


@dataclass
class ProjectConfig:
    """项目配置"""
    project_id: str
    project_name: str = ""
    config: dict = field(default_factory=dict)
    updated_by: str = ""
    updated_at: str = ""

    def to_dict(self) -> dict:
        return {
            "project_id": self.project_id,
            "project_name": self.project_name,
            "config": self.config,
            "updated_by": self.updated_by,
            "updated_at": self.updated_at,
        }


@dataclass
class MemoryRule:
    """记忆规则"""
    rule_id: str
    project_id: str
    pattern: str = ""
    conclusion: str = ""
    confidence: float = 1.0
    hit_count: int = 0
    correction_count: int = 0
    created_at: str = ""
    updated_at: str = ""

    def to_dict(self) -> dict:
        return {
            "rule_id": self.rule_id,
            "project_id": self.project_id,
            "pattern": self.pattern,
            "conclusion": self.conclusion,
            "confidence": self.confidence,
            "hit_count": self.hit_count,
            "correction_count": self.correction_count,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class UsageLog:
    """用量记录"""
    log_id: str
    user_id: str
    model: str = ""
    tokens_input: int = 0
    tokens_output: int = 0
    tokens_total: int = 0
    created_at: str = ""

    def to_dict(self) -> dict:
        return {
            "log_id": self.log_id,
            "user_id": self.user_id,
            "model": self.model,
            "tokens_input": self.tokens_input,
            "tokens_output": self.tokens_output,
            "tokens_total": self.tokens_total,
            "created_at": self.created_at,
        }


@dataclass
class UserStats:
    """用户统计"""
    user_id: str
    call_count_5h: int = 0      # 最近 5 小时调用次数
    tokens_total_5h: int = 0    # 最近 5 小时 token 消耗
    call_count_today: int = 0   # 今日调用次数
    tokens_today: int = 0       # 今日 token 消耗
    call_count_total: int = 0   # 总调用次数
    tokens_total: int = 0       # 总 token 消耗

    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "call_count_5h": self.call_count_5h,
            "tokens_total_5h": self.tokens_total_5h,
            "call_count_today": self.call_count_today,
            "tokens_today": self.tokens_today,
            "call_count_total": self.call_count_total,
            "tokens_total": self.tokens_total,
        }


@dataclass
class User:
    """用户信息"""
    user_id: str
    user_name: str = ""
    role: str = "user"  # user, manager, admin, super_admin
    department: str = ""
    email: str = ""
    created_at: str = ""
    last_login: str = ""
    last_login_ip: str = ""

    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "user_name": self.user_name,
            "role": self.role,
            "department": self.department,
            "email": self.email,
            "created_at": self.created_at,
            "last_login": self.last_login,
            "last_login_ip": self.last_login_ip,
        }
