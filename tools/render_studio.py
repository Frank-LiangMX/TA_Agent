"""
tools/render_studio.py - 独立的高质量渲染模块

支持：
- HDRI 环境光（摄影棚质量）
- 多角度渲染（正面、侧面、3/4、俯视）
- PBR 材质自动设置
- 可配置的渲染参数

独立使用：
    python render_studio.py <fbx_path> <output_dir> [--hdri <hdri_path>] [--resolution 1024]

或在代码中调用：
    from tools.render_studio import RenderStudio
    studio = RenderStudio(hdri_path="studio.hdr", resolution=1024)
    result = studio.render("model.fbx", "output/")
"""
from __future__ import annotations

import json
import os
import sys
from typing import Optional

from tools.render_studio_config import RenderConfig, PRESETS


# ========== 贴图查找 ==========

# 贴图类型后缀映射
TEXTURE_SUFFIXES = {
    "diffuse": ["_D", "_BaseColor", "_Albedo", "_albedo", "_basecolor", "_diffuse"],
    "normal": ["_N", "_Normal", "_normal"],
    "roughness": ["_R", "_Roughness", "_roughness"],
    "metallic": ["_M", "_Metallic", "_metallic"],
    "ao": ["_AO", "_AmbientOcclusion"],
    "emission": ["_E", "_Emission", "_emissive"],
}


def find_textures_for_model(fbx_path: str, texture_dirs: list[str] = None) -> dict:
    """
    根据 FBX 文件名，在指定目录中查找对应的贴图。

    查找逻辑：
    1. 提取 FBX 文件名（不含扩展名）作为基础名
    2. 在贴图目录中查找匹配的贴图文件
    3. 根据后缀判断贴图类型

    参数:
        fbx_path: FBX 文件路径
        texture_dirs: 贴图目录列表，默认为 FBX 同级目录和上级目录

    返回:
        {
            "diffuse": "path/to/T_xxx_D.png",
            "normal": "path/to/T_xxx_N.png",
            "roughness": "path/to/T_xxx_R.png",
            ...
        }
    """
    import re

    fbx_path = os.path.abspath(fbx_path)
    fbx_name = os.path.splitext(os.path.basename(fbx_path))[0]

    # 清理名称：移除常见前缀
    base_name = fbx_name
    for prefix in ["SK_", "SM_", "T_", "M_", "MI_"]:
        if base_name.startswith(prefix):
            base_name = base_name[len(prefix):]

    # 默认搜索目录
    if texture_dirs is None:
        fbx_dir = os.path.dirname(fbx_path)
        texture_dirs = [
            fbx_dir,
            os.path.join(fbx_dir, "Textures"),
            os.path.join(fbx_dir, "textures"),
            os.path.join(fbx_dir, ".."),
            os.path.join(fbx_dir, "..", "Textures"),
            os.path.join(fbx_dir, "..", "textures"),
            os.path.join(fbx_dir, "..", ".."),
            os.path.join(fbx_dir, "..", "..", "Textures"),
        ]

    # 支持的图片格式
    image_exts = {".png", ".jpg", ".jpeg", ".tga", ".tif", ".tiff", ".bmp"}

    # 收集所有图片文件
    all_images = {}
    for tex_dir in texture_dirs:
        if not os.path.isdir(tex_dir):
            continue
        for f in os.listdir(tex_dir):
            ext = os.path.splitext(f)[1].lower()
            if ext in image_exts:
                name = os.path.splitext(f)[0]
                all_images[name] = os.path.join(tex_dir, f)

    # 匹配贴图
    found_textures = {}

    for tex_type, suffixes in TEXTURE_SUFFIXES.items():
        for suffix in suffixes:
            # 尝试不同的命名模式
            candidates = [
                f"T_{base_name}{suffix}",
                f"{base_name}{suffix}",
                f"t_{base_name}{suffix}",
                f"{base_name}_{suffix.lstrip('_')}",
            ]

            for candidate in candidates:
                # 模糊匹配（忽略大小写）
                candidate_lower = candidate.lower()
                for img_name, img_path in all_images.items():
                    if img_name.lower() == candidate_lower or img_name.lower().startswith(candidate_lower):
                        found_textures[tex_type] = img_path
                        break
                if tex_type in found_textures:
                    break
            if tex_type in found_textures:
                break

    return found_textures


