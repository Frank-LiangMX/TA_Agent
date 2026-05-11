"""
TA Agent 工具定义
每个工具包含：OpenAI 格式的工具描述 + 实际执行函数
"""
import os
import re
import json


# ========== 工具 Schema 定义（OpenAI Function Calling 格式）==========

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "check_naming",
            "description": "检查文件命名是否符合项目规范。规范要求文件名以类型前缀开头（如 SM_ 表示静态网格体，SK_ 表示骨骼网格体），后跟描述性名称，使用下划线分隔。",
            "parameters": {
                "type": "object",
                "properties": {
                    "filename": {
                        "type": "string",
                        "description": "要检查的文件名，例如 SM_WoodenTable_01.fbx"
                    }
                },
                "required": ["filename"]
            }
        }
    },
    {
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
    },
    {
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
    },
    {
        "type": "function",
        "function": {
            "name": "scan_directory",
            "description": "扫描指定目录，列出所有资产文件。用于批量检查。",
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
                    }
                },
                "required": ["dir_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "suggest_naming",
            "description": "根据资产类型和描述，建议符合规范的文件名。",
            "parameters": {
                "type": "object",
                "properties": {
                    "asset_type": {
                        "type": "string",
                        "enum": ["static_mesh", "skeletal_mesh", "material", "material_instance", "texture", "blueprint", "sound", "effect", "animation"],
                        "description": "资产类型"
                    },
                    "description": {
                        "type": "string",
                        "description": "资产的描述，例如 '木制桌子' 或 '角色主材质'"
                    }
                },
                "required": ["asset_type", "description"]
            }
        }
    },
    {
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
    },
    {
        "type": "function",
        "function": {
            "name": "generate_report",
            "description": "生成质检报告。接收检查结果列表，输出格式化的报告。",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "报告标题"
                    },
                    "results": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "asset": {"type": "string", "description": "资产名称"},
                                "check": {"type": "string", "description": "检查项"},
                                "status": {"type": "string", "enum": ["pass", "fail", "warning"]},
                                "detail": {"type": "string", "description": "详细说明"}
                            }
                        },
                        "description": "检查结果列表"
                    }
                },
                "required": ["title", "results"]
            }
        }
    },
]


# ========== 工具执行函数 ==========

def check_naming(filename: str) -> dict:
    """检查文件命名规范"""
    from config import NAMING_CONVENTIONS

    name = os.path.basename(filename)
    name_no_ext = os.path.splitext(name)[0]

    issues = []
    prefix_found = None

    # 检查是否有正确的前缀
    for prefix, desc in NAMING_CONVENTIONS.items():
        if name.startswith(prefix):
            prefix_found = prefix
            break

    if not prefix_found:
        issues.append(f"缺少类型前缀。建议使用以下前缀之一：{', '.join(NAMING_CONVENTIONS.keys())}")
    else:
        # 检查前缀后的部分
        rest = name_no_ext[len(prefix_found):]
        if not rest:
            issues.append("前缀后缺少描述性名称")
        elif rest[0].islower():
            issues.append(f"前缀 '{prefix_found}' 后的描述应以大写字母开头（PascalCase）")

    # 检查非法字符
    if re.search(r'[^a-zA-Z0-9_.]', name):
        issues.append("文件名包含非法字符（只允许字母、数字、下划线、点）")

    # 检查是否有连续下划线
    if '__' in name:
        issues.append("文件名包含连续下划线")

    # 检查是否以数字开头（去掉前缀后）
    if prefix_found:
        rest = name_no_ext[len(prefix_found):]
        if rest and rest[0].isdigit():
            issues.append("描述部分不应以数字开头")

    result = {
        "filename": name,
        "prefix": prefix_found,
        "prefix_meaning": NAMING_CONVENTIONS.get(prefix_found, "未知类型") if prefix_found else None,
        "is_valid": len(issues) == 0,
        "issues": issues,
    }

    return result


