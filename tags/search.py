"""
tags/search.py - 语义化资源检索

将用户的自然语言查询转换为结构化搜索条件，
在 SQLite 标签库中检索并按匹配度排序返回结果。

工作流程:
  用户自然语言 → LLM 解析 → 结构化 SearchQuery → 评分引擎 → 排序结果
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Optional

from openai import OpenAI
from config import get_llm_config

from tags.schema import AssetTags


# ========== 数据结构 ==========

@dataclass
class SearchQuery:
    """结构化搜索条件（由 LLM 从自然语言解析生成）"""
    category: str = ""            # 资产大类: building / character / weapon / ...
    subcategory: str = ""         # 子类: commercial / residential / ...
    style: str = ""               # 风格: modern / ancient / cyberpunk / ...
    condition: str = ""           # 状态: new / worn / broken / ...
    materials: list[str] = field(default_factory=list)  # 材质关键词: glass, concrete, ...
    color_palette: list[str] = field(default_factory=list)  # 色调: cold, warm, ...
    min_tri_count: int = 0        # 最小面数
    max_tri_count: int = 0        # 最大面数（0=不限）
    size_class: str = ""          # 尺寸: small / medium / large
    keywords: list[str] = field(default_factory=list)  # 其他关键词
    description_keywords: list[str] = field(default_factory=list)  # 描述文本关键词

    def to_dict(self) -> dict:
        return {
            "category": self.category,
            "subcategory": self.subcategory,
            "style": self.style,
            "condition": self.condition,
            "materials": self.materials,
            "color_palette": self.color_palette,
            "min_tri_count": self.min_tri_count,
            "max_tri_count": self.max_tri_count,
            "size_class": self.size_class,
            "keywords": self.keywords,
            "description_keywords": self.description_keywords,
        }


@dataclass
class SearchResult:
    """单条搜索结果"""
    asset: AssetTags
    score: float          # 匹配度 0-100
    matched_fields: list[str]  # 命中的字段列表

    def to_dict(self) -> dict:
        return {
            "asset_id": self.asset.asset_id,
            "asset_name": self.asset.asset_name,
            "file_path": self.asset.file_path,
            "score": round(self.score, 1),
            "matched_fields": self.matched_fields,
            "category": self.asset.category.category,
            "subcategory": self.asset.category.subcategory,
            "style": self.asset.visual.style,
            "condition": self.asset.visual.condition,
            "materials": self.asset.material_structure.primary,
            "tri_count": self.asset.mesh.tri_count,
        }


# ========== LLM 查询解析 ==========

QUERY_PARSE_PROMPT = """你是一个游戏资产检索助手。将用户的自然语言查询解析为结构化搜索条件。

## 可用的搜索维度

| 字段 | 含义 | 可选值示例 |
|---|---|---|
| category | 资产大类 | building, character, weapon, vehicle, prop, environment, nature |
| subcategory | 子类 | commercial, residential, industrial, landmark, humanoid, melee |
| style | 风格 | modern, ancient, cyberpunk, realistic, cartoon, sci-fi, medieval |
| condition | 状态 | new, slightly_worn, heavily_worn, broken, rusted |
| materials | 材质关键词列表 | concrete, glass, metal, wood, stone, plastic, fabric |
| color_palette | 色调列表 | cold_gray, warm_brown, dark, bright, earthy |
| min_tri_count | 最小面数 | 整数 |
| max_tri_count | 最大面数 | 整数 |
| size_class | 尺寸 | small, medium, large |
| keywords | 其他关键词 | 任何有助于筛选的词 |
| description_keywords | 描述文本关键词 | 用于匹配资产描述文本 |

## 用户查询

{query}

## 输出格式

返回一个 JSON 对象，只包含用户明确提到或可合理推断的字段，未提及的字段留空：

```json
{{
  "category": "",
  "subcategory": "",
  "style": "",
  "condition": "",
  "materials": [],
  "color_palette": [],
  "min_tri_count": 0,
  "max_tri_count": 0,
  "size_class": "",
  "keywords": [],
  "description_keywords": []
}}
```

