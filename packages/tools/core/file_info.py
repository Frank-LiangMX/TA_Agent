"""
文件信息获取与目录扫描工具
"""
import os

from config import NAMING_CONVENTIONS
from tools.core.naming import check_naming


# 扫描时识别的资产扩展名
ASSET_EXTENSIONS = {
    '.fbx', '.obj', '.blend', '.gltf', '.glb',       # 3D 模型
    '.png', '.jpg', '.jpeg', '.tga', '.bmp', '.exr', '.hdr',  # 贴图
    '.mat', '.mtl',                                    # 材质
    '.uasset',                                         # UE 资产
}

MODEL_EXTENSIONS = {'.fbx', '.obj', '.blend', '.gltf', '.glb'}
TEXTURE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.tga', '.bmp', '.exr', '.hdr'}
MATERIAL_EXTENSIONS = {'.mat', '.mtl'}


CHECK_FILE_INFO_SCHEMA = {
    "type": "function",
    "function": {
        "name": "check_file_info",
        "description": "获取文件的基本信息（大小、扩展名、所在目录等）。用于初步判断资产类型。",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "文件的完整路径"
                }
            },
            "required": ["file_path"]
        }
    }
}

SCAN_DIRECTORY_SCHEMA = {
    "type": "function",
    "function": {
        "name": "scan_directory",
        "description": "扫描指定目录，列出所有文件。默认只列资产类（.fbx/.png/.blend 等），传 include_all=True 可列全部。",
        "parameters": {
            "type": "object",
            "properties": {
                "dir_path": {
                    "type": "string",
                    "description": "要扫描的目录路径"
                },
                "recursive": {
                    "type": "boolean",
                    "description": "是否递归扫描子目录",
                    "default": True
                },
                "include_all": {
                    "type": "boolean",
                    "description": "是否包含非资产类文件（默认 False，只列资产）",
                    "default": False
                }
            },
            "required": ["dir_path"]
        }
    }
}


def check_file_info(file_path: str) -> dict:
    """获取文件基本信息"""
    result = {
        "file_path": file_path,
        "exists": False,
    }

    if not os.path.exists(file_path):
        result["error"] = f"文件不存在: {file_path}"
        return result

    result["exists"] = True
    result["filename"] = os.path.basename(file_path)
    result["extension"] = os.path.splitext(file_path)[1].lower()
    result["size_bytes"] = os.path.getsize(file_path)
    result["size_mb"] = round(result["size_bytes"] / (1024 * 1024), 2)
    result["directory"] = os.path.dirname(file_path)

    # 根据扩展名判断文件类型
    if result["extension"] in MODEL_EXTENSIONS:
        result["category"] = "3D 模型"
    elif result["extension"] in TEXTURE_EXTENSIONS:
        result["category"] = "贴图"
    elif result["extension"] in MATERIAL_EXTENSIONS:
        result["category"] = "材质"
    else:
        result["category"] = "未知"

    return result


def scan_directory(dir_path: str, recursive: bool = True, include_all: bool = False) -> dict:
    """扫描目录中的文件，逐个验证命名规范（仅对资产类）"""
    if not os.path.exists(dir_path):
        return {"error": f"目录不存在: {dir_path}"}

    files = []
    naming_issues = []

    walker = os.walk(dir_path) if recursive else [(dir_path, [], os.listdir(dir_path))]

    for root, dirs, filenames in walker:
        for fname in filenames:
            ext = os.path.splitext(fname)[1].lower()
            if not include_all and ext not in ASSET_EXTENSIONS:
                continue

            full_path = os.path.join(root, fname) if recursive else os.path.join(dir_path, fname)
            if not os.path.isfile(full_path):
                continue

            file_entry = {
                "filename": fname,
                "path": full_path,
                "extension": ext,
                "size_mb": round(os.path.getsize(full_path) / (1024 * 1024), 2),
            }
            files.append(file_entry)

            # 仅对资产类验证命名规范
            if ext in ASSET_EXTENSIONS:
                naming_result = check_naming(fname)
                if not naming_result["is_valid"]:
                    naming_issues.append({
                        "filename": fname,
                        "path": full_path,
                        "issues": naming_result["issues"],
                    })

    # 按扩展名统计
    ext_stats = {}
    for f in files:
        ext = f["extension"]
        if ext not in ext_stats:
            ext_stats[ext] = {"count": 0, "total_mb": 0.0}
        ext_stats[ext]["count"] += 1
        ext_stats[ext]["total_mb"] += f["size_mb"]

    # 对每个 ext_stats 的 total_mb 做四舍五入
    for ext in ext_stats:
        ext_stats[ext]["total_mb"] = round(ext_stats[ext]["total_mb"], 2)

    return {
        "directory": dir_path,
        "total_files": len(files),
        "extension_stats": ext_stats,
        "naming_issues_count": len(naming_issues),
        "naming_issues": naming_issues,
        "files": files,
    }
