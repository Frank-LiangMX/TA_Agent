"""资产类型推断（补全缺失的 asset_type）"""
from __future__ import annotations

import os

TEXTURE_EXTENSIONS = frozenset({
    ".tga", ".png", ".jpg", ".jpeg", ".tiff", ".tif", ".bmp", ".exr", ".hdr", ".dds",
})

_PREFIX_TYPE_MAP = (
    ("T_", "texture"),
    ("SM_", "static_mesh"),
    ("SK_", "skeletal_mesh"),
    ("M_", "material"),
    ("MI_", "material"),
    ("AN_", "animation"),
    ("BP_", "blueprint"),
    ("S_", "sound"),
    ("FX_", "effect"),
    ("P_", "prop"),
)


def infer_asset_type(
    asset_name: str = "",
    file_path: str = "",
    asset_type: str = "",
) -> str:
    """在 asset_type 为空时，根据扩展名或命名前缀推断。"""
    if asset_type:
        return asset_type

    path = file_path or asset_name
    if not path:
        return ""

    ext = os.path.splitext(path)[1].lower()
    if ext in TEXTURE_EXTENSIONS:
        return "texture"

    base = os.path.basename(path).upper()
    for prefix, inferred in _PREFIX_TYPE_MAP:
        if base.startswith(prefix):
            return inferred

    return ""
