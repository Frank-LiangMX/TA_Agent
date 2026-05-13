# -*- coding: utf-8 -*-
"""
示例插件：资产统计工具
"""

SCHEMA = {
    "type": "function",
    "function": {
        "name": "count_assets_by_type",
        "description": "Count assets by type in the database. Call when user asks about asset statistics.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
}


def count_assets_by_type() -> dict:
    """统计各类型资产数量"""
    import os
    from tags.store import TagStore

    store_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "tag_store")
    store = TagStore(store_dir)
    all_assets = store.search({})

    counts = {}
    for a in all_assets:
        t = a.asset_type or "unknown"
        counts[t] = counts.get(t, 0) + 1

    return {
        "total": len(all_assets),
        "by_type": counts,
    }
