"""
Blender 资产渲染脚本
由 agent 通过 subprocess 调用 blender --background --python 运行
输出 JSON 到 stdout
"""
import bpy
import sys
import json
import os
import math


def setup_scene():
    """清空场景并设置基本渲染参数"""
    bpy.ops.wm.read_factory_settings(use_empty=True)

    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'  # Cycles 在 headless 模式下更可靠
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 32  # 低采样数，速度快
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False  # 不透明背景，LLM 更容易识别

    # 白色背景
    scene.world = bpy.data.worlds.new("World")
    scene.world.color = (1, 1, 1)

    return scene


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
        elif ext == '.blend':
            # append from blend file
            with bpy.data.libraries.load(file_path, link=False) as (data_from, data_to):
                data_to.objects = data_from.objects
            for obj in data_to.objects:
                if obj is not None:
                    bpy.context.collection.objects.link(obj)
        else:
            # 尝试 FBX
            bpy.ops.import_scene.fbx(filepath=file_path)
        return True
    except Exception as e:
        print(json.dumps({"error": f"导入失败: {str(e)}"}))
        return False


def get_asset_bounds():
    """获取所有 mesh 对象的合并包围盒"""
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
    radius = max(size) / 2

    return {
        "center": center.tolist(),
        "size": size.tolist(),
        "radius": float(radius),
        "bbox_min": bbox_min.tolist(),
        "bbox_max": bbox_max.tolist(),
    }


def _compute_camera_distance(bounds, camera_angle: str, padding: float = 1.6) -> float:
    """
    根据相机 FOV 和物体包围盒，计算能让物体完整入画的相机距离。

    原理：distance = half_size / tan(half_fov) * padding
    对每个角度，取水平和垂直方向需要的最大距离。
    padding=1.6 留 60% 余量，确保非对称模型（楼梯、底座等）不会被裁切。
    """
    cam = bpy.context.scene.camera
    if cam and cam.data:
        sensor_w = cam.data.sensor_width  # 默认 36mm
        focal = cam.data.lens             # 默认 50mm
    else:
        sensor_w = 36.0
        focal = 50.0

    sensor_h = sensor_w  # 正方形渲染 (512x512)
    half_fov_h = math.atan(sensor_w / (2 * focal))
    half_fov_v = math.atan(sensor_h / (2 * focal))

    cx, cy, cz = bounds["center"]
    sx, sy, sz = bounds["size"]
    half_x, half_y, half_z = sx / 2, sy / 2, sz / 2

    if camera_angle == 'front':
        # 相机在 -Y，看向 +Y；画面水平 = X，垂直 = Z
        req_h = half_x / math.tan(half_fov_h)
        req_v = half_z / math.tan(half_fov_v)
    elif camera_angle == 'side':
        # 相机在 +X，看向 -X；画面水平 = Y，垂直 = Z
        req_h = half_y / math.tan(half_fov_h)
        req_v = half_z / math.tan(half_fov_v)
    elif camera_angle == 'top':
        # 相机在 +Z，看向 -Z；画面水平 = X，垂直 = Y
        req_h = half_x / math.tan(half_fov_h)
        req_v = half_y / math.tan(half_fov_v)
    elif camera_angle == 'three_quarter':
        # 45° 斜角，取包围盒对角线投影
        diag_h = math.sqrt(half_x**2 + half_y**2)
        req_h = diag_h / math.tan(half_fov_h)
        req_v = half_z / math.tan(half_fov_v)
    else:
        diag = math.sqrt(half_x**2 + half_y**2 + half_z**2) / 2
        req_h = diag / math.tan(half_fov_h)
        req_v = diag / math.tan(half_fov_v)

    return max(req_h, req_v) * padding


