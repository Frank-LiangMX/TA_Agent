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

def _migrate_legacy_mode(app_config: dict) -> dict:
    """将旧 mode: local|online 迁移为 runtime + cloud 结构。"""
    if "mode" not in app_config:
        return app_config

    old_mode = app_config.pop("mode")

    # 迁移 local → runtime
    if "runtime" not in app_config:
        local = app_config.pop("local", {})
        app_config["runtime"] = {
            "llm_provider": local.get("llm_provider", ""),
            "llm_api_key": local.get("llm_api_key", ""),
            "llm_base_url": local.get("llm_base_url", ""),
            "llm_model": local.get("llm_model", ""),
            "blender_path": local.get("blender_path", ""),
        }
    else:
        app_config.pop("local", None)

    # 迁移 online → cloud
    if "cloud" not in app_config:
        online = app_config.pop("online", {})
        app_config["cloud"] = {
            "enabled": old_mode == "online",
            "server_url": f"{online.get('server_host', '')}:{online.get('server_port', 8081)}" if old_mode == "online" else "",
            "user_id": online.get("user_id", ""),
            "user_name": online.get("user_name", ""),
        }
    else:
        app_config.pop("online", None)

    # 写回文件
    try:
        config_path = os.path.join(CONFIGS_DIR, "app-config.json")
        if config_path:
            with open(config_path, "w", encoding="utf-8") as f:
                json.dump(app_config, f, ensure_ascii=False, indent=2)
    except OSError:
        pass

    return app_config


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
        if not isinstance(data, dict):
            return {}
        return _migrate_legacy_mode(data)
    except (OSError, json.JSONDecodeError):
        return {}


def get_agent_runtime_mode() -> str:
    """获取当前 Agent 运行模式（ta/general）。

    优先级：
    1. 环境变量 TAGENT_AGENT_MODE
    2. app-config.json 的 agent_mode 字段
    3. 默认 ta
    """
    env_mode = (os.environ.get("TAGENT_AGENT_MODE") or "").strip().lower()
    if env_mode in {"ta", "general"}:
        return env_mode

    app_config = _get_runtime_app_config()
    cfg_mode = str(app_config.get("agent_mode", "")).strip().lower()
    if cfg_mode in {"ta", "general"}:
        return cfg_mode

    return "ta"


def get_memory_namespace() -> str:
    """记忆命名空间，当前与运行模式同名。"""
    return get_agent_runtime_mode()

