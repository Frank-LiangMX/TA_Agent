"""
tags/store.py - 标签持久化存储（SQLite 后端）

使用 SQLite 存储资产身份证，支持 4 万+ 资产的快速检索。
每个资产的结构化字段存为独立列（可索引），完整数据以 JSON 存储。

存储结构:
    store_dir/
        tags.db             <- SQLite 数据库（所有资产）
        tags/               <- 旧版 JSON 文件（迁移后可删除）
            {asset_id}.json
"""
from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime
from typing import Optional

from tags.schema import AssetTags


# 搜索字段到数据库列的映射
_SEARCH_COLUMNS = {
    "category": "category",
    "subcategory": "subcategory",
    "style": "style",
    "condition": "asset_condition",
    "min_tri_count": "tri_count",
    "max_tri_count": "tri_count",
    "status": "status",
}


class TagStore:
    """
    资产标签存储（SQLite 后端）

    同时保留 JSON 文件导出能力，方便离线查看。
    """

    def __init__(self, store_dir: str):
        self.store_dir = store_dir
        self.db_path = os.path.join(store_dir, "tags.db")
        self.tags_dir = os.path.join(store_dir, "tags")  # 保留用于导出
        self._conn: Optional[sqlite3.Connection] = None

    def _get_conn(self) -> sqlite3.Connection:
        if self._conn is None:
            os.makedirs(self.store_dir, exist_ok=True)
            self._conn = sqlite3.connect(self.db_path)
            self._conn.row_factory = sqlite3.Row
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA synchronous=NORMAL")
            self._ensure_schema()
        return self._conn

    def _ensure_schema(self):
        conn = self._get_conn()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS assets (
                asset_id       TEXT PRIMARY KEY,
                asset_name     TEXT NOT NULL DEFAULT '',
                file_path      TEXT NOT NULL DEFAULT '',
                asset_type     TEXT NOT NULL DEFAULT '',
                -- 结构化字段（可索引、可搜索）
                category       TEXT NOT NULL DEFAULT '',
                subcategory    TEXT NOT NULL DEFAULT '',
                style          TEXT NOT NULL DEFAULT '',
                asset_condition TEXT NOT NULL DEFAULT '',
                tri_count      INTEGER NOT NULL DEFAULT 0,
                material_count INTEGER NOT NULL DEFAULT 0,
                has_materials  INTEGER NOT NULL DEFAULT 1,
                status         TEXT NOT NULL DEFAULT 'pending',
                -- 时间戳
                analyzed_at    TEXT NOT NULL DEFAULT '',
                -- 完整标签数据（JSON）
                full_data      TEXT NOT NULL DEFAULT '{}'
            );
            CREATE INDEX IF NOT EXISTS idx_category ON assets(category);
            CREATE INDEX IF NOT EXISTS idx_subcategory ON assets(subcategory);
            CREATE INDEX IF NOT EXISTS idx_style ON assets(style);
            CREATE INDEX IF NOT EXISTS idx_condition ON assets(asset_condition);
            CREATE INDEX IF NOT EXISTS idx_tri_count ON assets(tri_count);
            CREATE INDEX IF NOT EXISTS idx_status ON assets(status);
        """)
        # 迁移：给老数据库加 analyzed_at 列
        try:
            conn.execute("ALTER TABLE assets ADD COLUMN analyzed_at TEXT NOT NULL DEFAULT ''")
            conn.commit()
        except sqlite3.OperationalError:
            pass  # 列已存在
        # 迁移：给老数据库加 asset_type 列
        try:
            conn.execute("ALTER TABLE assets ADD COLUMN asset_type TEXT NOT NULL DEFAULT ''")
            conn.commit()
        except sqlite3.OperationalError:
            pass  # 列已存在

    def save(self, tags: AssetTags) -> str:
        """
        保存一张资产身份证。

        返回:
            asset_id
        """
        conn = self._get_conn()
        full_data = tags.to_json()
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        conn.execute(
            """
            INSERT OR REPLACE INTO assets
                (asset_id, asset_name, file_path, asset_type,
                 category, subcategory, style, asset_condition,
                 tri_count, material_count, has_materials,
                 status, analyzed_at, full_data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                tags.asset_id,
                tags.asset_name,
                tags.file_path,
                tags.asset_type,
                tags.category.category,
                tags.category.subcategory,
                tags.visual.style,
                tags.visual.condition,
                tags.mesh.tri_count,
                tags.mesh.material_count,
                1 if tags.mesh.has_materials else 0,
                tags.meta.status,
                now,
                full_data,
            ),
        )
        conn.commit()
        return tags.asset_id

    def load(self, asset_id: str) -> Optional[AssetTags]:
        """
        按 asset_id 加载一张资产身份证。

        返回:
            AssetTags 或 None
        """
        conn = self._get_conn()
        row = conn.execute(
            "SELECT full_data FROM assets WHERE asset_id = ?", (asset_id,)
        ).fetchone()
        if row is None:
            return None
        return AssetTags.from_dict(json.loads(row["full_data"]))

    def search(self, query: dict) -> list[AssetTags]:
        """
        按条件搜索资产标签。

        query 支持的字段：
            category: str       - 资产大类
            subcategory: str    - 资产子类
            style: str          - 视觉风格
            condition: str      - 状态
            min_tri_count: int  - 最小面数
            max_tri_count: int  - 最大面数
            status: str         - 审核状态

        返回:
            匹配的 AssetTags 列表
        """
        conn = self._get_conn()
        conditions = []
        params = []

        if "category" in query:
            conditions.append("category = ?")
            params.append(query["category"])
        if "subcategory" in query:
            conditions.append("subcategory = ?")
            params.append(query["subcategory"])
        if "style" in query:
            conditions.append("style = ?")
            params.append(query["style"])
        if "condition" in query:
            conditions.append("asset_condition = ?")
            params.append(query["condition"])
        if "min_tri_count" in query:
            conditions.append("tri_count >= ?")
            params.append(query["min_tri_count"])
        if "max_tri_count" in query:
            conditions.append("tri_count <= ?")
            params.append(query["max_tri_count"])
        if "status" in query:
            conditions.append("status = ?")
            params.append(query["status"])

        if conditions:
            sql = "SELECT full_data FROM assets WHERE " + " AND ".join(conditions)
        else:
            sql = "SELECT full_data FROM assets"

        rows = conn.execute(sql, params).fetchall()
        return [AssetTags.from_dict(json.loads(row["full_data"])) for row in rows]

    def list_all(self) -> list[dict]:
        """
        列出所有已存储的资产索引。

        返回:
            索引列表
        """
        conn = self._get_conn()
        rows = conn.execute(
            """SELECT asset_id, asset_name, file_path, asset_type,
                      category, subcategory, tri_count, status, analyzed_at
               FROM assets"""
        ).fetchall()
        return [
            {
                "asset_id": row["asset_id"],
                "asset_name": row["asset_name"],
                "file_path": row["file_path"],
                "asset_type": row["asset_type"],
                "category": row["category"],
                "subcategory": row["subcategory"],
                "tri_count": row["tri_count"],
                "status": row["status"],
                "analyzed_at": row["analyzed_at"],
            }
            for row in rows
        ]

    def count(self) -> int:
        """返回已存储的资产总数"""
        conn = self._get_conn()
        row = conn.execute("SELECT COUNT(*) as cnt FROM assets").fetchone()
        return row["cnt"]

    def update_status(self, asset_id: str, status: str, reviewer: str = "") -> bool:
        """
        更新资产审核状态。

        参数:
            asset_id: 资产 ID
            status: 新状态（pending / approved / rejected）
            reviewer: 审核人

        返回:
            是否更新成功
        """
        tags = self.load(asset_id)
        if tags is None:
            return False

        tags.meta.status = status
        if reviewer:
            tags.meta.reviewer = reviewer

        self.save(tags)
        return True

    def delete(self, asset_id: str) -> bool:
        """
        删除一张资产身份证。

        返回:
            是否删除成功
        """
        conn = self._get_conn()
        cursor = conn.execute("DELETE FROM assets WHERE asset_id = ?", (asset_id,))
        conn.commit()
        return cursor.rowcount > 0

    def close(self):
        """关闭数据库连接"""
        if self._conn:
            self._conn.close()
            self._conn = None

    def __del__(self):
        self.close()

    # ============================================================
    # 迁移工具：从旧版 JSON 文件迁移到 SQLite
    # ============================================================

    def migrate_from_json(self, json_store_dir: str) -> int:
        """
        从旧版 JSON 文件存储迁移到 SQLite。

        参数:
            json_store_dir: 旧版 store_dir 路径（包含 index.json 和 tags/ 目录）

        返回:
            成功迁移的资产数量
        """
        json_tags_dir = os.path.join(json_store_dir, "tags")
        if not os.path.isdir(json_tags_dir):
            return 0

        migrated = 0
        conn = self._get_conn()

        for filename in os.listdir(json_tags_dir):
            if not filename.endswith(".json"):
                continue
            filepath = os.path.join(json_tags_dir, filename)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                tags = AssetTags.from_dict(data)

                conn.execute(
                    """
                    INSERT OR REPLACE INTO assets
                        (asset_id, asset_name, file_path, asset_type,
                         category, subcategory, style, asset_condition,
                         tri_count, material_count, has_materials,
                         status, analyzed_at, full_data)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        tags.asset_id,
                        tags.asset_name,
                        tags.file_path,
                        tags.asset_type,
                        tags.category.category,
                        tags.category.subcategory,
                        tags.visual.style,
                        tags.visual.condition,
                        tags.mesh.tri_count,
                        tags.mesh.material_count,
                        1 if tags.mesh.has_materials else 0,
                        tags.meta.status,
                        tags.meta.intake_date or datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        tags.to_json(),
                    ),
                )
                migrated += 1
            except Exception as e:
                print(f"  跳过 {filename}: {e}")

        conn.commit()
        return migrated
