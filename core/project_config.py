"""
config/project_config.py - 项目配置系统

管理项目的命名规则、资产类型、目录结构、导入配置等。
不同项目只需修改配置文件，Agent 核心逻辑不变。
"""
from __future__ import annotations

import os
import json
from dataclasses import dataclass, field
from typing import Optional
from pathlib import Path


# ========== 配置数据结构 ==========

@dataclass
class AssetTypeConfig:
    """资产类型配置"""
    category: str                    # 类型名称：weapon, character, building...
    naming_prefix: str               # 命名前缀：SM_, SK_, T_...
    engine_path: str                 # 引擎目录：/Weapons/
    subcategories: list[str] = field(default_factory=list)  # 子类型
    required_tags: list[str] = field(default_factory=list)  # 必填标签
    description: str = ""            # 描述

    def to_dict(self) -> dict:
        return {
            "category": self.category,
            "naming_prefix": self.naming_prefix,
            "engine_path": self.engine_path,
            "subcategories": self.subcategories,
            "required_tags": self.required_tags,
            "description": self.description,
        }


@dataclass
class ImportPreset:
    """导入预设配置"""
    import_scale: float = 1.0
    generate_lod: bool = True
    lod_levels: int = 3
    collision: bool = False
    material_import: bool = True
    # 额外参数
    extra: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        result = {
            "import_scale": self.import_scale,
            "generate_lod": self.generate_lod,
            "lod_levels": self.lod_levels,
            "collision": self.collision,
            "material_import": self.material_import,
        }
        result.update(self.extra)
        return result


