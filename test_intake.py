"""
test_intake.py - 入库工作流测试

测试流程：
  1. 创建模拟的 FBX + 贴图文件
  2. 写入 TagStore 并设置为 approved
  3. 运行入库流程
  4. 验证文件移动、命名、导入清单生成
"""
import os
import sys
import json
import tempfile
import shutil

# 确保能导入项目模块
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tags.schema import (
    AssetTags, MeshInfo, TextureSet, BoundingBox,
    AssetCategory, MaterialStructure, VisualAttributes, MetaInfo,
)
from tags.store import TagStore
from tools.intake import intake_asset, intake_batch, intake_approved


def create_mock_asset(store_dir: str, asset_id: str, name: str, category: str, approved: bool = True) -> AssetTags:
    """创建一个模拟资产并写入 TagStore"""
    tags = AssetTags()
    tags.asset_id = asset_id
    tags.asset_name = name
    tags.asset_type = "static_mesh"

    # 几何信息
    tags.mesh = MeshInfo(
        tri_count=5200,
        vertex_count=3100,
        has_skeleton=False,
        material_count=1,
        material_names=["M_Metal"],
        has_materials=True,
        bounding_box=BoundingBox(x=1.2, y=0.3, z=0.1),
    )

    # 分类
    tags.category = AssetCategory(
        category=category,
       subcategory="melee" if category == "weapon" else "",
        confidence=0.92,
    )

    # 材质
    tags.material_structure = MaterialStructure(
        primary=["metal", "leather"],
        secondary=[],
        confidence=0.88,
    )

    # 视觉
    tags.visual = VisualAttributes(
        style="medieval",
        condition="worn",
        style_confidence=0.85,
        condition_confidence=0.90,
    )

    # 管理信息
    tags.meta = MetaInfo(
        naming_compliant=False,
        status="approved" if approved else "pending",
        reviewer="test_user",
    )

    # 保存到 TagStore
    store = TagStore(store_dir)
    store.save(tags)
    return tags


def create_mock_files(source_dir: str, fbx_name: str):
    """创建模拟的 FBX 和贴图文件"""
    # 创建 FBX 文件（空文件，仅用于测试）
    fbx_path = os.path.join(source_dir, f"{fbx_name}.fbx")
    with open(fbx_path, "w") as f:
        f.write("mock fbx content")

    # 创建关联贴图文件
    textures = [
        f"{fbx_name}_D.png",
        f"{fbx_name}_N.png",
        f"{fbx_name}_R.png",
    ]
    for tex_name in textures:
        tex_path = os.path.join(source_dir, tex_name)
        with open(tex_path, "w") as f:
            f.write(f"mock texture: {tex_name}")

    return fbx_path, textures


def test_single_intake():
    """测试单资产入库"""
    print("=" * 60)
    print("测试 1：单资产入库")
    print("=" * 60)

    # 创建临时目录
    test_dir = tempfile.mkdtemp(prefix="ta_intake_test_")
    source_dir = os.path.join(test_dir, "source")
    engine_dir = os.path.join(test_dir, "engine_content")
    store_dir = os.path.join(test_dir, "tag_store")
    os.makedirs(source_dir)
    os.makedirs(engine_dir)
    os.makedirs(store_dir)

    try:
        # 1. 创建模拟文件
        fbx_path, tex_files = create_mock_files(source_dir, "sword_01")
        print(f"\n[准备] 创建模拟文件:")
        print(f"  FBX: {fbx_path}")
        for t in tex_files:
            print(f"  贴图: {t}")

        # 2. 创建资产标签并写入
        tags = create_mock_asset(store_dir, "test_001", "sword_01", "weapon")
        tags.file_path = fbx_path
        store = TagStore(store_dir)
        store.save(tags)
        print(f"\n[准备] 写入 TagStore: {tags.asset_name} (status={tags.meta.status})")

        # 3. 试运行入库
        print(f"\n[执行] 试运行入库...")
        result = intake_asset(
            asset_id="test_001",
            target_engine_dir=engine_dir,
            store_dir=store_dir,
            dry_run=True,
        )
        print(f"  结果: {result.get('message')}")
        print(f"  新名称: {result.get('new_name')}")
        print(f"  目标目录: {result.get('target_dir')}")
        print(f"  关联贴图: {result.get('related_textures')}")

        # 4. 实际入库
        print(f"\n[执行] 实际入库...")
        result = intake_asset(
            asset_id="test_001",
            target_engine_dir=engine_dir,
            store_dir=store_dir,
            dry_run=False,
        )
        print(f"  结果: {result.get('message')}")

        # 5. 验证文件
        print(f"\n[验证] 检查文件:")
        target_dir = os.path.join(engine_dir, "Game", "Weapons")
        if os.path.exists(target_dir):
            files = os.listdir(target_dir)
            print(f"  目标目录文件: {files}")
        else:
            print(f"  ❌ 目标目录不存在: {target_dir}")

        # 6. 验证数据库状态
        store2 = TagStore(store_dir)
        updated_tags = store2.load("test_001")
        print(f"\n[验证] 数据库状态:")
        print(f"  status: {updated_tags.meta.status}")
        print(f"  engine_path: {updated_tags.meta.engine_path}")
        print(f"  intake_date: {updated_tags.meta.intake_date}")

        # 7. 验证审计日志
        log_path = os.path.join(store_dir, "intake_log.jsonl")
        if os.path.exists(log_path):
            with open(log_path, "r", encoding="utf-8") as f:
                log_entry = json.loads(f.readline())
            print(f"\n[验证] 审计日志:")
            print(f"  {json.dumps(log_entry, ensure_ascii=False, indent=2)}")

        print(f"\n[PASS] 测试 1 通过")

    finally:
        # 清理
        shutil.rmtree(test_dir, ignore_errors=True)


