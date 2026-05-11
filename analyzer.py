"""
analyzer.py - 资产身份分析器

编排完整分析流程：
  扫描目录 → 提取几何/贴图/命名信息 → 组装资产身份证 → 存储 → 生成报告
"""
from __future__ import annotations
import os
import json
import time

from typing import Optional

from tags.schema import AssetTags, MeshInfo, TextureSet, BoundingBox
from tags.extractor import TagExtractor
from tags.store import TagStore
from tags.inferrer import infer_batch

# 导入现有工具的底层逻辑
from tools.file_info import scan_directory
from tools.naming import check_naming
from tools.texture import check_texture_info
from tools.mesh_fbx import check_fbx_info
from tools.renderer import render_asset_preview, clean_orphan_previews

# 导入记忆模块
from tools.memory import MemoryProvider, NullMemoryProvider, build_memory_context, extract_asset_features


class AssetIdentityAnalyzer:
    """
    资产身份分析器

    职责：
    1. 扫描目录，识别所有资产
    2. 对每个资产调用相关工具提取确定层数据
    3. 用 TagExtractor 组装资产身份证
    4. 存储到 TagStore
    5. 生成汇总报告
    """

    def __init__(
        self,
        store_dir: Optional[str] = None,
        blender_path: Optional[str] = None,
        memory: Optional[MemoryProvider] = None,
    ):
        self.extractor = TagExtractor()
        self.store_dir = store_dir or os.path.join(os.path.dirname(os.path.abspath(__file__)), "tag_store")
        self.store = TagStore(self.store_dir)
        self.blender_path = blender_path
        self.memory = memory or NullMemoryProvider()

    def analyze_directory(
        self,
        dir_path: str,
        naming_config: Optional[dict] = None,
        enable_ai_inference: bool = False,
        conventions_context: str = "",
        render_previews: bool = False,
        clean_orphans: bool = False,
        on_progress: Optional[callable] = None,
    ) -> dict:
        """
        分析一个目录中的所有资产，生成资产身份证。

        参数:
            dir_path: 要分析的目录路径
            naming_config: 命名规范配置（可选）
            enable_ai_inference: 是否启用 AI 推断层（分类/材质/视觉属性）
            conventions_context: 项目规范上下文（传给 AI 推断）
            render_previews: 是否渲染资产预览图（需要 Blender）
            clean_orphans: 是否清理无对应资产的孤儿预览图
            on_progress: 进度回调 fn(phase, current, total, detail)
                         phase: "textures" | "assets" | "inference" | "done"

        返回:
            {
                "total_assets": int,
                "assets": [AssetTags.to_dict(), ...],
                "summary": { ... },
                "report_markdown": str,
            }
        """
        if not os.path.exists(dir_path):
            return {"error": f"目录不存在: {dir_path}"}

        start_time = time.time()

        def _elapsed():
            return time.time() - start_time

        def _fmt(sec):
            """格式化秒数：>=60s 显示分钟"""
            if sec >= 60:
                m = int(sec) // 60
                s = sec - m * 60
                return f"{m}m {s:.1f}s"
            return f"{sec:.1f}s"

        def _phase(msg):
            """打印阶段提示并刷新"""
            print(f"\n  === {msg} ===  [{_fmt(_elapsed())}]")
            import sys; sys.stdout.flush()

        # 0. 清理孤儿预览图（可选，在扫描前执行）
        orphan_cleanup = None
        if clean_orphans:
            orphan_cleanup = clean_orphan_previews(dir_path)

        # 1. 扫描目录
        _phase("扫描目录")
        scan_result = scan_directory(dir_path, recursive=True)
        if "error" in scan_result:
            return scan_result

        # 2. 获取文件列表（排除 .previews 目录）
        files = [
            f for f in scan_result.get("files", [])
            if ".previews" not in f.get("path", "").replace("\\", "/")
        ]
        fbx_files = [f for f in files if f.get("extension") == ".fbx"]
        texture_files = [
            f for f in files
            if f.get("extension") in (".png", ".jpg", ".jpeg", ".tga", ".tiff", ".bmp")
        ]
        print(f"  找到 {len(fbx_files)} 个 FBX, {len(texture_files)} 张贴图")
        import sys; sys.stdout.flush()

        # 3. 批量分析贴图
        if texture_files:
            _phase(f"分析贴图 ({len(texture_files)} 张)")
        texture_by_stem = {}  # 贴图按去掉后缀的名称分组
        texture_results = []
        total_textures = len(texture_files)
        for idx, tex_file in enumerate(texture_files):
            if on_progress:
                on_progress("textures", idx + 1, total_textures, tex_file["filename"], _elapsed())
            tex_path = os.path.join(dir_path, tex_file["filename"])
            tex_result = check_texture_info(tex_path)
            tex_result["file"] = tex_file["filename"]
            texture_results.append(tex_result)

            # 按 stem 分组（去掉 _D, _N, _R 等后缀）
            stem = self._texture_stem(tex_file["filename"])
            texture_by_stem.setdefault(stem, []).append(tex_result)

        # 4. 逐个分析 FBX 资产
        if fbx_files:
            _phase(f"分析 FBX 模型 ({len(fbx_files)} 个)")
        all_tags: list[AssetTags] = []
        animation_count = 0
        total_fbx = len(fbx_files)
        for idx, fbx_file in enumerate(fbx_files):
            if on_progress:
                on_progress("assets", idx + 1, total_fbx, fbx_file["filename"], _elapsed())
            fbx_path = os.path.join(dir_path, fbx_file["filename"])
            tags = self._analyze_single_asset(
                fbx_path=fbx_path,
                naming_config=naming_config,
                texture_results=texture_by_stem.get(
                    self._texture_stem(fbx_file["filename"]), []
                ),
                render_preview=render_previews,
            )
            all_tags.append(tags)
            if tags.asset_type == "animation":
                animation_count += 1

        # 5. 分析没有 FBX 的贴图（可能是独立贴图资产）
        matched_stems = {self._texture_stem(f["filename"]) for f in fbx_files}
        orphan_stems = set(texture_by_stem.keys()) - matched_stems
        for stem in orphan_stems:
            tex_group = texture_by_stem[stem]
            tags = self._analyze_texture_only_asset(stem, tex_group, dir_path)
            all_tags.append(tags)

        # 6. 识别关联关系
        self._link_related_assets(all_tags)

        # 6.5 AI 推断层（可选）
        if enable_ai_inference:
            # 过滤掉动画资产，动画不需要 AI 视觉分析
            inferable_tags = [t for t in all_tags if t.asset_type != "animation"]
            skip_count = len(all_tags) - len(inferable_tags)
            if skip_count:
                print(f"  跳过 {skip_count} 个动画资产（不需要 AI 推断）")
                import sys; sys.stdout.flush()
            _phase(f"AI 智能推断 ({len(inferable_tags)} 个资产)")
            # 构建记忆上下文（从第一个资产的特征提取）
            memory_context = None
            if inferable_tags:
                # 提取第一个资产的特征用于记忆匹配
                first_tag = inferable_tags[0]
                asset_features = extract_asset_features(
                    asset_name=first_tag.asset_name,
                    face_count=first_tag.mesh.tri_count,
                    vertex_count=first_tag.mesh.vertex_count,
                    material_name=first_tag.mesh.material_names[0] if first_tag.mesh.material_names else None,
                    bbox_size=(
                        first_tag.mesh.bounding_box.x,
                        first_tag.mesh.bounding_box.y,
                        first_tag.mesh.bounding_box.z,
                    ),
                )
                memory_context = build_memory_context(self.memory, asset_features)

            def _infer_progress(current, total, name, elapsed=0):
                if on_progress:
                    on_progress("inference", current, total, name, elapsed)

            infer_result = infer_batch(
                inferable_tags,
                conventions_context=conventions_context,
                memory_context=memory_context,
                on_progress=_infer_progress,
            )
        else:
            infer_result = None

        # 6.6 统一保存（推断后的最新数据，或提取阶段的数据）
        _phase("保存到数据库")
        for tags in all_tags:
            self.store.save(tags)

        # 7. 生成汇总
        summary = self._build_summary(all_tags)
        report_md = self._build_report_markdown(all_tags, summary, dir_path)

        result = {
            "total_assets": len(all_tags),
            "store_dir": self.store_dir,
            "assets": [t.to_dict() for t in all_tags],
            "summary": summary,
            "report_markdown": report_md,
        }
        if orphan_cleanup:
            result["orphan_cleanup"] = orphan_cleanup
        if infer_result:
            result["inference_result"] = infer_result

        if on_progress:
            on_progress("done", len(all_tags), len(all_tags), dir_path, _elapsed())

        return result

    def _analyze_single_asset(
        self,
        fbx_path: str,
        naming_config: Optional[dict],
        texture_results: list[dict],
        render_preview: bool = False,
    ) -> AssetTags:
        """分析单个 FBX 资产"""
        # 读 FBX 信息
        fbx_result = check_fbx_info(fbx_path)

        # 命名检查（使用项目规范 if 提供）
        naming_result = check_naming(os.path.basename(fbx_path), naming_config=naming_config)

        # 提取几何标签
        mesh_info = self.extractor.extract_from_fbx_result(fbx_result)

        # 提取贴图标签
        texture_set = self.extractor.extract_from_texture_results(texture_results)

        # 组装身份证
        tags = self.extractor.build_asset_tags(
            file_path=fbx_path,
            mesh_info=mesh_info,
            texture_set=texture_set,
            naming_result=naming_result,
        )

        # 判断资产类型
        asset_type = self._detect_asset_type(fbx_path, fbx_result, naming_result)
        tags.asset_type = asset_type

        # 动画资产跳过渲染（动画 FBX 没有有意义的网格可渲染）
        if asset_type == "animation":
            return tags

        # 渲染预览图（可选）
        if render_preview:
            preview_result = render_asset_preview(fbx_path)
            if preview_result.get("success"):
                tags.meta.preview_images = [
                    img["path"] for img in preview_result.get("images", []) if "path" in img
                ]

        return tags

    def _detect_asset_type(self, fbx_path: str, fbx_result: dict, naming_result: dict) -> str:
        """
        检测 FBX 资产类型。

        判断逻辑：
        1. 命名以 AN_ 开头 → 动画
        2. FBX 有骨架但没有网格数据 → 纯动画文件
        3. 命名以 SK_ 开头 → 骨骼网格体
        4. 命名以 SM_ 开头 → 静态网格体
        5. 其他 → 未知
        """
        filename = os.path.basename(fbx_path)
        prefix = naming_result.get("prefix", "")

        # 1. 命名前缀判断
        if prefix == "AN_":
            return "animation"

        # 2. FBX 内容判断：有骨架但没有网格 → 纯动画
        has_skeleton = fbx_result.get("has_skeleton", False)
        has_mesh = not fbx_result.get("error") and fbx_result.get("total_faces", 0) > 0
        if has_skeleton and not has_mesh:
            return "animation"

        # 3. 根据命名前缀判断其他类型
        if prefix == "SK_":
            return "skeletal_mesh"
        if prefix == "SM_":
            return "static_mesh"
        if prefix == "T_":
            return "texture"
        if prefix in ("M_", "MI_"):
            return "material"

        return "unknown"

    def _analyze_texture_only_asset(
        self,
        stem: str,
        texture_results: list[dict],
        dir_path: str,
    ) -> AssetTags:
        """分析只有贴图没有 FBX 的资产"""
        texture_set = self.extractor.extract_from_texture_results(texture_results)

        # 取第一张贴图的路径作为代表
        representative_path = os.path.join(dir_path, texture_results[0]["file"])

        tags = self.extractor.build_asset_tags(
            file_path=representative_path,
            texture_set=texture_set,
        )
        tags.asset_name = stem

        return tags

    def _link_related_assets(self, all_tags: list[AssetTags]):
        """识别并链接关联资产"""
        for i, tag_a in enumerate(all_tags):
            for j, tag_b in enumerate(all_tags):
                if i == j:
                    continue
                # 同一目录下，名称前缀相同的是关联资产
                stem_a = self._texture_stem(tag_a.asset_name)
                stem_b = self._texture_stem(tag_b.asset_name)
                if stem_a == stem_b and tag_a.asset_id not in tag_b.spatial.related_assets:
                    tag_a.spatial.related_assets.append(tag_b.asset_id)
                    tag_b.spatial.related_assets.append(tag_a.asset_id)

    def _texture_stem(self, name: str) -> str:
        """
        提取贴图的主干名称（去掉 _D, _N, _R, _O 等后缀）
        例: T_Building_01_D → T_Building_01
        """
        import re
        base = os.path.splitext(name)[0]
        # 常见贴图后缀模式
        match = re.match(r"^(.+?)_(D|N|R|M|O|E|AO|ORM|MT|NM|DM)$", base, re.IGNORECASE)
        if match:
            return match.group(1)
        return base

    def _build_summary(self, all_tags: list[AssetTags]) -> dict:
        """生成汇总统计"""
        total_tris = sum(t.mesh.tri_count for t in all_tags)
        total_textures = sum(t.textures.count for t in all_tags)
        with_skeleton = sum(1 for t in all_tags if t.mesh.has_skeleton)
        naming_issues = sum(1 for t in all_tags if not t.meta.naming_compliant)
        animations = sum(1 for t in all_tags if t.asset_type == "animation")

        categories = {}
        for t in all_tags:
            cat = t.category.category or "未分类"
            categories[cat] = categories.get(cat, 0) + 1

        return {
            "total_assets": len(all_tags),
            "total_triangles": total_tris,
            "total_textures": total_textures,
            "with_skeleton": with_skeleton,
            "animations": animations,
            "naming_issues": naming_issues,
            "categories": categories,
        }

    def _build_report_markdown(
        self,
        all_tags: list[AssetTags],
        summary: dict,
        dir_path: str,
    ) -> str:
        """生成 Markdown 格式的分析报告"""
        lines = [
            f"# 资产分析报告",
            f"",
            f"**目录**: `{dir_path}`",
            f"**资产数量**: {summary['total_assets']}",
            f"**总面数**: {summary['total_triangles']:,}",
            f"**贴图总数**: {summary['total_textures']}",
            f"**有骨骼资产**: {summary['with_skeleton']}",
            f"**动画文件**: {summary.get('animations', 0)}",
            f"**命名问题**: {summary['naming_issues']}",
            f"",
            f"## 分类统计",
            f"",
        ]

        for cat, count in summary.get("categories", {}).items():
            lines.append(f"- **{cat}**: {count}")

        lines.extend([
            f"",
            f"## 资产详情",
            f"",
        ])

        for tag in all_tags:
            type_label = {"animation": "动画", "skeletal_mesh": "骨骼网格", "static_mesh": "静态网格"}.get(tag.asset_type, "")
            lines.extend([
                f"### {tag.asset_name}" + (f" `{type_label}`" if type_label else ""),
                f"",
                f"| 属性 | 值 |",
                f"|---|---|",
                f"| 三角面数 | {tag.mesh.tri_count:,} |",
                f"| 顶点数 | {tag.mesh.vertex_count:,} |",
                f"| 有骨骼 | {'是' if tag.mesh.has_skeleton else '否'} |",
                f"| 骨骼数 | {tag.mesh.bone_count} |",
                f"| 材质数 | {tag.mesh.material_count} |",
                f"| 有材质 | {'是' if tag.mesh.has_materials else '否 ⚠️ **无材质**'} |",
                f"| 包围盒 | {tag.mesh.bounding_box.x}m × {tag.mesh.bounding_box.y}m × {tag.mesh.bounding_box.z}m |",
                f"| 贴图数 | {tag.textures.count} |",
                f"| 命名合规 | {'是' if tag.meta.naming_compliant else '否'} |",
            ])

            # AI 推断层信息（如果有）
            if tag.category.category:
                lines.append(f"| 分类 | {tag.category.category}/{tag.category.subcategory} ({tag.category.confidence:.0%}) |")
            if tag.material_structure.primary:
                lines.append(f"| 主要材质 | {', '.join(tag.material_structure.primary)} |")
            if tag.material_structure.secondary:
                lines.append(f"| 次要材质 | {', '.join(tag.material_structure.secondary)} |")
            if tag.visual.style:
                lines.append(f"| 风格 | {tag.visual.style} |")
            if tag.visual.condition:
                lines.append(f"| 状态 | {tag.visual.condition} |")
            if tag.visual.color_palette:
                lines.append(f"| 主色调 | {', '.join(tag.visual.color_palette)} |")
            if tag.visual.description:
                lines.append(f"| 描述 | {tag.visual.description} |")
            if tag.spatial.belongs_to:
                lines.append(f"| 所属 | {tag.spatial.belongs_to} |")
            if tag.meta.engine_path:
                lines.append(f"| 建议引擎目录 | {tag.meta.engine_path} |")

            if tag.meta.naming_issues:
                lines.append(f"| 命名问题 | {', '.join(tag.meta.naming_issues)} |")

            if tag.spatial.related_assets:
                lines.append(f"| 关联资产 | {len(tag.spatial.related_assets)} 个 |")

            if tag.meta.preview_images:
                lines.append(f"| 预览图 | {len(tag.meta.preview_images)} 张 |")
                for img_path in tag.meta.preview_images:
                    lines.append(f"  - `{img_path}`")

            lines.append("")

        return "\n".join(lines)

    def search_assets(self, query: dict) -> list[dict]:
        """
        搜索已存储的资产标签。

        参数:
            query: 搜索条件（见 TagStore.search）

        返回:
            匹配的资产标签列表
        """
        results = self.store.search(query)
        return [t.to_dict() for t in results]

    def get_asset(self, asset_id: str) -> Optional[dict]:
        """
        获取单个资产的完整标签。

        返回:
            资产标签 dict 或 None
        """
        tags = self.store.load(asset_id)
        return tags.to_dict() if tags else None

    def list_all_assets(self) -> list[dict]:
        """列出所有已存储的资产索引"""
        return self.store.list_all()
