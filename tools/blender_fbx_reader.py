"""
Blender FBX 读取脚本
由 agent 通过 subprocess 调用 blender --background --python 运行
输出 JSON 到 stdout
"""
import bpy
import sys
import json
import os


def _extract_material_textures(material) -> list:
    """从材质节点树中提取贴图名称"""
    textures = []
    if not material.use_nodes or not material.node_tree:
        return textures
    for node in material.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image:
            img_name = node.image.name
            if img_name not in textures:
                textures.append(img_name)
    return textures


def _render_preview(output_path: str, resolution: int = 256) -> bool:
    """在当前已加载的场景中渲染一张预览图（复用已导入的 FBX）"""
    try:
        import math

        # 获取场景中所有 mesh 的包围盒
        mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
        if not mesh_objects:
            return False

        # 计算整体包围盒
        all_corners = []
        for obj in mesh_objects:
            for corner in obj.bound_box:
                world_corner = obj.matrix_world @ __import__('mathutils').Vector(corner)
                all_corners.append(world_corner)

        if not all_corners:
            return False

        import numpy as np
        coords = np.array([[c.x, c.y, c.z] for c in all_corners])
        center = coords.mean(axis=0)
        size = coords.max(axis=0) - coords.min(axis=0)
        max_dim = max(size)

        # 设置渲染参数
        scene = bpy.context.scene
        scene.render.resolution_x = resolution
        scene.render.resolution_y = resolution
        scene.render.film_transparent = True
        scene.render.engine = 'BLENDER_EEVEE'

        # 创建相机
        cam_data = bpy.data.cameras.new("PreviewCam")
        cam_obj = bpy.data.objects.new("PreviewCam", cam_data)
        scene.collection.objects.link(cam_obj)
        scene.camera = cam_obj

        # 相机位置：斜上方 45 度
        dist = max_dim * 1.8
        cam_obj.location = (
            center[0] + dist * 0.7,
            center[1] - dist * 0.7,
            center[2] + dist * 0.5,
        )
        # 相机朝向模型中心
        direction = __import__('mathutils').Vector(center) - cam_obj.location
        rot = direction.to_track_quat('-Z', 'Y')
        cam_obj.rotation_euler = rot.to_euler()

        # 创建灯光
        light_data = bpy.data.lights.new("PreviewLight", 'SUN')
        light_data.energy = 3.0
        light_obj = bpy.data.objects.new("PreviewLight", light_data)
        scene.collection.objects.link(light_obj)
        light_obj.location = (
            center[0] + dist,
            center[1] - dist,
            center[2] + dist,
        )

        # 渲染
        scene.render.filepath = output_path
        bpy.ops.render.render(write_still=True)

        return os.path.exists(output_path)

    except Exception as e:
        print(f"  [预览渲染] 失败: {e}")
        return False