@dataclass
class ProjectConfig:
    """
    项目配置

    包含项目的所有规范定义，如命名规则、资产类型、目录结构等。
    """
    # 基本信息
    project_name: str = ""
    engine: str = "UE5"              # UE5 / Unity / Godot / Custom
    genre: str = ""                  # 科幻 / 奇幻 / 都市 / ...
    description: str = ""            # 项目描述

    # 资源目录（支持多目录）
    source_paths: dict = field(default_factory=lambda: {
        "textures": "",    # 贴图目录
        "models": "",      # 模型目录
        "blender": "",     # Blender 工程目录
        "engine": "",      # 引擎资源目录
    })

    # 资产类型定义
    asset_types: list[AssetTypeConfig] = field(default_factory=list)

    # 命名规则模板
    naming_rules: dict = field(default_factory=lambda: {
        "static_mesh": "SM_{category}_{name}_{variant}",
        "skeletal_mesh": "SK_{category}_{name}_{variant}",
        "texture": "T_{asset_name}_{map_type}",
        "material": "M_{asset_name}_{variant}",
        "animation": "AN_{asset_name}_{action}",
    })

    # 导入预设
    import_presets: dict = field(default_factory=dict)

    # 面数预算
    mesh_budgets: dict = field(default_factory=lambda: {
        "character": 30000,
        "weapon": 10000,
        "prop": 5000,
        "building": 20000,
        "vehicle": 15000,
    })

    # 贴图预算
    texture_budgets: dict = field(default_factory=lambda: {
        "character": {"diffuse": 2048, "normal": 2048},
        "weapon": {"diffuse": 1024, "normal": 1024},
        "prop": {"diffuse": 1024, "normal": 512},
        "building": {"diffuse": 2048, "normal": 2048},
    })

    # 配置文件路径
    config_path: Optional[str] = None

    @classmethod
    def load(cls, config_path: str) -> 'ProjectConfig':
        """
        从 YAML 或 JSON 文件加载配置

        参数:
            config_path: 配置文件路径

        返回:
            ProjectConfig 实例
        """
        if not os.path.exists(config_path):
            raise FileNotFoundError(f"配置文件不存在: {config_path}")

        ext = os.path.splitext(config_path)[1].lower()

        if ext in ('.yaml', '.yml'):
            data = cls._load_yaml(config_path)
        elif ext == '.json':
            with open(config_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        else:
            raise ValueError(f"不支持的配置格式: {ext}")

        return cls._from_dict(data, config_path)

    @classmethod
    def _load_yaml(cls, path: str) -> dict:
        """加载 YAML 文件"""
        try:
            import yaml
            with open(path, 'r', encoding='utf-8') as f:
                return yaml.safe_load(f)
        except ImportError:
            # 没有 PyYAML，尝试简单解析
            return cls._simple_yaml_parse(path)

    @classmethod
    def _simple_yaml_parse(cls, path: str) -> dict:
        """简单的 YAML 解析（不依赖 PyYAML）"""
        data = {}
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if ':' in line:
                    key, value = line.split(':', 1)
                    key = key.strip()
                    value = value.strip()
                    # 尝试转换类型
                    if value.lower() == 'true':
                        value = True
                    elif value.lower() == 'false':
                        value = False
                    elif value.isdigit():
                        value = int(value)
                    elif value.replace('.', '', 1).isdigit():
                        value = float(value)
                    data[key] = value
        return data

    @classmethod
    def _from_dict(cls, data: dict, config_path: str = None) -> 'ProjectConfig':
        """从字典创建配置"""
        config = cls()
        config.config_path = config_path
        config.project_name = data.get('project_name', '')
        config.engine = data.get('engine', 'UE5')
        config.genre = data.get('genre', '')
        config.description = data.get('description', '')

        # 资源目录
        if 'source_paths' in data:
            config.source_paths.update(data['source_paths'])

        # 命名规则
        if 'naming_rules' in data:
            config.naming_rules = data['naming_rules']

        # 面数预算
        if 'mesh_budgets' in data:
            config.mesh_budgets = data['mesh_budgets']

        # 贴图预算
        if 'texture_budgets' in data:
            config.texture_budgets = data['texture_budgets']

        # 资产类型
        for at_data in data.get('asset_types', []):
            asset_type = AssetTypeConfig(
                category=at_data.get('category', ''),
                naming_prefix=at_data.get('naming_prefix', ''),
                engine_path=at_data.get('engine_path', ''),
                subcategories=at_data.get('subcategories', []),
                required_tags=at_data.get('required_tags', []),
                description=at_data.get('description', ''),
            )
            config.asset_types.append(asset_type)

        # 导入预设
        for category, preset_data in data.get('import_presets', {}).items():
            if isinstance(preset_data, dict):
                config.import_presets[category] = ImportPreset(
                    import_scale=preset_data.get('import_scale', 1.0),
                    generate_lod=preset_data.get('generate_lod', True),
                    lod_levels=preset_data.get('lod_levels', 3),
                    collision=preset_data.get('collision', False),
                    material_import=preset_data.get('material_import', True),
                    extra={k: v for k, v in preset_data.items()
                           if k not in ('import_scale', 'generate_lod', 'lod_levels', 'collision', 'material_import')},
                )

        return config

    def save(self, path: str = None):
        """保存配置到文件"""
        if path is None:
            path = self.config_path
        if path is None:
            raise ValueError("未指定保存路径")

        ext = os.path.splitext(path)[1].lower()
        data = self.to_dict()

        if ext in ('.yaml', '.yml'):
            self._save_yaml(path, data)
        elif ext == '.json':
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        else:
            raise ValueError(f"不支持的格式: {ext}")

    def _save_yaml(self, path: str, data: dict):
        """保存为 YAML 格式"""
        try:
            import yaml
            with open(path, 'w', encoding='utf-8') as f:
                yaml.dump(data, f, allow_unicode=True, default_flow_style=False)
        except ImportError:
            # 没有 PyYAML，保存为 JSON
            json_path = os.path.splitext(path)[0] + '.json'
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "project_name": self.project_name,
            "engine": self.engine,
            "genre": self.genre,
            "description": self.description,
            "source_paths": self.source_paths,
            "naming_rules": self.naming_rules,
            "mesh_budgets": self.mesh_budgets,
            "texture_budgets": self.texture_budgets,
            "asset_types": [at.to_dict() for at in self.asset_types],
            "import_presets": {k: v.to_dict() for k, v in self.import_presets.items()},
        }

    # ========== 查询方法 ==========

    def get_asset_type(self, category: str) -> Optional[AssetTypeConfig]:
        """获取资产类型配置"""
        for at in self.asset_types:
            if at.category == category:
                return at
        return None

    def get_naming_prefix(self, category: str) -> str:
        """获取资产类型的命名前缀"""
        at = self.get_asset_type(category)
        return at.naming_prefix if at else ""

    def get_engine_path(self, category: str) -> str:
        """获取资产类型的引擎目录"""
        at = self.get_asset_type(category)
        return at.engine_path if at else ""

    def get_import_preset(self, category: str) -> Optional[ImportPreset]:
        """获取导入预设"""
        return self.import_presets.get(category)

    def get_mesh_budget(self, category: str) -> int:
        """获取面数预算"""
        return self.mesh_budgets.get(category, 10000)

    def get_texture_budget(self, category: str, map_type: str = 'diffuse') -> int:
        """获取贴图尺寸预算"""
        budget = self.texture_budgets.get(category, {})
        return budget.get(map_type, 1024)

    def suggest_naming(self, category: str, name: str, variant: str = "01") -> str:
        """
        根据命名规则生成建议名称

        参数:
            category: 资产类型
            name: 资产名称
            variant: 变体编号

        返回:
            建议的文件名（不含扩展名）
        """
        at = self.get_asset_type(category)
        if not at:
            return f"SM_{name}_{variant}"

        prefix = at.naming_prefix
        # 根据前缀选择命名规则
        if prefix == "SM_":
            template = self.naming_rules.get("static_mesh", "SM_{category}_{name}_{variant}")
        elif prefix == "SK_":
            template = self.naming_rules.get("skeletal_mesh", "SK_{category}_{name}_{variant}")
        elif prefix == "T_":
            template = self.naming_rules.get("texture", "T_{asset_name}_{map_type}")
        else:
            template = f"{prefix}{{name}}_{{variant}}"

        return template.format(
            category=category,
            name=name,
            variant=variant,
            asset_name=name,
            map_type="D",
        )


