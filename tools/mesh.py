"""
面数预算检查工具
"""
from config import MESH_BUDGETS


SCHEMA = {
    "type": "function",
    "function": {
        "name": "check_mesh_budget",
        "description": "检查模型面数是否在预算范围内。需要提供面数和资产类型。",
        "parameters": {
            "type": "object",
            "properties": {
                "face_count": {
                    "type": "integer",
                    "description": "模型的面数（三角面）"
                },
                "asset_type": {
                    "type": "string",
                    "enum": ["character", "weapon", "prop", "building", "nature", "vehicle"],
                    "description": "资产类型"
                }
            },
            "required": ["face_count", "asset_type"]
        }
    }
}


def check_mesh_budget(face_count: int, asset_type: str) -> dict:
    """检查面数是否在预算内"""
    budget = MESH_BUDGETS.get(asset_type, 10000)
    ratio = face_count / budget

    if ratio <= 1.0:
        status = "pass"
        detail = f"面数 {face_count:,} 在预算 {budget:,} 以内（使用 {ratio:.0%}）"
    elif ratio <= 1.2:
        status = "warning"
        detail = f"面数 {face_count:,} 略超预算 {budget:,}（超出 {(ratio-1):.0%}），建议优化"
    else:
        status = "fail"
        detail = f"面数 {face_count:,} 严重超出预算 {budget:,}（超出 {(ratio-1):.0%}），必须优化"

    return {
        "face_count": face_count,
        "budget": budget,
        "ratio": round(ratio, 2),
        "status": status,
        "detail": detail,
    }
