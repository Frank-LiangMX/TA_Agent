"""
Blender FBX 读取脚本
由 agent 通过 subprocess 调用 blender --background --python 运行
输出 JSON 到 stdout
"""
import bpy
import sys
import json
import os


def read_fbx(fbx_path: str) -> dict:
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

    if not mesh_objects:
        result["error"] = "文件中没有找到网格数据"
        return result

    result["is_scene"] = len(mesh_objects) > 1
    result["sub_mesh_count"] = len(mesh_objects)
    result["has_skeleton"] = len(armature_objects) > 0
    result["armature_count"] = len(armature_objects)

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

        # 材质信息：名称列表 + 是否有实际材质
        mat_names = []
        for slot in obj.material_slots:
            if slot.material:
                mat_names.append(slot.material.name)
            else:
                mat_names.append(None)  # 空槽位

        mesh_details.append({
            "name": obj.name,
            "vertices": v_count,
            "faces": f_count,
            "material_count": len(obj.material_slots),
            "material_names": mat_names,
            "has_materials": any(m is not None for m in mat_names),
            "has_armature_modifier": any(mod.type == 'ARMATURE' for mod in obj.modifiers),
        })

    # 汇总材质信息
    all_mat_names = []
    has_any_material = False
    for detail in mesh_details:
        for name in detail.get("material_names", []):
            if name and name not in all_mat_names:
                all_mat_names.append(name)
        if detail.get("has_materials"):
            has_any_material = True

    result.update({
        "total_vertices": total_vertices,
        "total_faces": total_faces,
        "uv_channel_count": len(uv_layers),
        "uv_layer_names": list(uv_layers),
        "material_names": all_mat_names,
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

    # 骨骼信息
    if armature_objects:
        bone_info = []
        for arm in armature_objects:
            bone_info.append({
                "name": arm.name,
                "bone_count": len(arm.data.bones),
            })
        result["skeleton_info"] = bone_info

    result["mesh_details"] = mesh_details[:20]  # 最多 20 个

    return result


if __name__ == "__main__":
    # 从命令行参数获取 FBX 路径
    # blender --background --python blender_fbx_reader.py -- "/path/to/file.fbx"
    argv = sys.argv
    # 找到 "--" 后面的参数
    try:
        idx = argv.index("--")
        fbx_path = argv[idx + 1]
    except (ValueError, IndexError):
        # 尝试从环境变量读取
        fbx_path = os.environ.get("TA_FBX_PATH", "")

    if not fbx_path:
        print(json.dumps({"error": "未提供 FBX 文件路径"}))
    else:
        result = read_fbx(fbx_path)
        print(json.dumps(result, ensure_ascii=False))