# ========== 检测和创建 ==========

# Agent 配置目录
AGENT_CONFIG_DIR = ".ta_agent"


def get_agent_config_dir() -> str:
    """获取 Agent 配置目录路径"""
    # 优先使用环境变量
    env_dir = os.environ.get("TA_AGENT_CONFIG_DIR")
    if env_dir:
        return env_dir

    # 默认使用脚本所在目录的 .ta_agent
    script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(script_dir, AGENT_CONFIG_DIR)


def get_project_config_dir() -> str:
    """获取项目配置目录路径"""
    return os.path.join(get_agent_config_dir(), "configs", "project")


def find_project_config(name: str = None) -> Optional[str]:
    """
    查找项目配置文件

    参数:
        name: 配置名称（不含扩展名），None 则返回第一个找到的

    返回:
        配置文件路径，或 None
    """
    config_dir = get_project_config_dir()
    if not os.path.isdir(config_dir):
        return None

    if name:
        # 查找指定名称
        for ext in ['.yaml', '.yml']:
            path = os.path.join(config_dir, f"{name}{ext}")
            if os.path.exists(path):
                return path
        return None
    else:
        # 返回第一个找到的
        for filename in sorted(os.listdir(config_dir)):
            if filename.endswith(('.yaml', '.yml')):
                return os.path.join(config_dir, filename)
        return None


