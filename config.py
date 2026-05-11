"""
TA Agent 配置文件
切换 LLM 只需要修改这里的配置
"""

# ========== LLM 配置 ==========

# DeepSeek 配置
DEEPSEEK_CONFIG = {
    "base_url": "https://api.deepseek.com/v1",
    "api_key": "sk-fa07dc15b2464cf6bfb4a6d752c865bb",  # 替换为你的 key
    "model": "deepseek-v4-pro",           # 模型名称
}

# GLM 配置
GLM_CONFIG = {
    "base_url": "https://api.sfkey.cn/v1",
    "api_key": "sk-6tO7dFcZFeuyIxYx7GRxjo7W4r7EHvhXt59YeAqpBJkLwbNn",       # 替换为你的 key
    "model": "glm-5",                     # 模型名称
}

# 当前使用的 LLM（切换时改这里）
ACTIVE_LLM = "glm"  # 可选: "deepseek" 或 "glm"

def get_llm_config():
    """获取当前活跃的 LLM 配置"""
    configs = {
        "deepseek": DEEPSEEK_CONFIG,
        "glm": GLM_CONFIG,
    }
    return configs[ACTIVE_LLM]

# ========== Blender 配置 ==========

BLENDER_PATH = r"D:\Program Files\Blender Foundation\Blender 4.3\blender.exe"

# FBX 解析超时（秒）
FBX_PARSE_TIMEOUT = 30

# 渲染超时（秒）
RENDER_TIMEOUT = 120

# AI 推断单次请求超时（秒）
INFERENCE_TIMEOUT = 60

# ========== 多模态视觉分析配置 ==========

# 是否启用视觉分析（需要 LLM 支持 vision）
# 注意：文本 LLM（DeepSeek、GLM-5 等）不支持图片输入
# 视觉分析必须使用支持多模态的模型
USE_VISION = True

# 视觉分析专用配置（必须是支持多模态的模型）
# ModelScope 配置（阿里达摩院，国内可用，OpenAI 兼容接口）
VISION_CONFIG = {
    "base_url": "https://api-inference.modelscope.cn/v1",
    "api_key": "ms-23fcf550-22f9-4ce3-9833-e41507664fa6",
    "model": "Qwen/Qwen3-VL-8B-Instruct",   # 视觉模型，可换成其他 VL 模型
}

# ModelScope 可用的视觉模型（部分）：
#   Qwen/Qwen2.5-VL-7B-Instruct    - 通义千问 VL 7B，性价比高
#   Qwen/Qwen2.5-VL-72B-Instruct   - 通义千问 VL 72B，效果更好
#   Qwen/QVQ-72B-Preview            - 通义视觉推理模型
#   deepseek-ai/Janus-Pro-7B        - DeepSeek 视觉模型

def get_vision_config():
    """获取视觉分析的 LLM 配置（独立于文本 LLM）"""
    return VISION_CONFIG

# ========== 项目规范配置 ==========

# 命名规范前缀
NAMING_CONVENTIONS = {
    "SM_": "静态网格体 (Static Mesh)",
    "SK_": "骨骼网格体 (Skeletal Mesh)",
    "M_":  "材质 (Material)",
    "MI_": "材质实例 (Material Instance)",
    "T_":  "贴图 (Texture)",
    "BP_": "蓝图 (Blueprint)",
    "S_":  "音效 (Sound)",
    "FX_": "特效 (Effect)",
    "AN_": "动画 (Animation)",
}

# 面数预算
MESH_BUDGETS = {
    "character": 30000,    # 角色
    "weapon":    10000,    # 武器
    "prop":      5000,     # 道具
    "building":  20000,    # 建筑
    "nature":    8000,     # 自然物体
    "vehicle":   25000,    # 载具
}

# 贴图尺寸规范
TEXTURE_BUDGETS = {
    "character": {"diffuse": 2048, "normal": 2048, "mask": 1024},
    "weapon":    {"diffuse": 1024, "normal": 1024, "mask": 512},
    "prop":      {"diffuse": 1024, "normal": 1024, "mask": 512},
    "building":  {"diffuse": 2048, "normal": 2048, "mask": 1024},
    "nature":    {"diffuse": 1024, "normal": 1024, "mask": 512},
}

# 项目目录结构（用于资产分类推荐）
PROJECT_DIRECTORY_TREE = """
/Game/
├── Characters/          # 角色相关
│   ├── Hero/           # 主角
│   ├── NPC/            # NPC
│   └── Monster/        # 怪物
├── Environment/         # 环境相关
│   ├── Architecture/   # 建筑结构
│   ├── Nature/         # 自然物体（树木、岩石等）
│   ├── Props/          # 道具（家具、工具等）
│   └── Terrain/        # 地形
├── Weapons/             # 武器
├── Vehicles/            # 载具
├── Effects/             # 特效
├── UI/                  # UI
├── Audio/               # 音频
└── Materials/           # 材质库
    ├── Shared/         # 共享材质
    └── Master/         # 主材质
"""