def generate_blender_script(
    file_path: str,
    output_dir: str,
    config: RenderConfig,
    texture_dirs: list[str] = None,
) -> str:
    """
    生成 Blender Python 脚本，用于 headless 渲染。

    返回：脚本内容
    """
    angles_str = json.dumps(config.angles)
    hdri_path_str = json.dumps(config.hdri_path) if config.hdri_path else "None"

    script = f'''
import bpy
import sys
import json
import os
import math

# Config
FILE_PATH = {json.dumps(file_path)}
OUTPUT_DIR = {json.dumps(output_dir)}
ANGLES = {angles_str}
CONFIG = {{
    "engine": {json.dumps(config.engine)},
    "device": {json.dumps(config.device)},
    "samples": {config.samples},
    "resolution_x": {config.resolution_x},
    "resolution_y": {config.resolution_y},
    "file_format": {json.dumps(config.file_format)},
    "use_transparent": {config.use_transparent},
    "background_color": {list(config.background_color)},
    "use_hdri": {config.use_hdri},
    "hdri_path": {hdri_path_str},
    "hdri_strength": {config.hdri_strength},
    "use_fill_light": {config.use_fill_light},
    "fill_light_strength": {config.fill_light_strength},
    "camera_lens": {config.camera_lens},
    "camera_padding": {config.camera_padding},
    "use_pbr": {config.use_pbr},
    "default_material_color": {list(config.default_material_color)},
}}


def setup_scene():
    """清空场景并设置渲染参数"""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    # Render engine
    if CONFIG["engine"] == "CYCLES":
        scene.render.engine = 'CYCLES'
        scene.cycles.device = CONFIG["device"]
        scene.cycles.samples = CONFIG["samples"]
        scene.cycles.use_denoising = True
    else:
        scene.render.engine = 'BLENDER_EEVEE'

    # Output settings
    scene.render.resolution_x = CONFIG["resolution_x"]
    scene.render.resolution_y = CONFIG["resolution_y"]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = CONFIG["file_format"]
    scene.render.image_settings.color_depth = '16' if CONFIG["file_format"] == "PNG" else '8'
    scene.render.film_transparent = CONFIG["use_transparent"]

    # Background
    if not CONFIG["use_transparent"]:
        scene.world = bpy.data.worlds.new("World")
        scene.world.use_nodes = True
        bg = scene.world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs["Color"].default_value = CONFIG["background_color"]
            bg.inputs["Strength"].default_value = 1.0

    return scene


def setup_hdri(hdri_path: str, strength: float = 1.0):
    """设置 HDRI 环境光"""
    scene = bpy.context.scene
    if not scene.world:
        scene.world = bpy.data.worlds.new("World")
    scene.world.use_nodes = True
    tree = scene.world.node_tree

    # Clear existing nodes
    for node in tree.nodes:
        tree.nodes.remove(node)

    # Create nodes
    output = tree.nodes.new("ShaderNodeOutputWorld")
    bg = tree.nodes.new("ShaderNodeBackground")
    tex_coord = tree.nodes.new("ShaderNodeTexCoord")
    mapping = tree.nodes.new("ShaderNodeMapping")
    env_tex = tree.nodes.new("ShaderNodeTexEnvironment")

    # Load HDRI
    env_tex.image = bpy.data.images.load(hdri_path)
    env_tex.location = (-600, 0)
    mapping.location = (-800, 0)
    tex_coord.location = (-1000, 0)

    # Connect
    tree.links.new(tex_coord.outputs["Generated"], mapping.inputs["Vector"])
    tree.links.new(mapping.inputs["Vector"], env_tex.inputs["Vector"])
    tree.links.new(env_tex.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = strength
    tree.links.new(bg.outputs["Background"], output.inputs["Surface"])


def setup_studio_lighting():
    """设置摄影棚三点光"""
    scene = bpy.context.scene

    # Get scene center
    mesh_objects = [obj for obj in scene.objects if obj.type == 'MESH']
    if not mesh_objects:
        center = [0, 0, 0]
        radius = 2
    else:
        all_coords = []
        for obj in mesh_objects:
            for v in obj.data.vertices:
                co = obj.matrix_world @ v.co
                all_coords.append([co.x, co.y, co.z])
        import numpy as np
        coords = np.array(all_coords)
        bbox_min = coords.min(axis=0)
        bbox_max = coords.max(axis=0)
        center = ((bbox_min + bbox_max) / 2).tolist()
        radius = max(bbox_max - bbox_min) / 2

    # Key Light
    key = bpy.data.lights.new("KeyLight", 'AREA')
    key.energy = 500
    key.size = radius * 2
    key.color = (1.0, 0.98, 0.95)  # 暖白
    key_obj = bpy.data.objects.new("KeyLight", key)
    scene.collection.objects.link(key_obj)
    key_obj.location = [center[0] + radius, center[1] - radius * 2, center[2] + radius * 1.5]
    key_obj.rotation_euler = [math.radians(45), 0, math.radians(30)]

    # Fill Light
    if CONFIG["use_fill_light"]:
        fill = bpy.data.lights.new("FillLight", 'AREA')
        fill.energy = 500 * CONFIG["fill_light_strength"]
        fill.size = radius * 3
        fill.color = (0.95, 0.97, 1.0)  # 冷白
        fill_obj = bpy.data.objects.new("FillLight", fill)
        scene.collection.objects.link(fill_obj)
        fill_obj.location = [center[0] - radius * 1.5, center[1] + radius, center[2] + radius]
        fill_obj.rotation_euler = [math.radians(30), 0, math.radians(-135)]

    # Rim Light
    rim = bpy.data.lights.new("RimLight", 'AREA')
    rim.energy = 300
    rim.size = radius * 1.5
    rim.color = (1.0, 1.0, 1.0)
    rim_obj = bpy.data.objects.new("RimLight", rim)
    scene.collection.objects.link(rim_obj)
    rim_obj.location = [center[0], center[1] + radius * 2, center[2] + radius * 0.5]
    rim_obj.rotation_euler = [math.radians(-15), 0, math.radians(180)]


def import_asset(file_path: str) -> bool:
    """导入资产文件"""
    ext = os.path.splitext(file_path)[1].lower()
    try:
        if ext == '.fbx':
            bpy.ops.import_scene.fbx(filepath=file_path)
        elif ext in ('.glb', '.gltf'):
            bpy.ops.import_scene.gltf(filepath=file_path)
        elif ext == '.obj':
            bpy.ops.wm.obj_import(filepath=file_path)
        else:
            bpy.ops.import_scene.fbx(filepath=file_path)
        return True
    except Exception as e:
        print(json.dumps({{"error": f"导入失败: {{str(e)}}"}}))
        return False


def get_asset_bounds():
    """获取资产包围盒"""
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if not mesh_objects:
        return None

    all_coords = []
    for obj in mesh_objects:
        for v in obj.data.vertices:
            co = obj.matrix_world @ v.co
            all_coords.append([co.x, co.y, co.z])

    if not all_coords:
        return None

    import numpy as np
    coords = np.array(all_coords)
    bbox_min = coords.min(axis=0)
    bbox_max = coords.max(axis=0)
    center = (bbox_min + bbox_max) / 2
    size = bbox_max - bbox_min

    return {{
        "center": center.tolist(),
        "size": size.tolist(),
        "radius": float(max(size) / 2),
    }}


def setup_materials():
    """设置 PBR 材质或默认材质"""
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    has_materials = False

    for obj in mesh_objects:
        for slot in obj.material_slots:
            if slot.material:
                has_materials = True

    if not has_materials:
        # Create default material
        mat = bpy.data.materials.new(name="DefaultMaterial")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = CONFIG["default_material_color"]
            bsdf.inputs["Roughness"].default_value = 0.5
            bsdf.inputs["Metallic"].default_value = 0.0

        for obj in mesh_objects:
            if len(obj.material_slots) == 0:
                obj.data.materials.append(mat)
            else:
                for slot in obj.material_slots:
                    slot.material = mat

    return has_materials


def compute_camera_distance(bounds, angle):
    """计算相机距离"""
    cam = bpy.context.scene.camera
    if cam and cam.data:
        sensor_w = cam.data.sensor_width
        focal = cam.data.lens
    else:
        sensor_w = 36.0
        focal = CONFIG["camera_lens"]

    half_fov = math.atan(sensor_w / (2 * focal))
    padding = CONFIG["camera_padding"]

    sx, sy, sz = bounds["size"]

    if angle == "front":
        req = max(sx/2, sz/2) / math.tan(half_fov)
    elif angle == "side":
        req = max(sy/2, sz/2) / math.tan(half_fov)
    elif angle == "top":
        req = max(sx/2, sy/2) / math.tan(half_fov)
    elif angle == "three_quarter":
        diag = math.sqrt((sx/2)**2 + (sy/2)**2)
        req = max(diag, sz/2) / math.tan(half_fov)
    elif angle == "back":
        req = max(sx/2, sz/2) / math.tan(half_fov)
    elif angle == "other_side":
        req = max(sy/2, sz/2) / math.tan(half_fov)
    else:
        req = max(sx/2, sy/2, sz/2) / math.tan(half_fov)

    return req * padding


def setup_camera(bounds, angle):
    """设置相机"""
    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = CONFIG["camera_lens"]
    cam_obj = bpy.data.objects.new("Camera", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj

    center = bounds["center"]
    target = [center[0], center[1], center[2] - bounds["size"][2] * 0.1]
    distance = compute_camera_distance(bounds, angle)

    positions = {{
        "front":        [target[0], target[1] - distance, target[2]],
        "side":         [target[0] + distance, target[1], target[2]],
        "top":          [target[0], target[1], target[2] + distance],
        "three_quarter": [target[0] + distance*0.707, target[1] - distance*0.707, target[2]],
        "back":         [target[0], target[1] + distance, target[2]],
        "other_side":   [target[0] - distance, target[1], target[2]],
    }}

    loc = positions.get(angle, positions["front"])
    cam_obj.location = loc

    # Look at target
    import mathutils
    direction = [target[i] - loc[i] for i in range(3)]
    dir_vec = mathutils.Vector(direction)
    rot_quat = dir_vec.to_track_quat('-Z', 'Y').to_euler()
    cam_obj.rotation_euler = rot_quat

    return cam_obj


def render(output_path: str):
    """渲染并保存"""
    bpy.context.scene.render.filepath = output_path
    bpy.ops.render.render(write_still=True)


# ========== 主流程 ==========
def main():
    result = {{
        "file_path": FILE_PATH,
        "config": {{
            "engine": CONFIG["engine"],
            "samples": CONFIG["samples"],
            "resolution": f"{{CONFIG['resolution_x']}}x{{CONFIG['resolution_y']}}",
        }},
        "images": [],
    }}

    if not os.path.exists(FILE_PATH):
        result["error"] = f"文件不存在: {{FILE_PATH}}"
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)

    # 1. Setup scene
    scene = setup_scene()

    # 2. Import asset
    if not import_asset(FILE_PATH):
        result["error"] = "导入失败"
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)

    # 3. Get bounds
    bounds = get_asset_bounds()
    if bounds is None:
        result["error"] = "无法获取包围盒"
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)

    result["bounds"] = {{"size": [round(v, 3) for v in bounds["size"]]}}

    # 4. Setup materials
    has_materials = setup_materials()
    result["has_materials"] = has_materials

    # 5. Setup lighting
    if CONFIG["use_hdri"] and CONFIG["hdri_path"] and os.path.exists(CONFIG["hdri_path"]):
        setup_hdri(CONFIG["hdri_path"], CONFIG["hdri_strength"])
        result["lighting"] = "hdri"
    else:
        setup_studio_lighting()
        result["lighting"] = "studio"

    # 6. Render angles
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    asset_name = os.path.splitext(os.path.basename(FILE_PATH))[0]

    for angle in ANGLES:
        # Clear camera
        for obj in bpy.context.scene.objects:
            if obj.type == 'CAMERA':
                bpy.data.objects.remove(obj, do_unlink=True)

        # Setup camera
        setup_camera(bounds, angle)

        # 渲染
        output_path = os.path.join(OUTPUT_DIR, f"{{asset_name}}_{{angle}}.png")
        try:
            render(output_path)
            if os.path.exists(output_path):
                result["images"].append({{
                    "angle": angle,
                    "path": output_path,
                    "size_kb": round(os.path.getsize(output_path) / 1024, 1),
                }})
        except Exception as e:
            result["images"].append({{"angle": angle, "error": str(e)}})

    result["success"] = len([img for img in result["images"] if "path" in img]) > 0
    result["total_rendered"] = len([img for img in result["images"] if "path" in img])

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
'''
    return script


