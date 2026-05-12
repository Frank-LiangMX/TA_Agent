"""
tools/intake.py - 入库工作流

审核通过后，自动完成：
  1. 根据 ProjectConfig 生成规范名称
  2. 创建引擎目录结构
  3. 重命名 + 移动文件（含关联贴图）
  4. 生成 UE5 导入清单（import_manifest.json + import_assets.py）
  5. 记录审计日志
"""
from __future__ import annotations

import json
import os
import re
import shutil
from datetime import datetime
from typing import Optional

from tags.store import TagStore
from tags.schema import AssetTags
from core.project_config import ProjectConfig, find_project_config


# ========== Schema 定义 ==========

INTAKE_ASSET_DEF = {
    "type": "function",
    "function": {
        "name": "intake_asset",
        "description": "对单个已审核通过的资产执行入库流程：重命名、移动到引擎目录、生成导入清单。",
        "parameters": {
            "type": "object",
            "properties": {
                "asset_id": {
                    "type": "string",
                    "description": "资产 ID（从 TagStore 中获取）",
                },
                "target_engine_dir": {
                    "type": "string",
                    "description": "UE5 Content 目录（如 D:/UE5/MyProject/Content）",
                },
                "project_config_name": {
                    "type": "string",
                    "description": "项目配置名称（可选，默认使用第一个找到的配置）",
                },
                "dry_run": {
                    "type": "boolean",
                    "description": "试运行模式，只显示结果不实际操作（默认 false）",
                    "default": False,
                },
            },
            "required": ["asset_id", "target_engine_dir"],
        },
    },
}

INTAKE_BATCH_DEF = {
    "type": "function",
    "function": {
        "name": "intake_batch",
        "description": "批量入库：对多个已审核通过的资产执行入库流程，并生成 UE5 导入清单。",
        "parameters": {
            "type": "object",
            "properties": {
                "asset_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "资产 ID 列表",
                },
                "target_engine_dir": {
                    "type": "string",
                    "description": "UE5 Content 目录",
                },
                "project_config_name": {
                    "type": "string",
                    "description": "项目配置名称（可选）",
                },
                "dry_run": {
                    "type": "boolean",
                    "description": "试运行模式（默认 false）",
                    "default": False,
                },
            },
            "required": ["asset_ids", "target_engine_dir"],
        },
    },
}

INTAKE_APPROVED_DEF = {
    "type": "function",
    "function": {
        "name": "intake_approved",
        "description": "一键入库所有已审核通过（approved）的资产。",
        "parameters": {
            "type": "object",
            "properties": {
                "target_engine_dir": {
                    "type": "string",
                    "description": "UE5 Content 目录",
                },
                "project_config_name": {
                    "type": "string",
                    "description": "项目配置名称（可选）",
                },
                "store_dir": {
                    "type": "string",
                    "description": "数据库目录（可选）",
                },
                "dry_run": {
                    "type": "boolean",
                    "description": "试运行模式（默认 false）",
                    "default": False,
                },
            },
            "required": ["target_engine_dir"],
        },
    },
}


# ========== 工具实现 ==========