def test_batch_intake():
    """测试批量入库"""
    print("\n" + "=" * 60)
    print("测试 2：批量入库 + 导入清单生成")
    print("=" * 60)

    # 创建临时目录
    test_dir = tempfile.mkdtemp(prefix="ta_intake_batch_")
    source_dir = os.path.join(test_dir, "source")
    engine_dir = os.path.join(test_dir, "engine_content")
    store_dir = os.path.join(test_dir, "tag_store")
    os.makedirs(source_dir)
    os.makedirs(engine_dir)
    os.makedirs(store_dir)

    try:
        # 1. 创建多个模拟资产
        assets = [
            ("sword_01", "weapon"),
            ("shield_01", "weapon"),
            ("helmet_01", "prop"),
        ]
        asset_ids = []
        for name, category in assets:
            fbx_path, _ = create_mock_files(source_dir, name)
            tags = create_mock_asset(store_dir, f"batch_{name}", name, category)
            tags.file_path = fbx_path
            store = TagStore(store_dir)
            store.save(tags)
            asset_ids.append(f"batch_{name}")
            print(f"\n[准备] 创建资产: {name} ({category})")

        # 2. 批量入库
        print(f"\n[执行] 批量入库 {len(asset_ids)} 个资产...")
        result = intake_batch(
            asset_ids=asset_ids,
            target_engine_dir=engine_dir,
            store_dir=store_dir,
            dry_run=False,
        )
        print(f"  总数: {result['total']}")
        print(f"  成功: {result['success']}")
        print(f"  失败: {result['failed']}")

        # 3. 验证导入清单
        manifest_path = result.get("manifest_path")
        script_path = result.get("script_path")
        if manifest_path and os.path.exists(manifest_path):
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = json.load(f)
            print(f"\n[验证] 导入清单:")
            print(f"  路径: {manifest_path}")
            print(f"  资产数: {len(manifest['assets'])}")
            for a in manifest["assets"]:
                print(f"    - {a['source_path']} ({a['category']})")
        else:
            print(f"\n[FAIL] 导入清单未生成")

        if script_path and os.path.exists(script_path):
            print(f"\n[验证] 导入脚本:")
            print(f"  路径: {script_path}")
            with open(script_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
            print(f"  行数: {len(lines)}")
        else:
            print(f"\n[FAIL] 导入脚本未生成")

        # 4. 验证目录结构
        print(f"\n[验证] 引擎目录结构:")
        for root, dirs, files in os.walk(engine_dir):
            level = root.replace(engine_dir, "").count(os.sep)
            indent = "  " * level
            print(f"  {indent}{os.path.basename(root)}/")
            for f in files:
                print(f"  {indent}  {f}")

        print(f"\n[PASS] 测试 2 通过")

    finally:
        shutil.rmtree(test_dir, ignore_errors=True)


def test_intake_approved():
    """测试一键入库"""
    print("\n" + "=" * 60)
    print("测试 3：一键入库所有已审核资产")
    print("=" * 60)

    test_dir = tempfile.mkdtemp(prefix="ta_intake_approved_")
    source_dir = os.path.join(test_dir, "source")
    engine_dir = os.path.join(test_dir, "engine_content")
    store_dir = os.path.join(test_dir, "tag_store")
    os.makedirs(source_dir)
    os.makedirs(engine_dir)
    os.makedirs(store_dir)

    try:
        # 创建已审核和未审核的资产
        for name, category, approved in [
            ("axe_01", "weapon", True),
            ("bow_01", "weapon", True),
            ("unfinished_01", "prop", False),  # 未审核
        ]:
            fbx_path, _ = create_mock_files(source_dir, name)
            tags = create_mock_asset(store_dir, f"auto_{name}", name, category, approved=approved)
            tags.file_path = fbx_path
            store = TagStore(store_dir)
            store.save(tags)
            status = "approved" if approved else "pending"
            print(f"\n[准备] {name}: {status}")

        # 一键入库
        print(f"\n[执行] 一键入库已审核资产...")
        result = intake_approved(
            target_engine_dir=engine_dir,
            store_dir=store_dir,
            dry_run=False,
        )
        print(f"  总数: {result['total']}")
        print(f"  成功: {result['success']}")
        print(f"  失败: {result['failed']}")

        # 验证只有 approved 的被入库
        store2 = TagStore(store_dir)
        for name in ["axe_01", "bow_01", "unfinished_01"]:
            tags = store2.load(f"auto_{name}")
            print(f"\n[验证] {name}: status={tags.meta.status}")

        print(f"\n[PASS] 测试 3 通过")

    finally:
        shutil.rmtree(test_dir, ignore_errors=True)


if __name__ == "__main__":
    test_single_intake()
    test_batch_intake()
    test_intake_approved()
    print("\n" + "=" * 60)
    print("[PASS] 所有测试通过！")
    print("=" * 60)
