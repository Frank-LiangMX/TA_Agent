"""
tags/schema.py - 资产标签数据结构

定义资产身份证的完整结构，分为三层：
  确定层（基础信息）：由工具自动提取，准确无误
  推断层（分析信息）：由 AI 分析得出，需人工确认
  管理层（元信息）：入库流程中产生
"""
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Optional
import json


@dataclass
class BoundingBox:
    """包围盒（单位：米）"""
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0

    def to_dict(self):
        return {"x": round(self.x, 2), "y": round(self.y, 2), "z": round(self.z, 2)}

    @classmethod
    def from_dict(cls, d: dict) -> BoundingBox:
        return cls(x=d.get("x", 0), y=d.get("y", 0), z=d.get("z", 0))


@dataclass
class MeshInfo:
    """几何信息 - 确定层"""
    tri_count: int = 0
    vertex_count: int = 0
    has_skeleton: bool = False
    bone_count: int = 0
    has_skin: bool = False
    has_uv: bool = False
    has_vertex_color: bool = False
    material_count: int = 0
    material_names: list[str] = field(default_factory=list)
    has_materials: bool = True  # False 表示模型没有材质（资源缺失）
    bounding_box: BoundingBox = field(default_factory=BoundingBox)
    export_mode: str = ""  # MECHA/NPC/PILOT/STATIC/DEFAULT

    def to_dict(self):
        return {
            "tri_count": self.tri_count,
            "vertex_count": self.vertex_count,
            "has_skeleton": self.has_skeleton,
            "bone_count": self.bone_count,
            "has_skin": self.has_skin,
            "has_uv": self.has_uv,
            "has_vertex_color": self.has_vertex_color,
            "material_count": self.material_count,
            "material_names": self.material_names,
            "has_materials": self.has_materials,
            "bounding_box": self.bounding_box.to_dict(),
            "export_mode": self.export_mode,
        }


@dataclass
class TextureInfo:
    """单张贴图信息 - 确定层"""
    name: str = ""
    width: int = 0
    height: int = 0
    format: str = ""
    channels: int = 0
    color_space: str = ""  # sRGB / Linear
    usage: str = ""  # Albedo / Normal / Roughness / ...
    file_size_mb: float = 0.0


@dataclass
class TextureSet:
    """贴图集信息 - 确定层"""
    count: int = 0
    textures: list[TextureInfo] = field(default_factory=list)
    max_resolution: str = ""  # "4096x4096"
    formats_used: list[str] = field(default_factory=list)
    color_spaces: list[str] = field(default_factory=list)
    usage_types: list[str] = field(default_factory=list)  # Albedo, Normal, ...

    def to_dict(self):
        return {
            "count": self.count,
            "max_resolution": self.max_resolution,
            "formats_used": self.formats_used,
            "color_spaces": self.color_spaces,
            "usage_types": self.usage_types,
            "textures": [
                {
                    "name": t.name,
                    "width": t.width,
                    "height": t.height,
                    "format": t.format,
                    "channels": t.channels,
                    "color_space": t.color_space,
                    "usage": t.usage,
                    "file_size_mb": round(t.file_size_mb, 2),
                }
                for t in self.textures
            ],
        }


@dataclass
class AssetCategory:
    """分类标签 - 推断层（AI 生成，需人工确认）"""
    category: str = ""        # character / weapon / building / vehicle / prop / environment
    subcategory: str = ""     # 商业高楼 / 人形角色 / ...
    confidence: float = 0.0   # AI 置信度 0-1


@dataclass
class MaterialStructure:
    """材质结构 - 推断层"""
    primary: list[str] = field(default_factory=list)    # 主要材质：混凝土、金属
    secondary: list[str] = field(default_factory=list)  # 次要材质：玻璃、木材
    confidence: float = 0.0   # AI 置信度 0-1


@dataclass
class VisualAttributes:
    """视觉属性 - 推断层"""
    style: str = ""           # 现代 / 古风 / 科幻 / 写实 / 卡通
    color_palette: list[str] = field(default_factory=list)  # 主色调
    condition: str = ""       # 全新 / 轻微磨损 / 重度磨损 / 破碎
    description: str = ""     # AI 生成的自然语言描述
    style_confidence: float = 0.0      # 风格置信度
    condition_confidence: float = 0.0  # 状态置信度


