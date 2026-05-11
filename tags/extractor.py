"""
tags/extractor.py - 标签提取器

从现有工具的结果中提取结构化标签数据。
负责确定层（基础信息）的自动提取，和推断层数据的汇总。
"""
from __future__ import annotations
import hashlib
import os
from datetime import datetime
from typing import Optional

from tags.schema import (
    AssetTags, MeshInfo, BoundingBox, TextureSet, TextureInfo,
    AssetCategory, MaterialStructure, VisualAttributes,
    SpatialRelation, MetaInfo,
)


def _asset_id(file_path: str) -> str:
    """基于文件路径生成唯一 ID"""
    return hashlib.md5(file_path.encode("utf-8")).hexdigest()[:12]


def _asset_name(file_path: str) -> str:
    """从路径提取资产名（去扩展名）"""
    return os.path.splitext(os.path.basename(file_path))[0]


class TagExtractor:
    """
    资产标签提取器

    接收各个工具的原始输出，组装成一张完整的资产身份证。
    不直接调用工具——由 analyzer 调度工具后，把结果喂给这里。
    """

    # --- 确定层：从工具结果中提取 ---

    def extract_from_fbx_result(self, fbx_result: dict) -> MeshInfo:
        """
        从 read_fbx_info 的输出中提取几何标签。

        参数:
            fbx_result: read_fbx_info 返回的 dict

        返回:
            MeshInfo 数据对象
        """
        mesh = MeshInfo()

        mesh.tri_count = fbx_result.get("total_faces", fbx_result.get("tri_count", 0))
        mesh.vertex_count = fbx_result.get("total_vertices", fbx_result.get("vertex_count", 0))
        mesh.has_skeleton = fbx_result.get("has_skeleton", False)
        mesh.bone_count = fbx_result.get("bone_count", fbx_result.get("armature_count", 0))
        mesh.has_skin = fbx_result.get("has_skin", False)
        mesh.has_uv = fbx_result.get("uv_channel_count", 0) > 0

        # material_count 可能在顶层或 mesh_details 里
        material_count = fbx_result.get("material_count", 0)
        mesh_details = fbx_result.get("mesh_details", [])
        if not material_count and mesh_details:
            material_count = mesh_details[0].get("material_count", 0)
        mesh.material_count = material_count
        mesh.material_names = fbx_result.get("material_names", [])
        mesh.has_materials = fbx_result.get("has_materials", material_count > 0)
        mesh.export_mode = fbx_result.get("export_mode", "")

        # 包围盒：支持两种格式
        bb = fbx_result.get("bounding_box", {})
        if bb:
            mesh.bounding_box = BoundingBox(
                x=bb.get("x", 0.0),
                y=bb.get("y", 0.0),
                z=bb.get("z", 0.0),
            )
        elif "bbox_size" in fbx_result:
            bbox = fbx_result["bbox_size"]
            mesh.bounding_box = BoundingBox(
                x=round(bbox[0], 3) if len(bbox) > 0 else 0.0,
                y=round(bbox[1], 3) if len(bbox) > 1 else 0.0,
                z=round(bbox[2], 3) if len(bbox) > 2 else 0.0,
            )

        return mesh

    def extract_from_texture_results(self, texture_results: list[dict]) -> TextureSet:
        """
        从 check_texture_batch 的输出中提取贴图集标签。

        参数:
            texture_results: check_texture_batch 中每个贴图的结果列表

        返回:
            TextureSet 数据对象
        """
        ts = TextureSet()
        ts.count = len(texture_results)

        max_area = 0
        formats = set()
        color_spaces = set()
        usage_types = set()

        for t in texture_results:
            ti = TextureInfo(
                name=t.get("file", ""),
                width=t.get("width", 0),
                height=t.get("height", 0),
                format=t.get("format", ""),
                channels=t.get("channels", 0),
                color_space=t.get("color_space", ""),
                usage=t.get("usage_type", ""),
                file_size_mb=t.get("file_size_mb", 0.0),
            )
            ts.textures.append(ti)

            area = ti.width * ti.height
            if area > max_area:
                max_area = area
                ts.max_resolution = f"{ti.width}x{ti.height}"

            if ti.format:
                formats.add(ti.format)
            if ti.color_space:
                color_spaces.add(ti.color_space)
            if ti.usage:
                usage_types.add(ti.usage)

        ts.formats_used = sorted(formats)
        ts.color_spaces = sorted(color_spaces)
        ts.usage_types = sorted(usage_types)

        return ts

    def extract_from_naming_result(self, naming_result: dict) -> tuple[bool, list[str], str]:
        """
        从 check_naming 的输出中提取命名标签。

        返回:
            (is_compliant, issues, suggestion)
        """
        issues = naming_result.get("issues", [])
        is_compliant = len(issues) == 0
        suggestion = naming_result.get("suggestion", "")
        return is_compliant, issues, suggestion

    def build_asset_tags(
        self,
        file_path: str,
        mesh_info: Optional[MeshInfo] = None,
        texture_set: Optional[TextureSet] = None,
        naming_result: Optional[dict] = None,
        related_assets: Optional[list[str]] = None,
    ) -> AssetTags:
        """
        汇总所有工具结果，组装成一张完整的资产身份证。
        推断层字段（category, visual, material_structure）留空，
        等待 AI 分析阶段填充。

        参数:
            file_path: 资产文件路径
            mesh_info: 几何信息（从 read_fbx_info 提取）
            texture_set: 贴图集信息（从 check_texture_batch 提取）
            naming_result: 命名检查结果（从 check_naming 提取）
            related_assets: 关联资产列表

        返回:
            AssetTags 资产身份证
        """
        tags = AssetTags()
        tags.asset_id = _asset_id(file_path)
        tags.asset_name = _asset_name(file_path)
        tags.file_path = file_path

        # 确定层
        tags.mesh = mesh_info or MeshInfo()
        tags.textures = texture_set or TextureSet()

        # 命名信息
        if naming_result:
            compliant, issues, suggestion = self.extract_from_naming_result(naming_result)
            tags.meta.naming_compliant = compliant
            tags.meta.naming_issues = issues
            tags.meta.naming_suggestion = suggestion

        # 空间关系
        if related_assets:
            tags.spatial.related_assets = related_assets

        # 管理层
        tags.meta.source_path = file_path
        tags.meta.intake_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        tags.meta.status = "pending"

        return tags

    def build_asset_tags_from_scan(
        self,
        file_path: str,
        scan_data: dict,
    ) -> AssetTags:
        """
        从一次完整的扫描结果中构建资产身份证。
        scan_data 应包含 fbx_info、texture_results、naming_result 等字段。

        这是一个快捷方法，适合批量处理时使用。
        """
        mesh_info = None
        if "fbx_info" in scan_data:
            mesh_info = self.extract_from_fbx_result(scan_data["fbx_info"])

        texture_set = None
        if "texture_results" in scan_data:
            texture_set = self.extract_from_texture_results(scan_data["texture_results"])

        naming_result = scan_data.get("naming_result")

        return self.build_asset_tags(
            file_path=file_path,
            mesh_info=mesh_info,
            texture_set=texture_set,
            naming_result=naming_result,
            related_assets=scan_data.get("related_assets", []),
        )
