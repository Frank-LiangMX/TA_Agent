"""
多模态分析集成测试
测试：几何提取 → 渲染 → 视觉 LLM 推断 完整流程
"""
import sys
import os

# 确保项目根目录在 path 里
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

FBX_PATH = r"D:\Trunk_Projects\Main\Assets\Art\MapSources\Architecture\Common\Building\Common_Building_A\FBX\High\Common_Building_A_01.fbx"
FBX_DIR = os.path.dirname(FBX_PATH)

def test_step1_geometry():
    """Step 1: 测试几何提取（Blender FBX 读取）"""
    print("=" * 60)
    print("Step 1: 几何提取")
    print("=" * 60)
    from tools.mesh_fbx import check_fbx_info
    result = check_fbx_info(FBX_PATH)
    print(f"  结果: {result}")
    if "error" in result:
        print(f"  [FAIL] 几何提取失败: {result['error']}")
        return False
    print(f"  [OK] 三角面数: {result.get('triangle_count', 'N/A')}")
    print(f"  [OK] 顶点数: {result.get('vertex_count', 'N/A')}")
    return True

def test_step2_render():
    """Step 2: 测试 Blender 渲染预览图"""
    print("\n" + "=" * 60)
    print("Step 2: 渲染预览图")
    print("=" * 60)
    from tools.renderer import render_asset_preview
    result = render_asset_preview(FBX_PATH, angles=["front"])
    print(f"  结果: {result}")
    if not result.get("success"):
        print(f"  [FAIL] 渲染失败: {result.get('error', 'unknown')}")
        return False
    images = result.get("images", [])
    print(f"  [OK] 渲染了 {len(images)} 张图")
    for img in images:
        path = img.get("path", "")
        exists = os.path.exists(path)
        size = os.path.getsize(path) if exists else 0
        print(f"    - {img.get('angle')}: {path} ({size} bytes) {'EXISTS' if exists else 'MISSING'}")
    return True

def test_step3_vision():
    """Step 3: 测试视觉 LLM（发送图片到 ModelScope）"""
    print("\n" + "=" * 60)
    print("Step 3: 视觉 LLM 分析")
    print("=" * 60)

    # 找到渲染图
    preview_dir = os.path.join(FBX_DIR, ".previews")
    if not os.path.exists(preview_dir):
        print(f"  [SKIP] 预览图目录不存在: {preview_dir}")
        return False

    preview_images = []
    for f in os.listdir(preview_dir):
        if f.endswith(".png"):
            preview_images.append(os.path.join(preview_dir, f))

    if not preview_images:
        print("  [SKIP] 没有找到预览图")
        return False

    print(f"  找到 {len(preview_images)} 张预览图")

    from tools.vision import encode_image_to_base64, build_vision_prompt
    from config import get_vision_config
    from openai import OpenAI

    vision_cfg = get_vision_config()
    print(f"  视觉模型: {vision_cfg['model']}")
    print(f"  API: {vision_cfg['base_url']}")

    # 构建消息
    prompt = "你是一个游戏资产分析专家。请分析这张3D模型渲染图，判断：1. 这是什么类型的资产（建筑/角色/武器/道具/自然物体）2. 主要材质 3. 风格描述 4. 主色调 5. 状态（新/旧/损坏）"

    images_b64 = [encode_image_to_base64(p) for p in preview_images[:1]]  # 只用第一张
    content = build_vision_prompt(prompt, preview_images[:1])
    messages = [{"role": "user", "content": content}]

    print(f"  发送请求到 ModelScope...")
    try:
        client = OpenAI(
            api_key=vision_cfg["api_key"],
            base_url=vision_cfg["base_url"],
        )
        response = client.chat.completions.create(
            model=vision_cfg["model"],
            messages=messages,
            max_tokens=1000,
        )
        answer = response.choices[0].message.content
        print(f"  [OK] LLM 回复:")
        for line in answer.strip().split("\n"):
            print(f"    {line}")
        return True
    except Exception as e:
        print(f"  [FAIL] 请求失败: {e}")
        return False

def test_step4_full_pipeline():
    """Step 4: 完整分析流程（analyzer 集成）"""
    print("\n" + "=" * 60)
    print("Step 4: 完整分析流程")
    print("=" * 60)
    from analyzer import AssetIdentityAnalyzer
    analyzer = AssetIdentityAnalyzer()
    result = analyzer.analyze_directory(
        dir_path=FBX_DIR,
        render_previews=True,
        clean_orphans=True,
        enable_ai_inference=True,
    )
    if "error" in result:
        print(f"  [FAIL] {result['error']}")
        return False

    print(f"  [OK] 资产数: {result['total_assets']}")
    print(f"  [OK] 汇总: {result['summary']}")
    if result.get("orphan_cleanup"):
        print(f"  [OK] 孤儿清理: {result['orphan_cleanup']}")

    # 打印每个资产的关键信息
    for asset in result.get("assets", []):
        name = asset.get("asset_name", "unknown")
        mesh = asset.get("mesh", {})
        cat = asset.get("category", {})
        visual = asset.get("visual", {})
        meta = asset.get("meta", {})
        print(f"\n  --- {name} ---")
        print(f"    三角面: {mesh.get('tri_count', 'N/A')}")
        print(f"    分类: {cat.get('category', 'N/A')}/{cat.get('subcategory', 'N/A')} ({cat.get('confidence', 0):.0%})")
        print(f"    材质: {asset.get('material_structure', {}).get('primary', [])}")
        print(f"    风格: {visual.get('style', 'N/A')}")
        print(f"    色调: {visual.get('color_palette', [])}")
        print(f"    描述: {visual.get('description', 'N/A')[:80]}")
        previews = meta.get("preview_images", [])
        if previews:
            print(f"    预览图: {len(previews)} 张")

    return True

if __name__ == "__main__":
    steps = {
        "1": ("几何提取", test_step1_geometry),
        "2": ("渲染预览图", test_step2_render),
        "3": ("视觉 LLM", test_step3_vision),
        "4": ("完整流程", test_step4_full_pipeline),
    }

    if len(sys.argv) > 1:
        # 指定步骤: python test_multimodal.py 1 2 3
        selected = sys.argv[1:]
    else:
        # 默认跑全部
        selected = list(steps.keys())

    results = {}
    for step_id in selected:
        if step_id not in steps:
            print(f"未知步骤: {step_id}")
            continue
        name, func = steps[step_id]
        try:
            ok = func()
            results[name] = "PASS" if ok else "FAIL"
        except Exception as e:
            print(f"  [ERROR] {e}")
            import traceback
            traceback.print_exc()
            results[name] = "ERROR"

    print("\n" + "=" * 60)
    print("测试结果汇总")
    print("=" * 60)
    for name, status in results.items():
        icon = "[OK]" if status == "PASS" else "[FAIL]" if status == "FAIL" else "[ERR]"
        print(f"  {icon} {name}")