def check_directory_structure(current_path: str, asset_type: str) -> dict:
    """检查目录结构是否规范"""
    from config import PROJECT_DIRECTORY_TREE

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

    # 检查当前路径是否在正确的目录下
    is_correct = expected_dir.lower() in current_path.lower()

    return {
        "current_path": current_path,
        "asset_type": asset_type,
        "expected_directory": expected_dir,
        "is_in_correct_directory": is_correct,
        "suggestion": None if is_correct else f"建议移动到 {expected_dir}",
        "project_structure": PROJECT_DIRECTORY_TREE,
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
    model_exts = {'.fbx', '.obj', '.blend', '.gltf', '.glb'}
    texture_exts = {'.png', '.jpg', '.jpeg', '.tga', '.bmp', '.exr', '.hdr'}
    material_exts = {'.mat', '.mtl'}

    if result["extension"] in model_exts:
        result["category"] = "3D 模型"
    elif result["extension"] in texture_exts:
        result["category"] = "贴图"
    elif result["extension"] in material_exts:
        result["category"] = "材质"
    else:
        result["category"] = "未知"

    return result


def scan_directory(dir_path: str, recursive: bool = True) -> dict:
    """扫描目录中的资产文件"""
    if not os.path.exists(dir_path):
        return {"error": f"目录不存在: {dir_path}"}

    asset_extensions = {'.fbx', '.obj', '.blend', '.gltf', '.glb',
                        '.png', '.jpg', '.jpeg', '.tga', '.exr',
                        '.mat', '.mtl', '.uasset'}

    files = []
    errors = []

    if recursive:
        for root, dirs, filenames in os.walk(dir_path):
            for fname in filenames:
                ext = os.path.splitext(fname)[1].lower()
                if ext in asset_extensions:
                    full_path = os.path.join(root, fname)
                    files.append({
                        "filename": fname,
                        "path": full_path,
                        "extension": ext,
                        "size_mb": round(os.path.getsize(full_path) / (1024 * 1024), 2),
                    })
    else:
        for fname in os.listdir(dir_path):
            full_path = os.path.join(dir_path, fname)
            if os.path.isfile(full_path):
                ext = os.path.splitext(fname)[1].lower()
                if ext in asset_extensions:
                    files.append({
                        "filename": fname,
                        "path": full_path,
                        "extension": ext,
                        "size_mb": round(os.path.getsize(full_path) / (1024 * 1024), 2),
                    })

    return {
        "directory": dir_path,
        "total_files": len(files),
        "files": files,
    }


def suggest_naming(asset_type: str, description: str) -> dict:
    """建议规范命名"""
    type_prefixes = {
        "static_mesh":       "SM",
        "skeletal_mesh":     "SK",
        "material":          "M",
        "material_instance": "MI",
        "texture":           "T",
        "blueprint":         "BP",
        "sound":             "S",
        "effect":            "FX",
        "animation":         "AN",
    }

    prefix = type_prefixes.get(asset_type, "SM")

    # 将中文描述转为 PascalCase 英文（简单映示例）
    # 实际项目中可以用翻译 API
    desc_clean = description.strip()
    # 去除空格，首字母大写
    desc_pascal = "".join(word.capitalize() for word in re.split(r'[\s_\-]+', desc_clean))

    suggested_name = f"{prefix}_{desc_pascal}_01"

    return {
        "asset_type": asset_type,
        "description": description,
        "prefix": prefix,
        "suggested_name": suggested_name,
        "alternatives": [
            f"{prefix}_{desc_pascal}_A",
            f"{prefix}_{desc_pascal}_v01",
        ],
    }


def check_mesh_budget(face_count: int, asset_type: str) -> dict:
    """检查面数是否在预算内"""
    from config import MESH_BUDGETS

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


def generate_report(title: str, results: list) -> dict:
    """生成格式化报告"""
    pass_count = sum(1 for r in results if r.get("status") == "pass")
    fail_count = sum(1 for r in results if r.get("status") == "fail")
    warn_count = sum(1 for r in results if r.get("status") == "warning")

    report = {
        "title": title,
        "summary": {
            "total": len(results),
            "pass": pass_count,
            "fail": fail_count,
            "warning": warn_count,
        },
        "results": results,
    }

    return report


# ========== 工具分发器 ==========

TOOL_FUNCTIONS = {
    "check_naming": check_naming,
    "check_directory_structure": check_directory_structure,
    "check_file_info": check_file_info,
    "scan_directory": scan_directory,
    "suggest_naming": suggest_naming,
    "check_mesh_budget": check_mesh_budget,
    "generate_report": generate_report,
}


def execute_tool(tool_name: str, arguments: dict) -> str:
    """执行工具并返回 JSON 字符串结果"""
    func = TOOL_FUNCTIONS.get(tool_name)
    if not func:
        return json.dumps({"error": f"未知工具: {tool_name}"}, ensure_ascii=False)

    try:
        result = func(**arguments)
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"error": f"工具执行失败: {str(e)}"}, ensure_ascii=False)
