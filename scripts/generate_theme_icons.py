from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "apps" / "web" / "src" / "assets" / "icon.png"
OUT_DIR = ROOT / "apps" / "web" / "src" / "assets" / "theme-icons"


THEMES = {
    "default-light": {
        "bg": ((248, 248, 248), (232, 232, 232)),
        "stroke": (34, 34, 34),
        "facet": (238, 236, 231),
        "accent": (36, 36, 36),
        "check": (255, 255, 255),
    },
    "default-dark": {
        "bg": ((18, 19, 20), (36, 38, 40)),
        "stroke": (246, 244, 239),
        "facet": (226, 222, 216),
        "accent": (107, 188, 180),
        "check": (255, 255, 255),
    },
    "ocean-light": {
        "bg": ((226, 237, 245), (201, 221, 237)),
        "stroke": (22, 74, 117),
        "facet": (240, 248, 252),
        "accent": (63, 137, 195),
        "check": (255, 255, 255),
    },
    "ocean-dark": {
        "bg": ((10, 20, 33), (26, 37, 53)),
        "stroke": (222, 239, 252),
        "facet": (77, 119, 157),
        "accent": (58, 106, 155),
        "check": (255, 255, 255),
    },
    "forest-light": {
        "bg": ((226, 233, 228), (244, 248, 245)),
        "stroke": (31, 84, 57),
        "facet": (236, 244, 238),
        "accent": (63, 131, 97),
        "check": (255, 255, 255),
    },
    "forest-dark": {
        "bg": ((9, 22, 16), (27, 39, 33)),
        "stroke": (226, 240, 231),
        "facet": (65, 112, 85),
        "accent": (24, 83, 55),
        "check": (255, 255, 255),
    },
    "slate-light": {
        "bg": ((240, 239, 236), (227, 225, 220)),
        "stroke": (69, 61, 57),
        "facet": (247, 245, 242),
        "accent": (181, 151, 141),
        "check": (255, 255, 255),
    },
    "slate-dark": {
        "bg": ((18, 16, 20), (39, 36, 41)),
        "stroke": (242, 229, 222),
        "facet": (108, 96, 97),
        "accent": (201, 168, 158),
        "check": (39, 36, 41),
    },
}


def mix(a: tuple[int, int, int], b: tuple[int, int, int], t):
    aa = np.array(a, dtype=np.float32)
    bb = np.array(b, dtype=np.float32)
    return aa + (bb - aa) * np.expand_dims(t, axis=-1)


def recolor(src: Image.Image, theme: dict) -> Image.Image:
    arr = np.array(src.convert("RGBA"), dtype=np.float32)
    rgb = arr[..., :3]
    alpha = arr[..., 3:4]

    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    chroma = rgb.max(axis=-1) - rgb.min(axis=-1)

    out = np.empty_like(rgb)

    bg_t = np.clip(lum / 0.28, 0, 1)
    out[:] = mix(theme["bg"][0], theme["bg"][1], bg_t)

    soft_facet = (lum > 0.30) & (chroma < 28)
    out[soft_facet] = mix(theme["bg"][1], theme["facet"], 0.22)

    facet = (lum > 0.46) & (chroma < 22)
    out[facet] = mix(theme["facet"], theme["stroke"], 0.16)

    stroke = lum > 0.78
    stroke_t = np.clip((lum - 0.78) / 0.22, 0, 1)
    out[stroke] = mix(theme["facet"], theme["stroke"], stroke_t)[stroke]

    tealish = (g > r + 14) & (b > r + 8) & (chroma > 24)
    accent_t = np.clip((lum - 0.45) * 0.35, 0, 1)
    out[tealish] = mix(theme["accent"], (255, 255, 255), accent_t)[tealish]

    result = np.concatenate([out, alpha], axis=-1).clip(0, 255).astype(np.uint8)
    return Image.fromarray(result, "RGBA")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    src = Image.open(SOURCE).convert("RGBA")

    for name, theme in THEMES.items():
        recolor(src, theme).save(OUT_DIR / f"icon-{name}.png")


if __name__ == "__main__":
    main()
