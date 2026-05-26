"""
TA Agent 配置文件
"""

import json
import os
from pathlib import Path

# ========== LLM 配置 ==========

# 所有可用的 LLM 配置（云端 + 自建）
LLM_CONFIGS = {
    # 云端 API
    "deepseek": {
        "name": "DeepSeek-V4-pro",
        "type": "cloud",
        "base_url": "https://api.deepseek.com/v1",
        "api_key": "",
        "model": "deepseek-v4-pro",
    },
    "glm": {
        "name": "GLM-5",
        "type": "cloud",
        "base_url": "https://api.sfkey.cn/v1",
        "api_key": "",
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

def _get_runtime_app_config() -> dict:
    """读取运行目录里的前端/桌面配置。"""
    config_dir = CONFIGS_DIR
    if not config_dir:
        return {}
    config_path = os.path.join(config_dir, "app-config.json")
    if not os.path.exists(config_path):
        return {}
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}

def _get_runtime_llm_config() -> dict | None:
    app_config = _get_runtime_app_config()
    if app_config.get("mode", "local") != "local":
        return None

    # 优先使用用户自定义模型列表中的激活模型
    active_model = get_active_model()
    if active_model:
        # 模型必须有自己的 API Key，不 fallback 到旧配置
        api_key = active_model.get("api_key") or ""
        base_url = active_model.get("base_url") or ""
        model = active_model.get("model") or ""
        extra_headers = active_model.get("extra_headers") or {}

        if not base_url or not model:
            return None

        return {
            "name": active_model.get("name", "Custom"),
            "type": "custom",
            "base_url": base_url,
            "api_key": api_key,
            "model": model,
            "protocol": active_model.get("protocol", "openai"),
            "extra_headers": extra_headers,
        }

    # 兼容旧配置：从 local 配置读取（仅在没有自定义模型时）
    local = app_config.get("local") or {}
    api_key = local.get("llm_api_key") or ""
    llm_base_url = local.get("llm_base_url") or ""
    model = local.get("llm_model") or ""

    if not llm_base_url or not model:
        return None

    extra_headers = local.get("llm_extra_headers") or {}

    return {
        "name": local.get("llm_name") or "Custom",
        "type": "custom",
        "base_url": llm_base_url,
        "api_key": api_key,
        "model": model,
        "extra_headers": extra_headers,
    }

def get_llm_config():
    """获取当前活跃的 LLM 配置"""
    runtime_config = _get_runtime_llm_config()
    if runtime_config:
        if not runtime_config.get("api_key"):
            raise ValueError("LLM API Key 未配置，请先在启动向导或设置页配置本地模式。")
        return runtime_config
    if ACTIVE_LLM not in LLM_CONFIGS:
        raise ValueError(f"未知的 LLM: {ACTIVE_LLM}，可用: {list(LLM_CONFIGS.keys())}")
    config = LLM_CONFIGS[ACTIVE_LLM]
    if not config.get("api_key"):
        raise ValueError("LLM API Key 未配置，请先在启动向导或设置页配置本地模式。")
    return config

def list_llm_configs():
    """列出所有可用的 LLM 配置（不暴露 api_key）"""
    result = []

    # 添加用户已保存的自定义配置（来自 app-config.json）
    app_config = _get_runtime_app_config()
    local = app_config.get("local", {})
    if local.get("llm_base_url") and local.get("llm_model"):
        result.append({
            "key": "user_custom",
            "name": local.get("llm_name") or "自定义配置",
            "type": local.get("llm_type", "custom"),
            "base_url": local.get("llm_base_url"),
            "model": local.get("llm_model"),
            "active": True,  # 用户自定义配置始终是当前使用的
        })

    # 添加预设（仅供选择，不暴露 api_key）
    for key, cfg in LLM_CONFIGS.items():
        result.append({
            "key": key,
            "name": cfg.get("name", key),
            "type": cfg.get("type", "cloud"),
            "base_url": cfg["base_url"],
            "model": cfg["model"],
            "active": not local.get("llm_base_url") and key == ACTIVE_LLM,
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

# ========== 用户自定义模型管理（存储在 app-config.json）==========

def _get_models() -> list:
    """获取用户自定义模型列表"""
    app_config = _get_runtime_app_config()
    return app_config.get("models", [])

def _save_models(models: list) -> None:
    """保存用户自定义模型列表"""
    app_config = _get_runtime_app_config()
    app_config["models"] = models
    # 保存到文件
    config_dir = CONFIGS_DIR
    if not config_dir:
        return
    os.makedirs(config_dir, exist_ok=True)
    config_path = os.path.join(config_dir, "app-config.json")
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(app_config, f, ensure_ascii=False, indent=2)

def list_models() -> list:
    """列出所有用户自定义模型（不暴露 api_key）"""
    models = _get_models()
    result = []
    for m in models:
        item = {k: v for k, v in m.items() if k != "api_key"}
        item["has_api_key"] = bool(m.get("api_key"))
        result.append(item)
    return result

def get_model(model_id: str) -> dict | None:
    """获取指定模型"""
    models = _get_models()
    for m in models:
        if m.get("id") == model_id:
            return m
    return None

def add_model(name: str, base_url: str, model: str, api_key: str, extra_headers: dict = None, protocol: str = "openai") -> dict:
    """添加新模型"""
    import uuid
    models = _get_models()
    new_model = {
        "id": str(uuid.uuid4())[:8],
        "name": name,
        "base_url": base_url,
        "model": model,
        "api_key": api_key,
        "protocol": protocol,
        "extra_headers": extra_headers or {},
    }
    models.append(new_model)
    _save_models(models)
    return {"success": True, "id": new_model["id"], "model": {k: v for k, v in new_model.items() if k != "api_key"}}

def update_model(model_id: str, updates: dict) -> dict:
    """更新模型"""
    models = _get_models()
    for i, m in enumerate(models):
        if m.get("id") == model_id:
            # 不允许通过 updates 修改 id
            updates.pop("id", None)
            # 如果 api_key 为空，保留原来的
            if not updates.get("api_key"):
                updates.pop("api_key", None)
            models[i].update(updates)
            _save_models(models)
            return {"success": True, "model": {k: v for k, v in models[i].items() if k != "api_key"}}
    return {"success": False, "error": "模型不存在"}

def delete_model(model_id: str) -> dict:
    """删除模型"""
    models = _get_models()
    original_len = len(models)
    models = [m for m in models if m.get("id") != model_id]
    if len(models) == original_len:
        return {"success": False, "error": "模型不存在"}
    _save_models(models)
    return {"success": True}

def get_active_model() -> dict | None:
    """获取当前启用的模型"""
    models = _get_models()
    for m in models:
        if m.get("active"):
            return m
    # 如果没有激活的，返回第一个
    if models:
        return models[0]
    return None

def set_active_model(model_id: str) -> dict:
    """激活指定模型"""
    models = _get_models()
    found = False
    for m in models:
        m["active"] = (m.get("id") == model_id)
        if m.get("id") == model_id:
            found = True
    if not found:
        return {"success": False, "error": "模型不存在"}
    _save_models(models)
    return {"success": True}

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
    "api_key": "",
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

# ========== 路径常量 ==========
import os
import sys

# 项目根目录（代码所在目录）
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

# 运行时数据根目录
# 开发模式：使用项目内的 .ta_agent 目录
# 打包模式：使用用户目录（%APPDATA%\tagent-desktop\agent-running-data）
def _get_runtime_dir() -> str:
    # 显式覆盖（调试用）
    override = os.environ.get("TAGENT_RUNTIME_DIR")
    if override:
        return override

    # 打包模式：使用用户目录，确保用户数据在更新后保留
    if getattr(sys, 'frozen', False):
        appdata = os.environ.get(
            "APPDATA",
            os.path.join(os.path.expanduser("~"), "AppData", "Roaming"),
        )
        return os.path.join(appdata, "tagent-desktop", "agent-running-data")

    # 开发模式：使用项目内的 .ta_agent 目录
    return os.path.join(PROJECT_ROOT, '.ta_agent')

RUNTIME_DIR = _get_runtime_dir()

# ========== 数据库路径 ==========
# 资产标签数据库
TAG_STORE_DIR = os.path.join(RUNTIME_DIR, "tag_store")

# ========== 会话路径 ==========
# 会话数据目录
SESSIONS_DIR = os.path.join(RUNTIME_DIR, "sessions")

# ========== 记忆系统路径 ==========
# 记忆数据目录
MEMORY_DIR = os.path.join(RUNTIME_DIR, "memory")

# ========== 配置路径 ==========
# 运行时配置目录（项目配置、用户配置等）
CONFIGS_DIR = os.path.join(RUNTIME_DIR, "configs")

# ========== 流水线路径 ==========
# 流水线检查点目录
CHECKPOINTS_DIR = os.path.join(RUNTIME_DIR, "checkpoints")

# 流水线运行记录
PIPELINE_RUNS_FILE = os.path.join(RUNTIME_DIR, "pipeline_runs.jsonl")

# ========== UE5 桥接路径 ==========
# UE5 通信目录（命令/结果文件）
UE5_BRIDGE_DIR = os.path.join(RUNTIME_DIR, "ue5_bridge")

# ========== 预览图路径 ==========
# 资产预览图目录
PREVIEWS_DIR = os.path.join(RUNTIME_DIR, "previews")

# ========== 日志路径 ==========
# 日志目录
LOGS_DIR = os.path.join(RUNTIME_DIR, "logs")

# ========== 初始化函数 ==========
def ensure_directories():
    """确保所有必要的目录存在"""
    dirs = [
        TAG_STORE_DIR,
        SESSIONS_DIR,
        MEMORY_DIR,
        CONFIGS_DIR,
        CHECKPOINTS_DIR,
        UE5_BRIDGE_DIR,
        PREVIEWS_DIR,
        LOGS_DIR,
    ]
    for d in dirs:
        os.makedirs(d, exist_ok=True)

# 模块加载时自动初始化
ensure_directories()
