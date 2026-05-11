"""
tags/inferrer.py - AI 推断层

接收资产的确定层数据（几何、贴图、命名等），调用 LLM 推断：
  - 分类（category / subcategory）
  - 材质结构（primary / secondary）
  - 视觉属性（style / color_palette / condition / description）
  - 空间关系推断

LLM 返回 JSON，解析后填充到 AssetTags 的推断层字段。
"""
from __future__ import annotations
import json
import re
import sys
import threading
from typing import Optional

from openai import OpenAI
from config import get_llm_config

from tags.schema import (
    AssetTags, AssetCategory, MaterialStructure,
    VisualAttributes, SpatialRelation,
)


# ========== Prompt 模板 ==========

INFERENCE_PROMPT = """你是一个专业的游戏技术美术（TA）分析师。根据以下资产的技术数据，推断资产的分类和视觉属性。

## 资产技术数据

**文件名**: {asset_name}
**文件路径**: {file_path}

**几何信息**:
- 三角面数: {tri_count:,}
- 顶点数: {vertex_count:,}
- 是否有骨骼: {has_skeleton}
- 骨骼数: {bone_count}
- 是否有蒙皮: {has_skin}
- 材质数: {material_count}
- 材质名: {material_names}
- 包围盒: {bbox_x}m × {bbox_y}m × {bbox_z}m
- 导出模式: {export_mode}

**贴图信息**:
- 贴图数量: {tex_count}
- 最大分辨率: {max_resolution}
- 格式: {formats}
- 色彩空间: {color_spaces}
- 用途类型: {usage_types}
- 具体贴图: {texture_details}

**命名信息**:
- 文件名前缀: {name_prefix}
- 命名合规: {naming_compliant}

{conventions_context}

## 你的任务

根据以上数据，推断以下信息，以 JSON 格式返回：

```json
{{
  "category": {{
    "category": "大类（character/weapon/building/vehicle/prop/environment/plant/fx）",
    "subcategory": "子类（如：商业高楼/人形角色/近战武器/载具轮胎等）",
    "confidence": 0.85
  }},
  "material_structure": {{
    "primary": ["主要材质1", "主要材质2"],
    "secondary": ["次要材质1"]
  }},
  "visual": {{
    "style": "风格（现代/古风/科幻/写实/卡通/赛博朋克/末日废土/东方奇幻/西方魔幻）",
    "color_palette": ["主色调1", "主色调2"],
    "condition": "状态（全新/轻微磨损/重度磨损/破碎/风化/锈蚀）",
    "description": "一句话描述这个资产的外观特征"
  }},
  "spatial": {{
    "belongs_to": "推测属于哪个大资产或场景（如：城市建筑群/角色装备集/载具组件）",
    "related_hints": ["可能关联的资产类型或关键词"]
  }},
  "naming_suggestion": {{
    "suggested_name": "建议的标准命名（如果当前命名不合规）",
    "suggested_engine_path": "建议的引擎目录路径"
  }}
}}
```

## 推断规则

1. **分类推断**:
   - SM_ 前缀 → 通常是静态网格体（building/prop/environment）
   - SK_ 前缀 → 通常是骨骼网格体（character/vehicle）
   - 有骨骼+蒙皮 → 大概率是角色或生物
   - 无骨骼+面数高 → 大概率是建筑或环境
   - 包围盒窄长 → 可能是武器或工具
   - 包围盒高大 → 可能是建筑或大型物体

2. **材质推断**:
   - 材质数为 0 或材质名为"无" → 该资产没有材质，标记为"无材质"，这是资源缺失问题
   - 材质名包含 Glass/Transparent → 有玻璃材质
   - 材质名包含 Metal/Steel/Iron → 有金属材质
   - 贴图有 Roughness/Metallic → PBR 流程，可能有金属/非金属混合
   - 贴图有 Normal → 有表面细节
   - 贴图有 Emission/Emissive → 有自发光部分

3. **视觉推断**:
   - 色彩空间 sRGB → 通常是颜色贴图（Albedo/Diffuse）
   - 色彩空间 Linear → 通常是数据贴图（Normal/Roughness/Metallic）
   - 面数极低+风格化命名 → 可能是卡通风格
   - 面数高+写实命名 → 可能是写实风格

4. **状态推断**:
   - 通常默认为"全新"，除非有明显特征表明是旧资产
   - 贴图名包含 Damaged/Broken/Worn → 破损/磨损状态

只返回 JSON，不要有其他文字。"""


