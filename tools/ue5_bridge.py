# -*- coding: utf-8 -*-
"""
tools/ue5_bridge.py - UE5 桥接工具

通过文件通信调用 UE5 Editor 内的命令服务器。
Agent 写入命令到 commands.jsonl，UE5 轮询执行后返回结果到 results.jsonl。
"""
import os
import json
import time
import uuid

# 文件路径
_SERVER_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ue5_server")
COMMANDS_FILE = os.path.join(_SERVER_DIR, "commands.jsonl")
RESULTS_FILE = os.path.join(_SERVER_DIR, "results.jsonl")
RESPONSE_TIMEOUT = 120  # 最长等待秒数


def _send_command(action: str, data: dict) -> dict:
    """发送命令到 UE5 并等待结果"""
    request_id = str(uuid.uuid4())[:8]
    command = {"request_id": request_id, "action": action, "data": data}

    # 清空旧结果
    if os.path.exists(RESULTS_FILE):
        os.remove(RESULTS_FILE)

    # 写入命令
    with open(COMMANDS_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(command, ensure_ascii=False) + "\n")

    # 等待结果
    start = time.time()
    while time.time() - start < RESPONSE_TIMEOUT:
        if os.path.exists(RESULTS_FILE):
            with open(RESULTS_FILE, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            entry = json.loads(line)
                            if entry.get("request_id") == request_id:
                                return entry.get("result", {"error": "No result"})
                        except json.JSONDecodeError:
                            pass
        time.sleep(0.5)

    return {"error": f"UE5 响应超时（{RESPONSE_TIMEOUT}s）。请确认 UE5 已启动 Server。"}


# ========== Schema 定义 ==========

UE5_IMPORT_DEF = {
    "type": "function",
    "function": {
        "name": "ue5_import_asset",
        "description": "远程调用 UE5 导入资产。将 FBX 文件导入到 UE5 Content 目录。导入成功后自动更新数据库中的 engine_path 和状态。需要 UE5 Editor 已启动并运行 Server。",
        "parameters": {
            "type": "object",
            "properties": {
                "source_path": {
                    "type": "string",
                    "description": "FBX 源文件的完整路径",
                },
                "target_dir": {
                    "type": "string",
                    "description": "UE5 Content 目标目录（如 /Game/Weapons）",
                },
                "asset_type": {
                    "type": "string",
                    "enum": ["static_mesh", "skeletal_mesh"],
                    "description": "资产类型（默认 static_mesh）",
                    "default": "static_mesh",
                },
                "asset_id": {
                    "type": "string",
                    "description": "资产 ID（可选，传入后导入成功会自动更新数据库状态）",
                },
            },
            "required": ["source_path", "target_dir"],
        },
    },
}

UE5_HEALTH_DEF = {
    "type": "function",
    "function": {
        "name": "ue5_health_check",
        "description": "检查 UE5 Server 是否在线。在执行 UE5 相关操作前调用。",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
}


# ========== 工具实现 ==========

def ue5_import_asset(source_path: str, target_dir: str, asset_type: str = "static_mesh", asset_id: str = None) -> dict:
    """远程调用 UE5 导入资产。导入成功后自动更新数据库中的 engine_path。"""
    result = _send_command("import", {
        "source_path": source_path,
        "target_dir": target_dir,
        "asset_type": asset_type,
        "import_settings": {},
        "metadata": {},
    })

    # 导入成功后，更新数据库中的 engine_path 和状态
    if result.get("success") and asset_id:
        try:
            from tags.store import TagStore
            store_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tag_store")
            store = TagStore(store_dir)
            tags = store.load(asset_id)
            if tags:
                asset_name = os.path.splitext(os.path.basename(source_path))[0]
                tags.meta.engine_path = f"{target_dir}/{asset_name}"
                tags.meta.status = "imported"
                store.save(tags)
                result["engine_path"] = tags.meta.engine_path
                result["db_updated"] = True
        except Exception as e:
            result["db_warning"] = f"导入成功但数据库更新失败: {e}"

    return result


def ue5_health_check() -> dict:
    """检查 UE5 Server 是否在线"""
    return _send_command("health", {})


# ========== 注册 ==========

UE5_TOOLS = [
    UE5_IMPORT_DEF,
    UE5_HEALTH_DEF,
]

UE5_TOOL_FUNCTIONS = {
    "ue5_import_asset": ue5_import_asset,
    "ue5_health_check": ue5_health_check,
}