def list_project_configs() -> list[dict]:
    """
    列出所有项目配置

    返回:
        [{"name": "my_game", "path": "...", "project_name": "...", "engine": "..."}]
    """
    config_dir = get_project_config_dir()
    if not os.path.isdir(config_dir):
        return []

    configs = []
    for filename in sorted(os.listdir(config_dir)):
        if not filename.endswith(('.yaml', '.yml')):
            continue
        filepath = os.path.join(config_dir, filename)
        try:
            config = ProjectConfig.load(filepath)
            configs.append({
                "name": os.path.splitext(filename)[0],
                "path": filepath,
                "project_name": config.project_name,
                "engine": config.engine,
            })
        except Exception:
            pass

    return configs


def check_project_config(name: str = None) -> dict:
    """
    检查项目配置是否存在

    返回:
        {
            "exists": bool,
            "config_path": str | None,
            "config_name": str | None,
            "message": str,
        }
    """
    config_path = find_project_config(name)

    if config_path:
        return {
            "exists": True,
            "config_path": config_path,
            "config_name": os.path.splitext(os.path.basename(config_path))[0],
            "message": f"找到项目配置: {config_path}",
        }
    else:
        return {
            "exists": False,
            "config_path": None,
            "config_name": None,
            "message": "未找到项目配置文件",
        }


def create_example_config(name: str = "example", engine: str = "UE5") -> str:
    """
    创建示例配置文件

    参数:
        name: 配置名称
        engine: 游戏引擎类型

    返回:
        创建的配置文件路径
    """
    # 确保配置目录存在
    config_dir = get_project_config_dir()
    os.makedirs(config_dir, exist_ok=True)

    config_path = os.path.join(config_dir, f"{name}.yaml")

    # 根据引擎生成不同的示例配置
    if engine == "UE5":
        content = _generate_ue5_example()
    elif engine == "Unity":
        content = _generate_unity_example()
    else:
        content = _generate_generic_example()

    with open(config_path, 'w', encoding='utf-8') as f:
        f.write(content)

    return config_path


def _generate_ue5_example() -> str:
    """生成 UE5 项目示例配置"""
    return '''# ============================================================
# TA Agent 项目配置文件
# ============================================================
# 请根据你的项目实际情况修改以下配置
# 修改后，Agent 会按照此配置进行资产检查和入库

# ---------- 项目基本信息 ----------
project_name: "MyUE5Project"          # 项目名称
engine: "UE5"                          # 引擎类型：UE5 / Unity / Godot
genre: "sci-fi"                        # 项目题材：sci-fi / fantasy / modern / ...
description: ""                        # 项目描述（可选）

# ---------- 资源目录 ----------
# 支持多个目录，Agent 会根据这些路径查找资源
source_paths:
  textures: "D:/Art/Textures"          # 贴图目录
  models: "D:/Art/Models"              # 模型目录
  blender: "D:/Blender/Projects"       # Blender 工程目录
  engine: "D:/UE5/Content"             # 引擎资源目录

# ---------- 命名规则 ----------
# 变量说明：
#   {category} - 资产类型（weapon, character 等）
#   {name}     - 资产名称
#   {variant}  - 变体编号（01, 02...）
#   {map_type} - 贴图类型（D, N, R, M...）
naming_rules:
  static_mesh: "SM_{category}_{name}_{variant}"
  skeletal_mesh: "SK_{category}_{name}_{variant}"
  texture: "T_{asset_name}_{map_type}"
  material: "M_{asset_name}_{variant}"
  animation: "AN_{asset_name}_{action}"

# ---------- 资产类型定义 ----------
# 每种类型定义：命名前缀、引擎目录、子类型、必填标签
asset_types:
  - category: character
    naming_prefix: SK_
    engine_path: /Game/Characters/
    subcategories: [humanoid, mech, creature, npc]
    required_tags: [style, bone_count]
    description: "角色模型"

  - category: weapon
    naming_prefix: SM_
    engine_path: /Game/Weapons/
    subcategories: [melee, ranged, energy]
    required_tags: [material_primary, style]
    description: "武器道具"

  - category: building
    naming_prefix: SM_
    engine_path: /Game/Environment/Buildings/
    subcategories: [residential, commercial, industrial]
    required_tags: [height_class, style, condition]
    description: "建筑模型"

  - category: prop
    naming_prefix: SM_
    engine_path: /Game/Environment/Props/
    subcategories: [furniture, vegetation, decoration]
    required_tags: [style]
    description: "场景道具"

  - category: vehicle
    naming_prefix: SK_
    engine_path: /Game/Vehicles/
    subcategories: [ground, air, water]
    required_tags: [vehicle_type, style]
    description: "载具模型"

# ---------- 导入预设 ----------
# 每种资产类型的 UE5 导入参数
import_presets:
  character:
    import_scale: 1.0
    generate_lod: true
    lod_levels: 3
    collision: false
    material_import: true

  weapon:
    import_scale: 1.0
    generate_lod: true
    lod_levels: 2
    collision: true
    material_import: true

  building:
    import_scale: 1.0
    generate_lod: true
    lod_levels: 4
    collision: true
    material_import: true

  prop:
    import_scale: 1.0
    generate_lod: true
    lod_levels: 2
    collision: true
    material_import: true

  vehicle:
    import_scale: 1.0
    generate_lod: true
    lod_levels: 3
    collision: true
    material_import: true

# ---------- 面数预算 ----------
mesh_budgets:
  character: 30000
  weapon: 10000
  building: 20000
  prop: 5000
  vehicle: 15000

# ---------- 贴图预算 ----------
texture_budgets:
  character:
    diffuse: 2048
    normal: 2048
  weapon:
    diffuse: 1024
    normal: 1024
  building:
    diffuse: 2048
    normal: 2048
  prop:
    diffuse: 1024
    normal: 512
'''


