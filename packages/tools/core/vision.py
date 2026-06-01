"""
多模态视觉分析工具
将资产预览图编码为 base64，构建多模态 LLM 请求
"""
import base64
import os
from typing import Optional


def encode_image_to_base64(image_path: str) -> Optional[str]:
    """
    将图片文件编码为 base64 字符串

    参数:
        image_path: 图片文件路径

    返回:
        base64 编码字符串，失败返回 None
    """
    if not os.path.exists(image_path):
        return None

    try:
        with open(image_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")
    except Exception:
        return None


def build_image_content(image_paths: list[str]) -> list[dict]:
    """
    将多张图片路径转换为 OpenAI vision API 格式的 content 列表

    参数:
        image_paths: 图片文件路径列表

    返回:
        [{"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}]
    """
    content = []
    for path in image_paths:
        b64 = encode_image_to_base64(path)
        if b64:
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{b64}",
                },
            })
    return content


def build_vision_prompt(
    text_prompt: str,
    image_paths: list[str],
) -> list[dict]:
    """
    构建包含文本和图片的多模态消息内容

    参数:
        text_prompt: 文本提示
        image_paths: 图片路径列表

    返回:
        OpenAI vision API 格式的 content 列表
    """
    content = []

    # 先加图片
    content.extend(build_image_content(image_paths))

    # 再加文本
    content.append({
        "type": "text",
        "text": text_prompt,
    })

    return content


def get_available_preview_images(preview_paths: list[str], max_count: int = 3) -> list[str]:
    """
    从预览图路径列表中筛选出实际存在的文件

    参数:
        preview_paths: 预览图路径列表
        max_count: 最多返回几张

    返回:
        实际存在的图片路径列表
    """
    available = []
    for path in preview_paths:
        if len(available) >= max_count:
            break
        if path and os.path.exists(path):
            available.append(path)
    return available
