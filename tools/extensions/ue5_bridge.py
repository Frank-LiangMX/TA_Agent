"""
tools/ue5_bridge.py - UE5 资产导入桥接

通过文件 IPC 与 UE5 插件（TAAssetBridge）通信。
Agent 写命令到 commands.jsonl → UE5 插件轮询执行 → 结果写入 results.jsonl
"""

import json
import os
import time
from pathlib import Path

# ========== 工具 Schema ==========

UE5_IMPORT_DEF = {
    "type": "function",
    "function": {
        "name": "ue5_import_asset",
        "description": "导入资产到 UE5 引擎。通过文件 IPC 与 UE5 编辑器中的 TAAssetBridge 插件通信，自动完成资产导入。需要 UE5 编辑器已启动并加载了 TAAssetBridge 插件。",
        "parameters": {
            "type": "object",
            "properties": {
                "source_path": {
                    "type": "string",
                    "description": "源文件绝对路径（如 D:/Assets/hero.fbx）",
                },
                "dest_path": {
                    "type": "string",
                    "description": "UE5 目标文件夹路径（如 /Game/Characters/M1C），资产会放在这个文件夹下，不要包含资产名",
                },
                "asset_type": {
                    "type": "string",
                    "description": "资产类型（static_mesh, skeletal_mesh, texture 等）",
                    "default": "static_mesh",
                },
            },
            "required": ["source_path", "dest_path"],
        },
    },
}

