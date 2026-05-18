"""
tools/identity.py - 资产身份系统工具

提供四个工具：
  analyze_assets   - 分析目录，生成资产身份证
  search_assets    - 按标签搜索已入库资产
  get_asset_detail - 查看单个资产的完整身份证
  list_assets      - 列出所有已入库资产
"""
from __future__ import annotations
import os

from conventions.context import get_conventions_context

# 全局分析器实例（复用同一个存储目录）
_analyzer: AssetIdentityAnalyzer | None = None

# 模块级进度回调（由 agent.py 注入，用于 rich 进度面板）
_active_progress_callback = None


def set_progress_callback(fn):
    """设置进度回调（agent.py 在执行 analyze_assets 前调用）"""
    global _active_progress_callback
    _active_progress_callback = fn


def clear_progress_callback():
    """清除进度回调（agent.py 在工具执行完成后调用）"""
    global _active_progress_callback
    _active_progress_callback = None


def _get_analyzer():
    global _analyzer
    if _analyzer is None:
        from analyzer import AssetIdentityAnalyzer
        from tools.memory import NullMemoryProvider
        from tools.memory_tools import get_memory_provider
        store_dir = os.path.join(os.path.dirname(__file__), "..", "tag_store")
        # 使用全局记忆提供器（由 agent.py 或 server.py 初始化）
        mem = get_memory_provider() or NullMemoryProvider()
        _analyzer = AssetIdentityAnalyzer(
            store_dir=os.path.abspath(store_dir),
            memory=mem,
        )
    return _analyzer


# ============================================================
# 工具定义（Schema 格式，传给 LLM）
# ============================================================

ANALYZE_ASSETS_DEF = {
    "type": "function",
    "function": {
        "name": "analyze_assets",
        "description": (
            "分析指定目录中的所有资产（FBX模型+贴图），为每个资产生成结构化的'资产身份证'。"
            "身份证包含：几何信息（面数、包围盒、骨骼）、贴图信息（分辨率、格式、用途）、"
            "命名合规性检查、关联资产识别。"
            "返回汇总报告和每个资产的详细标签数据。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "dir_path": {
                    "type": "string",
                    "description": "要分析的资产目录路径",
                },
                "file_pattern": {
                    "type": "string",
                    "description": "文件名过滤模式（可选），支持通配符如 'SK_*.fbx'、'*.fbx'、'@*.*'。不填则分析所有文件。",
                },
                "naming_prefix": {
                    "type": "string",
                    "description": "命名规范前缀（如 SM_、SK_、T_），用于命名合规检查。不填则使用默认规则。",
                },
                "enable_ai_inference": {
                    "type": "boolean",
                    "description": "是否启用 AI 推断层（自动推断分类、材质、风格、状态等）。默认 true。设置 false 可跳过推断只做基础分析。",
                },
            },
            "required": ["dir_path"],
        },
    },
}

SEARCH_ASSETS_DEF = {
    "type": "function",
    "function": {
        "name": "search_assets",
        "description": (
            "在已入库的资产中按标签条件搜索。"
            "可按资产类别、子类、风格、状态、面数范围等条件筛选。"
            "返回匹配的资产列表及其摘要信息。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "description": "资产大类：character / weapon / building / vehicle / prop / environment",
                },
                "subcategory": {
                    "type": "string",
                    "description": "资产子类（如：商业高楼、人形角色）",
                },
                "style": {
                    "type": "string",
                    "description": "视觉风格：现代 / 古风 / 科幻 / 写实 / 卡通",
                },
                "condition": {
                    "type": "string",
                    "description": "状态：全新 / 轻微磨损 / 重度磨损 / 破碎",
                },
                "min_tri_count": {
                    "type": "integer",
                    "description": "最小面数过滤",
                },
                "max_tri_count": {
                    "type": "integer",
                    "description": "最大面数过滤",
                },
                "status": {
                    "type": "string",
                    "description": "审核状态：pending / approved / rejected",
                },
            },
        },
    },
}

GET_ASSET_DETAIL_DEF = {
    "type": "function",
    "function": {
        "name": "get_asset_detail",
        "description": (
            "查看单个资产的完整身份证信息。"
            "需要提供 asset_id（从 analyze_assets 或 search_assets 的返回结果中获取）。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "asset_id": {
                    "type": "string",
                    "description": "资产的唯一标识 ID",
                },
            },
            "required": ["asset_id"],
        },
    },
}

LIST_ASSETS_DEF = {
    "type": "function",
    "function": {
        "name": "list_assets",
        "description": (
            "列出所有已入库的资产索引。"
            "返回资产ID、名称、类别、面数等摘要信息。"
        ),
        "parameters": {
            "type": "object",
            "properties": {},
        },
    },
}


