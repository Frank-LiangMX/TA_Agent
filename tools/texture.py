"""
贴图深度检查工具
使用 Pillow 读取贴图的真实分辨率、格式、通道数等信息
"""
import os


SCHEMA = {
    "type": "function",
    "function": {
        "name": "check_texture_info",
        "description": "深度解析贴图文件，返回真实分辨率、格式、通道数、是否有 Alpha、色彩空间等信息。用于质检贴图是否符合项目规范。",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "贴图文件的完整路径（支持 .png, .jpg, .jpeg, .tga, .bmp, .exr, .hdr）"
                }
            },
            "required": ["file_path"]
        }
    }
}

BATCH_SCAN_SCHEMA = {
    "type": "function",
    "function": {
        "name": "check_texture_batch",
        "description": "批量检查目录下所有贴图的分辨率、格式等信息，返回汇总统计和不合规贴图列表。",
        "parameters": {
            "type": "object",
            "properties": {
                "dir_path": {
                    "type": "string",
                    "description": "贴图目录路径"
                },
                "max_resolution": {
                    "type": "integer",
                    "description": "最大允许分辨率（如 2048 表示不允许超过 2048x2048）",
                    "default": 2048
                },
                "recursive": {
                    "type": "boolean",
                    "description": "是否递归扫描子目录",
                    "default": True
                }
            },
            "required": ["dir_path"]
        }
    }
}


TEXTURE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.tga', '.bmp', '.exr', '.hdr'}


def check_texture_info(file_path: str) -> dict:
    """
    深度解析单个贴图文件
    返回：分辨率、格式、通道数、是否有 Alpha、色彩空间等
    """
    result = {
        "file_path": file_path,
        "exists": False,
    }

    if not os.path.exists(file_path):
        result["error"] = f"文件不存在: {file_path}"
        return result

    result["exists"] = True
    result["filename"] = os.path.basename(file_path)
    result["extension"] = os.path.splitext(file_path)[1].lower()
    result["size_mb"] = round(os.path.getsize(file_path) / (1024 * 1024), 2)

    # 尝试导入 Pillow
    try:
        from PIL import Image
    except ImportError:
        result["error"] = "Pillow 库未安装，请运行: pip install Pillow"
        return result

    try:
        with Image.open(file_path) as img:
            result["width"] = img.width
            result["height"] = img.height
            result["is_power_of_two"] = _is_power_of_two(img.width) and _is_power_of_two(img.height)
            result["is_square"] = img.width == img.height
            result["format"] = img.format  # PNG, JPEG, TGA 等
            result["mode"] = img.mode      # RGB, RGBA, L, LA 等

            # 通道信息
            channel_info = _analyze_channels(img)
            result.update(channel_info)

            # 分辨率等级
            max_dim = max(img.width, img.height)
            if max_dim <= 512:
                result["resolution_tier"] = "low"
            elif max_dim <= 1024:
                result["resolution_tier"] = "medium"
            elif max_dim <= 2048:
                result["resolution_tier"] = "high"
            elif max_dim <= 4096:
                result["resolution_tier"] = "very_high"
            else:
                result["resolution_tier"] = "extreme"

            # DPI 信息
            dpi = img.info.get("dpi")
            if dpi:
                result["dpi"] = dpi

    except Exception as e:
        result["error"] = f"解析贴图失败: {str(e)}"

    return result


def check_texture_batch(dir_path: str, max_resolution: int = 2048, recursive: bool = True) -> dict:
    """
    批量检查目录下所有贴图
    返回：统计汇总、不合规列表
    """
    if not os.path.exists(dir_path):
        return {"error": f"目录不存在: {dir_path}"}

    try:
        from PIL import Image
    except ImportError:
        return {"error": "Pillow 库未安装，请运行: pip install Pillow"}

    textures = []
    issues = []
    format_stats = {}
    resolution_stats = {"low": 0, "medium": 0, "high": 0, "very_high": 0, "extreme": 0}

    walker = os.walk(dir_path) if recursive else [(dir_path, [], os.listdir(dir_path))]

    for root, dirs, filenames in walker:
        for fname in filenames:
            ext = os.path.splitext(fname)[1].lower()
            if ext not in TEXTURE_EXTENSIONS:
                continue

            full_path = os.path.join(root, fname)
            if not os.path.isfile(full_path):
                continue

            info = check_texture_info(full_path)
            textures.append({
                "filename": fname,
                "path": full_path,
                "width": info.get("width"),
                "height": info.get("height"),
                "format": info.get("format"),
                "has_alpha": info.get("has_alpha"),
                "size_mb": info.get("size_mb"),
                "resolution_tier": info.get("resolution_tier"),
            })

            # 统计格式
            fmt = info.get("format", "unknown")
            format_stats[fmt] = format_stats.get(fmt, 0) + 1

            # 统计分辨率等级
            tier = info.get("resolution_tier", "unknown")
            if tier in resolution_stats:
                resolution_stats[tier] += 1

            # 检查问题
            file_issues = []
            if info.get("width") and info.get("height"):
                if info["width"] > max_resolution or info["height"] > max_resolution:
                    file_issues.append(f"分辨率 {info['width']}x{info['height']} 超过限制 {max_resolution}")
                if not info.get("is_power_of_two"):
                    file_issues.append(f"分辨率 {info['width']}x{info['height']} 不是 2 的幂次")
                if info["width"] != info["height"]:
                    file_issues.append(f"贴图不是正方形 ({info['width']}x{info['height']})")

            if file_issues:
                issues.append({
                    "filename": fname,
                    "path": full_path,
                    "issues": file_issues,
                })

    return {
        "directory": dir_path,
        "total_textures": len(textures),
        "format_stats": format_stats,
        "resolution_stats": resolution_stats,
        "issues_count": len(issues),
        "issues": issues,
        "textures": textures[:50],  # 最多返回 50 个详情，避免 token 过多
    }


def _is_power_of_two(n: int) -> bool:
    """检查是否是 2 的幂次"""
    return n > 0 and (n & (n - 1)) == 0


def _analyze_channels(img) -> dict:
    """分析贴图通道信息"""
    result = {
        "channel_count": 0,
        "has_alpha": False,
        "is_grayscale": False,
    }

    mode = img.mode
    if mode == "L":
        result["channel_count"] = 1
        result["is_grayscale"] = True
    elif mode == "LA":
        result["channel_count"] = 2
        result["has_alpha"] = True
        result["is_grayscale"] = True
    elif mode == "RGB":
        result["channel_count"] = 3
    elif mode == "RGBA":
        result["channel_count"] = 4
        result["has_alpha"] = True
    elif mode == "P":
        result["channel_count"] = 1
        result["is_grayscale"] = True
    else:
        result["channel_count"] = len(mode)
        result["has_alpha"] = "A" in mode

    return result