UE5_PING_DEF = {
    "type": "function",
    "function": {
        "name": "ue5_ping",
        "description": "测试与 UE5 编辑器的连接。检查 TAAssetBridge 插件是否在运行。",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
}

UE5_CHECK_PLUGIN_DEF = {
    "type": "function",
    "function": {
        "name": "ue5_check_plugin",
        "description": "检查 UE5 项目是否安装了 TAAssetBridge 插件。如果未安装，返回安装指引。",
        "parameters": {
            "type": "object",
            "properties": {
                "project_path": {
                    "type": "string",
                    "description": "UE5 项目根目录（包含 .uproject 文件的目录）",
                },
            },
            "required": ["project_path"],
        },
    },
}

UE5_SET_MATERIAL_DEF = {
    "type": "function",
    "function": {
        "name": "ue5_set_material",
        "description": "给 UE5 中的模型分配材质。需要资产已在 UE5 中导入。",
        "parameters": {
            "type": "object",
            "properties": {
                "asset_path": {"type": "string", "description": "UE5 资产路径（如 /Game/Characters/Hero/SK_Hero）"},
                "slot_index": {"type": "integer", "description": "材质槽索引（从 0 开始）"},
                "material_path": {"type": "string", "description": "材质路径（如 /Game/Materials/M_Hero）"},
            },
            "required": ["asset_path", "slot_index", "material_path"],
        },
    },
}

UE5_SET_NANITE_DEF = {
    "type": "function",
    "function": {
        "name": "ue5_set_nanite",
        "description": "设置 UE5 资产的 Nanite 配置。Nanite 是 UE5 的虚拟化几何体系统，适合高面数模型。",
        "parameters": {
            "type": "object",
            "properties": {
                "asset_path": {"type": "string", "description": "UE5 资产路径"},
                "enabled": {"type": "boolean", "description": "是否启用 Nanite"},
                "fallback_percent": {"type": "number", "description": "回退百分比（0-1，默认 1.0）", "default": 1.0},
                "position_precision": {"type": "integer", "description": "位置精度（默认 2）", "default": 2},
            },
            "required": ["asset_path", "enabled"],
        },
    },
}

UE5_SET_LOD_GROUP_DEF = {
    "type": "function",
    "function": {
        "name": "ue5_set_lod_group",
        "description": "设置 UE5 资产的 LOD 组。影响自动 LOD 生成策略。",
        "parameters": {
            "type": "object",
            "properties": {
                "asset_path": {"type": "string", "description": "UE5 资产路径"},
                "lod_group": {"type": "string", "description": "LOD 组名（如 SmallProp, LargeProp, Character）"},
            },
            "required": ["asset_path", "lod_group"],
        },
    },
}

UE5_SET_METADATA_DEF = {
    "type": "function",
    "function": {
        "name": "ue5_set_metadata",
        "description": "给 UE5 资产写入元数据标签（分类、风格、状态等）。",
        "parameters": {
            "type": "object",
            "properties": {
                "asset_path": {"type": "string", "description": "UE5 资产路径"},
                "tags": {"type": "object", "description": "标签键值对（如 {\"category\": \"weapon\", \"style\": \"realistic\"}）"},
            },
            "required": ["asset_path", "tags"],
        },
    },
}

UE5_CREATE_COLLISION_DEF = {
    "type": "function",
    "function": {
        "name": "ue5_create_collision",
        "description": "为 UE5 静态网格生成碰撞体。",
        "parameters": {
            "type": "object",
            "properties": {
                "asset_path": {"type": "string", "description": "UE5 资产路径"},
                "collision_type": {"type": "string", "description": "碰撞体类型（box, sphere, convex, simplified）", "default": "box"},
            },
            "required": ["asset_path"],
        },
    },
}

UE5_GET_ASSET_INFO_DEF = {
    "type": "function",
    "function": {
        "name": "ue5_get_asset_info",
        "description": "获取 UE5 中资产的详细信息（面数、材质、LOD、Nanite 状态等）。",
        "parameters": {
            "type": "object",
            "properties": {
                "asset_path": {"type": "string", "description": "UE5 资产路径"},
            },
            "required": ["asset_path"],
        },
    },
}


# ========== UE5Bridge 核心类 ==========

class UE5Bridge:
    """UE5 资产导入桥接器"""

    def __init__(self, project_path: str):
        self.project_path = Path(project_path)
        self.ipc_dir = self.project_path / "Saved" / "TAAssetBridge"
        self.ipc_dir.mkdir(parents=True, exist_ok=True)
        self.commands_file = self.ipc_dir / "commands.jsonl"
        self.results_file = self.ipc_dir / "results.jsonl"
        self.default_timeout = 30

    def send_command(self, cmd_dict: dict, timeout: float = None) -> dict:
        """发送命令到 UE5 并等待结果"""
        request_id = cmd_dict.get("request_id", f"req_{int(time.time() * 1000)}")
        cmd_dict["request_id"] = request_id
        timeout = timeout or self.default_timeout

        # 记录当前 results 文件大小（跳过旧内容）
        results_offset = 0
        if self.results_file.exists():
            try:
                results_offset = self.results_file.stat().st_size
            except OSError:
                pass

        # 写入命令
        with open(self.commands_file, "w", encoding="utf-8") as f:
            f.write(json.dumps(cmd_dict, ensure_ascii=False) + "\n")

        # 等待结果
        start = time.time()
        while time.time() - start < timeout:
            if self.results_file.exists():
                try:
                    file_size = self.results_file.stat().st_size
                    if file_size > results_offset:
                        with open(self.results_file, "r", encoding="utf-8") as f:
                            f.seek(results_offset)
                            content = f.read()
                        # 尝试解析（兼容单行和多行 JSON）
                        result = self._parse_result(content, request_id)
                        if result:
                            return result
                except Exception:
                    pass
            time.sleep(0.1)

        return {"status": "timeout", "request_id": request_id, "message": f"超时（{timeout}秒）"}

    def _parse_result(self, content: str, request_id: str) -> dict:
        """解析 results 文件内容，兼容单行和多行 JSON"""
        content = content.strip()
        if not content:
            return None

        # 策略1：尝试逐行解析（单行 JSON）
        for line in content.split("\n"):
            line = line.strip()
            if line.startswith("{"):
                try:
                    result = json.loads(line)
                    if result.get("request_id") == request_id:
                        return result
                except json.JSONDecodeError:
                    pass

        # 策略2：尝试从末尾反向解析多行 JSON
        # 找到最后一个完整的 JSON 对象
        brace_count = 0
        json_start = -1
        for i in range(len(content) - 1, -1, -1):
            if content[i] == '}':
                if brace_count == 0:
                    json_end = i + 1
                brace_count += 1
            elif content[i] == '{':
                brace_count -= 1
                if brace_count == 0:
                    json_start = i
                    break

        if json_start >= 0:
            try:
                result = json.loads(content[json_start:json_end])
                if result.get("request_id") == request_id:
                    return result
            except (json.JSONDecodeError, UnboundLocalError):
                pass

        return None

    def ping(self) -> dict:
        """测试连接"""
        return self.send_command({"cmd": "ping", "request_id": "ping_test"}, timeout=5)

    def import_asset(self, source_path: str, dest_path: str, asset_type: str = "static_mesh") -> dict:
        """导入资产"""
        source_path = source_path.replace("\\", "/")
        return self.send_command({
            "cmd": "import_asset",
            "request_id": f"import_{int(time.time() * 1000)}",
            "asset_type": asset_type,
            "source_path": source_path,
            "dest_path": dest_path,
        }, timeout=60)

    def set_material(self, asset_path: str, slot_index: int, material_path: str) -> dict:
        """给模型分配材质"""
        return self.send_command({
            "cmd": "set_material",
            "request_id": f"mat_{int(time.time() * 1000)}",
            "asset_path": asset_path,
            "slot_index": slot_index,
            "material_path": material_path,
        })

    def set_nanite(self, asset_path: str, enabled: bool, fallback_percent: float = 1.0, position_precision: int = 2) -> dict:
        """设置 Nanite"""
        return self.send_command({
            "cmd": "set_nanite",
            "request_id": f"nanite_{int(time.time() * 1000)}",
            "asset_path": asset_path,
            "enabled": enabled,
            "fallback_percent": fallback_percent,
            "position_precision": position_precision,
        })

    def set_lod_group(self, asset_path: str, lod_group: str) -> dict:
        """设置 LOD 组"""
        return self.send_command({
            "cmd": "set_lod_group",
            "request_id": f"lod_{int(time.time() * 1000)}",
            "asset_path": asset_path,
            "lod_group": lod_group,
        })

    def set_metadata(self, asset_path: str, tags: dict) -> dict:
        """写入元数据标签"""
        return self.send_command({
            "cmd": "set_metadata",
            "request_id": f"meta_{int(time.time() * 1000)}",
            "asset_path": asset_path,
            "tags": tags,
        })

    def create_collision(self, asset_path: str, collision_type: str = "box") -> dict:
        """生成碰撞体"""
        return self.send_command({
            "cmd": "create_collision",
            "request_id": f"col_{int(time.time() * 1000)}",
            "asset_path": asset_path,
            "collision_type": collision_type,
        })

    def get_asset_info(self, asset_path: str) -> dict:
        """获取 UE5 内资产信息"""
        return self.send_command({
            "cmd": "get_asset_info",
            "request_id": f"info_{int(time.time() * 1000)}",
            "asset_path": asset_path,
        })

    def is_connected(self) -> bool:
        """检查连接"""
        result = self.ping()
        return result.get("status") == "pong"


# ========== 插件检测 ==========

PLUGIN_DIR_NAME = "TAAssetBridge"
PLUGIN_FILES = [
    "TAAssetBridge.uplugin",
    "Source/TAAssetBridge/TAAssetBridge.cpp",
    "Source/TAAssetBridge/TAAssetBridge.h",
    "Source/TAAssetBridge/TAAssetBridge.Build.cs",
]

# Agent 自带的插件源目录
_AGENT_PLUGIN_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "Plugins", PLUGIN_DIR_NAME)