# ============================================================
# 工具实现（接收关键字参数）
# ============================================================

def analyze_assets(dir_path: str, naming_prefix: str = None, enable_ai_inference: bool = True, ai_inference_threshold: int = 50, file_pattern: str = None) -> dict:
    """
    分析目录中的资产，生成身份证。

    参数:
        dir_path: 要分析的目录路径
        naming_prefix: 命名规范前缀（可选）
        enable_ai_inference: 是否启用 AI 推断层（默认 true）
        ai_inference_threshold: AI 推断资产数超过此阈值时，先返回基础分析结果，不执行推断（默认 50）
        file_pattern: 文件名过滤模式（可选），如 'SK_*.fbx'

    返回:
        分析结果汇总。
    """
    if not dir_path:
        return {"error": "必须提供 dir_path 参数"}

    if not os.path.exists(dir_path):
        return {"error": f"目录不存在: {dir_path}"}

    # 构建命名配置
    naming_config = None
    if naming_prefix:
        naming_config = {"prefix": naming_prefix}

    # 读取项目配置的自定义规则
    custom_rules = []
    try:
        from core.project_config import find_project_config, ProjectConfig
        config_path = find_project_config()
        if config_path:
            config = ProjectConfig.load(config_path)
            custom_rules = config.custom_rules or []
    except Exception:
        pass

    # 获取已加载的规范上下文（供 AI 推断使用）
    conventions_context = get_conventions_context() if enable_ai_inference else ""

    analyzer = _get_analyzer()

    def _fmt(sec):
        """格式化秒数：>=60s 显示分钟"""
        if sec >= 60:
            m = int(sec) // 60
            s = sec - m * 60
            return f"{m}m {s:.1f}s"
        return f"{sec:.1f}s"

    # 进度回调：优先使用外部注入的 rich 回调，降级为 print
    progress_cb = _active_progress_callback  # 由 agent.py 注入

    def _print_progress(phase, current, total, detail, elapsed=0):
        import sys
        if progress_cb:
            progress_cb(phase, current, total, detail, elapsed)
            return
        if phase == "textures":
            print(f"  [贴图分析] {current}/{total} - {detail}  [{_fmt(elapsed)}]")
        elif phase == "assets":
            print(f"  [FBX 分析] {current}/{total} - {detail}  [{_fmt(elapsed)}]")
        elif phase == "inference":
            pass
        elif phase == "done":
            print(f"  [完成] 共分析 {current} 个资产  总耗时: {_fmt(elapsed)}")
        sys.stdout.flush()

    # 如果启用 AI 推断，先检查资产数量，超过阈值则只跑基础分析
    actual_inference = enable_ai_inference
    if enable_ai_inference:
        # 先跑基础分析（不带 AI 推断）
        result = analyzer.analyze_directory(
            dir_path=dir_path,
            naming_config=naming_config,
            enable_ai_inference=False,
            conventions_context=conventions_context,
            custom_rules=custom_rules,
            on_progress=_print_progress,
            file_pattern=file_pattern,
        )
        # 统计可推断的资产数（排除动画、纯贴图、无网格）
        inferable_count = sum(
            1 for a in result.get("assets", [])
            if a.get("asset_type") != "animation"
            and a.get("asset_type") != "texture"
            and a.get("mesh", {}).get("tri_count", 0) > 0
        )
        if inferable_count > ai_inference_threshold:
            # 超过阈值，先返回基础结果，等用户确认
            ret = {
                "total_assets": result["total_assets"],
                "store_dir": result["store_dir"],
                "summary": result["summary"],
                "report_markdown": result["report_markdown"],
                "asset_ids": [a["asset_id"] for a in result.get("assets", [])],
                "need_inference_confirm": True,
                "inferable_count": inferable_count,
                "message": f"基础分析完成，共 {result['total_assets']} 个资产，其中 {inferable_count} 个需要 AI 推断。数量较多，是否继续执行 AI 推断？",
            }
            return ret

    # 正常执行（资产数未超阈值，或未启用 AI 推断）
    result = analyzer.analyze_directory(
        dir_path=dir_path,
        naming_config=naming_config,
        enable_ai_inference=actual_inference,
        conventions_context=conventions_context,
        custom_rules=custom_rules,
        on_progress=_print_progress,
        file_pattern=file_pattern,
    )

    # 简化返回：不传完整的 assets 数据（太大），只传摘要和报告
    ret = {
        "total_assets": result["total_assets"],
        "store_dir": result["store_dir"],
        "summary": result["summary"],
        "report_markdown": result["report_markdown"],
        "asset_ids": [a["asset_id"] for a in result.get("assets", [])],
    }
    # 传递 AI 推断结果（成功/失败统计）
    if "inference_result" in result:
        ret["inference_result"] = result["inference_result"]
    return ret