# ========== Python 调用接口 ==========

class RenderStudio:
    """
    独立的高质量渲染器

    使用方式：
        studio = RenderStudio(preset="studio", hdri_path="studio.hdr")
        result = studio.render("model.fbx", "output/")
    """

    def __init__(
        self,
        preset: str = "studio",
        hdri_path: Optional[str] = None,
        blender_path: Optional[str] = None,
        **kwargs,
    ):
        """
        初始化渲染器

        参数:
            preset: 预设配置 (studio/turntable/fast/transparent)
            hdri_path: HDRI 环境光文件路径
            blender_path: Blender 可执行文件路径
            **kwargs: 覆盖配置参数
        """
        if preset in PRESETS:
            self.config = PRESETS[preset]
        else:
            self.config = RenderConfig()

        if hdri_path:
            self.config.hdri_path = hdri_path

        # 应用自定义参数
        for key, value in kwargs.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)

        # Blender 路径
        if blender_path:
            self.blender_path = blender_path
        else:
            from config import BLENDER_PATH
            self.blender_path = BLENDER_PATH

    def render(self, file_path: str, output_dir: str) -> dict:
        """
        渲染资产预览图

        参数:
            file_path: 资产文件路径
            output_dir: 输出目录

        返回:
            {
                "success": bool,
                "images": [{"angle": str, "path": str}, ...],
                "config": {...},
            }
        """
        import subprocess
        import tempfile

        # 生成脚本
        script_content = generate_blender_script(file_path, output_dir, self.config)

        # 写入临时文件（使用 UTF-8 编码）
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False, encoding='utf-8') as f:
            f.write(script_content)
            script_path = f.name

        try:
            # 调用 Blender
            cmd = [
                self.blender_path,
                "--background",
                "--python", script_path,
            ]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',  # Windows 编码兼容
                timeout=300,  # 5 分钟超时
            )

            # 解析输出
            stdout = result.stdout.strip()
            # 找到 JSON 输出（最后一行）
            for line in reversed(stdout.split('\n')):
                line = line.strip()
                if line.startswith('{'):
                    try:
                        return json.loads(line)
                    except json.JSONDecodeError:
                        continue

            return {
                "success": False,
                "error": "无法解析 Blender 输出",
                "stdout": stdout[-500:] if stdout else "",
                "stderr": result.stderr[-500:] if result.stderr else "",
            }

        except subprocess.TimeoutExpired:
            return {"success": False, "error": "渲染超时（>5分钟）"}
        except Exception as e:
            return {"success": False, "error": str(e)}
        finally:
            os.unlink(script_path)

    def render_batch(self, file_paths: list[str], output_dir: str) -> dict:
        """
        批量渲染多个资产

        返回:
            {"total": int, "success": int, "failed": int, "results": [...]}
        """
        results = []
        success_count = 0

        for i, file_path in enumerate(file_paths):
            print(f"  渲染 {i+1}/{len(file_paths)}: {os.path.basename(file_path)}")
            asset_output = os.path.join(output_dir, os.path.splitext(os.path.basename(file_path))[0])
            result = self.render(file_path, asset_output)
            results.append(result)
            if result.get("success"):
                success_count += 1

        return {
            "total": len(file_paths),
            "success": success_count,
            "failed": len(file_paths) - success_count,
            "results": results,
        }

    def get_config(self) -> dict:
        """获取当前配置"""
        return {
            "engine": self.config.engine,
            "samples": self.config.samples,
            "resolution": f"{self.config.resolution_x}x{self.config.resolution_y}",
            "use_hdri": self.config.use_hdri,
            "use_transparent": self.config.use_transparent,
            "angles": self.config.angles,
        }


