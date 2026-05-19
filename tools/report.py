"""
报告生成工具

直接从数据库生成质检报告，不走 LLM。
"""

import os

SCHEMA = {
    "type": "function",
    "function": {
        "name": "generate_report",
        "description": "生成质检报告。直接从数据库查询资产数据并生成报告，不需要 LLM 构造数据。可指定目录过滤。",
        "parameters": {
            "type": "object",
            "properties": {
                "dir_path": {
                    "type": "string",
                    "description": "目录路径（可选），只报告该目录下的资产。不填则报告全部。",
                },
            },
            "required": [],
        },
    },
}


def generate_report(dir_path: str = None) -> dict:
    """从数据库生成质检报告"""
    from tags.store import TagStore
    from config import NAMING_CONVENTIONS, MESH_BUDGETS, TEXTURE_BUDGETS

    store_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tag_store")
    store = TagStore(store_dir)

    # 查询资产
    if dir_path:
        all_assets = store.search({})
        dir_abs = os.path.abspath(dir_path)
        assets = [a for a in all_assets if os.path.abspath(os.path.dirname(a.file_path)).startswith(dir_abs)]
    else:
        assets = store.search({})

    if not assets:
        return {"error": "没有找到资产", "dir_path": dir_path}

    # 执行检查
    results = []
    pass_count = 0
    fail_count = 0
    warn_count = 0

    for tags in assets:
        name = tags.asset_name

        # 跳过动画和贴图（不同类型检查项不同）
        if tags.asset_type == "animation":
            continue

        # 检查命名
        if not tags.meta.naming_compliant:
            results.append({
                "asset": name,
                "check": "命名规范",
                "status": "warning",
                "detail": f"命名不合规: {', '.join(tags.meta.naming_issues[:2])}",
            })
            warn_count += 1
        else:
            pass_count += 1

        # 检查面数（仅模型）
        if tags.asset_type in ("static_mesh", "skeletal_mesh", "mesh"):
            budget_key = tags.category.category if tags.category.category else "prop"
            budget = MESH_BUDGETS.get(budget_key, 10000)
            if tags.mesh.tri_count > budget:
                ratio = tags.mesh.tri_count / budget
                results.append({
                    "asset": name,
                    "check": "面数预算",
                    "status": "fail" if ratio > 1.5 else "warning",
                    "detail": f"{tags.mesh.tri_count:,} 面，预算 {budget:,}（超标 {ratio:.0%}）",
                })
                if ratio > 1.5:
                    fail_count += 1
                else:
                    warn_count += 1
            else:
                pass_count += 1

            # 检查材质
            if not tags.mesh.has_materials:
                results.append({
                    "asset": name,
                    "check": "材质",
                    "status": "warning",
                    "detail": "无材质",
                })
                warn_count += 1
            else:
                pass_count += 1

    total = pass_count + fail_count + warn_count

    # 生成摘要
    title = f"质检报告 - {os.path.basename(dir_path) if dir_path else '全部资产'}"
    summary = {
        "total_assets": len(assets),
        "total_checks": total,
        "pass": pass_count,
        "fail": fail_count,
        "warning": warn_count,
        "pass_rate": f"{pass_count / total * 100:.0f}%" if total > 0 else "N/A",
    }

    # 只返回前 50 个问题（避免结果过大）
    issues = [r for r in results if r["status"] != "pass"]
    issues.sort(key=lambda x: 0 if x["status"] == "fail" else 1)

    return {
        "title": title,
        "summary": summary,
        "issues": issues[:50],
        "issues_truncated": len(issues) > 50,
    }