def read_fbx(fbx_path: str, preview_output: str = "") -> dict:
    """读取 FBX 文件并提取几何数据"""
    result = {
        "file_path": fbx_path,
        "exists": os.path.exists(fbx_path),
    }

    if not result["exists"]:
        result["error"] = f"文件不存在: {fbx_path}"
        return result

    result["size_mb"] = round(os.path.getsize(fbx_path) / (1024 * 1024), 2)

    # 清空场景
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # 导入 FBX
    try:
        bpy.ops.import_scene.fbx(filepath=fbx_path)
    except Exception as e:
        result["error"] = f"FBX 导入失败: {str(e)}"
        return result

    # 收集所有 mesh 对象
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    armature_objects = [obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE']

    # 先记录骨架信息（动画文件可能没有网格，但有骨架）
    result["has_skeleton"] = len(armature_objects) > 0
    result["armature_count"] = len(armature_objects)
    if armature_objects:
        bone_info = []
        total_constraints = 0
        constraint_types = {}
        for arm in armature_objects:
            bone_constraint_count = 0
            for bone in arm.data.bones:
                if hasattr(bone, 'constraints'):
                    for c in bone.constraints:
                        bone_constraint_count += 1
                        ctype = c.type
                        constraint_types[ctype] = constraint_types.get(ctype, 0) + 1
            total_constraints += bone_constraint_count
            bone_info.append({
                "name": arm.name,
                "bone_count": len(arm.data.bones),
                "constraint_count": bone_constraint_count,
            })
        result["skeleton_info"] = bone_info
        result["constraint_count"] = total_constraints
        result["constraint_types"] = constraint_types

    if not mesh_objects:
        result["error"] = "文件中没有找到网格数据"
        result["total_faces"] = 0
        result["total_vertices"] = 0
        return result

    result["is_scene"] = len(mesh_objects) > 1
    result["sub_mesh_count"] = len(mesh_objects)

    # 汇总数据
    total_vertices = 0
    total_faces = 0
    uv_layers = set()
    mesh_details = []

    all_coords = []

    for obj in mesh_objects:
        mesh = obj.data
        v_count = len(mesh.vertices)
        # 面数转为三角面
        f_count = sum(len(f.vertices) - 2 for f in mesh.polygons)
        total_vertices += v_count
        total_faces += f_count

        # UV 层
        for uv_layer in mesh.uv_layers:
            uv_layers.add(uv_layer.name)

        # 顶点坐标（用于计算包围盒）
        for v in mesh.vertices:
            # 应用物体变换
            co = obj.matrix_world @ v.co
            all_coords.append([co.x, co.y, co.z])

        # 材质信息：名称列表 + 是否有实际材质 + 贴图映射
        mat_names = []
        mat_textures = {}  # {材质名: [贴图名列表]}
        for slot in obj.material_slots:
            if slot.material:
                mat_names.append(slot.material.name)
                # 读取材质节点树中的贴图
                textures_in_mat = _extract_material_textures(slot.material)
                if textures_in_mat:
                    mat_textures[slot.material.name] = textures_in_mat
            else:
                mat_names.append(None)  # 空槽位

        mesh_details.append({
            "name": obj.name,
            "vertices": v_count,
            "faces": f_count,
            "material_count": len(obj.material_slots),
            "material_names": mat_names,
            "material_textures": mat_textures,
            "has_materials": any(m is not None for m in mat_names),
            "has_armature_modifier": any(mod.type == 'ARMATURE' for mod in obj.modifiers),
        })

    # 汇总材质信息
    all_mat_names = []
    all_mat_textures = {}  # {材质名: [贴图名列表]}
    has_any_material = False
    for detail in mesh_details:
        for name in detail.get("material_names", []):
            if name and name not in all_mat_names:
                all_mat_names.append(name)
        if detail.get("has_materials"):
            has_any_material = True
        # 合并材质贴图映射
        for mat_name, tex_list in detail.get("material_textures", {}).items():
            if mat_name not in all_mat_textures:
                all_mat_textures[mat_name] = tex_list
            else:
                for t in tex_list:
                    if t not in all_mat_textures[mat_name]:
                        all_mat_textures[mat_name].append(t)

    result.update({
        "total_vertices": total_vertices,
        "total_faces": total_faces,
        "uv_channel_count": len(uv_layers),
        "uv_layer_names": list(uv_layers),
        "material_names": all_mat_names,
        "material_textures": all_mat_textures,
        "has_materials": has_any_material,
    })

    # 包围盒
    if all_coords:
        import numpy as np
        coords = np.array(all_coords)
        bbox_min = coords.min(axis=0).tolist()
        bbox_max = coords.max(axis=0).tolist()
        bbox_size = (coords.max(axis=0) - coords.min(axis=0)).tolist()
        result["bbox_min"] = [round(v, 3) for v in bbox_min]
        result["bbox_max"] = [round(v, 3) for v in bbox_max]
        result["bbox_size"] = [round(v, 3) for v in bbox_size]

    result["mesh_details"] = mesh_details[:20]  # 最多 20 个

    # 渲染预览图（如果指定了输出路径）
    if preview_output and mesh_objects:
        os.makedirs(os.path.dirname(preview_output), exist_ok=True)
        if _render_preview(preview_output):
            result["preview_image"] = preview_output

    return result


if __name__ == "__main__":
    # 从命令行参数获取 FBX 路径和预览输出路径
    # blender --background --python blender_fbx_reader.py -- "/path/to/file.fbx" "/path/to/preview.png"
    argv = sys.argv
    # 找到 "--" 后面的参数
    try:
        idx = argv.index("--")
        fbx_path = argv[idx + 1]
        preview_output = argv[idx + 2] if len(argv) > idx + 2 else ""
    except (ValueError, IndexError):
        # 尝试从环境变量读取
        fbx_path = os.environ.get("TA_FBX_PATH", "")
        preview_output = ""

    if not fbx_path:
        print(json.dumps({"error": "未提供 FBX 文件路径"}))
    else:
        result = read_fbx(fbx_path, preview_output=preview_output)
        print(json.dumps(result, ensure_ascii=False))
