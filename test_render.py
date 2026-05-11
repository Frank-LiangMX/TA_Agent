"""
test_render.py - 渲染模块测试脚本

用法：
    python test_render.py <fbx_path>
    python test_render.py <fbx_path> --preset fast
    python test_render.py <fbx_path> --preset studio --hdri <hdri_path>
"""
import sys
import os
import json
import time

# 添加项目路径
sys.path.insert(0, os.path.dirname(__file__))

from tools.render_studio import RenderStudio


def main():
    if len(sys.argv) < 2:
        print("=" * 50)
        print("渲染模块测试工具")
        print("=" * 50)
        print()
        print("用法:")
        print("  python test_render.py <fbx_path> [options]")
        print()
        print("示例:")
        print('  python test_render.py "F:\\Assets\\model.fbx"')
        print('  python test_render.py "F:\\Assets\\model.fbx" --preset fast')
        print('  python test_render.py "F:\\Assets\\model.fbx" --preset studio --hdri studio.hdr')
        print()
        print("预设:")
        print("  fast        - 快速预览 (512x512, 2角度)")
        print("  studio      - 高质量 (1024x1024, 4角度)")
        print("  turntable   - 360度 (512x512, 4角度, 透明背景)")
        print("  transparent - 透明背景 (1024x1024, 4角度)")
        return

    fbx_path = sys.argv[1]

    # 解析参数
    preset = "fast"
    hdri_path = None

    i = 2
    while i < len(sys.argv):
        if sys.argv[i] == "--preset" and i + 1 < len(sys.argv):
            preset = sys.argv[i + 1]
            i += 2
        elif sys.argv[i] == "--hdri" and i + 1 < len(sys.argv):
            hdri_path = sys.argv[i + 1]
            i += 2
        else:
            i += 1

    # 检查文件
    if not os.path.exists(fbx_path):
        print(f"错误: 文件不存在 - {fbx_path}")
        return

    # 输出目录
    output_dir = os.path.join(os.path.dirname(__file__), "render_output")
    os.makedirs(output_dir, exist_ok=True)

    # 创建渲染器
    print("=" * 50)
    print("渲染配置")
    print("=" * 50)
    studio = RenderStudio(preset=preset, hdri_path=hdri_path)
    config = studio.get_config()
    for k, v in config.items():
        print(f"  {k}: {v}")

    print()
    print("=" * 50)
    print("开始渲染")
    print("=" * 50)
    print(f"  输入: {fbx_path}")
    print(f"  输出: {output_dir}")
    print()

    # 执行渲染
    start_time = time.time()
    result = studio.render(fbx_path, output_dir)
    elapsed = time.time() - start_time

    # 输出结果
    print()
    print("=" * 50)
    print("渲染结果")
    print("=" * 50)
    print(f"  成功: {result.get('success', False)}")
    print(f"  耗时: {elapsed:.1f}秒")

    if result.get("bounds"):
        print(f"  尺寸: {result['bounds']['size']}")

    if result.get("has_materials") is not None:
        print(f"  材质: {'有' if result['has_materials'] else '无（使用默认材质）'}")

    if result.get("lighting"):
        print(f"  灯光: {result['lighting']}")

    print()
    if result.get("images"):
        print("  渲染图片:")
        for img in result["images"]:
            if "path" in img:
                size_kb = img.get("size_kb", 0)
                print(f"    ✅ {img['angle']}: {img['path']} ({size_kb}KB)")
            elif "error" in img:
                print(f"    ❌ {img['angle']}: {img['error']}")

    if result.get("error"):
        print(f"\n  错误: {result['error']}")

    # 显示 Blender 输出（调试用）
    if not result.get("success"):
        print()
        print("=" * 50)
        print("Blender 输出（调试）")
        print("=" * 50)
        if result.get("stdout"):
            print("  stdout:")
            print(result["stdout"][:1000])
        if result.get("stderr"):
            print("  stderr:")
            print(result["stderr"][:1000])

    print()
    print("=" * 50)
    print(f"渲染完成！图片保存在: {output_dir}")
    print("=" * 50)


if __name__ == "__main__":
    main()
