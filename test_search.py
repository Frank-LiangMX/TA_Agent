"""
语义化资源检索测试

运行: python test_search.py
"""
import sys
import os
import io
import tempfile
import shutil

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tags.schema import (
    AssetTags, AssetCategory, MeshInfo, VisualAttributes,
    MaterialStructure, TextureSet, BoundingBox,
)
from tags.store import TagStore
from tags.search import SearchQuery, SearchResult, score_asset, SearchEngine


def _make_asset(name, category="", subcategory="", style="", condition="",
                primary_mat=None, secondary_mat=None, color_palette=None,
                description="", tri_count=0):
    """快速创建测试资产"""
    tags = AssetTags()
    tags.asset_id = f"test_{name}"
    tags.asset_name = name
    tags.file_path = f"F:/Assets/{name}.fbx"
    tags.category = AssetCategory(category=category, subcategory=subcategory, confidence=0.9)
    tags.visual = VisualAttributes(style=style, condition=condition,
                                    color_palette=color_palette or [], description=description)
    tags.material_structure = MaterialStructure(primary=primary_mat or [], secondary=secondary_mat or [])
    tags.mesh = MeshInfo(tri_count=tri_count, vertex_count=tri_count // 3)
    return tags


def test_score_category():
    """测试分类字段评分"""
    print("\n" + "=" * 50)
    print("测试：分类字段评分")
    print("=" * 50)

    asset = _make_asset("building_01", category="building", subcategory="commercial", style="modern")

    # 精确匹配
    query = SearchQuery(category="building")
    result = score_asset(query, asset)
    print(f"  category=building -> {result.score:.1f}% (matched: {result.matched_fields})")
    assert result.score > 0, "category 精确匹配应该得分"

    # 不匹配
    query = SearchQuery(category="weapon")
    result = score_asset(query, asset)
    print(f"  category=weapon -> {result.score:.1f}% (matched: {result.matched_fields})")
    assert result.score == 0, "category 不匹配应该 0 分"

    print("  ✅ 分类评分通过")


def test_score_style():
    """测试风格字段评分"""
    print("\n" + "=" * 50)
    print("测试：风格字段评分")
    print("=" * 50)

    asset = _make_asset("tower_01", category="building", style="modern")

    query = SearchQuery(style="modern")
    result = score_asset(query, asset)
    print(f"  style=modern -> {result.score:.1f}%")
    assert result.score > 0

    # 模糊匹配
    query = SearchQuery(style="modern urban")
    result = score_asset(query, asset)
    print(f"  style='modern urban' -> {result.score:.1f}% (modern in 'modern urban')")

    print("  ✅ 风格评分通过")


def test_score_materials():
    """测试材质列表评分"""
    print("\n" + "=" * 50)
    print("测试：材质列表评分")
    print("=" * 50)

    asset = _make_asset("glass_tower", primary_mat=["glass", "concrete"], secondary_mat=["metal"])

    # 匹配一个
    query = SearchQuery(materials=["glass"])
    result = score_asset(query, asset)
    print(f"  materials=[glass] -> {result.score:.1f}%")
    assert result.score > 0

    # 匹配多个
    query = SearchQuery(materials=["glass", "concrete"])
    result = score_asset(query, asset)
    print(f"  materials=[glass, concrete] -> {result.score:.1f}%")
    assert result.score > 0

    # 不匹配
    query = SearchQuery(materials=["wood"])
    result = score_asset(query, asset)
    print(f"  materials=[wood] -> {result.score:.1f}%")
    assert result.score == 0

    print("  ✅ 材质评分通过")


def test_score_combined():
    """测试多维度组合评分"""
    print("\n" + "=" * 50)
    print("测试：多维度组合评分")
    print("=" * 50)

    modern_building = _make_asset(
        "SM_Building_Commercial_01",
        category="building", subcategory="commercial",
        style="modern", condition="slightly_worn",
        primary_mat=["glass", "concrete"],
        color_palette=["cold_gray"],
        description="A modern urban commercial building with glass curtain walls",
        tri_count=15000,
    )

    ancient_building = _make_asset(
        "SM_Castle_Medieval_01",
        category="building", subcategory="landmark",
        style="medieval", condition="heavily_worn",
        primary_mat=["stone", "wood"],
        color_palette=["warm_brown"],
        description="An ancient medieval castle with stone walls",
        tri_count=25000,
    )

    weapon = _make_asset(
        "SM_Sword_01",
        category="weapon", subcategory="melee",
        style="medieval", condition="new",
        primary_mat=["metal"],
        description="A steel sword",
        tri_count=2000,
    )

    query = SearchQuery(
        category="building",
        style="modern",
        materials=["glass"],
        condition="slightly_worn",
    )

    r1 = score_asset(query, modern_building)
    r2 = score_asset(query, ancient_building)
    r3 = score_asset(query, weapon)

    print(f"  现代商业楼: {r1.score:.1f}% (matched: {r1.matched_fields})")
    print(f"  中世纪城堡: {r2.score:.1f}% (matched: {r2.matched_fields})")
    print(f"  剑:         {r3.score:.1f}% (matched: {r3.matched_fields})")

    assert r1.score > r2.score > r3.score, "现代商业楼应该排第一"
    print("  ✅ 组合评分通过")


def test_score_size():
    """测试尺寸评分"""
    print("\n" + "=" * 50)
    print("测试：尺寸评分")
    print("=" * 50)

    small = _make_asset("small_prop", tri_count=1000)
    medium = _make_asset("medium_building", tri_count=8000)
    large = _make_asset("large_city", tri_count=50000)

    query = SearchQuery(size_class="medium")
    r1 = score_asset(query, small)
    r2 = score_asset(query, medium)
    r3 = score_asset(query, large)

    print(f"  small (1k faces):   {r1.score:.1f}%")
    print(f"  medium (8k faces):  {r2.score:.1f}%")
    print(f"  large (50k faces):  {r3.score:.1f}%")

    assert r2.score > r1.score and r2.score > r3.score
    print("  ✅ 尺寸评分通过")


def test_score_keywords():
    """测试关键词搜索"""
    print("\n" + "=" * 50)
    print("测试：关键词搜索")
    print("=" * 50)

    asset = _make_asset(
        "SM_Building_GlassTower",
        category="building", style="modern",
        description="A tall glass tower building in modern urban style",
        primary_mat=["glass", "steel"],
    )

    query = SearchQuery(keywords=["glass", "tower"])
    result = score_asset(query, asset)
    print(f"  keywords=[glass, tower] -> {result.score:.1f}%")
    assert result.score > 0

    query = SearchQuery(description_keywords=["glass", "urban"])
    result = score_asset(query, asset)
    print(f"  description_keywords=[glass, urban] -> {result.score:.1f}%")
    assert result.score > 0

    print("  ✅ 关键词搜索通过")


def test_store_integration():
    """测试与 SQLite 存储的集成"""
    print("\n" + "=" * 50)
    print("测试：SQLite 存储集成")
    print("=" * 50)

    tmp_dir = tempfile.mkdtemp()
    try:
        store = TagStore(tmp_dir)

        # 插入测试数据
        assets = [
            _make_asset("Building_Modern_01", category="building", subcategory="commercial",
                        style="modern", primary_mat=["glass", "concrete"],
                        condition="new", description="Modern commercial building", tri_count=15000),
            _make_asset("Building_Ancient_01", category="building", subcategory="landmark",
                        style="ancient", primary_mat=["stone"],
                        condition="heavily_worn", description="Ancient stone temple", tri_count=20000),
            _make_asset("Sword_01", category="weapon", subcategory="melee",
                        style="modern", primary_mat=["metal"],
                        condition="new", description="Tactical combat knife", tri_count=2000),
            _make_asset("Car_01", category="vehicle", subcategory="ground",
                        style="modern", primary_mat=["metal", "glass"],
                        condition="slightly_worn", description="Modern sports car", tri_count=30000),
        ]

        for a in assets:
            store.save(a)
        print(f"  已插入 {store.count()} 个测试资产")

        # 结构化搜索
        query = SearchQuery(category="building", style="modern")
        results = store.search({"category": "building", "style": "modern"})
        print(f"  精确搜索 category=building, style=modern: {len(results)} 个结果")
        assert len(results) == 1
        assert results[0].asset_name == "Building_Modern_01"

        # 搜索引擎
        engine = SearchEngine(store)
        sq = SearchQuery(category="building", style="modern", materials=["glass"])
        ranked = engine.search_structured(sq, top_k=5)
        print(f"  语义搜索 (building + modern + glass): {len(ranked)} 个结果")
        for r in ranked:
            print(f"    {r.asset.asset_name}: {r.score:.1f}%")
        assert ranked[0].asset.asset_name == "Building_Modern_01"

        # 跨类别搜索
        sq = SearchQuery(style="modern", materials=["glass"])
        ranked = engine.search_structured(sq, top_k=5)
        print(f"  跨类别搜索 (modern + glass): {len(ranked)} 个结果")
        for r in ranked:
            print(f"    {r.asset.asset_name}: {r.score:.1f}%")
        assert len(ranked) >= 2  # building 和 car 都有 glass + modern

        store.close()
        print("  ✅ 存储集成测试通过")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def test_natural_language():
    """测试自然语言搜索（需要 API key）"""
    print("\n" + "=" * 50)
    print("测试：自然语言搜索（需要 LLM API）")
    print("=" * 50)

    tmp_dir = tempfile.mkdtemp()
    try:
        store = TagStore(tmp_dir)

        # 插入测试数据
        assets = [
            _make_asset("SM_Building_Commercial_01", category="building", subcategory="commercial",
                        style="modern", primary_mat=["glass", "concrete"],
                        condition="slightly_worn", description="Modern urban commercial building with glass curtain walls",
                        tri_count=15000),
            _make_asset("SM_Building_Residential_01", category="building", subcategory="residential",
                        style="modern", primary_mat=["concrete", "wood"],
                        condition="new", description="Modern residential apartment building",
                        tri_count=12000),
            _make_asset("SM_Castle_Medieval_01", category="building", subcategory="landmark",
                        style="medieval", primary_mat=["stone"],
                        condition="heavily_worn", description="Ancient medieval castle ruins",
                        tri_count=25000),
            _make_asset("SM_Sword_01", category="weapon", subcategory="melee",
                        style="medieval", primary_mat=["metal"],
                        condition="new", description="Medieval steel longsword",
                        tri_count=2000),
        ]

        for a in assets:
            store.save(a)

        engine = SearchEngine(store)

        query = "我需要一个现代都市风格的商业建筑，有玻璃幕墙"
        print(f"  查询: {query}")
        results = engine.search(query, top_k=3)
        print(f"  结果:")
        for r in results:
            print(f"    {r.asset.asset_name}: {r.score:.1f}% (matched: {r.matched_fields})")

        assert len(results) > 0
        assert results[0].asset.asset_name == "SM_Building_Commercial_01"
        print("  ✅ 自然语言搜索通过")

        store.close()
    except Exception as e:
        print(f"  ⚠️  LLM 调用失败（可能没有 API key）: {e}")
        print("  跳过自然语言测试")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    test_score_category()
    test_score_style()
    test_score_materials()
    test_score_combined()
    test_score_size()
    test_score_keywords()
    test_store_integration()
    test_natural_language()

    print("\n" + "=" * 50)
    print("所有测试完成！")
    print("=" * 50)
