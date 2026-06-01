"""
conventions - 项目规范文档发现与加载模块

提供两个核心能力：
  1. 发现：扫描项目目录，按关键词/文件类型找到疑似规范文档
  2. 加载：读取规范文档内容（本地文件 + 在线URL），注入 Agent 上下文
"""
from conventions.discovery import discover_convention_docs
from conventions.loader import load_convention_doc, load_convention_docs