def _get_runtime_llm_config() -> dict | None:
    app_config = _get_runtime_app_config()
    cloud = app_config.get("cloud") or {}
    if cloud.get("enabled"):
        return None

    # 优先使用 Provider 模型中的激活模型
    active = get_active_provider_model()
    if active:
        api_key = active.get("api_key") or ""
        base_url = active.get("base_url") or ""
        model = active.get("model") or ""
        if not base_url or not model:
            return None
        return {
            "name": active.get("model_name", active.get("provider_name", "Custom")),
            "type": "custom",
            "base_url": base_url,
            "api_key": api_key,
            "model": model,
            "protocol": active.get("protocol", "openai"),
            "extra_headers": active.get("extra_headers", {}),
        }

    # 兼容旧配置
    runtime = app_config.get("runtime") or app_config.get("local") or {}
    api_key = runtime.get("llm_api_key") or ""
    llm_base_url = runtime.get("llm_base_url") or ""
    model = runtime.get("llm_model") or ""

    if not llm_base_url or not model:
        return None

    extra_headers = runtime.get("llm_extra_headers") or {}

    return {
        "name": runtime.get("llm_name") or "Custom",
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
    runtime = app_config.get("runtime") or app_config.get("local") or {}
    if runtime.get("llm_base_url") and runtime.get("llm_model"):
        result.append({
            "key": "user_custom",
            "name": runtime.get("llm_name") or "自定义配置",
            "type": runtime.get("llm_type", "custom"),
            "base_url": runtime.get("llm_base_url"),
            "model": runtime.get("llm_model"),
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
            "active": not runtime.get("llm_base_url") and key == ACTIVE_LLM,
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

# ========== LLM Provider 管理（存储在 app-config.json）==========
# 两级结构: providers[] → 内嵌 models[]
#
# 数据格式:
# {
#   "providers": [
#     {
#       "id": "uuid",
#       "name": "DeepSeek",
#       "base_url": "https://api.deepseek.com/v1",
#       "api_key": "",
#       "protocol": "openai",
#       "extra_headers": {},
#       "models": [
#         {"id": "deepseek-v4-pro", "name": "DeepSeek V4 Pro", "enabled": True},
#         {"id": "deepseek-v4-flash", "name": "DeepSeek V4 Flash", "enabled": False}
#       ],
#       "enabled": True
#     }
#   ]
# }

def _get_providers() -> list:
    """获取 providers 列表"""
    app_config = _get_runtime_app_config()
    return app_config.get("providers", [])

def _save_providers(providers: list) -> None:
    """保存 providers 列表"""
    app_config = _get_runtime_app_config()
    app_config["providers"] = providers
    config_dir = CONFIGS_DIR
    if not config_dir:
        return
    os.makedirs(config_dir, exist_ok=True)
    config_path = os.path.join(config_dir, "app-config.json")
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(app_config, f, ensure_ascii=False, indent=2)

def list_providers() -> list:
    """列出所有 Provider（不暴露 api_key）"""
    providers = _get_providers()
    result = []
    for p in providers:
        item = {k: v for k, v in p.items() if k != "api_key"}
        item["has_api_key"] = bool(p.get("api_key"))
        # 模型列表不暴露 api_key
        item["models"] = [
            {k: v for k, v in m.items()}
            for m in p.get("models", [])
        ]
        result.append(item)
    return result

def get_provider(provider_id: str) -> dict | None:
    """获取指定 Provider"""
    providers = _get_providers()
    for p in providers:
        if p.get("id") == provider_id:
            return p
    return None

def add_provider(name: str, base_url: str, api_key: str, protocol: str = "openai",
                  extra_headers: dict = None, models: list = None, enabled: bool = True) -> dict:
    """添加新 Provider"""
    import uuid
    providers = _get_providers()
    new_provider = {
        "id": str(uuid.uuid4())[:8],
        "name": name,
        "base_url": base_url,
        "api_key": api_key,
        "protocol": protocol,
        "extra_headers": extra_headers or {},
        "models": models or [],
        "enabled": enabled,
    }
    providers.append(new_provider)
    _save_providers(providers)
    return {
        "success": True,
        "id": new_provider["id"],
        "provider": {k: v for k, v in new_provider.items() if k != "api_key"}
    }

def update_provider(provider_id: str, updates: dict) -> dict:
    """更新 Provider"""
    providers = _get_providers()
    for i, p in enumerate(providers):
        if p.get("id") == provider_id:
            updates.pop("id", None)
            if not updates.get("api_key"):
                updates.pop("api_key", None)
            providers[i].update(updates)
            _save_providers(providers)
            return {"success": True, "provider": {k: v for k, v in providers[i].items() if k != "api_key"}}
    return {"success": False, "error": "Provider 不存在"}

def delete_provider(provider_id: str) -> dict:
    """删除 Provider"""
    providers = _get_providers()
    original_len = len(providers)
    providers = [p for p in providers if p.get("id") != provider_id]
    if len(providers) == original_len:
        return {"success": False, "error": "Provider 不存在"}
    _save_providers(providers)
    return {"success": True}

def add_model_to_provider(provider_id: str, model_id: str, model_name: str = None) -> dict:
    """向 Provider 添加模型"""
    providers = _get_providers()
    for i, p in enumerate(providers):
        if p.get("id") == provider_id:
            models = p.get("models", [])
            if any(m.get("id") == model_id for m in models):
                return {"success": False, "error": "模型已存在"}
            models.append({
                "id": model_id,
                "name": model_name or model_id,
                "enabled": True,
            })
            providers[i]["models"] = models
            _save_providers(providers)
            return {"success": True}
    return {"success": False, "error": "Provider 不存在"}

def remove_model_from_provider(provider_id: str, model_id: str) -> dict:
    """从 Provider 移除模型"""
    providers = _get_providers()
    for i, p in enumerate(providers):
        if p.get("id") == provider_id:
            models = p.get("models", [])
            original_len = len(models)
            models = [m for m in models if m.get("id") != model_id]
            if len(models) == original_len:
                return {"success": False, "error": "模型不存在"}
            providers[i]["models"] = models
            _save_providers(providers)
            return {"success": True}
    return {"success": False, "error": "Provider 不存在"}

def set_provider_enabled(provider_id: str, enabled: bool) -> dict:
    """启用/禁用 Provider"""
    providers = _get_providers()
    for i, p in enumerate(providers):
        if p.get("id") == provider_id:
            providers[i]["enabled"] = enabled
            _save_providers(providers)
            return {"success": True}
    return {"success": False, "error": "Provider 不存在"}

def set_model_enabled(provider_id: str, model_id: str, enabled: bool) -> dict:
    """启用/禁用 Provider 下的模型"""
    providers = _get_providers()
    for i, p in enumerate(providers):
        if p.get("id") == provider_id:
            for j, m in enumerate(p.get("models", [])):
                if m.get("id") == model_id:
                    if enabled:
                        # 启用时：所有 provider 下的所有模型全部禁用，保证只有一个模型活跃
                        for pi, pp in enumerate(providers):
                            for pmi, pm in enumerate(pp.get("models", [])):
                                if pm.get("id") != model_id:
                                    providers[pi]["models"][pmi]["enabled"] = False
                    providers[i]["models"][j]["enabled"] = enabled
                    _save_providers(providers)
                    return {"success": True}
            return {"success": False, "error": "模型不存在"}
    return {"success": False, "error": "Provider 不存在"}

def get_active_provider_model() -> dict | None:
    """获取当前启用的 Provider 和模型"""
    providers = _get_providers()
    for p in providers:
        if not p.get("enabled"):
            continue
        for m in p.get("models", []):
            if m.get("enabled"):
                return {
                    "provider_id": p["id"],
                    "provider_name": p.get("name", ""),
                    "base_url": p.get("base_url", ""),
                    "api_key": p.get("api_key", ""),
                    "protocol": p.get("protocol", "openai"),
                    "extra_headers": p.get("extra_headers", {}),
                    "model": m["id"],
                    "model_name": m.get("name", m["id"]),
                }
    return None

def get_active_model() -> dict | None:
    """获取当前启用的模型（兼容旧接口）"""
    return get_active_provider_model()

def set_active_model(model_id: str) -> dict:
    """兼容旧接口：激活指定模型（通过 model_id 在所有 Provider 中查找）"""
    providers = _get_providers()
    for p in providers:
        for m in p.get("models", []):
            if m.get("id") == model_id:
                # 禁用同 Provider 下其他模型，启用目标模型
                for pm in p.get("models", []):
                    pm["enabled"] = (pm["id"] == model_id)
                _save_providers(providers)
                return {"success": True}
    return {"success": False, "error": "模型不存在"}

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
# 格式参照 MCP 标准 mcp.json，通过 tools/mcp_bridge.py 读取

# ========== 路径常量 ==========
import os
import sys

# 项目根目录（代码所在目录）
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 运行时数据根目录
# 开发模式：使用项目内的 .ta_agent 目录
# 打包模式：使用用户目录（%APPDATA%\tagent-desktop\agent-running-data）
def _get_runtime_dir() -> str:
    # 显式覆盖（调试用）
    override = os.environ.get("TAGENT_RUNTIME_DIR")
    if override:
        return override

    electron_user_data = os.environ.get("ELECTRON_USER_DATA")
    if electron_user_data:
        return electron_user_data

    # 打包模式：与 Electron userData 对齐（package.json name: tagent-desktop）
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

# ========== 工作区路径 ==========
# 通用模式会话工作区目录
WORKSPACES_DIR = os.path.join(RUNTIME_DIR, "workspaces")
DEFAULT_WORKSPACE_NAME = "默认工作区"


def get_default_workspace_path() -> str:
    """通用模式未指定目录时使用的共享默认工作区（与 Proma 类似）。"""
    path = os.path.join(WORKSPACES_DIR, "default")
    os.makedirs(path, exist_ok=True)
    return os.path.abspath(path)

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
        WORKSPACES_DIR,
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
