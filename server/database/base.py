"""
数据库抽象层
"""
from abc import ABC, abstractmethod
from typing import Optional, List
from .models import Asset, Review, ProjectConfig, MemoryRule, User, UsageLog, UserStats


class Database(ABC):
    """数据库接口"""

    @abstractmethod
    def connect(self):
        """连接数据库"""
        ...

    @abstractmethod
    def close(self):
        """关闭连接"""
        ...

    # ========== 资产 ==========

    @abstractmethod
    def save_asset(self, asset: Asset) -> bool:
        """保存资产（新增或更新）"""
        ...

    @abstractmethod
    def get_asset(self, asset_id: str) -> Optional[Asset]:
        """获取资产"""
        ...

    @abstractmethod
    def list_assets(self, status: str = None, limit: int = 100, offset: int = 0) -> List[Asset]:
        """列出资产"""
        ...

    @abstractmethod
    def delete_asset(self, asset_id: str) -> bool:
        """删除资产"""
        ...

    @abstractmethod
    def count_assets(self, status: str = None) -> int:
        """统计资产数量"""
        ...

    # ========== 审核 ==========

    @abstractmethod
    def save_review(self, review: Review) -> bool:
        """保存审核记录"""
        ...

    @abstractmethod
    def get_reviews(self, asset_id: str = None, limit: int = 100) -> List[Review]:
        """获取审核记录"""
        ...

    # ========== 项目配置 ==========

    @abstractmethod
    def save_project_config(self, config: ProjectConfig) -> bool:
        """保存项目配置"""
        ...

    @abstractmethod
    def get_project_config(self, project_id: str) -> Optional[ProjectConfig]:
        """获取项目配置"""
        ...

    @abstractmethod
    def list_projects(self) -> List[ProjectConfig]:
        """列出项目"""
        ...

    # ========== 记忆规则 ==========

    @abstractmethod
    def save_rule(self, rule: MemoryRule) -> bool:
        """保存规则"""
        ...

    @abstractmethod
    def get_rules(self, project_id: str, limit: int = 15) -> List[MemoryRule]:
        """获取规则"""
        ...

    @abstractmethod
    def delete_rule(self, rule_id: str) -> bool:
        """删除规则"""
        ...

    # ========== 用户 ==========

    @abstractmethod
    def save_user(self, user: User) -> bool:
        """保存用户"""
        ...

    @abstractmethod
    def get_user(self, user_id: str) -> Optional[User]:
        """获取用户"""
        ...

    @abstractmethod
    def list_users(self) -> List[User]:
        """列出用户"""
        ...

    # ========== 用量统计 ==========

    @abstractmethod
    def log_usage(self, log: UsageLog) -> bool:
        """记录用量"""
        ...

    @abstractmethod
    def get_user_stats(self, user_id: str) -> UserStats:
        """获取用户统计"""
        ...

    @abstractmethod
    def get_all_stats(self) -> List[UserStats]:
        """获取所有用户统计"""
        ...
