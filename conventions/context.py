"""
conventions/context.py - 规范文档上下文状态

独立模块，存放已加载的规范文档内容。
agent.py 和 tools 都可以从这里读取，避免循环导入。
"""
_loaded_conventions: str = ""


def get_conventions_context() -> str:
    """获取已加载的规范文档上下文"""
    return _loaded_conventions


def set_conventions_context(context: str):
    """设置规范文档上下文"""
    global _loaded_conventions
    _loaded_conventions = context
