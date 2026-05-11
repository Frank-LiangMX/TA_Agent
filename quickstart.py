"""
快速开始指南
"""
# ========== 第一步：安装依赖 ==========
#
# pip install openai
#
# ========== 第二步：配置 API Key ==========
#
# 打开 config.py，填入你的 API Key：
#
#   DEEPSEEK_CONFIG = {
#       "base_url": "https://api.deepseek.com/v1",
#       "api_key": "sk-xxxxxxxx",      # ← 替换这里
#       "model": "deepseek-v4-pro",
#   }
#
#   GLM_CONFIG = {
#       "base_url": "https://open.bigmodel.cn/api/paas/v4",
#       "api_key": "xxxxxxxx",          # ← 替换这里
#       "model": "glm-5",
#   }
#
# 然后选择使用哪个模型：
#   ACTIVE_LLM = "deepseek"   # 或 "glm"
#
# ========== 第三步：运行 ==========
#
# cd ta_agent
# python agent.py
#
# ========== 试试这些对话 ==========
#
# 1. 命名检查：
#    你: 帮我检查文件名 SM_WoodenTable_01.fbx 是否规范
#
# 2. 目录扫描：
#    你: 扫描 D:\Project\Assets\Import 目录下的所有资产
#
# 3. 面数检查：
#    你: 一个角色模型有 45000 面，检查是否超标
#
# 4. 命名建议：
#    你: 我有一个石头模型，应该叫什么名字
#
# 5. 综合质检：
#    你: 帮我对 D:\Project\Assets\Import 做一次全面的资产质检
#
