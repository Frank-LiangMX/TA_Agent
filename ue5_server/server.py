# -*- coding: utf-8 -*-
"""
UE5 Command Server - 通过文件通信，避免线程问题

原理：
  Agent 写入命令到 commands.jsonl
  UE5 主线程轮询读取并执行
  结果写入 results.jsonl

使用方法：
  1. 打开 UE5 Editor
  2. Python Console 执行：exec(open(r"F:/ta_agent/ue5_server/server.py").read())
  3. Server 自动在后台轮询命令文件
"""
import json
import os
import time
import threading
import queue

try:
    import unreal
    IS_UE5 = True
except ImportError:
    IS_UE5 = False
    print("[UE5 Server] 警告：未在 UE5 环境中运行")

# 命令文件路径（固定路径，兼容 exec() 执行）
_SERVER_DIR = r"F:/ta_agent/ue5_server"
COMMANDS_FILE = os.path.join(_SERVER_DIR, "commands.jsonl")
RESULTS_FILE = os.path.join(_SERVER_DIR, "results.jsonl")
POLL_INTERVAL = 0.5  # 轮询间隔（秒）


def _write_result(request_id: str, result: dict):
    """写入执行结果"""
    entry = {"request_id": request_id, "result": result}
    with open(RESULTS_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def _handle_import(data: dict, request_id: str):
    """执行资产导入"""
    source_path = data.get("source_path", "")
    target_dir = data.get("target_dir", "")
    asset_type = data.get("asset_type", "static_mesh")
    import_settings = data.get("import_settings", {})
    metadata = data.get("metadata", {})

    if not source_path or not target_dir:
        _write_result(request_id, {"error": "source_path and target_dir are required"})
        return

    if not os.path.exists(source_path):
        _write_result(request_id, {"error": f"Source file not found: {source_path}"})
        return

    if not IS_UE5:
        _write_result(request_id, {"error": "Not running in UE5"})
        return

    try:
        # 创建导入任务
        task = unreal.AssetImportTask()
        task.set_editor_property("filename", source_path)
        task.set_editor_property("destination_path", target_dir)
        task.set_editor_property("replace_existing", True)
        task.set_editor_property("automated", True)

        # 配置 FBX 导入参数
        fbx_ui = unreal.FbxImportUI()
        fbx_ui.set_editor_property("import_mesh", True)
        fbx_ui.set_editor_property("import_textures", import_settings.get("import_textures", True))
        fbx_ui.set_editor_property("import_materials", import_settings.get("import_materials", True))

        if asset_type == "skeletal_mesh":
            fbx_ui.set_editor_property("import_as_skeletal", True)
        else:
            fbx_ui.set_editor_property("import_as_skeletal", False)

        task.set_editor_property("options", fbx_ui)

        # 执行导入（UE5.7 兼容：用 import_asset_tasks 并捕获 Result 属性错误）
        try:
            unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
        except Exception as import_err:
            # UE5.7 可能在 import_asset_tasks 内部访问 Result 属性时报错
            # 但导入可能仍然成功，通过 does_asset_exist 检查
            error_str = str(import_err)
            if "Result" not in error_str and "protected" not in error_str:
                # 不是 Result 属性错误，是真正的导入失败
                _write_result(request_id, {"success": False, "error": error_str})
                return

        asset_name = os.path.splitext(os.path.basename(source_path))[0]
        asset_path = target_dir + "/" + asset_name

        # 检查导入是否成功（通过文件是否存在判断，兼容 UE5.7+）
        success = unreal.EditorAssetLibrary.does_asset_exist(asset_path)

        if success:
            # 写入元数据
            for key, value in metadata.items():
                if value:
                    unreal.EditorAssetLibrary.set_metadata_tag(asset_path, key, str(value))
            unreal.EditorAssetLibrary.save_asset(asset_path)
            _write_result(request_id, {"success": True, "asset_path": asset_path, "message": f"Imported: {asset_name}"})
        else:
            _write_result(request_id, {"success": False, "error": f"Import failed: {asset_name}"})

    except Exception as e:
        _write_result(request_id, {"success": False, "error": str(e)})


def _handle_health(data: dict, request_id: str):
    _write_result(request_id, {"status": "ok", "ue5": IS_UE5})


def _process_command(cmd: dict):
    """处理单条命令"""
    request_id = cmd.get("request_id", "")
    action = cmd.get("action", "")
    data = cmd.get("data", {})

    handlers = {
        "import": _handle_import,
        "health": _handle_health,
    }

    handler = handlers.get(action)
    if handler:
        handler(data, request_id)
    else:
        _write_result(request_id, {"error": f"Unknown action: {action}"})


def _process_pending_commands():
    """处理待执行的命令（在主线程调用）"""
    if not os.path.exists(COMMANDS_FILE):
        return

    try:
        with open(COMMANDS_FILE, "r", encoding="utf-8") as f:
            lines = f.readlines()

        if not lines:
            return

        # 处理完后清空命令文件
        with open(COMMANDS_FILE, "w", encoding="utf-8") as f:
            pass

        for line in lines:
            line = line.strip()
            if line:
                try:
                    cmd = json.loads(line)
                    _process_command(cmd)
                except json.JSONDecodeError:
                    pass
    except Exception as e:
        if IS_UE5:
            unreal.log_error(f"[UE5 Server] Error: {e}")


# 全局：待处理的命令队列（线程安全）
import queue
_command_queue = queue.Queue()


def _process_pending_commands():
    """处理队列中的命令（必须在主线程调用）"""
    while not _command_queue.empty():
        try:
            cmd = _command_queue.get_nowait()
            _process_command(cmd)
        except queue.Empty:
            break


def _file_reader_loop():
    """后台线程：读取命令文件，放入队列"""
    while True:
        try:
            if os.path.exists(COMMANDS_FILE):
                with open(COMMANDS_FILE, "r", encoding="utf-8") as f:
                    content = f.read()
                if content.strip():
                    # 清空文件
                    with open(COMMANDS_FILE, "w", encoding="utf-8") as f:
                        pass
                    # 解析命令放入队列
                    for line in content.strip().split("\n"):
                        line = line.strip()
                        if line:
                            try:
                                cmd = json.loads(line)
                                _command_queue.put(cmd)
                            except json.JSONDecodeError:
                                pass
            time.sleep(POLL_INTERVAL)
        except Exception as e:
            time.sleep(1)


def start_server():
    """启动 Server"""
    # 清空旧文件
    if os.path.exists(COMMANDS_FILE):
        os.remove(COMMANDS_FILE)
    if os.path.exists(RESULTS_FILE):
        os.remove(RESULTS_FILE)

    # 启动文件读取线程（只读文件，不调 UE5 API）
    reader_thread = threading.Thread(target=_file_reader_loop, daemon=True)
    reader_thread.start()

    if IS_UE5:
        # 注册 Slate Tick 回调，在主线程处理命令
        def _on_tick(delta_seconds):
            _process_pending_commands()

        # 尝试注册 tick 回调
        try:
            unreal.register_slate_post_tick_callback(_on_tick)
            unreal.log("[UE5 Server] 启动（Slate Tick 主线程回调）")
        except AttributeError:
            # 如果 register_slate_post_tick_callback 不可用，用子线程直接处理
            unreal.log("[UE5 Server] 警告：Slate Tick 不可用，使用子线程模式")
            def _fallback_loop():
                while True:
                    try:
                        cmd = _command_queue.get(timeout=1)
                        _process_command(cmd)
                    except queue.Empty:
                        continue
            fallback_thread = threading.Thread(target=_fallback_loop, daemon=True)
            fallback_thread.start()

        unreal.log(f"[UE5 Server] 命令文件: {COMMANDS_FILE}")
    else:
        # 非 UE5 环境，直接在子线程处理
        def _fallback_loop():
            while True:
                try:
                    cmd = _command_queue.get(timeout=1)
                    _process_command(cmd)
                except queue.Empty:
                    continue
        fallback_thread = threading.Thread(target=_fallback_loop, daemon=True)
        fallback_thread.start()
        print("[UE5 Server] 启动（非 UE5 环境）")


# 自动启动
start_server()
