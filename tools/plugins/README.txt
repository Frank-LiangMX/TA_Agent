# tools/plugins/ - 插件目录
#
# 在此目录下放置 .py 文件，Agent 启动时会自动扫描并注册。
#
# ============ 插件格式 ============
#
# 格式 1：单工具
# --------
# 导出 SCHEMA（dict）+ 与 SCHEMA.function.name 同名的函数
#
#   SCHEMA = {"type": "function", "function": {"name": "my_tool", ...}}
#   def my_tool(param1: str) -> dict:
#       return {"result": "ok"}
#
# 格式 2：多工具（一个文件注册多个工具）
# --------
# 导出 SCHEMAS（list[dict]）+ TOOL_FUNCTIONS（dict[str, callable]）
#
#   SCHEMAS = [
#       {"type": "function", "function": {"name": "tool_a", ...}},
#       {"type": "function", "function": {"name": "tool_b", ...}},
#   ]
#   TOOL_FUNCTIONS = {
#       "tool_a": tool_a_func,
#       "tool_b": tool_b_func,
#   }
#
# ============ 注意事项 ============
#
# - 函数参数必须是 JSON 可序列化类型（str/int/float/bool/list/dict）
# - 返回值必须是 dict（会被序列化为 JSON）
# - 工具名不能与已有工具重名
# - description 写清楚，LLM 靠它判断什么时候调用
#
# ============ 插件管理命令 ============
#
# /plugins          查看已启用和可安装的插件
# /install <name>   安装插件（从 plugins_available 复制到 plugins）
# /uninstall <name> 卸载插件