def check_plugin_installed(project_path: str) -> dict:
    """检查 UE5 项目是否安装了 TAAssetBridge 插件"""
    project_path = Path(project_path)

    # 查找 .uproject 文件
    uproject_files = list(project_path.glob("*.uproject"))
    if not uproject_files:
        return {"installed": False, "error": f"未找到 .uproject 文件: {project_path}"}

    # 检查插件目录
    plugin_dir = project_path / "Plugins" / PLUGIN_DIR_NAME
    if not plugin_dir.exists():
        return {
            "installed": False,
            "project": uproject_files[0].name,
            "plugin_dir": str(plugin_dir),
            "source_available": os.path.isdir(_AGENT_PLUGIN_DIR),
            "message": f"未安装 {PLUGIN_DIR_NAME} 插件",
        }

    # 检查关键文件
    missing = []
    for f in PLUGIN_FILES:
        if not (plugin_dir / f).exists():
            missing.append(f)

    if missing:
        return {
            "installed": False,
            "project": uproject_files[0].name,
            "plugin_dir": str(plugin_dir),
            "missing_files": missing,
            "message": f"插件目录存在但缺少文件: {', '.join(missing)}",
        }

    return {
        "installed": True,
        "project": uproject_files[0].name,
        "plugin_dir": str(plugin_dir),
        "message": f"{PLUGIN_DIR_NAME} 插件已安装",
    }


def install_plugin(project_path: str) -> dict:
    """将 TAAssetBridge 插件复制到 UE5 项目"""
    import shutil

    project_path = Path(project_path)
    plugin_dir = project_path / "Plugins" / PLUGIN_DIR_NAME

    if not os.path.isdir(_AGENT_PLUGIN_DIR):
        return {"success": False, "error": f"Agent 插件源不存在: {_AGENT_PLUGIN_DIR}"}

    try:
        if plugin_dir.exists():
            shutil.rmtree(plugin_dir)
        shutil.copytree(_AGENT_PLUGIN_DIR, plugin_dir)
        return {
            "success": True,
            "plugin_dir": str(plugin_dir),
            "message": f"已安装 {PLUGIN_DIR_NAME} 到 {plugin_dir}，需要重新编译 UE5 项目",
        }
    except Exception as e:
        return {"success": False, "error": f"安装失败: {e}"}


# ========== 工具执行函数 ==========