VISION_PROMPT = """你是一个专业的游戏技术美术（TA）分析师。下面附带了这个资产的多角度渲染预览图。
请结合技术数据和渲染图，推断资产的分类和视觉属性。

注意：渲染图展示了资产的实际外观，请特别关注：
- 资产的整体形状和比例，用于判断分类
- 材质质感（金属/木材/布料/石材等），用于判断材质结构
- 色彩搭配和风格（写实/卡通/科幻/古风等）
- 磨损程度和表面状态

重要提示：如果渲染图中模型呈现**紫红色**，说明该资产**没有材质**（FBX 中未嵌入材质信息）。
请在材质结构中标记为"无材质"，不要将紫红色误认为是实际材质颜色。
"""


def _build_inference_prompt(
    tags: AssetTags,
    conventions_context: str = "",
    memory_context: Optional[str] = None,
) -> str:
    """从资产身份证的确定层数据构建推断 prompt"""
    # 提取贴图详情
    tex_details = []
    for t in tags.textures.textures:
        tex_details.append(f"{t.name} ({t.width}x{t.height}, {t.format}, {t.usage})")
    tex_details_str = "\n".join(tex_details) if tex_details else "无"

    # 提取文件名前缀
    name_prefix = ""
    parts = tags.asset_name.split("_")
    if len(parts) > 1:
        name_prefix = parts[0]

    # 材质名列表
    mat_names = ", ".join(tags.mesh.material_names) if tags.mesh.material_names else "无"

    # 构建记忆上下文部分
    memory_section = ""
    if memory_context:
        memory_section = f"""

## 项目记忆（从历史经验中学习）

{memory_context}

注意：以上项目记忆来自历史纠正和学习，当与技术数据冲突时，以技术数据为准，但记忆中的经验应优先考虑。
"""

    return INFERENCE_PROMPT.format(
        asset_name=tags.asset_name,
        file_path=tags.file_path,
        tri_count=tags.mesh.tri_count,
        vertex_count=tags.mesh.vertex_count,
        has_skeleton="是" if tags.mesh.has_skeleton else "否",
        bone_count=tags.mesh.bone_count,
        has_skin="是" if tags.mesh.has_skin else "否",
        material_count=tags.mesh.material_count,
        material_names=mat_names,
        bbox_x=tags.mesh.bounding_box.x,
        bbox_y=tags.mesh.bounding_box.y,
        bbox_z=tags.mesh.bounding_box.z,
        export_mode=tags.mesh.export_mode or "未知",
        tex_count=tags.textures.count,
        max_resolution=tags.textures.max_resolution or "无",
        formats=", ".join(tags.textures.formats_used) or "无",
        color_spaces=", ".join(tags.textures.color_spaces) or "无",
        usage_types=", ".join(tags.textures.usage_types) or "无",
        texture_details=tex_details_str,
        name_prefix=name_prefix or "无",
        naming_compliant="是" if tags.meta.naming_compliant else "否",
        conventions_context=conventions_context + memory_section,
    )


