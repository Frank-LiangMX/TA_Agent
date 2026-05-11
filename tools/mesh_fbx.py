"""
FBX / 3D 模型深度解析工具
通过 Blender headless 模式读取真实的几何数据
"""
import os
import json
import subprocess
import sys


SCHEMA = {
    "type": "function",
    "function": {
        "name": "check_fbx_info",
        "description": "深度解析 FBX 3D 模型文件，通过 Blender 读取真实的顶点数、三角面数、骨骼信息、UV 通道数、包围盒尺寸等。比 check_file_info 更精确。",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "FBX 文件的完整路径"
                }
            },
            "required": ["file_path"]
        }
    }
}


def _get_blender_path() -> str:
    """获取 Blender 路径"""
    # 尝试从 config 导入（需要把项目根目录加入 path）
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

    # 常见安装路径
    candidates = [
        r"D:\Program Files\Blender Foundation\Blender 4.3\blender.exe",
        r"D:\Program Files\Blender Foundation\Blender 3.3\blender.exe",
        r"E:\Program Files\Blender Foundation\Blender 4.5\blender.exe",
        r"C:\Program Files\Blender Foundation\Blender 2.93\blender.exe",
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return ""


def check_fbx_info(file_path: str) -> dict:
    """
    通过 Blender headless 解析 FBX 文件
    返回：顶点数、三角面数、骨骼、UV 通道、包围盒等
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
    result["size_mb"] = round(os.path.getsize(file_path) / (1024 * 1024), 2)

    ext = os.path.splitext(file_path)[1].lower()
    if ext != ".fbx":
        result["warning"] = f"文件扩展名是 {ext}，工具针对 FBX 优化，其他格式可能不准确"

    # 获取 Blender 路径
    blender_path = _get_blender_path()
    if not blender_path:
        result["error"] = "未找到 Blender 安装，请在 config.py 中设置 BLENDER_PATH"
        return result

    # Blender reader 脚本路径
    script_dir = os.path.dirname(os.path.abspath(__file__))
    reader_script = os.path.join(script_dir, "blender_fbx_reader.py")

    if not os.path.exists(reader_script):
        result["error"] = f"找不到 Blender 读取脚本: {reader_script}"
        return result

    # 调用 Blender headless
    try:
        # 获取超时配置
        timeout = 30
        try:
            from config import FBX_PARSE_TIMEOUT
            timeout = FBX_PARSE_TIMEOUT
        except ImportError:
            pass

        cmd = [
            blender_path,
            "--background",
            "--python", reader_script,
            "--", file_path
        ]

        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            encoding="utf-8",
            errors="replace",
        )

        if proc.returncode != 0:
            # Blender 可能输出大量日志，只取最后部分
            stderr_tail = proc.stderr[-500:] if proc.stderr else ""
            result["error"] = f"Blender 执行失败 (code {proc.returncode})"
            result["blender_stderr"] = stderr_tail
            return result

        # 解析 JSON 输出（Blender 输出中可能混有日志，找到 JSON 部分）
        output = proc.stdout.strip()
        # 找第一个 { 开始的 JSON
        json_start = output.find("{")
        if json_start == -1:
            result["error"] = "Blender 没有返回有效的 JSON 输出"
            result["raw_output"] = output[-500:]
            return result

        # 用 JSONDecoder 找到 JSON 对象的结束位置（忽略后面的 Blender 日志）
        decoder = json.JSONDecoder()
        parsed, _ = decoder.raw_decode(output, json_start)

        # 合并结果
        result.update(parsed)
        return result

    except subprocess.TimeoutExpired:
        result["error"] = f"Blender 解析超时（{timeout}秒），文件可能过大"
        return result
    except json.JSONDecodeError as e:
        result["error"] = f"解析 Blender 输出失败: {str(e)}"
        result["raw_output"] = proc.stdout[-500:] if proc else ""
        return result
    except Exception as e:
        result["error"] = f"调用 Blender 失败: {str(e)}"
        return result