# ========== 命令行入口 ==========

def main_cli():
    """命令行入口"""
    import argparse

    parser = argparse.ArgumentParser(description="高质量 3D 资产渲染器")
    parser.add_argument("file_path", help="资产文件路径")
    parser.add_argument("output_dir", help="输出目录")
    parser.add_argument("--preset", default="studio", choices=PRESETS.keys(), help="渲染预设")
    parser.add_argument("--hdri", help="HDRI 环境光文件路径")
    parser.add_argument("--resolution", type=int, default=1024, help="渲染分辨率")
    parser.add_argument("--samples", type=int, default=64, help="采样数")
    parser.add_argument("--angles", nargs="+", help="渲染角度")
    parser.add_argument("--transparent", action="store_true", help="透明背景")
    parser.add_argument("--blender", help="Blender 可执行文件路径")

    args = parser.parse_args()

    kwargs = {}
    if args.resolution:
        kwargs["resolution_x"] = args.resolution
        kwargs["resolution_y"] = args.resolution
    if args.samples:
        kwargs["samples"] = args.samples
    if args.angles:
        kwargs["angles"] = args.angles
    if args.transparent:
        kwargs["use_transparent"] = True

    studio = RenderStudio(
        preset=args.preset,
        hdri_path=args.hdri,
        blender_path=args.blender,
        **kwargs,
    )

    print(f"渲染配置: {json.dumps(studio.get_config(), ensure_ascii=False)}")
    result = studio.render(args.file_path, args.output_dir)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    # 检查是否在 Blender 内部运行
    try:
        import bpy
        # Run in Blender
        main()
    except ImportError:
        # Run as CLI
        main_cli()