只输出 JSON，不要其他内容。"""


class QueryParser:
    """将自然语言查询解析为结构化 SearchQuery"""

    def __init__(self):
        config = get_llm_config()
        self.client = OpenAI(
            base_url=config["base_url"],
            api_key=config["api_key"],
        )
        self.model = config["model"]

    def parse(self, query: str) -> SearchQuery:
        """
        解析自然语言查询为结构化 SearchQuery。

        参数:
            query: 用户的自然语言查询，如"我需要一个现代都市风格的商业建筑"

        返回:
            SearchQuery 结构化搜索条件
        """
        prompt = QUERY_PARSE_PROMPT.format(query=query)

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=500,
        )

        content = response.choices[0].message.content.strip()

        # 提取 JSON（兼容 markdown 代码块）
        if "```" in content:
            start = content.find("{")
            end = content.rfind("}") + 1
            if start != -1 and end > start:
                content = content[start:end]

        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            # 解析失败，返回空查询
            return SearchQuery()

        return SearchQuery(
            category=data.get("category", ""),
            subcategory=data.get("subcategory", ""),
            style=data.get("style", ""),
            condition=data.get("condition", ""),
            materials=data.get("materials", []),
            color_palette=data.get("color_palette", []),
            min_tri_count=data.get("min_tri_count", 0),
            max_tri_count=data.get("max_tri_count", 0),
            size_class=data.get("size_class", ""),
            keywords=data.get("keywords", []),
            description_keywords=data.get("description_keywords", []),
        )


# ========== 评分引擎 ==========

# 字段权重配置
FIELD_WEIGHTS = {
    "category": 30,
    "subcategory": 15,
    "style": 20,
    "condition": 10,
    "materials": 15,
    "color_palette": 5,
    "size_class": 5,
}


def _score_field(query_val: str, asset_val: str, weight: float) -> tuple[float, bool]:
    """对单个字符串字段评分。返回 (得分, 是否命中)"""
    if not query_val or not asset_val:
        return 0.0, False
    q = query_val.lower().strip()
    a = asset_val.lower().strip()
    if q == a:
        return weight, True
    if q in a or a in q:
        return weight * 0.8, True
    return 0.0, False


def _score_list_field(query_vals: list[str], asset_vals: list[str], weight: float) -> tuple[float, bool]:
    """对列表字段评分。返回 (得分, 是否命中)"""
    if not query_vals or not asset_vals:
        return 0.0, False
    asset_lower = [v.lower().strip() for v in asset_vals]
    hits = 0
    for qv in query_vals:
        q = qv.lower().strip()
        for a in asset_lower:
            if q == a or q in a or a in q:
                hits += 1
                break
    if hits == 0:
        return 0.0, False
    ratio = hits / len(query_vals)
    return weight * ratio, True


def _score_tri_count(min_tri: int, max_tri: int, asset_tri: int) -> tuple[float, bool]:
    """对面数范围评分"""
    if min_tri == 0 and max_tri == 0:
        return 0.0, False
    if min_tri > 0 and asset_tri < min_tri:
        return 0.0, False
    if max_tri > 0 and asset_tri > max_tri:
        return 0.0, False
    return 5.0, True  # 面数范围命中给固定分


def _size_class_from_tri(tri_count: int) -> str:
    """根据面数推断尺寸类别"""
    if tri_count < 3000:
        return "small"
    elif tri_count < 15000:
        return "medium"
    else:
        return "large"


def score_asset(query: SearchQuery, asset: AssetTags) -> SearchResult:
    """
    对单个资产进行评分。

    参数:
        query: 结构化搜索条件
        asset: 资产标签

    返回:
        SearchResult 包含分数和命中字段
    """
    total_score = 0.0
    max_possible = 0.0
    matched = []

    # 字符串字段
    for field_name in ["category", "subcategory", "style", "condition"]:
        query_val = getattr(query, field_name, "")
        if not query_val:
            continue
        weight = FIELD_WEIGHTS.get(field_name, 10)
        max_possible += weight

        if field_name == "category":
            asset_val = asset.category.category
        elif field_name == "subcategory":
            asset_val = asset.category.subcategory
        elif field_name == "style":
            asset_val = asset.visual.style
        elif field_name == "condition":
            asset_val = asset.visual.condition
        else:
            asset_val = ""

        score, hit = _score_field(query_val, asset_val, weight)
        if hit:
            total_score += score
            matched.append(field_name)

    # 列表字段
    for field_name in ["materials", "color_palette"]:
        query_vals = getattr(query, field_name, [])
        if not query_vals:
            continue
        weight = FIELD_WEIGHTS.get(field_name, 10)
        max_possible += weight

        if field_name == "materials":
            asset_vals = asset.material_structure.primary + asset.material_structure.secondary
        elif field_name == "color_palette":
            asset_vals = asset.visual.color_palette
        else:
            asset_vals = []

        score, hit = _score_list_field(query_vals, asset_vals, weight)
        if hit:
            total_score += score
            matched.append(field_name)

    # 尺寸
    if query.size_class:
        max_possible += FIELD_WEIGHTS["size_class"]
        asset_size = _size_class_from_tri(asset.mesh.tri_count)
        if query.size_class.lower() == asset_size:
            total_score += FIELD_WEIGHTS["size_class"]
            matched.append("size_class")

    # 面数范围
    if query.min_tri_count > 0 or query.max_tri_count > 0:
        max_possible += 5
        s, hit = _score_tri_count(query.min_tri_count, query.max_tri_count, asset.mesh.tri_count)
        if hit:
            total_score += s
            matched.append("tri_count")

    # 描述关键词
    if query.description_keywords:
        max_possible += 10
        desc = asset.visual.description.lower()
        hits = sum(1 for kw in query.description_keywords if kw.lower() in desc)
        if hits > 0:
            total_score += 10 * (hits / len(query.description_keywords))
            matched.append("description")

    # 通用关键词（搜索多个字段）
    if query.keywords:
        max_possible += 10
        searchable = " ".join([
            asset.asset_name.lower(),
            asset.category.category.lower(),
            asset.category.subcategory.lower(),
            asset.visual.style.lower(),
            asset.visual.description.lower(),
            " ".join(asset.material_structure.primary).lower(),
            " ".join(asset.material_structure.secondary).lower(),
        ])
        hits = sum(1 for kw in query.keywords if kw.lower() in searchable)
        if hits > 0:
            total_score += 10 * (hits / len(query.keywords))
            matched.append("keywords")

    # 计算最终百分比
    if max_possible > 0:
        score_pct = min(100.0, (total_score / max_possible) * 100)
    else:
        score_pct = 0.0

    return SearchResult(asset=asset, score=score_pct, matched_fields=matched)


# ========== 搜索引擎 ==========

class SearchEngine:
    """
    语义化资源检索引擎。

    使用方式:
        engine = SearchEngine(store)
        results = engine.search("我需要一个现代都市风格的商业建筑")
        for r in results:
            print(f"{r.asset.asset_name}: {r.score}%")
    """

    def __init__(self, store):
        """
        参数:
            store: TagStore 实例
        """
        self.store = store
        self.parser = QueryParser()

    def search(self, query: str, top_k: int = 10, min_score: float = 20.0) -> list[SearchResult]:
        """
        自然语言搜索资产。

        参数:
            query: 用户的自然语言查询
            top_k: 返回前 N 个结果
            min_score: 最低匹配度阈值（0-100）

        返回:
            按匹配度排序的 SearchResult 列表
        """
        # 1. LLM 解析查询
        search_query = self.parser.parse(query)

        # 2. 获取候选集（用结构化条件预过滤）
        candidates = self._get_candidates(search_query)

        # 3. 评分
        results = []
        for asset in candidates:
            result = score_asset(search_query, asset)
            if result.score >= min_score:
                results.append(result)

        # 4. 排序
        results.sort(key=lambda r: r.score, reverse=True)
        return results[:top_k]

    def search_structured(self, query: SearchQuery, top_k: int = 10, min_score: float = 20.0) -> list[SearchResult]:
        """
        结构化搜索（跳过 LLM 解析，直接用 SearchQuery）。

        参数:
            query: 结构化搜索条件
            top_k: 返回前 N 个结果
            min_score: 最低匹配度阈值

        返回:
            按匹配度排序的 SearchResult 列表
        """
        candidates = self._get_candidates(query)
        results = []
        for asset in candidates:
            result = score_asset(query, asset)
            if result.score >= min_score:
                results.append(result)
        results.sort(key=lambda r: r.score, reverse=True)
        return results[:top_k]

    def _get_candidates(self, query: SearchQuery) -> list[AssetTags]:
        """
        用结构化条件从 SQLite 预过滤候选集。
        先用精确条件缩小范围，再评分排序。
        """
        # 构建预过滤条件
        filters = {}
        if query.category:
            filters["category"] = query.category
        if query.subcategory:
            filters["subcategory"] = query.subcategory
        if query.style:
            filters["style"] = query.style
        if query.condition:
            filters["condition"] = query.condition

        # 用 store 的 search 方法预过滤
        if filters:
            candidates = self.store.search(filters)
        else:
            # 没有精确条件时，获取全部
            candidates = self.store.search({})

        return candidates