def _parse_inference_result(raw: str) -> dict:
    """解析 LLM 返回的 JSON"""
    # 尝试直接解析
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # 尝试从 markdown code block 中提取
    match = re.search(r"```(?:json)?\s*\n?(.*?)```", raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # 尝试找第一个 { 到最后一个 }
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1:
        try:
            return json.loads(raw[start:end + 1])
        except json.JSONDecodeError:
            pass

    return {}


def infer_asset_tags(
    tags: AssetTags,
    conventions_context: str = "",
    memory_context: Optional[str] = None,
    preview_images: Optional[list[str]] = None,
    client=None,
) -> AssetTags:
    """
    用 LLM 推断资产的推断层标签。

    参数:
        tags: 已有确定层数据的资产身份证
        conventions_context: 项目规范上下文（可选）
        memory_context: 项目记忆上下文（可选，来自 MemoryProvider）
        preview_images: 预览图路径列表（可选，启用多模态分析）
        client: 复用的 OpenAI 客户端（可选，不传则新建）

    返回:
        填充了推断层字段的资产身份证
    """
    if client is None:
        config = get_llm_config()
        client = OpenAI(base_url=config["base_url"], api_key=config["api_key"])

    # 始终获取 config，用于获取 model 名称
    config = get_llm_config()

    prompt = _build_inference_prompt(tags, conventions_context, memory_context)

    # 判断是否使用多模态模式
    use_vision = False
    vision_images = []
    try:
        from config import USE_VISION
        vision_enabled = USE_VISION
    except ImportError:
        vision_enabled = False

    if vision_enabled and preview_images:
        from tools.vision import get_available_preview_images
        vision_images = get_available_preview_images(preview_images, max_count=3)
        use_vision = len(vision_images) > 0

    try:
        if use_vision:
            # 多模态模式：图片 + 文本，使用视觉专用配置
            from tools.vision import build_vision_prompt
            from config import get_vision_config, INFERENCE_TIMEOUT
            vision_config = get_vision_config()
            vision_client = OpenAI(base_url=vision_config["base_url"], api_key=vision_config["api_key"], timeout=INFERENCE_TIMEOUT)

            system_msg = "你是一个专业的游戏技术美术分析师。结合渲染图和技术数据进行分析。只返回 JSON，不要有其他文字。"
            user_content = build_vision_prompt(
                VISION_PROMPT + "\n\n" + prompt,
                vision_images,
            )
            messages = [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_content},
            ]

            response = vision_client.chat.completions.create(
                model=vision_config["model"],
                messages=messages,
                temperature=0.2,
                max_tokens=1000,
            )
        else:
            # 纯文本模式
            messages = [
                {"role": "system", "content": "你是一个专业的游戏技术美术分析师。只返回 JSON，不要有其他文字。"},
                {"role": "user", "content": prompt},
            ]

            response = client.chat.completions.create(
                model=config["model"],
                messages=messages,
                temperature=0.2,
                max_tokens=1000,
            )

        raw = response.choices[0].message.content or ""
        result = _parse_inference_result(raw)

        if not result:
            return tags

        # 填充分类
        cat = result.get("category", {})
        if cat:
            tags.category = AssetCategory(
                category=cat.get("category", ""),
                subcategory=cat.get("subcategory", ""),
                confidence=cat.get("confidence", 0.0),
            )

        # 填充材质结构
        mat = result.get("material_structure", {})
        if mat:
            tags.material_structure = MaterialStructure(
                primary=mat.get("primary", []),
                secondary=mat.get("secondary", []),
            )

        # 填充视觉属性
        vis = result.get("visual", {})
        if vis:
            tags.visual = VisualAttributes(
                style=vis.get("style", ""),
                color_palette=vis.get("color_palette", []),
                condition=vis.get("condition", ""),
                description=vis.get("description", ""),
            )

        # 填充空间关系
        spa = result.get("spatial", {})
        if spa:
            tags.spatial.belongs_to = spa.get("belongs_to", "")

        # 填充命名建议
        ns = result.get("naming_suggestion", {})
        if ns:
            if ns.get("suggested_name"):
                tags.meta.naming_suggestion = ns["suggested_name"]
            if ns.get("suggested_engine_path"):
                tags.meta.engine_path = ns["suggested_engine_path"]

    except Exception as e:
        import traceback
        error_detail = f"{type(e).__name__}: {e}"
        tags.visual.description = f"AI 推断失败: {error_detail}"
        # 打印到控制台，方便调试
        print(f"  [!] 推断失败 {tags.asset_name}: {error_detail}")
        # 标记这个资产的推断失败，供 batch 统计
        tags._infer_failed = True
        tags._infer_error = error_detail

    return tags