RUN_INFERENCE_DEF = {
    "type": "function",
    "function": {
        "name": "run_ai_inference",
        "description": "对已分析的资产执行 AI 推断（分类、材质、风格、状态等）。在 analyze_assets 返回 need_inference_confirm=True 后，用户确认后调用此工具。",
        "parameters": {
            "type": "object",
            "properties": {
                "dir_path": {
                    "type": "string",
                    "description": "之前分析过的目录路径",
                },
            },
            "required": ["dir_path"],
        },
    },
}


def run_ai_inference(dir_path: str) -> dict:
    """
    对已分析的资产执行 AI 推断。

    前置条件：该目录已经通过 analyze_assets 完成了基础分析，资产已存入数据库。
    此函数从数据库加载资产，对非动画资产执行 AI 推断，更新数据库。
    """
    if not dir_path or not os.path.exists(dir_path):
        return {"error": "目录不存在"}

    analyzer = _get_analyzer()

    # 从数据库加载该目录的资产
    all_assets = analyzer.store.search({})
    # 过滤出该目录下的资产
    dir_abs = os.path.abspath(dir_path)
    dir_assets = [a for a in all_assets if os.path.abspath(os.path.dirname(a.file_path)).startswith(dir_abs)]

    if not dir_assets:
        return {"error": f"数据库中没有找到 {dir_path} 下的资产，请先运行 analyze_assets"}

    # 过滤掉动画资产和无网格资产
    inferable = [a for a in dir_assets if a.asset_type != "animation" and a.mesh.tri_count > 0]
    skip_count = len(dir_assets) - len(inferable)

    if not inferable:
        return {"message": "没有需要 AI 推断的资产", "total": len(dir_assets), "skipped_animations": skip_count}

    print(f"\n  === AI 智能推断 ({len(inferable)} 个资产) ===")
    import sys; sys.stdout.flush()

    # 获取规范上下文
    conventions_context = get_conventions_context() or ""

    # 构建记忆上下文
    from tools.memory.memory_tools import build_memory_context, extract_asset_features
    memory_context = None
    first_tag = inferable[0]
    asset_features = extract_asset_features(
        asset_name=first_tag.asset_name,
        face_count=first_tag.mesh.tri_count,
        vertex_count=first_tag.mesh.vertex_count,
        material_name=first_tag.mesh.material_names[0] if first_tag.mesh.material_names else None,
        bbox_size=(
            first_tag.mesh.bounding_box.x,
            first_tag.mesh.bounding_box.y,
            first_tag.mesh.bounding_box.z,
        ),
    )
    memory_context = build_memory_context(analyzer.memory, asset_features)

    def _progress(current, total, name, elapsed=0):
        if _active_progress_callback:
            _active_progress_callback("inference", current, total, name, elapsed)
        # else: inferrer 内部有进度打印

    # 执行推断
    from tags.inferrer import infer_batch
    infer_result = infer_batch(
        inferable,
        conventions_context=conventions_context,
        memory_context=memory_context,
        on_progress=_progress,
    )

    # 更新数据库
    for tags in inferable:
        analyzer.store.save(tags)

    return {
        "total": len(dir_assets),
        "inferred": len(inferable),
        "skipped_animations": skip_count,
        "inference_result": infer_result,
        "message": f"AI 推断完成：{len(inferable)} 个资产已更新",
    }


UPDATE_ASSET_TYPE_DEF = {
    "type": "function",
    "function": {
        "name": "update_asset_type",
        "description": "批量更新数据库中资产的类型（asset_type）。当用户说明了某些资产的正确类型后，调用此工具修改数据库。",
        "parameters": {
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "文件名匹配模式，支持通配符（如 '*.fbx'、'@*.*'、'SK_*.*'）",
                },
                "asset_type": {
                    "type": "string",
                    "enum": ["static_mesh", "skeletal_mesh", "material", "material_instance", "texture", "blueprint", "sound", "effect", "animation"],
                    "description": "目标资产类型",
                },
                "asset_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "指定资产 ID 列表（与 pattern 二选一）",
                },
            },
            "required": ["asset_type"],
        },
    },
}