# 全局 bridge 实例缓存
_bridge_cache: dict[str, UE5Bridge] = {}


def _get_bridge(project_path: str = None) -> UE5Bridge:
    """获取或创建 bridge 实例"""
    if not project_path:
        # 尝试从 config 获取
        try:
            from config import UE5_PROJECT_PATH
            project_path = UE5_PROJECT_PATH
        except (ImportError, AttributeError):
            return None

    if project_path not in _bridge_cache:
        _bridge_cache[project_path] = UE5Bridge(project_path)
    return _bridge_cache[project_path]


def ue5_import_asset(source_path: str, dest_path: str, asset_type: str = "static_mesh", asset_id: str = None) -> dict:
    """导入资产到 UE5"""
    bridge = _get_bridge()
    if not bridge:
        return {"error": "未配置 UE5 项目路径，请在 config.py 中设置 UE5_PROJECT_PATH"}

    result = bridge.import_asset(source_path, dest_path, asset_type)

    # 导入成功后更新数据库
    if result.get("status") in ("success", "partial") and asset_id:
        try:
            from tags.store import TagStore
            from config import TAG_STORE_DIR
            store = TagStore(TAG_STORE_DIR)
            tags = store.load(asset_id)
            if tags:
                asset_name = os.path.splitext(os.path.basename(source_path))[0]
                tags.meta.engine_path = f"{dest_path}/{asset_name}"
                tags.meta.status = "imported"
                store.save(tags)
                result["engine_path"] = tags.meta.engine_path
                result["db_updated"] = True
        except Exception as e:
            result["db_warning"] = f"数据库更新失败: {e}"

    return result


def ue5_ping() -> dict:
    """测试 UE5 连接"""
    bridge = _get_bridge()
    if not bridge:
        return {"error": "未配置 UE5 项目路径"}
    return bridge.ping()


def ue5_check_plugin(project_path: str) -> dict:
    """检查插件安装状态"""
    return check_plugin_installed(project_path)


def ue5_set_material(asset_path: str, slot_index: int, material_path: str) -> dict:
    """给模型分配材质"""
    bridge = _get_bridge()
    if not bridge:
        return {"error": "未配置 UE5 项目路径"}
    return bridge.set_material(asset_path, slot_index, material_path)


def ue5_set_nanite(asset_path: str, enabled: bool, fallback_percent: float = 1.0, position_precision: int = 2) -> dict:
    """设置 Nanite"""
    bridge = _get_bridge()
    if not bridge:
        return {"error": "未配置 UE5 项目路径"}
    return bridge.set_nanite(asset_path, enabled, fallback_percent, position_precision)


def ue5_set_lod_group(asset_path: str, lod_group: str) -> dict:
    """设置 LOD 组"""
    bridge = _get_bridge()
    if not bridge:
        return {"error": "未配置 UE5 项目路径"}
    return bridge.set_lod_group(asset_path, lod_group)


def ue5_set_metadata(asset_path: str, tags: dict) -> dict:
    """写入元数据标签"""
    bridge = _get_bridge()
    if not bridge:
        return {"error": "未配置 UE5 项目路径"}
    return bridge.set_metadata(asset_path, tags)


def ue5_create_collision(asset_path: str, collision_type: str = "box") -> dict:
    """生成碰撞体"""
    bridge = _get_bridge()
    if not bridge:
        return {"error": "未配置 UE5 项目路径"}
    return bridge.create_collision(asset_path, collision_type)


def ue5_get_asset_info(asset_path: str) -> dict:
    """获取资产信息"""
    bridge = _get_bridge()
    if not bridge:
        return {"error": "未配置 UE5 项目路径"}
    return bridge.get_asset_info(asset_path)


# ========== 注册 ==========

UE5_TOOLS = [
    UE5_IMPORT_DEF, UE5_PING_DEF, UE5_CHECK_PLUGIN_DEF,
    UE5_SET_MATERIAL_DEF, UE5_SET_NANITE_DEF, UE5_SET_LOD_GROUP_DEF,
    UE5_SET_METADATA_DEF, UE5_CREATE_COLLISION_DEF, UE5_GET_ASSET_INFO_DEF,
]
UE5_TOOL_FUNCTIONS = {
    "ue5_import_asset": ue5_import_asset,
    "ue5_ping": ue5_ping,
    "ue5_check_plugin": ue5_check_plugin,
    "ue5_set_material": ue5_set_material,
    "ue5_set_nanite": ue5_set_nanite,
    "ue5_set_lod_group": ue5_set_lod_group,
    "ue5_set_metadata": ue5_set_metadata,
    "ue5_create_collision": ue5_create_collision,
    "ue5_get_asset_info": ue5_get_asset_info,
}
