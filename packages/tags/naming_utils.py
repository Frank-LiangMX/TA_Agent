"""资产命名归一化（用于贴图 ↔ 模型套匹配）"""
from __future__ import annotations

import os
import re

# 贴图通道后缀：T_Hero_D → 去掉 _D 后再去前缀
_TEXTURE_SUFFIX_RE = re.compile(r"^(.+?)_(D|N|R|M|O|E|AO|ORM|MT|NM|DM)$", re.IGNORECASE)

_ASSET_PREFIXES = ("SM_", "SK_", "T_", "M_", "MI_", "AN_", "BP_", "S_", "FX_", "P_")


def asset_base_name(name: str) -> str:
    """
    提取资产的基础名称，去掉类型前缀和贴图通道后缀。

    例:
      SK_C5_Body_1    → C5_Body_1
      T_C5_Body_1_D   → C5_Body_1
      SM_Sword_01     → Sword_01
    """
    base = os.path.splitext(os.path.basename(name))[0]

    tex_match = _TEXTURE_SUFFIX_RE.match(base)
    if tex_match:
        base = tex_match.group(1)

    upper = base.upper()
    for prefix in _ASSET_PREFIXES:
        if upper.startswith(prefix):
            return base[len(prefix):]

    if base.startswith("@"):
        return base[1:]

    return base