def _generate_unity_example() -> str:
    """生成 Unity 项目示例配置"""
    return '''# ============================================================
# TA Agent 项目配置文件（Unity）
# ============================================================

project_name: "MyUnityProject"
engine: "Unity"
genre: ""
description: ""

naming_rules:
  static_mesh: "SM_{category}_{name}_{variant}"
  skeletal_mesh: "SK_{category}_{name}_{variant}"
  texture: "T_{asset_name}_{map_type}"
  material: "M_{asset_name}_{variant}"
  animation: "AN_{asset_name}_{action}"

asset_types:
  - category: character
    naming_prefix: SK_
    engine_path: Assets/Models/Characters/
    subcategories: [humanoid, creature]
    required_tags: [style]
    description: "角色模型"

  - category: weapon
    naming_prefix: SM_
    engine_path: Assets/Models/Weapons/
    subcategories: [melee, ranged]
    required_tags: [style]
    description: "武器道具"

  - category: prop
    naming_prefix: SM_
    engine_path: Assets/Models/Props/
    subcategories: [furniture, vegetation]
    required_tags: [style]
    description: "场景道具"

import_presets:
  character:
    import_scale: 1.0
    generate_lod: true
    lod_levels: 3

  weapon:
    import_scale: 1.0
    generate_lod: true
    lod_levels: 2

mesh_budgets:
  character: 30000
  weapon: 10000
  prop: 5000

texture_budgets:
  character:
    diffuse: 2048
    normal: 2048
  weapon:
    diffuse: 1024
    normal: 1024
'''


def _generate_generic_example() -> str:
    """生成通用示例配置"""
    return '''# ============================================================
# TA Agent 项目配置文件
# ============================================================

project_name: "MyProject"
engine: "Custom"
genre: ""
description: ""

naming_rules:
  static_mesh: "SM_{category}_{name}_{variant}"
  skeletal_mesh: "SK_{category}_{name}_{variant}"
  texture: "T_{asset_name}_{map_type}"
  material: "M_{asset_name}_{variant}"

asset_types:
  - category: model
    naming_prefix: SM_
    engine_path: /Models/
    subcategories: []
    required_tags: []
    description: "通用模型"

mesh_budgets:
  model: 10000

texture_budgets:
  model:
    diffuse: 1024
    normal: 1024
'''