def infer_batch(
    all_tags: list[AssetTags],
    conventions_context: str = "",
    memory_context: Optional[str] = None,
    on_progress: Optional[callable] = None,
) -> dict:
    """
    批量推断多个资产的推断层标签。

    参数:
        all_tags: 已有确定层数据的资产身份证列表
        conventions_context: 项目规范上下文
        memory_context: 项目记忆上下文（可选）
        on_progress: 进度回调 (current, total, asset_name, elapsed)

    返回:
        {
            "total": 总数,
            "success": 成功数,
            "failed": 失败数,
            "first_error": 第一个错误的详情（如果有）,
            "aborted": 是否提前终止,
        }
    """
    import time
    from config import get_llm_config, INFERENCE_TIMEOUT
    from openai import OpenAI

    # 复用同一个客户端，避免每个资产都新建连接
    config = get_llm_config()
    client = OpenAI(
        base_url=config["base_url"],
        api_key=config["api_key"],
        timeout=INFERENCE_TIMEOUT,
    )

    total = len(all_tags)
    success_count = 0
    fail_count = 0
    first_error = None
    consecutive_fails = 0
    MAX_CONSECUTIVE_FAILS = 5  # 连续失败超过此数则终止
    aborted = False

    for i, tags in enumerate(all_tags):
        t0 = time.time()

        # 清除之前的失败标记
        tags._infer_failed = False
        tags._infer_error = None

        # 从资产身份证中获取预览图路径
        preview_images = tags.meta.preview_images if tags.meta else []

        # 启动动态计时线程（每 0.5 秒刷新一次当前资产的耗时）
        stop_tick = threading.Event()
        def _fmt(sec):
            if sec >= 60:
                m = int(sec) // 60
                s = sec - m * 60
                return f"{m}m {s:.1f}s"
            return f"{sec:.1f}s"
        def _tick(idx=i, name=tags.asset_name):
            while not stop_tick.is_set():
                so_far = time.time() - t0
                # \r 覆盖同一行，end="" 不换行
                print(f"\r  [AI 推断]  {idx+1}/{total} - {name}  ({_fmt(so_far)})   ", end="", flush=True)
                stop_tick.wait(0.5)

        tick_thread = threading.Thread(target=_tick, daemon=True)
        tick_thread.start()

        infer_asset_tags(
            tags,
            conventions_context=conventions_context,
            memory_context=memory_context,
            preview_images=preview_images,
            client=client,
        )

        # 停止计时，打印最终耗时（覆盖动态行）
        stop_tick.set()
        tick_thread.join(timeout=1.5)
        elapsed = time.time() - t0
        # 清除动态行，打印最终结果
        if elapsed >= 60:
            m = int(elapsed) // 60
            s = elapsed - m * 60
            print(f"\r  [AI 推断]  {i+1}/{total} - {tags.asset_name}  ({m}m {s:.1f}s)   ")
        else:
            print(f"\r  [AI 推断]  {i+1}/{total} - {tags.asset_name}  ({elapsed:.1f}s)   ")

        # 统计成功/失败
        if getattr(tags, '_infer_failed', False):
            fail_count += 1
            consecutive_fails += 1
            if first_error is None:
                first_error = tags._infer_error
            # 连续失败过多，提前终止
            if consecutive_fails >= MAX_CONSECUTIVE_FAILS:
                remaining = total - i - 1
                print(f"\n  [!!] 连续 {MAX_CONSECUTIVE_FAILS} 次推断失败，终止剩余 {remaining} 个资产")
                print(f"  [!!] 首个错误: {first_error}")
                aborted = True
                # 剩余资产标记为未推断
                for leftover_tags in all_tags[i + 1:]:
                    leftover_tags._infer_failed = True
                    leftover_tags._infer_error = "因连续失败被跳过"
                fail_count += remaining
                break
        else:
            success_count += 1
            consecutive_fails = 0  # 重置连续失败计数

    return {
        "total": total,
        "success": success_count,
        "failed": fail_count,
        "first_error": first_error,
        "aborted": aborted,
    }
