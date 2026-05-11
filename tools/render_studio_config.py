"""
tools/render_studio_config.py - 渲染模块配置

定义渲染配置和预设
"""
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class RenderConfig:
    """渲染配置"""
    # 渲染引擎
    engine: str = "CYCLES"          # CYCLES / BLENDER_EEVEE
    device: str = "CPU"             # CPU / GPU
    samples: int = 64               # 采样数（越高越清晰，越慢）

    # 输出
    resolution_x: int = 1024
    resolution_y: int = 1024
    file_format: str = "PNG"
    color_depth: str = "16"         # 8 / 16

    # 背景
    use_transparent: bool = False   # 透明背景
    background_color: tuple = (0.95, 0.95, 0.95, 1.0)  # 浅灰背景

    # 灯光
    use_hdri: bool = True           # 使用 HDRI 环境光
    hdri_path: Optional[str] = None # HDRI 文件路径
    hdri_strength: float = 1.0      # HDRI 强度
    use_fill_light: bool = True     # 使用补光
    fill_light_strength: float = 0.3

    # 相机
    camera_lens: float = 50.0       # 焦距 mm
    camera_padding: float = 1.4     # 包围盒留白比例

    # 渲染角度
    angles: list = field(default_factory=lambda: [
        "front", "side", "three_quarter", "top"
    ])

    # 材质
    use_pbr: bool = True            # 尝试加载 PBR 贴图
    default_material_color: tuple = (0.6, 0.6, 0.6, 1.0)  # 无材质时的默认颜色


# 预设配置
PRESETS = {
    "studio": RenderConfig(
        samples=64,
        resolution_x=1024,
        resolution_y=1024,
        use_hdri=True,
        use_transparent=False,
        background_color=(0.95, 0.95, 0.95, 1.0),
    ),
    "turntable": RenderConfig(
        samples=32,
        resolution_x=512,
        resolution_y=512,
        use_hdri=False,
        use_transparent=True,
        angles=["front", "side", "back", "other_side"],
    ),
    "fast": RenderConfig(
        samples=16,
        resolution_x=512,
        resolution_y=512,
        use_hdri=False,
        use_transparent=False,
        angles=["front", "three_quarter"],
    ),
    "transparent": RenderConfig(
        samples=64,
        resolution_x=1024,
        resolution_y=1024,
        use_hdri=True,
        use_transparent=True,
    ),
}
