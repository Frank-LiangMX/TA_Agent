"""
工具测试脚本 - 不需要 API Key，直接测试工具函数
运行: python test_tools.py
"""
import json
import sys
import os
import io

# Windows 终端 UTF-8 支持
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# 添加当前目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tools.naming import check_naming, suggest_naming
from tools.directory import check_directory_structure
from tools.file_info import check_file_info, scan_directory
from tools.mesh import check_mesh_budget
from tools.mesh_fbx import check_fbx_info
from tools.texture import check_texture_info, check_texture_batch
from tools.report import generate_report


def test_check_naming():
    print("\n" + "=" * 50)
    print("测试：命名规范检查")
    print("=" * 50)

    test_cases = [
        "SM_WoodenTable_01.fbx",
        "SK_Hero_Main.fbx",
        "wooden_table.fbx",
        "SM_woodenTable_01.fbx",
        "SM_Wooden@Table_01.fbx",
        "T_Diffuse_01.png",
        "BP_Door_01",
    ]

    for name in test_cases:
        result = check_naming(name)
        status = "✅" if result["is_valid"] else "❌"
        print(f"\n{status} {name}")
        if result["prefix"]:
            print(f"   前缀: {result['prefix']} ({result['prefix_meaning']})")
        if result["issues"]:
            for issue in result["issues"]:
                print(f"   ⚠️  {issue}")


def test_check_directory():
    print("\n" + "=" * 50)
    print("测试：目录结构检查")
    print("=" * 50)

    test_cases = [
        ("/Game/Characters/Hero/SK_Hero_Main.fbx", "character"),
        ("/Game/Environment/Architecture/SM_House_01.fbx", "building"),
        ("/Game/Import/random_model.fbx", "prop"),
        ("/Game/Weapons/SW_Sword_01.fbx", "weapon"),
    ]

    for path, asset_type in test_cases:
        result = check_directory_structure(path, asset_type)
        status = "✅" if result["is_in_correct_directory"] else "❌"
        print(f"\n{status} [{asset_type}] {path}")
        if result["suggestion"]:
            print(f"   ⚠️  {result['suggestion']}")


def test_check_file_info():
    print("\n" + "=" * 50)
    print("测试：文件信息检查")
    print("=" * 50)

    test_files = [
        __file__,
        "C:\\nonexistent\\file.fbx",
    ]

    for path in test_files:
        result = check_file_info(path)
        print(f"\n文件: {path}")
        if result["exists"]:
            print(f"   类型: {result['category']}")
            print(f"   大小: {result['size_mb']} MB")
        else:
            print(f"   ❌ {result.get('error', '文件不存在')}")


def test_scan_directory():
    print("\n" + "=" * 50)
    print("测试：目录扫描（含命名验证）")
    print("=" * 50)

    current_dir = os.path.dirname(os.path.abspath(__file__))
    result = scan_directory(current_dir, recursive=False)
    print(f"\n扫描目录: {current_dir}")
    print(f"找到资产文件: {result['total_files']} 个")
    print(f"命名问题: {result['naming_issues_count']} 个")

    if result.get("extension_stats"):
        print("\n扩展名统计:")
        for ext, stats in result["extension_stats"].items():
            print(f"   {ext}: {stats['count']} 个, {stats['total_mb']} MB")

    if result.get("naming_issues"):
        print("\n命名问题详情:")
        for issue in result["naming_issues"][:5]:
            print(f"   ❌ {issue['filename']}")
            for i in issue["issues"]:
                print(f"      ⚠️  {i}")


def test_suggest_naming():
    print("\n" + "=" * 50)
    print("测试：命名建议")
    print("=" * 50)

    test_cases = [
        ("static_mesh", "木制桌子"),
        ("skeletal_mesh", "主角模型"),
        ("material", "角色主材质"),
        ("texture", "漫反射贴图"),
        ("blueprint", "可交互门"),
    ]

    for asset_type, desc in test_cases:
        result = suggest_naming(asset_type, desc)
        print(f"\n[{asset_type}] {desc}")
        print(f"   建议命名: {result['suggested_name']}")
        print(f"   备选: {', '.join(result['alternatives'])}")


def test_check_mesh_budget():
    print("\n" + "=" * 50)
    print("测试：面数预算检查")
    print("=" * 50)

    test_cases = [
        (25000, "character"),
        (35000, "character"),
        (50000, "character"),
        (3000,  "prop"),
        (8000,  "prop"),
    ]

    for face_count, asset_type in test_cases:
        result = check_mesh_budget(face_count, asset_type)
        status_icon = {"pass": "✅", "warning": "⚠️", "fail": "❌"}[result["status"]]
        print(f"\n{status_icon} [{asset_type}] {face_count:,} 面 (预算 {result['budget']:,}, {result['ratio']:.0%})")
        print(f"   {result['detail']}")


