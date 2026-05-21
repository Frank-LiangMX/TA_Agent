"""
SQLite 数据库实现
"""
import sqlite3
import json
from datetime import datetime, timedelta
from typing import Optional, List
from pathlib import Path

from .base import Database
from .models import Asset, Review, ProjectConfig, MemoryRule, User, UsageLog, UserStats


class SQLiteDatabase(Database):
    """SQLite 数据库实现"""

    def __init__(self, db_path: str):
        self.db_path = db_path
        self.conn: Optional[sqlite3.Connection] = None

    def connect(self):
        """连接数据库"""
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self._create_tables()

    def close(self):
        """关闭连接"""
        if self.conn:
            self.conn.close()
            self.conn = None

    def _create_tables(self):
        """创建表结构"""
        cursor = self.conn.cursor()

        # 资产表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS assets (
                asset_id TEXT PRIMARY KEY,
                asset_name TEXT NOT NULL,
                asset_type TEXT DEFAULT '',
                file_path TEXT DEFAULT '',
                tri_count INTEGER DEFAULT 0,
                vertex_count INTEGER DEFAULT 0,
                material_count INTEGER DEFAULT 0,
                category TEXT DEFAULT '',
                subcategory TEXT DEFAULT '',
                style TEXT DEFAULT '',
                condition TEXT DEFAULT '',
                confidence REAL DEFAULT 0.0,
                status TEXT DEFAULT 'pending',
                preview_thumbnail TEXT DEFAULT '',
                preview_front TEXT DEFAULT '',
                preview_side TEXT DEFAULT '',
                created_by TEXT DEFAULT '',
                created_at TEXT DEFAULT '',
                updated_at TEXT DEFAULT '',
                metadata TEXT DEFAULT '{}'
            )
        """)

        # 审核记录表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS reviews (
                review_id TEXT PRIMARY KEY,
                asset_id TEXT NOT NULL,
                reviewer_id TEXT DEFAULT '',
                action TEXT DEFAULT '',
                comment TEXT DEFAULT '',
                created_at TEXT DEFAULT '',
                FOREIGN KEY (asset_id) REFERENCES assets(asset_id)
            )
        """)

        # 项目配置表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                project_id TEXT PRIMARY KEY,
                project_name TEXT DEFAULT '',
                config TEXT DEFAULT '{}',
                updated_by TEXT DEFAULT '',
                updated_at TEXT DEFAULT ''
            )
        """)

        # 记忆规则表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS rules (
                rule_id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                pattern TEXT DEFAULT '',
                conclusion TEXT DEFAULT '',
                confidence REAL DEFAULT 1.0,
                hit_count INTEGER DEFAULT 0,
                correction_count INTEGER DEFAULT 0,
                created_at TEXT DEFAULT '',
                updated_at TEXT DEFAULT ''
            )
        """)

        # 用户表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                user_name TEXT DEFAULT '',
                role TEXT DEFAULT 'user',
                department TEXT DEFAULT '',
                email TEXT DEFAULT '',
                created_at TEXT DEFAULT '',
                last_login TEXT DEFAULT ''
            )
        """)

        # 用量记录表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS usage_logs (
                log_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                model TEXT DEFAULT '',
                tokens_input INTEGER DEFAULT 0,
                tokens_output INTEGER DEFAULT 0,
                tokens_total INTEGER DEFAULT 0,
                created_at TEXT DEFAULT ''
            )
        """)

        # 创建索引
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_reviews_asset_id ON reviews(asset_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_rules_project_id ON rules(project_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_usage_user_id ON usage_logs(user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_usage_created_at ON usage_logs(created_at)")

        self.conn.commit()

    # ========== 资产 ==========

    def save_asset(self, asset: Asset) -> bool:
        """保存资产（新增或更新）"""
        now = datetime.now().isoformat(timespec="seconds")
        if not asset.created_at:
            asset.created_at = now
        asset.updated_at = now

        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO assets (
                asset_id, asset_name, asset_type, file_path,
                tri_count, vertex_count, material_count,
                category, subcategory, style, condition, confidence,
                status, preview_thumbnail, preview_front, preview_side,
                created_by, created_at, updated_at, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            asset.asset_id, asset.asset_name, asset.asset_type, asset.file_path,
            asset.tri_count, asset.vertex_count, asset.material_count,
            asset.category, asset.subcategory, asset.style, asset.condition, asset.confidence,
            asset.status, asset.preview_thumbnail, asset.preview_front, asset.preview_side,
            asset.created_by, asset.created_at, asset.updated_at,
            json.dumps(asset.metadata, ensure_ascii=False),
        ))
        self.conn.commit()
        return True

    def get_asset(self, asset_id: str) -> Optional[Asset]:
        """获取资产"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM assets WHERE asset_id = ?", (asset_id,))
        row = cursor.fetchone()
        if not row:
            return None
        return self._row_to_asset(row)

    def list_assets(self, status: str = None, limit: int = 100, offset: int = 0) -> List[Asset]:
        """列出资产"""
        cursor = self.conn.cursor()
        if status:
            cursor.execute(
                "SELECT * FROM assets WHERE status = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                (status, limit, offset)
            )
        else:
            cursor.execute(
                "SELECT * FROM assets ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                (limit, offset)
            )
        return [self._row_to_asset(row) for row in cursor.fetchall()]

    def delete_asset(self, asset_id: str) -> bool:
        """删除资产"""
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM assets WHERE asset_id = ?", (asset_id,))
        self.conn.commit()
        return cursor.rowcount > 0

    def count_assets(self, status: str = None) -> int:
        """统计资产数量"""
        cursor = self.conn.cursor()
        if status:
            cursor.execute("SELECT COUNT(*) FROM assets WHERE status = ?", (status,))
        else:
            cursor.execute("SELECT COUNT(*) FROM assets")
        return cursor.fetchone()[0]

    def _row_to_asset(self, row: sqlite3.Row) -> Asset:
        """将数据库行转换为 Asset 对象"""
        data = dict(row)
        data["metadata"] = json.loads(data.get("metadata", "{}"))
        return Asset(**{k: v for k, v in data.items() if k in Asset.__dataclass_fields__})

    # ========== 审核 ==========

    def save_review(self, review: Review) -> bool:
        """保存审核记录"""
        if not review.created_at:
            review.created_at = datetime.now().isoformat(timespec="seconds")

        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO reviews (
                review_id, asset_id, reviewer_id, action, comment, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
        """, (
            review.review_id, review.asset_id, review.reviewer_id,
            review.action, review.comment, review.created_at,
        ))
        self.conn.commit()
        return True

    def get_reviews(self, asset_id: str = None, limit: int = 100) -> List[Review]:
        """获取审核记录"""
        cursor = self.conn.cursor()
        if asset_id:
            cursor.execute(
                "SELECT * FROM reviews WHERE asset_id = ? ORDER BY created_at DESC LIMIT ?",
                (asset_id, limit)
            )
        else:
            cursor.execute(
                "SELECT * FROM reviews ORDER BY created_at DESC LIMIT ?",
                (limit,)
            )
        return [Review(**dict(row)) for row in cursor.fetchall()]

    # ========== 项目配置 ==========

    def save_project_config(self, config: ProjectConfig) -> bool:
        """保存项目配置"""
        if not config.updated_at:
            config.updated_at = datetime.now().isoformat(timespec="seconds")

        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO projects (
                project_id, project_name, config, updated_by, updated_at
            ) VALUES (?, ?, ?, ?, ?)
        """, (
            config.project_id, config.project_name,
            json.dumps(config.config, ensure_ascii=False),
            config.updated_by, config.updated_at,
        ))
        self.conn.commit()
        return True

    def get_project_config(self, project_id: str) -> Optional[ProjectConfig]:
        """获取项目配置"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM projects WHERE project_id = ?", (project_id,))
        row = cursor.fetchone()
        if not row:
            return None
        data = dict(row)
        data["config"] = json.loads(data.get("config", "{}"))
        return ProjectConfig(**data)

    def list_projects(self) -> List[ProjectConfig]:
        """列出项目"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM projects ORDER BY updated_at DESC")
        result = []
        for row in cursor.fetchall():
            data = dict(row)
            data["config"] = json.loads(data.get("config", "{}"))
            result.append(ProjectConfig(**data))
        return result

    # ========== 记忆规则 ==========

    def save_rule(self, rule: MemoryRule) -> bool:
        """保存规则"""
        now = datetime.now().isoformat(timespec="seconds")
        if not rule.created_at:
            rule.created_at = now
        rule.updated_at = now

        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO rules (
                rule_id, project_id, pattern, conclusion,
                confidence, hit_count, correction_count,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            rule.rule_id, rule.project_id, rule.pattern, rule.conclusion,
            rule.confidence, rule.hit_count, rule.correction_count,
            rule.created_at, rule.updated_at,
        ))
        self.conn.commit()
        return True

    def get_rules(self, project_id: str, limit: int = 15) -> List[MemoryRule]:
        """获取规则"""
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT * FROM rules WHERE project_id = ? ORDER BY confidence DESC, hit_count DESC LIMIT ?",
            (project_id, limit)
        )
        return [MemoryRule(**dict(row)) for row in cursor.fetchall()]

    def delete_rule(self, rule_id: str) -> bool:
        """删除规则"""
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM rules WHERE rule_id = ?", (rule_id,))
        self.conn.commit()
        return cursor.rowcount > 0

    # ========== 用户 ==========

    def save_user(self, user: User) -> bool:
        """保存用户"""
        if not user.created_at:
            user.created_at = datetime.now().isoformat(timespec="seconds")

        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO users (
                user_id, user_name, role, department, email, created_at, last_login
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            user.user_id, user.user_name, user.role,
            user.department, user.email, user.created_at, user.last_login,
        ))
        self.conn.commit()
        return True

    def get_user(self, user_id: str) -> Optional[User]:
        """获取用户"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
        row = cursor.fetchone()
        if not row:
            return None
        return User(**dict(row))

    def list_users(self) -> List[User]:
        """列出用户"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM users ORDER BY created_at DESC")
        return [User(**dict(row)) for row in cursor.fetchall()]

    # ========== 用量统计 ==========

    def log_usage(self, log: UsageLog) -> bool:
        """记录用量"""
        if not log.created_at:
            log.created_at = datetime.now().isoformat(timespec="seconds")

        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO usage_logs (
                log_id, user_id, model, tokens_input, tokens_output, tokens_total, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            log.log_id, log.user_id, log.model,
            log.tokens_input, log.tokens_output, log.tokens_total,
            log.created_at,
        ))
        self.conn.commit()
        return True

    def get_user_stats(self, user_id: str) -> UserStats:
        """获取用户统计"""
        cursor = self.conn.cursor()
        now = datetime.now()

        # 最近 5 小时
        five_hours_ago = (now - timedelta(hours=5)).isoformat(timespec="seconds")
        cursor.execute("""
            SELECT COUNT(*), COALESCE(SUM(tokens_total), 0)
            FROM usage_logs
            WHERE user_id = ? AND created_at >= ?
        """, (user_id, five_hours_ago))
        row = cursor.fetchone()
        call_count_5h = row[0]
        tokens_5h = row[1]

        # 今日
        today_start = now.replace(hour=0, minute=0, second=0).isoformat(timespec="seconds")
        cursor.execute("""
            SELECT COUNT(*), COALESCE(SUM(tokens_total), 0)
            FROM usage_logs
            WHERE user_id = ? AND created_at >= ?
        """, (user_id, today_start))
        row = cursor.fetchone()
        call_count_today = row[0]
        tokens_today = row[1]

        # 总计
        cursor.execute("""
            SELECT COUNT(*), COALESCE(SUM(tokens_total), 0)
            FROM usage_logs
            WHERE user_id = ?
        """, (user_id,))
        row = cursor.fetchone()
        call_count_total = row[0]
        tokens_total = row[1]

        return UserStats(
            user_id=user_id,
            call_count_5h=call_count_5h,
            tokens_total_5h=tokens_5h,
            call_count_today=call_count_today,
            tokens_today=tokens_today,
            call_count_total=call_count_total,
            tokens_total=tokens_total,
        )

    def get_all_stats(self) -> List[UserStats]:
        """获取所有用户统计"""
        users = self.list_users()
        return [self.get_user_stats(u.user_id) for u in users]