@dataclass
class SpatialRelation:
    """空间关系 - 推断层"""
    related_assets: list[str] = field(default_factory=list)
    belongs_to: str = ""      # 属于哪个大资产


@dataclass
class MetaInfo:
    """管理信息 - 管理层"""
    naming_suggestion: str = ""   # AI 建议的命名
    naming_compliant: bool = True # 当前命名是否合规
    naming_issues: list[str] = field(default_factory=list)
    engine_path: str = ""         # 建议的引擎目录
    source_path: str = ""         # 源文件路径
    intake_date: str = ""         # 入库日期
    analyzed_at: str = ""         # 分析时间
    reviewer: str = ""            # 入库责任人
    status: str = "pending"       # pending / approved / rejected
    preview_images: list[str] = field(default_factory=list)  # 渲染预览图路径


@dataclass
class AssetTags:
    """一张完整的资产身份证"""
    asset_id: str = ""            # 唯一标识（基于文件路径的 hash）
    asset_name: str = ""          # 资产名称（文件名去扩展名）
    file_path: str = ""           # 源文件路径

    asset_type: str = ""          # static_mesh / skeletal_mesh / animation / texture / ...

    # 确定层 - 工具自动提取
    mesh: MeshInfo = field(default_factory=MeshInfo)
    textures: TextureSet = field(default_factory=TextureSet)

    # 推断层 - AI 分析
    category: AssetCategory = field(default_factory=AssetCategory)
    material_structure: MaterialStructure = field(default_factory=MaterialStructure)
    visual: VisualAttributes = field(default_factory=VisualAttributes)
    spatial: SpatialRelation = field(default_factory=SpatialRelation)

    # 管理层
    meta: MetaInfo = field(default_factory=MetaInfo)

    def to_dict(self) -> dict:
        return {
            "asset_id": self.asset_id,
            "asset_name": self.asset_name,
            "file_path": self.file_path,
            "asset_type": self.asset_type,
            "mesh": self.mesh.to_dict(),
            "textures": self.textures.to_dict(),
            "category": {
                "category": self.category.category,
                "subcategory": self.category.subcategory,
                "confidence": self.category.confidence,
            },
            "material_structure": {
                "primary": self.material_structure.primary,
                "secondary": self.material_structure.secondary,
                "confidence": self.material_structure.confidence,
            },
            "visual": {
                "style": self.visual.style,
                "color_palette": self.visual.color_palette,
                "condition": self.visual.condition,
                "description": self.visual.description,
                "style_confidence": self.visual.style_confidence,
                "condition_confidence": self.visual.condition_confidence,
            },
            "spatial": {
                "related_assets": self.spatial.related_assets,
                "belongs_to": self.spatial.belongs_to,
            },
            "meta": {
                "naming_suggestion": self.meta.naming_suggestion,
                "naming_compliant": self.meta.naming_compliant,
                "naming_issues": self.meta.naming_issues,
                "engine_path": self.meta.engine_path,
                "source_path": self.meta.source_path,
                "intake_date": self.meta.intake_date,
                "analyzed_at": self.meta.analyzed_at,
                "reviewer": self.meta.reviewer,
                "status": self.meta.status,
                "preview_images": self.meta.preview_images,
            },
        }

    def to_json(self, indent=2) -> str:
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)

    @classmethod
    def from_dict(cls, d: dict) -> AssetTags:
        tags = cls()
        tags.asset_id = d.get("asset_id", "")
        tags.asset_name = d.get("asset_name", "")
        tags.file_path = d.get("file_path", "")
        tags.asset_type = d.get("asset_type", "")

        mesh_d = d.get("mesh", {})
        tags.mesh = MeshInfo(
            tri_count=mesh_d.get("tri_count", 0),
            vertex_count=mesh_d.get("vertex_count", 0),
            has_skeleton=mesh_d.get("has_skeleton", False),
            bone_count=mesh_d.get("bone_count", 0),
            has_skin=mesh_d.get("has_skin", False),
            has_uv=mesh_d.get("has_uv", False),
            has_vertex_color=mesh_d.get("has_vertex_color", False),
            material_count=mesh_d.get("material_count", 0),
            material_names=mesh_d.get("material_names", []),
            bounding_box=BoundingBox.from_dict(mesh_d.get("bounding_box", {})),
            export_mode=mesh_d.get("export_mode", ""),
        )

        tex_d = d.get("textures", {})
        tags.textures = TextureSet(
            count=tex_d.get("count", 0),
            max_resolution=tex_d.get("max_resolution", ""),
            formats_used=tex_d.get("formats_used", []),
            color_spaces=tex_d.get("color_spaces", []),
            usage_types=tex_d.get("usage_types", []),
        )

        cat_d = d.get("category", {})
        tags.category = AssetCategory(
            category=cat_d.get("category", ""),
            subcategory=cat_d.get("subcategory", ""),
            confidence=cat_d.get("confidence", 0.0),
        )

        mat_d = d.get("material_structure", {})
        tags.material_structure = MaterialStructure(
            primary=mat_d.get("primary", []),
            secondary=mat_d.get("secondary", []),
            confidence=mat_d.get("confidence", 0.0),
        )

        vis_d = d.get("visual", {})
        tags.visual = VisualAttributes(
            style=vis_d.get("style", ""),
            color_palette=vis_d.get("color_palette", []),
            condition=vis_d.get("condition", ""),
            description=vis_d.get("description", ""),
            style_confidence=vis_d.get("style_confidence", 0.0),
            condition_confidence=vis_d.get("condition_confidence", 0.0),
        )

        spa_d = d.get("spatial", {})
        tags.spatial = SpatialRelation(
            related_assets=spa_d.get("related_assets", []),
            belongs_to=spa_d.get("belongs_to", ""),
        )

        meta_d = d.get("meta", {})
        tags.meta = MetaInfo(
            naming_suggestion=meta_d.get("naming_suggestion", ""),
            naming_compliant=meta_d.get("naming_compliant", True),
            naming_issues=meta_d.get("naming_issues", []),
            engine_path=meta_d.get("engine_path", ""),
            source_path=meta_d.get("source_path", ""),
            intake_date=meta_d.get("intake_date", ""),
            analyzed_at=meta_d.get("analyzed_at", ""),
            reviewer=meta_d.get("reviewer", ""),
            status=meta_d.get("status", "pending"),
            preview_images=meta_d.get("preview_images", []),
        )

        return tags