def intake_asset(
    asset_id: str,
    target_engine_dir: str,
    project_config_name: str = None,
    store_dir: str = None,
    dry_run: bool = False,
) -> dict:
    """
    对单个资产执行入库流程。

    流程：
    1. 从 TagStore 加载资产标签
    2. 确定资产类型和分类
    3. 生成规范名称
    4. 确定目标路径
    5. 创建目标目录
    6. 重命名 + 移动文件（含关联贴图）
    7. 更新 TagStore 记录
    8. 记录审计日志
    """
    if store_dir is None:
        store_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tag_store")

    store = TagStore(store_dir)
    tags = store.load(asset_id)

    if tags is None:
        return {"success": False, "error": f"资产不存在: {asset_id}"}

    if tags.meta.status != "approved":
        return {
            "success": False,
            "error": f"资产未审核通过，当前状态: {tags.meta.status}",
            "asset_name": tags.asset_name,
        }

    # 加载项目配置
    config = _load_config(project_config_name)

    # 执行入库步骤
    steps = []
    try:
        # 步骤 1：确定资产分类
        category = _determine_category(tags)
        steps.append({"step": "determine_category", "status": "success", "detail": category})

        # 步骤 2：生成规范名称
        new_name = _generate_new_name(tags, category, config)
        steps.append({"step": "generate_name", "status": "success", "detail": new_name})

        # 步骤 3：确定目标路径
        engine_path = _get_engine_path(category, config)
        target_dir = os.path.join(target_engine_dir, engine_path.lstrip("/").replace("/", os.sep))
        steps.append({"step": "determine_path", "status": "success", "detail": target_dir})

        # 步骤 4：查找关联贴图
        related_textures = _find_related_textures(tags)
        steps.append({"step": "find_textures", "status": "success", "detail": f"{len(related_textures)} 张贴图"})

        # 步骤 5：创建目录 + 移动文件
        if not dry_run:
            os.makedirs(target_dir, exist_ok=True)

        # 移动 FBX
        fbx_ext = os.path.splitext(tags.file_path)[1]
        new_fbx_path = os.path.join(target_dir, f"{new_name}{fbx_ext}")
        if not dry_run:
            if os.path.exists(tags.file_path):
                shutil.move(tags.file_path, new_fbx_path)
            else:
                steps.append({"step": "move_fbx", "status": "warning", "detail": f"源文件不存在: {tags.file_path}"})
        steps.append({"step": "move_fbx", "status": "success", "detail": f"{tags.asset_name}{fbx_ext} → {new_name}{fbx_ext}"})

        # 移动关联贴图
        moved_textures = []
        for tex_path in related_textures:
            tex_name = os.path.basename(tex_path)
            new_tex_name = _rename_texture(tex_name, tags.asset_name, new_name, config)
            new_tex_path = os.path.join(target_dir, new_tex_name)
            if not dry_run:
                if os.path.exists(tex_path):
                    shutil.move(tex_path, new_tex_path)
            moved_textures.append({"old": tex_name, "new": new_tex_name})
        if moved_textures:
            steps.append({"step": "move_textures", "status": "success", "detail": moved_textures})

        # 步骤 6：更新 TagStore
        if not dry_run:
            tags.file_path = new_fbx_path
            tags.asset_name = new_name
            tags.meta.engine_path = os.path.join(engine_path, f"{new_name}{fbx_ext}").replace("\\", "/")
            tags.meta.intake_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            tags.meta.status = "imported"
            store.save(tags)
        steps.append({"step": "update_store", "status": "success", "detail": "状态更新为 imported"})

        # 步骤 7：记录审计日志
        if not dry_run:
            _log_intake(store_dir, {
                "asset_id": asset_id,
                "original_name": os.path.basename(tags.file_path) if dry_run else f"{new_name}{fbx_ext}",
                "final_name": f"{new_name}{fbx_ext}",
                "source_path": tags.file_path,
                "target_path": new_fbx_path,
                "category": category,
                "action": "intake",
                "status": "success",
            })
        steps.append({"step": "audit_log", "status": "success", "detail": "已记录"})

        return {
            "success": True,
            "dry_run": dry_run,
            "asset_id": asset_id,
            "original_name": tags.asset_name,
            "new_name": new_name,
            "target_dir": target_dir,
            "final_path": new_fbx_path,
            "related_textures": moved_textures,
            "steps": steps,
            "message": f"{'[试运行] ' if dry_run else ''}入库成功: {new_name}",
        }

    except Exception as e:
        steps.append({"step": "error", "status": "failed", "detail": str(e)})
        return {
            "success": False,
            "dry_run": dry_run,
            "asset_id": asset_id,
            "steps": steps,
            "error": str(e),
        }