def setup_camera_and_light(bounds, camera_angle: str):
    """
    设置相机和灯光
    camera_angle: 'front', 'side', 'top', 'three_quarter'
    """
    center = bounds["center"]

    # 创建相机
    cam_data = bpy.data.cameras.new("RenderCam")
    cam_data.lens = 35  # 35mm 广角，视野更宽
    cam_obj = bpy.data.objects.new("RenderCam", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj

    # 目标点下移 15%，给底部（楼梯、底座）留更多空间
    target = [center[0], center[1], center[2] - bounds["size"][2] * 0.15]

    # 根据 FOV 和包围盒计算合适的距离
    distance = _compute_camera_distance(bounds, camera_angle)

    # 根据角度设置相机位置（对准下移后的目标点）
    if camera_angle == 'front':
        loc = [target[0], target[1] - distance, target[2]]
    elif camera_angle == 'side':
        loc = [target[0] + distance, target[1], target[2]]
    elif camera_angle == 'top':
        loc = [target[0], target[1], target[2] + distance]
    elif camera_angle == 'three_quarter':
        offset = distance * 0.707
        loc = [target[0] + offset, target[1] - offset, target[2]]
    else:
        loc = [target[0], target[1] - distance, target[2]]

    cam_obj.location = loc

    # 相机朝向目标点
    rot_quat = _look_at_rotation(loc, target)
    cam_obj.rotation_euler = rot_quat

    # 灯光用包围盒对角线的一半作为参考距离
    radius = max(bounds["size"]) / 2

    # 创建主灯光（太阳光）
    light_data = bpy.data.lights.new("MainLight", 'SUN')
    light_data.energy = 3.0
    light_obj = bpy.data.objects.new("MainLight", light_data)
    bpy.context.collection.objects.link(light_obj)
    light_obj.location = [center[0] + radius, center[1] - radius, center[2] + radius * 2]
    light_obj.rotation_euler = [math.radians(45), 0, math.radians(45)]

    # 创建补光
    fill_data = bpy.data.lights.new("FillLight", 'SUN')
    fill_data.energy = 1.0
    fill_obj = bpy.data.objects.new("FillLight", fill_data)
    bpy.context.collection.objects.link(fill_obj)
    fill_obj.location = [center[0] - radius, center[1] + radius, center[2] + radius]
    fill_obj.rotation_euler = [math.radians(30), 0, math.radians(-135)]


def _look_at_rotation(from_pos, to_pos):
    """计算从 from_pos 看向 to_pos 的欧拉旋转"""
    import mathutils
    direction = mathutils.Vector(to_pos) - mathutils.Vector(from_pos)
    if direction.length == 0:
        return (0, 0, 0)
    rot_quat = direction.to_track_quat('-Z', 'Y')
    return rot_quat.to_euler()


def render_and_save(output_path: str) -> str:
    """渲染并保存图片"""
    bpy.context.scene.render.filepath = output_path
    bpy.ops.render.render(write_still=True)
    return output_path


def render_asset(file_path: str, output_dir: str, angles: list[str] = None) -> dict:
    """
    渲染资产预览图

    参数:
        file_path: 资产文件路径
        output_dir: 输出目录
        angles: 渲染角度列表，默认 ['front', 'side', 'three_quarter']

    返回:
        {"images": [{"angle": "front", "path": "..."}, ...], ...}
    """
    if angles is None:
        angles = ["front", "side", "three_quarter"]

    result = {
        "file_path": file_path,
        "images": [],
    }

    if not os.path.exists(file_path):
        result["error"] = f"文件不存在: {file_path}"
        return result

    # 设置场景
    setup_scene()

    # 导入资产
    if not import_asset(file_path):
        result["error"] = "资产导入失败"
        return result

    # 获取包围盒
    bounds = get_asset_bounds()
    if bounds is None:
        result["error"] = "无法获取资产包围盒"
        return result

    # 检测材质情况
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    all_mat_names = []
    has_materials = False
    for obj in mesh_objects:
        for slot in obj.material_slots:
            if slot.material:
                has_materials = True
                if slot.material.name not in all_mat_names:
                    all_mat_names.append(slot.material.name)

    result["has_materials"] = has_materials
    result["material_names"] = all_mat_names

    # 无材质时赋予默认紫红色材质，让 LLM 能明确识别"无材质"
    if not has_materials:
        default_mat = bpy.data.materials.new(name="NO_MATERIAL_DEFAULT")
        default_mat.use_nodes = True
        bsdf = default_mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (0.8, 0.1, 0.4, 1.0)  # 紫红色
        for obj in mesh_objects:
            if len(obj.material_slots) == 0:
                obj.data.materials.append(default_mat)
            else:
                for slot in obj.material_slots:
                    slot.material = default_mat

    result["bounds"] = {
        "size": [round(v, 3) for v in bounds["size"]],
        "radius": round(bounds["radius"], 3),
    }

    # 确保输出目录存在
    os.makedirs(output_dir, exist_ok=True)

    asset_name = os.path.splitext(os.path.basename(file_path))[0]

    # 每个角度渲染一张
    for angle in angles:
        # 清除相机和灯光（保留 mesh）
        for obj in bpy.context.scene.objects:
            if obj.type in ('CAMERA', 'LIGHT'):
                bpy.data.objects.remove(obj, do_unlink=True)

        # 设置相机和灯光
        setup_camera_and_light(bounds, angle)

        # 渲染
        output_path = os.path.join(output_dir, f"{asset_name}_{angle}.png")
        try:
            render_and_save(output_path)
            if os.path.exists(output_path):
                result["images"].append({
                    "angle": angle,
                    "path": output_path,
                })
        except Exception as e:
            result["images"].append({
                "angle": angle,
                "error": str(e),
            })

    result["success"] = len(result["images"]) > 0
    result["total_rendered"] = len([img for img in result["images"] if "path" in img])

    return result


if __name__ == "__main__":
    # 从命令行参数获取信息
    # blender --background --python blender_asset_renderer.py -- <file_path> <output_dir> [angles...]
    argv = sys.argv
    try:
        idx = argv.index("--")
        args = argv[idx + 1:]
    except ValueError:
        args = []

    if len(args) < 2:
        print(json.dumps({"error": "用法: blender --background --python blender_asset_renderer.py -- <file_path> <output_dir> [front|side|top|three_quarter...]"}))
        sys.exit(1)

    file_path = args[0]
    output_dir = args[1]
    angles = args[2:] if len(args) > 2 else ["front", "side", "three_quarter"]

    result = render_asset(file_path, output_dir, angles)
    print(json.dumps(result, ensure_ascii=False))
