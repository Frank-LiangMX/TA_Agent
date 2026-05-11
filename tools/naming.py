"""
命名规范检查工具
"""
import os
import re

from config import NAMING_CONVENTIONS


SCHEMA = {
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
}

SUGGEST_SCHEMA = {
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
}


def check_naming(filename: str, naming_config: dict = None) -> dict:
    """
    检查文件命名规范。

    参数:
        filename: 要检查的文件名
        naming_config: 命名规范配置（可选），覆盖默认规则
            支持的 key:
            - prefix: str, 单个前缀（如 "SM_"）
            - prefixes: dict, 完整前缀映射（如 {"SM_": "静态网格体", ...}）
            - rules: list[str], 额外的命名规则描述
    """
    name = os.path.basename(filename)
    name_no_ext = os.path.splitext(name)[0]

    # 确定使用哪套前缀规则
    conventions = NAMING_CONVENTIONS  # 默认
    extra_rules = []
    if naming_config:
        if "prefixes" in naming_config and isinstance(naming_config["prefixes"], dict):
            conventions = naming_config["prefixes"]
        elif "prefix" in naming_config:
            # 单前缀模式：只检查是否以该前缀开头
            conventions = {naming_config["prefix"]: "项目自定义前缀"}
        if "rules" in naming_config and isinstance(naming_config["rules"], list):
            extra_rules = naming_config["rules"]

    issues = []
    prefix_found = None

    # 检查是否有正确的前缀
    for prefix, desc in conventions.items():
        if name.startswith(prefix):
            prefix_found = prefix
            break

    if not prefix_found:
        issues.append(f"缺少类型前缀。建议使用以下前缀之一：{', '.join(conventions.keys())}")
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

    # 应用项目自定义规则
    for rule in extra_rules:
        issues.append(f"[项目规范] {rule}")

    return {
        "filename": name,
        "prefix": prefix_found,
        "prefix_meaning": conventions.get(prefix_found, "未知类型") if prefix_found else None,
        "is_valid": len(issues) == 0,
        "issues": issues,
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
    desc_clean = description.strip()
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