def test_check_fbx_info():
    print("\n" + "=" * 50)
    print("测试：FBX 深度解析")
    print("=" * 50)

    # 测试不存在的文件
    result = check_fbx_info("C:\\nonexistent\\model.fbx")
    print(f"\n不存在的文件:")
    print(f"   exists: {result['exists']}")
    print(f"   error: {result.get('error', '无')}")

    # 测试当前目录下是否有 FBX 文件可以测试
    current_dir = os.path.dirname(os.path.abspath(__file__))
    fbx_files = []
    for root, dirs, filenames in os.walk(current_dir):
        for f in filenames:
            if f.lower().endswith(('.fbx', '.obj', '.gltf', '.glb', '.stl')):
                fbx_files.append(os.path.join(root, f))
                break
        if fbx_files:
            break

    if fbx_files:
        print(f"\n找到测试文件: {fbx_files[0]}")
        result = check_fbx_info(fbx_files[0])
        if "error" in result:
            print(f"   ⚠️  {result['error']}")
        else:
            print(f"   顶点数: {result.get('total_vertices', 'N/A')}")
            print(f"   面数: {result.get('total_faces','N/A')}")
            print(f"   子网格: {result.get('sub_mesh_count', 'N/A')}")
            print(f"   包围盒: {result.get('bbox_size', 'N/A')}")
    else:
        print("\n当前目录没有 FBX/OBJ 文件，跳过实际解析测试")
        print("   提示: 可以将 .fbx 文件放到项目目录后重新测试")


def test_check_texture_info():
    print("\n" + "=" * 50)
    print("测试：贴图深度检查")
    print("=" * 50)

    # 测试不存在的文件
    result = check_texture_info("C:\\nonexistent\\texture.png")
    print(f"\n不存在的文件:")
    print(f"   exists: {result['exists']}")
    print(f"   error: {result.get('error', '无')}")

    # 测试当前目录下是否有图片文件
    current_dir = os.path.dirname(os.path.abspath(__file__))
    img_files = []
    for root, dirs, filenames in os.walk(current_dir):
        for f in filenames:
            if f.lower().endswith(('.png', '.jpg', '.jpeg', '.tga', '.bmp')):
                img_files.append(os.path.join(root, f))
                break
        if img_files:
            break

    if img_files:
        print(f"\n找到测试文件: {img_files[0]}")
        result = check_texture_info(img_files[0])
        if "error" in result:
            print(f"   ⚠️  {result['error']}")
        else:
            print(f"   分辨率: {result.get('width')}x{result.get('height')}")
            print(f"   格式: {result.get('format')}")
            print(f"   通道数: {result.get('channel_count')}")
            print(f"   有 Alpha: {result.get('has_alpha')}")
            print(f"   2 的幂次: {result.get('is_power_of_two')}")
            print(f"   分辨率等级: {result.get('resolution_tier')}")
    else:
        print("\n当前目录没有图片文件，跳过实际解析测试")
        print("   提示: 可以将 .png/.jpg 文件放到项目目录后重新测试")


def test_check_texture_batch():
    print("\n" + "=" * 50)
    print("测试：贴图批量检查")
    print("=" * 50)

    current_dir = os.path.dirname(os.path.abspath(__file__))
    result = check_texture_batch(current_dir, max_resolution=2048, recursive=False)

    if "error" in result:
        print(f"\n⚠️  {result['error']}")
        return

    print(f"\n扫描目录: {current_dir}")
    print(f"贴图总数: {result['total_textures']}")
    print(f"问题数: {result['issues_count']}")

    if result.get("format_stats"):
        print("\n格式统计:")
        for fmt, count in result["format_stats"].items():
            print(f"   {fmt}: {count} 个")

    if result.get("issues"):
        print("\n问题详情:")
        for issue in result["issues"][:5]:
            print(f"   ❌ {issue['filename']}")
            for i in issue["issues"]:
                print(f"      ⚠️  {i}")


def main():
    print("=" * 50)
    print("  TA Agent 工具测试 v0.2")
    print("  不需要 API Key，直接测试工具函数")
    print("=" * 50)

    test_check_naming()
    test_check_directory()
    test_check_file_info()
    test_scan_directory()
    test_suggest_naming()
    test_check_mesh_budget()
    test_check_fbx_info()
    test_check_texture_info()
    test_check_texture_batch()

    print("\n" + "=" * 50)
    print("  所有测试完成！")
    print("=" * 50)


if __name__ == "__main__":
    main()
