"""
命名规范检查工具
"""
import os
import re
import fnmatch

from config import NAMING_CONVENTIONS


def _get_custom_rules() -> list:
    """加载项目自定义规则"""
    try:
        from core.project_config import find_project_config, ProjectConfig
        config_path = find_project_config()
        if config_path:
            config = ProjectConfig.load(config_path)
            return config.custom_rules or []
    except Exception:
        pass
    return []


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

    # 先检查自定义规则（如 @*.* → animation）
    custom_rules = _get_custom_rules()
    matched_custom = False
    for rule in custom_rules:
        pattern = rule.get("pattern", "")
        if pattern and fnmatch.fnmatch(name, pattern):
            matched_custom = True
            prefix_found = pattern
            break

    # 如果没匹配自定义规则，检查标准前缀
    if not matched_custom:
        for prefix, desc in conventions.items():
            if name.startswith(prefix):
                prefix_found = prefix
                break

    if not prefix_found:
        issues.append(f"缺少类型前缀。建议使用以下前缀之一：{', '.join(conventions.keys())}")
    elif not matched_custom:
        # 只对标准前缀做后续检查（自定义规则匹配即合规）
        rest = name_no_ext[len(prefix_found):]
        if not rest:
            issues.append("前缀后缺少描述性名称")
        elif rest[0].islower():
            issues.append(f"前缀 '{prefix_found}' 后的描述应以大写字母开头（PascalCase）")

    # 检查非法字符（自定义规则匹配时跳过）
    if not matched_custom and re.search(r'[^a-zA-Z0-9_.]', name):
        issues.append("文件名包含非法字符（只允许字母、数字、下划线、点）")

    # 检查是否有连续下划线
    if '__' in name:
        issues.append("文件名包含连续下划线")

    # 检查是否以数字开头（去掉前缀后，仅对标准前缀）
    if prefix_found and not matched_custom:
        rest = name_no_ext[len(prefix_found):]
        if rest and rest[0].isdigit():
            issues.append("描述部分不应以数字开头")

    # 应用项目自定义规则
    for rule in extra_rules:
        issues.append(f"[项目规范] {rule}")

    # 获取前缀含义
    prefix_meaning = None
    if prefix_found:
        if matched_custom:
            # 自定义规则匹配，显示规则描述
            for rule in custom_rules:
                if fnmatch.fnmatch(name, rule.get("pattern", "")):
                    prefix_meaning = rule.get("description", "项目自定义规则")
                    break
        else:
            prefix_meaning = conventions.get(prefix_found, "未知类型")

    return {
        "filename": name,
        "prefix": prefix_found,
        "prefix_meaning": prefix_meaning,
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
