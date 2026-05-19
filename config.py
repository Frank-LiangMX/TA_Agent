"""
TA Agent 配置文件
切换 LLM 只需要修改这里的配置
"""

# ========== LLM 配置 ==========

# 所有可用的 LLM 配置（云端 + 自建）
LLM_CONFIGS = {
    # 云端 API
    "deepseek": {
        "name": "DeepSeek-V4-pro",
        "type": "cloud",
        "base_url": "https://api.deepseek.com/v1",
        "api_key": "sk-fa07dc15b2464cf6bfb4a6d752c865bb",
        "model": "deepseek-v4-pro",
    },
    "glm": {
        "name": "GLM-5",
        "type": "cloud",
        "base_url": "https://api.sfkey.cn/v1",
        "api_key": "sk-6tO7dFcZFeuyIxYx7GRxjo7W4r7EHvhXt59YeAqpBJkLwbNn",
        "model": "glm-5",
    },
    # 自建模型（按需启用）
    # "qwen-14b": {
    #     "name": "Qwen-14B (本地)",
    #     "type": "local",
    #     "base_url": "http://192.168.1.100:8000/v1",
    #     "api_key": "none",
    #     "model": "qwen-14b",
    # },
}

# 当前使用的 LLM
ACTIVE_LLM = "glm"  # 可选: LLM_CONFIGS 中的任意 key

def get_llm_config():
    """获取当前活跃的 LLM 配置"""
    if ACTIVE_LLM not in LLM_CONFIGS:
        raise ValueError(f"未知的 LLM: {ACTIVE_LLM}，可用: {list(LLM_CONFIGS.keys())}")
    return LLM_CONFIGS[ACTIVE_LLM]

def list_llm_configs():
    """列出所有可用的 LLM 配置（不暴露 api_key）"""
    result = []
    for key, cfg in LLM_CONFIGS.items():
        result.append({
            "key": key,
            "name": cfg.get("name", key),
            "type": cfg.get("type", "cloud"),
            "base_url": cfg["base_url"],
            "model": cfg["model"],
            "active": key == ACTIVE_LLM,
        })
    return result

def set_active_llm(name: str) -> dict:
    """切换当前活跃的 LLM"""
    global ACTIVE_LLM
    if name not in LLM_CONFIGS:
        return {"error": f"未知的 LLM: {name}，可用: {list(LLM_CONFIGS.keys())}"}
    ACTIVE_LLM = name
    cfg = LLM_CONFIGS[name]
    return {"success": True, "active": name, "name": cfg.get("name", name)}

def add_llm_config(key: str, name: str, base_url: str, model: str, api_key: str = "none", llm_type: str = "local") -> dict:
    """添加自定义 LLM 配置"""
    LLM_CONFIGS[key] = {
        "name": name,
        "type": llm_type,
        "base_url": base_url,
        "api_key": api_key,
        "model": model,
    }
    return {"success": True, "key": key, "message": f"已添加 {name}，使用 /llm switch {key} 切换"}

# ========== Blender 配置 ==========

BLENDER_PATH = r"D:\Program Files\Blender Foundation\Blender 4.3\blender.exe"

# ========== UE5 配置 ==========

# UE5 项目根目录（包含 .uproject 文件的目录）
UE5_PROJECT_PATH = r"E:\Unreal_TechDemo_5.7"

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

# ========== 用户配置 ==========

# 当前用户（本地模式只需要 name，中心模式需要 token）
USER_CONFIG = {
    "name": "",           # 用户名（首次运行自动提示设置）
    "token": "",          # 认证 token（中心模式使用，本地模式留空）
    "group": "",          # 分组（可选：角色组、场景组等）
}

def get_user_config():
    """获取当前用户配置"""
    return USER_CONFIG

def set_user_config(name: str = None, token: str = None, group: str = None) -> dict:
    """更新用户配置"""
    if name is not None:
        USER_CONFIG["name"] = name
    if token is not None:
        USER_CONFIG["token"] = token
    if group is not None:
        USER_CONFIG["group"] = group
    return {"success": True, "user": USER_CONFIG.copy()}

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

# MCP 服务器配置已迁移到项目根目录 mcp.json
# 格式参照 Proma Agent mcp.json，通过 tools/mcp_bridge.py 读取
