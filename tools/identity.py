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


def _get_analyzer():
    global _analyzer
    if _analyzer is None:
        from analyzer import AssetIdentityAnalyzer
        store_dir = os.path.join(os.path.dirname(__file__), "..", "tag_store")
        _analyzer = AssetIdentityAnalyzer(
            store_dir=os.path.abspath(store_dir),
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
                "naming_prefix": {
                    "type": "string",
                    "description": "命名规范前缀（如 SM_、SK_、T_），用于命名合规检查。不填则使用默认规则。",
                },
                "enable_ai_inference": {
                    "type": "boolean",
                    "description": "是否启用 AI 推断层（自动推断分类、材质、风格、状态等）。默认 false。启用后每个资产会调用一次 LLM 分析。",
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

def analyze_assets(dir_path: str, naming_prefix: str = None, enable_ai_inference: bool = False) -> dict:
    """
    分析目录中的资产，生成身份证。

    参数:
        dir_path: 要分析的目录路径
        naming_prefix: 命名规范前缀（可选）
        enable_ai_inference: 是否启用 AI 推断层

    返回:
        分析结果汇总
    """
    if not dir_path:
        return {"error": "必须提供 dir_path 参数"}

    if not os.path.exists(dir_path):
        return {"error": f"目录不存在: {dir_path}"}

    # 构建命名配置
    naming_config = None
    if naming_prefix:
        naming_config = {"prefix": naming_prefix}

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

    # 进度回调：打印到控制台
    def _print_progress(phase, current, total, detail, elapsed=0):
        import sys
        if phase == "textures":
            print(f"  [贴图分析] {current}/{total} - {detail}  [{_fmt(elapsed)}]")
        elif phase == "assets":
            print(f"  [FBX 分析] {current}/{total} - {detail}  [{_fmt(elapsed)}]")
        elif phase == "inference":
            # inference 阶段由 inferrer.py 内部的动态计时处理，这里不再重复打印
            pass
        elif phase == "done":
            print(f"  [完成] 共分析 {current} 个资产  总耗时: {_fmt(elapsed)}")
        sys.stdout.flush()

    result = analyzer.analyze_directory(
        dir_path=dir_path,
        naming_config=naming_config,
        enable_ai_inference=enable_ai_inference,
        conventions_context=conventions_context,
        on_progress=_print_progress,
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