def update_asset_type(asset_type: str, pattern: str = None, asset_ids: list[str] = None) -> dict:
    """
    批量更新资产类型。

    支持两种方式：
    1. pattern：按文件名模式匹配（如 "@*.*" 匹配所有 @ 前缀文件）
    2. asset_ids：指定资产 ID 列表
    """
    import fnmatch

    analyzer = _get_analyzer()
    store = analyzer.store

    if not pattern and not asset_ids:
        return {"error": "必须提供 pattern 或 asset_ids"}

    # 获取所有资产
    all_assets = store.search({})

    # 筛选目标资产
    targets = []
    if asset_ids:
        targets = [a for a in all_assets if a.asset_id in asset_ids]
    elif pattern:
        for a in all_assets:
            filename = os.path.basename(a.file_path)
            if fnmatch.fnmatch(filename, pattern):
                targets.append(a)

    if not targets:
        return {"message": f"没有找到匹配的资产", "pattern": pattern, "asset_ids": asset_ids}

    # 更新
    updated = 0
    for tags in targets:
        old_type = tags.asset_type
        tags.asset_type = asset_type
        store.save(tags)
        updated += 1
        print(f"  {tags.asset_name}: {old_type} → {asset_type}")

    return {
        "updated": updated,
        "asset_type": asset_type,
        "pattern": pattern,
        "message": f"已将 {updated} 个资产的类型更新为 {asset_type}",
    }


UPDATE_ASSET_DEF = {
    "type": "function",
    "function": {
        "name": "update_asset",
        "description": "更新资产的属性（名称、分类、风格等）。用于修正分析结果。",
        "parameters": {
            "type": "object",
            "properties": {
                "asset_id": {
                    "type": "string",
                    "description": "资产 ID",
                },
                "asset_name": {
                    "type": "string",
                    "description": "新的资产名称（可选）",
                },
                "category": {
                    "type": "string",
                    "description": "新的分类（可选，如 character/weapon/prop）",
                },
                "subcategory": {
                    "type": "string",
                    "description": "新的子分类（可选）",
                },
                "style": {
                    "type": "string",
                    "description": "新的风格（可选，如 写实/卡通/科幻）",
                },
                "asset_type": {
                    "type": "string",
                    "description": "新的资产类型（可选）",
                },
            },
            "required": ["asset_id"],
        },
    },
}


def update_asset(asset_id: str, **kwargs) -> dict:
    """更新单个资产的属性"""
    store = _get_tag_store()
    tags = store.load(asset_id)
    if not tags:
        return {"error": f"资产不存在: {asset_id}"}

    updated_fields = []
    if "asset_name" in kwargs and kwargs["asset_name"]:
        tags.asset_name = kwargs["asset_name"]
        updated_fields.append("asset_name")
    if "category" in kwargs and kwargs["category"]:
        tags.category.category = kwargs["category"]
        tags.category.confidence = 1.0
        updated_fields.append("category")
    if "subcategory" in kwargs and kwargs["subcategory"]:
        tags.category.subcategory = kwargs["subcategory"]
        updated_fields.append("subcategory")
    if "style" in kwargs and kwargs["style"]:
        tags.visual.style = kwargs["style"]
        tags.visual.style_confidence = 1.0
        updated_fields.append("style")
    if "asset_type" in kwargs and kwargs["asset_type"]:
        tags.asset_type = kwargs["asset_type"]
        updated_fields.append("asset_type")

    if not updated_fields:
        return {"error": "没有指定要更新的字段"}

    store.save(tags)
    return {
        "success": True,
        "asset_id": asset_id,
        "updated_fields": updated_fields,
        "message": f"已更新 {tags.asset_name}: {', '.join(updated_fields)}",
    }


def search_assets(**kwargs) -> dict:
    """
    按标签搜索已入库资产。

    参数:
        category, subcategory, style, condition,
        min_tri_count, max_tri_count, status

    返回:
        匹配的资产列表
    """
    # 过滤掉 None 值
    query = {k: v for k, v in kwargs.items() if v is not None}

    analyzer = _get_analyzer()
    results = analyzer.search_assets(query)

    # 返回摘要而非完整数据
    summaries = []
    for r in results:
        summaries.append({
            "asset_id": r["asset_id"],
            "asset_name": r["asset_name"],
            "category": r["category"]["category"],
            "subcategory": r["category"]["subcategory"],
            "tri_count": r["mesh"]["tri_count"],
            "texture_count": r["textures"]["count"],
            "style": r["visual"]["style"],
            "condition": r["visual"]["condition"],
            "status": r["meta"]["status"],
        })

    return {
        "count": len(summaries),
        "results": summaries,
    }


def get_asset_detail(asset_id: str) -> dict:
    """
    获取单个资产的完整身份证。

    参数:
        asset_id: 资产唯一标识

    返回:
        完整的资产标签数据
    """
    if not asset_id:
        return {"error": "必须提供 asset_id 参数"}

    analyzer = _get_analyzer()
    result = analyzer.get_asset(asset_id)

    if result is None:
        return {"error": f"未找到资产: {asset_id}"}

    return result


def list_assets() -> dict:
    """
    列出所有已入库资产。

    返回:
        资产索引列表
    """
    analyzer = _get_analyzer()
    assets = analyzer.list_all_assets()
    return {
        "count": len(assets),
        "assets": assets,
    }
