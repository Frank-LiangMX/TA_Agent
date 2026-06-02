"""
目录结构检查工具
"""
from config import PROJECT_DIRECTORY_TREE


SCHEMA = {
    "type": "function",
    "function": {
        "name": "check_directory_structure",
        "description": "检查资产路径是否符合项目目录结构规范。返回应该存放的正确目录。",
        "parameters": {
            "type": "object",
            "properties": {
                "current_path": {
                    "type": "string",
                    "description": "资产当前路径，例如 /Assets/Import/SM_WoodenTable.fbx"
                },
                "asset_type": {
                    "type": "string",
                    "enum": ["character", "weapon", "prop", "building", "nature", "vehicle", "effect", "material"],
                    "description": "资产类型"
                }
            },
            "required": ["current_path", "asset_type"]
        }
    }
}


def check_directory_structure(current_path: str, asset_type: str) -> dict:
    """检查目录结构是否规范"""
    type_to_dir = {
        "character": "/Game/Characters/",
        "weapon":    "/Game/Weapons/",
        "prop":      "/Game/Environment/Props/",
        "building":  "/Game/Environment/Architecture/",
        "nature":    "/Game/Environment/Nature/",
        "vehicle":   "/Game/Vehicles/",
        "effect":    "/Game/Effects/",
        "material":  "/Game/Materials/",
    }

    expected_dir = type_to_dir.get(asset_type, "/Game/")
    is_correct = expected_dir.lower() in current_path.lower()

    return {
        "current_path": current_path,
        "asset_type": asset_type,
        "expected_directory": expected_dir,
        "is_in_correct_directory": is_correct,
        "suggestion": None if is_correct else f"建议移动到 {expected_dir}",
        "project_structure": PROJECT_DIRECTORY_TREE,
    }