# --- 标签 Schema 定义（用于项目配置） ---

TAG_SCHEMA_DEFINITION = {
    "基础信息": {
        "asset_id": "唯一标识（文件路径 hash）",
        "asset_name": "资产名称",
        "file_path": "源文件路径",
    },
    "几何信息": {
        "tri_count": "三角面数",
        "vertex_count": "顶点数",
        "has_skeleton": "是否有骨骼",
        "bone_count": "骨骼数量",
        "has_skin": "是否有蒙皮",
        "has_uv": "是否有 UV",
        "material_count": "材质数量",
        "bounding_box": "包围盒尺寸（米）",
    },
    "贴图信息": {
        "count": "贴图数量",
        "max_resolution": "最大分辨率",
        "formats_used": "使用的格式",
        "usage_types": "贴图用途类型",
    },
    "分类标签": {
        "category": "资产大类",
        "subcategory": "资产子类",
    },
    "材质结构": {
        "primary": "主要材质",
        "secondary": "次要材质",
    },
    "视觉属性": {
        "style": "风格",
        "color_palette": "主色调",
        "condition": "状态",
        "description": "描述",
    },
    "空间关系": {
        "related_assets": "关联资产",
        "belongs_to": "所属大资产",
    },
    "管理信息": {
        "naming_suggestion": "建议命名",
        "naming_compliant": "命名是否合规",
        "engine_path": "建议引擎目录",
        "status": "审核状态",
    },
}