def intake_batch(
    asset_ids: list[str],
    target_engine_dir: str,
    project_config_name: str = None,
    store_dir: str = None,
    dry_run: bool = False,
) -> dict:
    """
    批量入库，生成汇总结果。

    返回：
    {
        "total": int,
        "success": int,
        "failed": int,
        "results": [...],
    }
    """
    results = []
    success_count = 0
    fail_count = 0

    for asset_id in asset_ids:
        result = intake_asset(
            asset_id=asset_id,
            target_engine_dir=target_engine_dir,
            project_config_name=project_config_name,
            store_dir=store_dir,
            dry_run=dry_run,
        )
        results.append(result)
        if result.get("success"):
            success_count += 1
        else:
            fail_count += 1

    # 批量入库完成后生成导入清单
    manifest_path = None
    script_path = None
    if success_count > 0 and not dry_run:
        # 收集成功入库的资产信息
        store = TagStore(store_dir or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tag_store"))
        imported_assets = []
        for r in results:
            if r.get("success"):
                tags = store.load(r["asset_id"])
                if tags:
                    imported_assets.append(tags)

        if imported_assets:
            config = _load_config(project_config_name)
            manifest_path = _generate_import_manifest(
                imported_assets, target_engine_dir, config, store_dir
            )
            script_path = _generate_import_script(manifest_path, store_dir)

    return {
        "total": len(asset_ids),
        "success": success_count,
        "failed": fail_count,
        "dry_run": dry_run,
        "results": results,
        "manifest_path": manifest_path,
        "script_path": script_path,
        "message": f"{'[试运行] ' if dry_run else ''}批量入库完成: {success_count} 成功, {fail_count} 失败",
    }


def intake_approved(
    target_engine_dir: str,
    project_config_name: str = None,
    store_dir: str = None,
    dry_run: bool = False,
) -> dict:
    """
    一键入库所有已审核通过的资产。
    """
    if store_dir is None:
        store_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tag_store")

    store = TagStore(store_dir)
    approved_assets = store.search({"status": "approved"})

    if not approved_assets:
        return {
            "total": 0,
            "success": 0,
            "failed": 0,
            "message": "没有已审核通过的资产",
        }

    asset_ids = [t.asset_id for t in approved_assets]
    return intake_batch(
        asset_ids=asset_ids,
        target_engine_dir=target_engine_dir,
        project_config_name=project_config_name,
        store_dir=store_dir,
        dry_run=dry_run,
    )


# ========== 内部辅助函数 ==========

def _load_config(config_name: str = None) -> Optional[ProjectConfig]:
    """加载项目配置"""
    config_path = find_project_config(config_name)
    if config_path:
        return ProjectConfig.load(config_path)
    return None


def _determine_category(tags: AssetTags) -> str:
    """
    确定资产分类。

    优先使用 AI 推断结果，回退到命名前缀。
    """
    # 优先使用 AI 推断的分类
    if tags.category.category:
        return tags.category.category

    # 回退到命名前缀
    prefix_map = {
        "SM_": "prop",
        "SK_": "character",
        "T_": "texture",
        "M_": "material",
        "MI_": "material",
        "AN_": "animation",
    }
    name = tags.asset_name.upper()
    for prefix, cat in prefix_map.items():
        if name.startswith(prefix):
            return cat

    return "prop"


def _generate_new_name(tags: AssetTags, category: str, config: Optional[ProjectConfig]) -> str:
    """
    生成规范名称。

    根据 ProjectConfig 的命名规则，结合资产信息生成。
    """
    # 从资产名称中提取基础名称（去掉已有的前缀）
    base_name = _extract_base_name(tags.asset_name)

    if config:
        return config.suggest_naming(category, base_name, "01")

    # 默认命名规则
    prefix_map = {
        "character": "SK_",
        "weapon": "SM_",
        "building": "SM_",
        "prop": "SM_",
        "vehicle": "SK_",
        "texture": "T_",
        "material": "M_",
    }
    prefix = prefix_map.get(category, "SM_")
    return f"{prefix}{category.capitalize()}_{base_name}_01"


def _extract_base_name(name: str) -> str:
    """
    从资产名称中提取基础名称，去掉已有的前缀和变体后缀。

    例：
      SM_Weapon_Sword_01 → Sword
      sword_01 → sword
      SK_Character_Hero_A → Hero
    """
    # 去掉已知前缀
    prefixes = ["SM_", "SK_", "T_", "M_", "MI_", "AN_"]
    for prefix in prefixes:
        if name.upper().startswith(prefix):
            name = name[len(prefix):]
            break

    # 去掉分类前缀（如 Weapon_, Character_）
    category_words = ["Weapon", "Character", "Building", "Prop", "Vehicle",
                      "weapon", "character", "building", "prop", "vehicle"]
    for word in category_words:
        if name.startswith(word + "_"):
            name = name[len(word) + 1:]
            break

    # 去掉末尾的变体编号（_01, _A, _v2 等）
    name = re.sub(r"[_\-]?\d+$", "", name)
    name = re.sub(r"[_\-]?[A-Z]$", "", name)

    return name if name else "Asset"


def _get_engine_path(category: str, config: Optional[ProjectConfig]) -> str:
    """获取资产类型的引擎目录"""
    if config:
        engine_path = config.get_engine_path(category)
        if engine_path:
            return engine_path

    # 默认引擎目录
    default_paths = {
        "character": "/Game/Characters/",
        "weapon": "/Game/Weapons/",
        "building": "/Game/Environment/Buildings/",
        "prop": "/Game/Environment/Props/",
        "vehicle": "/Game/Vehicles/",
        "texture": "/Game/Textures/",
        "material": "/Game/Materials/",
    }
    return default_paths.get(category, "/Game/Imported/")


def _find_related_textures(tags: AssetTags) -> list[str]:
    """
    查找与 FBX 关联的贴图文件。

    逻辑：在 FBX 同目录下查找同名前缀的图片文件。
    例：sword_01.fbx → sword_01_D.png, sword_01_N.png, ...
    """
    fbx_dir = os.path.dirname(tags.file_path)
    fbx_stem = os.path.splitext(os.path.basename(tags.file_path))[0]

    # 贴图文件扩展名
    texture_exts = {".png", ".jpg", ".jpeg", ".tga", ".tiff", ".bmp", ".exr"}

    related = []
    if os.path.isdir(fbx_dir):
        for filename in os.listdir(fbx_dir):
            ext = os.path.splitext(filename)[1].lower()
            if ext not in texture_exts:
                continue
            # 贴图文件名去掉后缀后，以 FBX 文件名开头
            tex_stem = os.path.splitext(filename)[0]
            if tex_stem.startswith(fbx_stem):
                related.append(os.path.join(fbx_dir, filename))

    return sorted(related)


def _rename_texture(
    old_tex_name: str,
    old_fbx_stem: str,
    new_fbx_name: str,
    config: Optional[ProjectConfig],
) -> str:
    """
    重命名贴图文件。

    将贴图名中的 FBX 名称部分替换为新名称。
    例：sword_01_D.png → T_Weapon_Sword_01_D.png
    """
    ext = os.path.splitext(old_tex_name)[1]
    tex_stem = os.path.splitext(old_tex_name)[0]

    # 替换 FBX 名称部分
    new_tex_stem = tex_stem.replace(old_fbx_stem, new_fbx_name, 1)

    # 如果贴图没有 T_ 前缀，加上
    if not new_tex_stem.upper().startswith("T_"):
        new_tex_stem = f"T_{new_tex_stem}"

    return f"{new_tex_stem}{ext}"


def _generate_import_manifest(
    assets: list[AssetTags],
    target_engine_dir: str,
    config: Optional[ProjectConfig],
    store_dir: str = None,
) -> str:
    """
    生成 UE5 导入清单文件。

    返回清单文件路径。
    """
    if store_dir is None:
        store_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tag_store")

    manifest = {
        "target_content_dir": target_engine_dir.replace("\\", "/"),
        "generated_at": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "project_config": config.project_name if config else "default",
        "assets": [],
    }

    for tags in assets:
        category = _determine_category(tags)

        # 获取导入预设
        preset = {}
        if config:
            import_preset = config.get_import_preset(category)
            if import_preset:
                preset = import_preset.to_dict()
        if not preset:
            preset = {
                "import_scale": 1.0,
                "generate_lod": True,
                "lod_levels": 3,
                "collision": False,
                "material_import": True,
            }

        # 构建元数据
        metadata = {
            "category": category,
            "subcategory": tags.category.subcategory,
            "style": tags.visual.style,
            "materials": tags.material_structure.primary,
            "condition": tags.visual.condition,
            "tri_count": tags.mesh.tri_count,
        }
        if tags.visual.description:
            metadata["description"] = tags.visual.description

        asset_info = {
            "source_path": tags.meta.engine_path,
            "asset_type": tags.asset_type,
            "category": category,
            "import_preset": preset,
            "metadata": metadata,
        }
        manifest["assets"].append(asset_info)

    # 写入文件
    manifest_path = os.path.join(store_dir, "import_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    return manifest_path


def _generate_import_script(manifest_path: str, store_dir: str = None) -> str:
    """
    生成 UE5 导入脚本。

    返回脚本文件路径。
    """
    if store_dir is None:
        store_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tag_store")

    # 将路径转换为 Python 字符串（处理反斜杠）
    manifest_path_escaped = manifest_path.replace("\\", "\\\\")

    script_content = '''"""
TA Agent 自动生成的 UE5 导入脚本
在 UE5 Python Console 中运行此脚本即可完成批量导入

使用方法：
  1. 打开 UE5 Editor
  2. 打开 Python Console（Window → Developer Tools → Output Log → Python）
  3. 运行：exec(open(r"{script_path}").read())
""".format(script_path=r"{manifest_path}")

import unreal
import json
import os


def import_from_manifest(manifest_path: str):
    """读取清单并执行导入"""
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    target_dir = manifest["target_content_dir"]
    assets = manifest["assets"]

    print(f"\\n=== TA Agent 批量导入 ===")
    print(f"目标目录: {target_dir}")
    print(f"资产数量: {len(assets)}")
    print()

    success_count = 0
    fail_count = 0

    for i, asset_info in enumerate(assets, 1):
        source = asset_info["source_path"]
        asset_name = os.path.splitext(os.path.basename(source))[0]
        print(f"[{i}/{len(assets)}] 导入: {asset_name}")

        try:
            # 创建导入任务
            task = unreal.AssetImportTask()
            task.set_editor_property("filename", source)
            task.set_editor_property("destination_path", target_dir)
            task.set_editor_property("replace_existing", True)
            task.set_editor_property("automated", True)

            # 配置 FBX 导入参数
            fbx_ui = unreal.FbxImportUI()
            preset = asset_info["import_preset"]

            fbx_ui.set_editor_property("import_mesh", True)
            fbx_ui.set_editor_property("import_textures", preset.get("material_import", True))
            fbx_ui.set_editor_property("import_materials", preset.get("material_import", True))

            if asset_info.get("asset_type") == "skeletal_mesh":
                fbx_ui.set_editor_property("import_as_skeletal", True)
                mesh_data = unreal.SkeletalMeshImportData()
            else:
                fbx_ui.set_editor_property("import_as_skeletal", False)
                mesh_data = unreal.StaticMeshImportData()

            mesh_data.set_editor_property("import_scale", preset.get("import_scale", 1.0))
            fbx_ui.set_editor_property("static_mesh_import_data", mesh_data)
            task.set_editor_property("options", fbx_ui)

            # 执行导入
            unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])

            if task.get_editor_property("result"):
                # 写入元数据
                asset_path = target_dir + "/" + asset_name
                metadata = asset_info.get("metadata", {})
                for key, value in metadata.items():
                    if value:  # 只写入非空值
                        unreal.EditorAssetLibrary.set_metadata_tag(
                            asset_path, key, str(value)
                        )
                unreal.EditorAssetLibrary.save_asset(asset_path)

                success_count += 1
                print(f"  ✅ 导入成功")
            else:
                fail_count += 1
                print(f"  ❌ 导入失败")

        except Exception as e:
            fail_count += 1
            print(f"  ❌ 错误: {str(e)}")

    print(f"\\n=== 导入完成 ===")
    print(f"成功: {success_count}, 失败: {fail_count}")


# 执行导入
import_from_manifest(r"{manifest_path}")
'''.replace("{manifest_path}", manifest_path_escaped)

    script_path = os.path.join(store_dir, "import_assets.py")
    with open(script_path, "w", encoding="utf-8") as f:
        f.write(script_content)

    return script_path


def _log_intake(store_dir: str, log_entry: dict):
    """记录入库审计日志"""
    log_entry["timestamp"] = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    log_path = os.path.join(store_dir, "intake_log.jsonl")
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(log_entry, ensure_ascii=False) + "\n")


# ========== 注册到 Agent ==========

INTAKE_TOOLS = [
    INTAKE_ASSET_DEF,
    INTAKE_BATCH_DEF,
    INTAKE_APPROVED_DEF,
]

INTAKE_TOOL_FUNCTIONS = {
    "intake_asset": intake_asset,
    "intake_batch": intake_batch,
    "intake_approved": intake_approved,
}
