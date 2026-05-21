"""
资产渲染工具
通过 Blender headless 渲染资产预览图
"""
import os
import json
import subprocess
import sys


SCHEMA = {
    "type": "function",
    "function": {
        "name": "render_asset_preview",
        "description": "使用 Blender 渲染资产的多角度预览图（正面、侧面、3/4 视角）。返回渲染后的图片路径，可用于多模态 LLM 分析资产外观。",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "资产文件的完整路径（支持 .fbx, .glb, .gltf, .obj）"
                },
                "output_dir": {
                    "type": "string",
                    "description": "渲染图片的输出目录。留空则使用资产同目录下的 .previews/ 子目录"
                },
                "angles": {
                    "type": "array",
                    "items": {"type": "string", "enum": ["front", "side", "top", "three_quarter"]},
                    "description": "要渲染的角度列表，默认渲染正面、侧面、3/4 视角"
                }
            },
            "required": ["file_path"]
        }
    }
}


def _get_blender_path() -> str:
    """获取 Blender 路径"""
    try:
        tools_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(tools_dir)
        if project_root not in sys.path:
            sys.path.insert(0, project_root)
        from config import BLENDER_PATH
        if os.path.exists(BLENDER_PATH):
            return BLENDER_PATH
    except (ImportError, AttributeError):
        pass

    candidates = [
        r"D:\Program Files\Blender Foundation\Blender 4.3\blender.exe",
        r"D:\Program Files\Blender Foundation\Blender 3.3\blender.exe",
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return ""


def render_asset_preview(
    file_path: str,
    output_dir: str = "",
    angles: list[str] = None,
) -> dict:
    """
    渲染资产预览图

    参数:
        file_path: 资产文件路径
        output_dir: 输出目录，留空则用资产同目录下的 .previews/
        angles: 渲染角度，默认 ["front", "side", "three_quarter"]

    返回:
        {"images": [{"angle": "front", "path": "..."}], "success": True/False}
    """
    result = {
        "file_path": file_path,
        "images": [],
        "success": False,
    }

    if not os.path.exists(file_path):
        result["error"] = f"文件不存在: {file_path}"
        return result

    # 默认输出目录
    if not output_dir:
        output_dir = os.path.join(os.path.dirname(file_path), ".previews")

    # 默认角度
    if angles is None:
        angles = ["front", "side", "three_quarter"]

    # 获取 Blender 路径
    blender_path = _get_blender_path()
    if not blender_path:
        result["error"] = "未找到 Blender 安装，请在 config.py 中设置 BLENDER_PATH"
        return result

    # 渲染脚本路径
    script_dir = os.path.dirname(os.path.abspath(__file__))
    renderer_script = os.path.join(script_dir, "blender_asset_renderer.py")

    if not os.path.exists(renderer_script):
        result["error"] = f"找不到渲染脚本: {renderer_script}"
        return result

    # 构建命令
    cmd = [
        blender_path,
        "--background",
        "--python", renderer_script,
        "--", file_path, output_dir,
    ] + angles

    # 调用 Blender
    try:
        timeout = 120  # 渲染比读取慢，给 2 分钟
        try:
            from config import RENDER_TIMEOUT
            timeout = RENDER_TIMEOUT
        except (ImportError, AttributeError):
            pass

        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            encoding="utf-8",
            errors="replace",
        )

        if proc.returncode != 0:
            stderr_tail = proc.stderr[-500:] if proc.stderr else ""
            result["error"] = f"Blender 渲染失败 (code {proc.returncode})"
            result["blender_stderr"] = stderr_tail
            return result

        # 解析 JSON 输出
        output = proc.stdout.strip()
        json_start = output.find("{")
        if json_start == -1:
            result["error"] = "Blender 没有返回有效的 JSON 输出"
            result["raw_output"] = output[-500:]
            return result

        decoder = json.JSONDecoder()
        parsed, _ = decoder.raw_decode(output, json_start)

        result.update(parsed)
        return result

    except subprocess.TimeoutExpired:
        result["error"] = f"Blender 渲染超时（{timeout}秒）"
        return result
    except json.JSONDecodeError as e:
        result["error"] = f"解析 Blender 输出失败: {str(e)}"
        result["raw_output"] = proc.stdout[-500:] if proc else ""
        return result
    except Exception as e:
        result["error"] = f"调用 Blender 失败: {str(e)}"
        return result


def clean_previews(asset_path: str) -> dict:
    """
    清理单个资产的预览图

    参数:
        asset_path: 资产文件路径

    返回:
        {"removed": int, "dirs_removed": bool}
    """
    asset_dir = os.path.dirname(asset_path)
    asset_stem = os.path.splitext(os.path.basename(asset_path))[0]
    preview_dir = os.path.join(asset_dir, ".previews")

    removed = 0
    if os.path.isdir(preview_dir):
        for f in os.listdir(preview_dir):
            if f.startswith(asset_stem) and f.endswith(".png"):
                os.remove(os.path.join(preview_dir, f))
                removed += 1

        # 如果 .previews/ 空了，删掉目录
        if not os.listdir(preview_dir):
            os.rmdir(preview_dir)
            return {"removed": removed, "dirs_removed": True}

    return {"removed": removed, "dirs_removed": False}


def clean_orphan_previews(dir_path: str) -> dict:
    """
    清理目录下所有孤儿预览图（没有对应资产文件的预览图）

    参数:
        dir_path: 资产目录路径

    返回:
        {"removed_files": int, "removed_dirs": int, "details": list}
    """
    preview_dir = os.path.join(dir_path, ".previews")
    if not os.path.isdir(preview_dir):
        return {"removed_files": 0, "removed_dirs": 0, "details": []}

    # 收集目录下所有资产文件名（不含后缀）
    asset_stems = set()
    for f in os.listdir(dir_path):
        full = os.path.join(dir_path, f)
        if os.path.isfile(full):
            stem = os.path.splitext(f)[0]
            asset_stems.add(stem)

    # 扫描预览图，删除无对应资产的
    removed_files = []
    for f in os.listdir(preview_dir):
        if not f.endswith(".png"):
            continue
        # 预览图命名格式: {asset_stem}_{angle}.png
        # 取第一个 _ 后面的部分去掉，得到 asset_stem
        parts = f.rsplit("_", 1)
        if len(parts) < 2:
            continue
        stem = parts[0]
        if stem not in asset_stems:
            os.remove(os.path.join(preview_dir, f))
            removed_files.append(f)

    # 如果 .previews/ 空了，删掉目录
    dir_removed = False
    if os.path.isdir(preview_dir) and not os.listdir(preview_dir):
        os.rmdir(preview_dir)
        dir_removed = True

    return {
        "removed_files": len(removed_files),
        "removed_dirs": 1 if dir_removed else 0,
        "details": removed_files,
    }
