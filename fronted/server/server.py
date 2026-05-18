"""
TAgent WebSocket 服务

将 ta_agent 的 CLI 交互模式转为 WebSocket 通信。
不修改 ta_agent 原目录任何文件，通过 sys.path 导入。

启动方式：
  cd F:\\Proma\\apps\\tagent-web\\server
  pip install -r requirements.txt
  python server.py

前端连接：ws://localhost:8080/ws
"""

import sys
import os
import json
import time
import uuid
import asyncio
import traceback
from typing import Optional

# 将 ta_agent 加入 Python 路径
TA_AGENT_DIR = r"F:\ta_agent"
sys.path.insert(0, TA_AGENT_DIR)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Body
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# 导入 ta_agent 模块（不修改原文件）
from config import get_llm_config
from tools import TOOLS, execute_tool
from conventions.context import get_conventions_context, set_conventions_context
import session_manager

# 尝试导入记忆模块
try:
    from tools.memory import FileMemoryProvider
    from tools.memory_tools import set_memory_provider
    HAS_MEMORY = True
except ImportError:
    HAS_MEMORY = False

# 延迟导入 agent 模块的函数（避免循环导入）
_agent_module = None

def get_agent_module():
    global _agent_module
    if _agent_module is None:
        import agent as _agent_module
    return _agent_module


# ===== FastAPI 应用 =====

app = FastAPI(title="TAgent WebSocket Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===== 会话管理 =====

class Session:
    """一个 WebSocket 连接对应一个会话"""

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.history: list = []  # 对话历史（不含 system prompt）
        self.workflow_mode: str = "step_by_step"
        self.created_at: float = time.time()
        self.context_cutoff: int = 0  # 上下文分割点索引

    def to_dict(self) -> dict:
        return {
            "sessionId": self.session_id,
            "messageCount": len(self.history),
            "workflowMode": self.workflow_mode,
            "createdAt": self.created_at,
        }


# 全局会话存储
sessions: dict[str, Session] = {}


# ===== WebSocket 事件发送辅助 =====

async def send_event(ws: WebSocket, event: str, payload: dict):
    """发送事件到客户端"""
    await ws.send_json({
        "type": "event",
        "event": event,
        "payload": payload,
    })


async def send_response(ws: WebSocket, request_id: str, result: dict):
    """发送 RPC 响应"""
    await ws.send_json({
        "id": request_id,
        "result": result,
    })


async def send_error(ws: WebSocket, request_id: str, error: str):
    """发送错误响应"""
    await ws.send_json({
        "id": request_id,
        "error": error,
    })


# ===== Agent 核心逻辑（事件化版本） =====

async def run_agent(
    ws: WebSocket,
    session: Session,
    user_message: str,
    context_cutoff: int | None = None,
):
    """
    运行 Agent 循环，通过 WebSocket 推送事件。

    事件类型：
    - stream_text: 流式文本增量
    - tool_start: 工具调用开始
    - tool_result: 工具调用结果
    - agent_thinking: Agent 思考过程
    - done: 完成
    - error: 错误
    """
    agent = get_agent_module()
    client, model = agent.create_client()

    system_prompt = agent.build_system_prompt(session.workflow_mode)
    messages = [{"role": "system", "content": system_prompt}]
    # 使用传入的 cutoff 或会话默认值
    cutoff = context_cutoff if context_cutoff is not None else session.context_cutoff
    messages.extend(session.history[cutoff:])
    messages.append({"role": "user", "content": user_message})

    # 持久化用户消息
    session_manager.append_message(session.session_id, {
        "role": "user",
        "content": user_message,
    })

    max_iterations = 15

    for iteration in range(max_iterations):
        try:
            # 流式调用 LLM
            stream = client.chat.completions.create(
                model=model,
                messages=messages,
                tools=TOOLS,
                tool_choice="auto",
                temperature=0.1,
                stream=True,
            )
            _usage_stats["llm_calls"] += 1
            # 粗略估算 token（中文约 1.5 token/字）
            _usage_stats["total_tokens_estimate"] += sum(len(str(m.get("content", ""))) for m in messages) * 2

            collected_content = ""
            # 按 index 收集工具调用块
            tool_call_chunks: dict[int, dict] = {}

            for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if not delta:
                    continue

                # 文本内容 → 流式推送
                if delta.content:
                    collected_content += delta.content
                    await send_event(ws, "stream_text", {
                        "sessionId": session.session_id,
                        "text": delta.content,
                    })
                    await asyncio.sleep(0)  # 强制 flush，避免缓冲

                # 工具调用 → 收集分块
                if delta.tool_calls:
                    for tc_delta in delta.tool_calls:
                        idx = tc_delta.index
                        if idx not in tool_call_chunks:
                            tool_call_chunks[idx] = {"id": "", "name": "", "arguments": ""}
                        chunk_data = tool_call_chunks[idx]
                        # id 只在第一个分块出现
                        if tc_delta.id:
                            chunk_data["id"] = tc_delta.id
                        # name 可能跨多个分块
                        if tc_delta.function:
                            if tc_delta.function.name:
                                chunk_data["name"] += tc_delta.function.name
                            if tc_delta.function.arguments:
                                chunk_data["arguments"] += tc_delta.function.arguments

            # 流式结束，判断是否有工具调用
            if not tool_call_chunks:
                # 没有工具调用 → 最终回答
                final_answer = collected_content or "(LLM 返回了空回复)"
                session.history.append({"role": "user", "content": user_message})
                session.history.append({"role": "assistant", "content": final_answer})

                # 持久化助手回复
                session_manager.append_message(session.session_id, {
                    "role": "assistant",
                    "content": final_answer,
                })
                await send_event(ws, "done", {
                    "sessionId": session.session_id,
                    "content": final_answer,
                })
                return

            # 有工具调用 → 构建 assistant message（用纯 dict，不用 SDK 对象）
            tool_calls_for_msg = []
            for idx in sorted(tool_call_chunks.keys()):
                tc = tool_call_chunks[idx]
                tool_calls_for_msg.append({
                    "id": tc["id"],
                    "type": "function",
                    "function": {"name": tc["name"], "arguments": tc["arguments"]},
                })

            assistant_msg = {
                "role": "assistant",
                "content": collected_content or None,
                "tool_calls": tool_calls_for_msg,
            }
            messages.append(assistant_msg)

            # 持久化助手消息（含工具调用）
            persist_msg = {"role": "assistant"}
            if collected_content:
                persist_msg["content"] = collected_content
            persist_msg["toolCalls"] = tool_calls_for_msg
            session_manager.append_message(session.session_id, persist_msg)

            # 推送思考过程
            if collected_content:
                await send_event(ws, "agent_thinking", {
                    "sessionId": session.session_id,
                    "text": collected_content,
                })

            # 逐个执行工具
            for tc in tool_calls_for_msg:
                func_name = tc["function"]["name"]
                raw_args = tc["function"]["arguments"]

                try:
                    func_args = json.loads(raw_args)
                except json.JSONDecodeError:
                    import re
                    fixed = re.sub(r'\\(?!["\\/bfnrt])', r'\\\\', raw_args)
                    try:
                        func_args = json.loads(fixed)
                    except json.JSONDecodeError:
                        func_args = {"error": f"参数解析失败: {raw_args[:200]}"}

                # 推送工具开始
                await send_event(ws, "tool_start", {
                    "sessionId": session.session_id,
                    "toolCall": {
                        "id": tc["id"],
                        "name": func_name,
                        "arguments": func_args,
                    },
                })

                # 执行工具（在线程池中运行，期间定期推送进度事件）
                import asyncio
                from progress_hook import get_progress_events

                loop = asyncio.get_event_loop()
                tool_task = loop.run_in_executor(None, execute_tool, func_name, func_args)

                # 轮询进度事件，直到工具执行完成
                while not tool_task.done():
                    await asyncio.sleep(0.3)
                    for evt in get_progress_events():
                        await send_event(ws, evt["type"], evt)

                try:
                    result = await tool_task
                except Exception as e:
                    result = json.dumps({"error": str(e)}, ensure_ascii=False)

                # 用量计数
                _usage_stats["tool_calls"] += 1

                # 最后一批进度事件
                for evt in get_progress_events():
                    await send_event(ws, evt["type"], evt)

                # 推送工具结果
                await send_event(ws, "tool_result", {
                    "sessionId": session.session_id,
                    "toolCallId": tc["id"],
                    "name": func_name,
                    "result": result,
                })

                # 拦截 load_conventions
                if func_name == "load_conventions":
                    try:
                        conv_result = json.loads(result)
                        if conv_result.get("combined_context"):
                            set_conventions_context(conv_result["combined_context"])
                    except (json.JSONDecodeError, KeyError):
                        pass

                # 添加工具结果到消息
                messages.append({
                    "role": "tool",
                    "tool_call_id":tc["id"],
                    "content": result,
                })

                # 持久化工具结果
                session_manager.append_message(session.session_id, {
                    "role": "tool",
                    "toolCallId": tc["id"],
                    "name": func_name,
                    "content": result,
                })

            # 继续循环
            continue

        except Exception as e:
            _usage_stats["llm_errors"] += 1
            await send_event(ws, "error", {
                "sessionId": session.session_id,
                "error": f"LLM API 调用失败: {str(e)}",
            })
            return

    await send_event(ws, "error", {
        "sessionId": session.session_id,
        "error": "达到最大迭代次数，请简化请求后重试",
    })


# ===== WebSocket 端点 =====

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()

    # 客户端可通过 query 参数传递会话 ID 和用户信息
    params = ws.query_params
    requested_session_id = params.get("sessionId")
    user_name = params.get("user", "")
    user_token = params.get("token", "")

    # 本地模式：如果没有传 user，使用 config 中的默认用户
    if not user_name:
        try:
            from config import get_user_config
            user_name = get_user_config().get("name", "")
        except ImportError:
            pass

    if requested_session_id:
        # 恢复已有会话
        meta = session_manager.get_session(requested_session_id)
        if meta:
            session_id = requested_session_id
            # 加载历史消息作为上下文
            history = session_manager.get_messages(session_id, limit=50)
        else:
            # 请求的会话不存在，创建新的
            meta = session_manager.create_session(user=user_name)
            session_id = meta["sessionId"]
            history = []
    else:
        # 创建新会话
        meta = session_manager.create_session(user=user_name)
        session_id = meta["sessionId"]
        history = []

    session = Session(session_id)
    session.history = history
    sessions[session_id] = session

    # 设置活跃会话（用于进度事件路由）
    from progress_hook import set_active_session
    set_active_session(session_id)

    # 发送连接确认
    await send_event(ws, "connected", {
        "sessionId": session_id,
        "user": user_name,
        "message": "TAgent WebSocket 已连接",
    })

    try:
        while True:
            data = await ws.receive_json()
            request_id = data.get("id", "")
            method = data.get("method", "")
            params = data.get("params", {})

            if method == "sendMessage":
                content = params.get("content", "")
                if not content.strip():
                    await send_error(ws, request_id, "消息不能为空")
                    continue

                # 立即返回确认
                await send_response(ws, request_id, {"status": "processing"})

                # 获取前端传来的上下文分割点
                ctx_cutoff = params.get("contextCutoff")
                if ctx_cutoff is not None:
                    session.context_cutoff = int(ctx_cutoff)

                # 运行 Agent
                await run_agent(ws, session, content.strip(), context_cutoff=ctx_cutoff)

            elif method == "setMode":
                mode = params.get("mode", "step_by_step")
                if mode in ("step_by_step", "auto"):
                    session.workflow_mode = mode
                    await send_response(ws, request_id, {"mode": mode})
                else:
                    await send_error(ws, request_id, f"未知模式: {mode}")

            elif method == "getHistory":
                await send_response(ws, request_id, {
                    "history": session.history,
                })

            elif method == "clearHistory":
                session.history.clear()
                session.context_cutoff = 0
                set_conventions_context("")
                await send_response(ws, request_id, {"status": "cleared"})

            elif method == "clearContext":
                session.context_cutoff = len(session.history)
                await send_response(ws, request_id, {
                    "status": "cleared",
                    "cutoff": session.context_cutoff,
                })

            elif method == "getStatus":
                from config import ACTIVE_LLM, get_llm_config
                llm_config = get_llm_config()
                await send_response(ws, request_id, {
                    "sessionId": session_id,
                    "workflowMode": session.workflow_mode,
                    "messageCount": len(session.history),
                    "llm": ACTIVE_LLM,
                    "model": llm_config["model"],
                })

            elif method == "listTools":
                tool_names = [t["function"]["name"] for t in TOOLS]
                await send_response(ws, request_id, {
                    "tools": tool_names,
                    "count": len(tool_names),
                })

            elif method == "switchSession":
                target_id = params.get("sessionId", "")
                if not target_id:
                    await send_error(ws, request_id, "sessionId 不能为空")
                    continue

                # 查找或创建目标会话
                meta = session_manager.get_session(target_id)
                if not meta:
                    await send_error(ws, request_id, f"会话不存在: {target_id}")
                    continue

                # 保存旧会话到 sessions 字典
                sessions[session.session_id] = session

                # 切换到新会话
                session_id = target_id
                session = Session(session_id)
                session.history = session_manager.get_messages(session_id, limit=50)
                sessions[session_id] = session

                # 更新活跃会话
                set_active_session(session_id)

                await send_response(ws, request_id, {
                    "sessionId": session_id,
                    "messageCount": len(session.history),
                })

            else:
                await send_error(ws, request_id, f"未知方法: {method}")

    except WebSocketDisconnect:
        # 空会话自动清理（断开时 0 条消息）
        session_obj = sessions.get(session_id)
        if session_obj and len(session_obj.history) == 0:
            session_manager.delete_session(session_id)
            print(f"[WS] 空会话 {session_id} 已自动清理")
        else:
            print(f"[WS] 会话 {session_id} 断开")
        del sessions[session_id]
        set_active_session(None)
    except Exception as e:
        print(f"[WS] 会话 {session_id} 异常: {e}")
        traceback.print_exc()
        if session_id in sessions:
            session_obj = sessions[session_id]
            if len(session_obj.history) == 0:
                session_manager.delete_session(session_id)
            del sessions[session_id]


# ===== REST 端点（辅助） =====

@app.get("/health")
async def health():
    return {"status": "ok", "ws_sessions": len(sessions)}


# ===== REST 端点（会话管理） =====

@app.post("/api/sessions")
async def create_new_session():
    """创建新会话"""
    meta = session_manager.create_session()
    return meta


@app.get("/api/sessions")
async def list_all_sessions(include_archived: bool = False, user: str = None):
    """获取会话列表（过滤空草稿，可按用户过滤）"""
    result = session_manager.list_sessions(include_archived, user=user)
    # 过滤掉 0 消息的草稿会话
    result = [s for s in result if not (s.get("isDraft") and s.get("messageCount", 0) == 0)]
    return {"sessions": result, "count": len(result)}


@app.get("/api/sessions/stats")
async def get_session_stats():
    """获取会话统计"""
    return session_manager.get_stats()


@app.get("/api/sessions/{session_id}")
async def get_session_detail(session_id: str):
    """获取单个会话详情"""
    meta = session_manager.get_session(session_id)
    if not meta:
        return {"error": f"会话不存在: {session_id}"}
    return meta


@app.get("/api/sessions/{session_id}/messages")
async def get_session_messages(session_id: str, limit: int = 0):
    """获取会话消息列表"""
    messages = session_manager.get_messages(session_id, limit)
    return {"messages": messages, "count": len(messages)}


@app.patch("/api/sessions/{session_id}")
async def update_session_meta(session_id: str, payload: dict = Body(...)):
    """更新会话（标题、置顶、归档等）"""
    meta = session_manager.update_session(session_id, **payload)
    if not meta:
        return {"error": f"会话不存在: {session_id}"}
    return meta


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    """删除会话"""
    ok = session_manager.delete_session(session_id)
    return {"success": ok}


@app.post("/api/sessions/search")
async def search_sessions(payload: dict = Body(...)):
    """跨会话搜索"""
    query = payload.get("query", "")
    if not query:
        return {"error": "query 不能为空"}
    results = session_manager.search_messages(query, max_results=payload.get("maxResults", 30))
    return {"results": results, "count": len(results)}


# ===== REST 端点（用户配置） =====

@app.get("/api/user")
async def get_user():
    """获取当前用户配置"""
    from config import get_user_config
    return get_user_config()


@app.post("/api/user")
async def update_user(payload: dict = Body(...)):
    """更新用户配置"""
    from config import set_user_config
    return set_user_config(
        name=payload.get("name"),
        token=payload.get("token"),
        group=payload.get("group"),
    )


# ===== REST 端点（LLM 配置） =====

@app.get("/api/config/llm")
async def get_llm_configs():
    """获取所有 LLM 配置"""
    from config import list_llm_configs, ACTIVE_LLM
    return {"configs": list_llm_configs(), "active": ACTIVE_LLM}


@app.post("/api/config/llm/switch")
async def switch_llm(payload: dict = Body(...)):
    """切换 LLM"""
    from config import set_active_llm
    name = payload.get("name", "")
    if not name:
        return {"error": "name 不能为空"}
    return set_active_llm(name)


@app.post("/api/config/llm/add")
async def add_llm(payload: dict = Body(...)):
    """添加自定义 LLM 配置"""
    from config import add_llm_config
    key = payload.get("key", "")
    name = payload.get("name", key)
    base_url = payload.get("base_url", "")
    model = payload.get("model", "")
    api_key = payload.get("api_key", "none")
    llm_type = payload.get("type", "local")
    if not key or not base_url or not model:
        return {"error": "key, base_url, model 不能为空"}
    return add_llm_config(key=key, name=name, base_url=base_url, model=model, api_key=api_key, llm_type=llm_type)


# ===== REST 端点（工具管理） =====

@app.get("/api/tools")
async def list_all_tools():
    """列出所有内置工具"""
    tools_info = []
    for schema in TOOLS:
        func_def = schema.get("function", {})
        tools_info.append({
            "name": func_def.get("name", ""),
            "description": func_def.get("description", ""),
            "category": _categorize_tool(func_def.get("name", "")),
        })
    return {"tools": tools_info, "count": len(tools_info)}


def _categorize_tool(name: str) -> str:
    """根据工具名推断分类"""
    if "naming" in name or "rename" in name:
        return "命名"
    if "mesh" in name or "fbx" in name:
        return "几何"
    if "texture" in name or "tex" in name:
        return "贴图"
    if "scan" in name or "directory" in name or "file_info" in name:
        return "扫描"
    if "asset" in name or "search" in name or "list" in name or "detail" in name:
        return "资产"
    if "review" in name or "approve" in name or "submit" in name:
        return "审核"
    if "convention" in name or "load" in name:
        return "规范"
    if "memory" in name or "correction" in name or "profile" in name:
        return "记忆"
    if "config" in name or "rule" in name:
        return "配置"
    if "intake" in name or "move" in name or "create_dir" in name:
        return "入库"
    if "render" in name:
        return "渲染"
    if "report" in name or "analyze" in name or "inference" in name:
        return "分析"
    return "其他"


@app.get("/api/plugins")
async def list_plugins():
    """列出已安装和可安装的插件"""
    import tools.registry as registry

    # 已安装插件
    plugins_dir = os.path.join(os.path.dirname(os.path.abspath(registry.__file__)), "plugins")
    installed = []
    if os.path.isdir(plugins_dir):
        for f in sorted(os.listdir(plugins_dir)):
            if f.endswith(".py") and not f.startswith("_"):
                installed.append(f)

    # 可安装插件
    available_dir = os.path.join(os.path.dirname(os.path.abspath(registry.__file__)), "plugins_available")
    available = []
    if os.path.isdir(available_dir):
        for f in sorted(os.listdir(available_dir)):
            if f.endswith(".py") and not f.startswith("_"):
                available.append({
                    "filename": f,
                    "installed": f in installed,
                })

    return {"installed": installed, "available": available}


@app.post("/api/plugins/install")
async def install_plugin(payload: dict = Body(...)):
    """安装插件"""
    import shutil
    import tools.registry as registry

    filename = payload.get("filename", "")
    if not filename or not filename.endswith(".py"):
        return {"error": "文件名无效"}

    available_dir = os.path.join(os.path.dirname(os.path.abspath(registry.__file__)), "plugins_available")
    plugins_dir = os.path.join(os.path.dirname(os.path.abspath(registry.__file__)), "plugins")

    src = os.path.join(available_dir, filename)
    dst = os.path.join(plugins_dir, filename)

    if not os.path.exists(src):
        return {"error": f"插件不存在: {filename}"}
    if os.path.exists(dst):
        return {"error": f"插件已安装: {filename}"}

    shutil.copy2(src, dst)
    return {"success": True, "message": f"已安装 {filename}，重启后生效"}


@app.post("/api/plugins/uninstall")
async def uninstall_plugin(payload: dict = Body(...)):
    """卸载插件"""
    import tools.registry as registry

    filename = payload.get("filename", "")
    if not filename:
        return {"error": "文件名不能为空"}

    plugins_dir = os.path.join(os.path.dirname(os.path.abspath(registry.__file__)), "plugins")
    target = os.path.join(plugins_dir, filename)

    if not os.path.exists(target):
        return {"error": f"插件未安装: {filename}"}

    os.remove(target)
    return {"success": True, "message": f"已卸载 {filename}，重启后生效"}


# ===== REST 端点（记忆管理） =====

@app.post("/api/memory/clear")
async def clear_memory():
    """清空记忆系统（保留目录结构）"""
    memory_dir = os.path.join(TA_AGENT_DIR, ".ta_agent", "memory")
    cleared = []
    for fname in ["corrections.jsonl", "rules.json", "profile.md"]:
        fpath = os.path.join(memory_dir, fname)
        if os.path.exists(fpath):
            os.remove(fpath)
            cleared.append(fname)
    return {"success": True, "cleared": cleared, "message": f"已清空: {', '.join(cleared)}"}


# ===== REST 端点（提示词管理） =====

@app.get("/api/config/prompt")
async def get_prompt():
    """获取当前 system prompt"""
    from agent import build_system_prompt
    prompt = build_system_prompt()
    return {"prompt": prompt, "length": len(prompt)}


# ===== REST 端点（用量统计） =====

# 用量计数器（运行时内存中）
_usage_stats = {
    "llm_calls": 0,
    "llm_errors": 0,
    "tool_calls": 0,
    "total_tokens_estimate": 0,
    "start_time": time.time(),
}


@app.get("/api/usage")
async def get_usage():
    """获取用量统计"""
    elapsed = time.time() - _usage_stats["start_time"]
    hours = elapsed / 3600
    return {
        "llm_calls": _usage_stats["llm_calls"],
        "llm_errors": _usage_stats["llm_errors"],
        "tool_calls": _usage_stats["tool_calls"],
        "total_tokens_estimate": _usage_stats["total_tokens_estimate"],
        "uptime_hours": round(hours, 1),
        "message": "用量统计基于本次服务运行期间的计数",
    }


@app.post("/api/usage/increment")
async def increment_usage(payload: dict = Body(...)):
    """内部接口：增加用量计数（由 agent 循环调用）"""
    if "llm_calls" in payload:
        _usage_stats["llm_calls"] += payload["llm_calls"]
    if "llm_errors" in payload:
        _usage_stats["llm_errors"] += payload["llm_errors"]
    if "tool_calls" in payload:
        _usage_stats["tool_calls"] += payload["tool_calls"]
    if "tokens" in payload:
        _usage_stats["total_tokens_estimate"] += payload["tokens"]
    return {"success": True}


# ===== REST 端点（资产数据 — 直接查 SQLite） =====

def _get_tag_store():
    """获取 TagStore 实例（延迟导入）"""
    from tags.store import TagStore
    store_dir = os.path.join(TA_AGENT_DIR, "tag_store")
    return TagStore(store_dir)


@app.get("/api/assets")
async def list_assets():
    """获取所有资产列表"""
    try:
        store = _get_tag_store()
        assets = store.list_all()
        return {"count": len(assets), "assets": assets}
    except Exception as e:
        return {"count": 0, "assets": [], "error": str(e)}


@app.get("/api/assets/{asset_id}")
async def get_asset_detail(asset_id: str):
    """获取单个资产详情"""
    try:
        store = _get_tag_store()
        tags = store.load(asset_id)
        if tags is None:
            return {"error": f"未找到资产: {asset_id}"}
        return tags.to_dict()
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/reviews/pending")
async def get_pending_reviews(limit: int = 100):
    """获取待审核资产（直接查数据库，绕过 MAX_DETAIL=20 限制）"""
    try:
        store = _get_tag_store()
        conn = store._get_conn()

        # 查询所有 pending 状态的资产
        rows = conn.execute(
            """SELECT asset_id, asset_name, file_path, asset_type,
                      category, subcategory, tri_count, status, analyzed_at
               FROM assets WHERE status = 'pending'
               ORDER BY analyzed_at DESC""",
        ).fetchall()

        all_pending = [
            {
                "asset_id": r["asset_id"],
                "asset_name": r["asset_name"],
                "file_path": r["file_path"],
                "asset_type": r["asset_type"],
                "category": r["category"],
                "subcategory": r["subcategory"],
                "tri_count": r["tri_count"],
                "status": r["status"],
            }
            for r in rows
        ]

        # 从 full_data 中提取置信度信息
        high_conf = []
        low_conf = []
        for item in all_pending:
            tags = store.load(item["asset_id"])
            if tags is None:
                continue
            # 计算平均置信度
            confidences = []
            if tags.category and tags.category.confidence > 0:
                confidences.append(tags.category.confidence)
            if tags.material_structure and tags.material_structure.confidence > 0:
                confidences.append(tags.material_structure.confidence)
            if tags.visual:
                if tags.visual.style_confidence > 0:
                    confidences.append(tags.visual.style_confidence)
                if tags.visual.condition_confidence > 0:
                    confidences.append(tags.visual.condition_confidence)
            avg_conf = sum(confidences) / len(confidences) if confidences else 0

            entry = {
                **item,
                "avg_confidence": round(avg_conf, 2),
                "confidence_details": {
                    "category": tags.category.confidence if tags.category else 0,
                    "material": tags.material_structure.confidence if tags.material_structure else 0,
                    "style": tags.visual.style_confidence if tags.visual else 0,
                    "condition": tags.visual.condition_confidence if tags.visual else 0,
                },
            }

            if avg_conf >= 0.9:
                high_conf.append(entry)
            else:
                low_conf.append(entry)

        return {
            "total_pending": len(all_pending),
            "high_confidence_count": len(high_conf),
            "low_confidence_count": len(low_conf),
            "high_confidence": high_conf[:limit],
            "low_confidence": low_conf[:limit],
            "high_confidence_ids": [a["asset_id"] for a in high_conf],
            "summary": f"共 {len(all_pending)} 个待审核：{len(high_conf)} 高置信度，{len(low_conf)} 低置信度",
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}


@app.get("/api/stats")
async def get_stats():
    """获取数据库统计（多维度）"""
    try:
        store = _get_tag_store()
        total = store.count()

        conn = store._get_conn()

        # 按状态统计
        status_rows = conn.execute(
            "SELECT status, COUNT(*) as cnt FROM assets GROUP BY status"
        ).fetchall()
        by_status = {row["status"]: row["cnt"] for row in status_rows}

        # 按分类统计
        cat_rows = conn.execute(
            "SELECT category, COUNT(*) as cnt FROM assets WHERE category != '' GROUP BY category ORDER BY cnt DESC"
        ).fetchall()
        by_category = {row["category"]: row["cnt"] for row in cat_rows}

        # 按资产类型统计
        type_rows = conn.execute(
            "SELECT asset_type, COUNT(*) as cnt FROM assets WHERE asset_type != '' GROUP BY asset_type ORDER BY cnt DESC"
        ).fetchall()
        by_type = {row["asset_type"]: row["cnt"] for row in type_rows}

        # 按风格统计
        style_rows = conn.execute(
            "SELECT style, COUNT(*) as cnt FROM assets WHERE style != '' GROUP BY style ORDER BY cnt DESC"
        ).fetchall()
        by_style = {row["style"]: row["cnt"] for row in style_rows}

        # 面数统计
        mesh_stats = conn.execute(
            "SELECT COUNT(*) as cnt, SUM(tri_count) as total_tris, AVG(tri_count) as avg_tris, MAX(tri_count) as max_tris, MIN(tri_count) as min_tris FROM assets WHERE tri_count > 0"
        ).fetchone()

        # 最近分析的资产
        recent_rows = conn.execute(
            "SELECT asset_name, asset_type, category, analyzed_at FROM assets WHERE analyzed_at != '' ORDER BY analyzed_at DESC LIMIT 10"
        ).fetchall()
        recent = [dict(row) for row in recent_rows]

        return {
            "total": total,
            "by_status": by_status,
            "by_category": by_category,
            "by_type": by_type,
            "by_style": by_style,
            "mesh": {
                "count": mesh_stats["cnt"] if mesh_stats else 0,
                "total_tris": mesh_stats["total_tris"] or 0 if mesh_stats else 0,
                "avg_tris": round(mesh_stats["avg_tris"]) if mesh_stats and mesh_stats["avg_tris"] else 0,
                "max_tris": mesh_stats["max_tris"] or 0 if mesh_stats else 0,
                "min_tris": mesh_stats["min_tris"] or 0 if mesh_stats else 0,
            },
            "recent": recent,
        }
    except Exception as e:
        return {"total": 0, "error": str(e)}


@app.get("/api/memory/stats")
async def get_memory_stats():
    """获取记忆系统状态"""
    try:
        from tools.memory_tools import get_memory_stats as _get_stats
        result = _get_stats()
        return result
    except Exception as e:
        return {"error": str(e)}


# ===== 资产预览图 =====

IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.tga', '.bmp', '.tiff', '.webp'}

from fastapi.responses import FileResponse, StreamingResponse
from io import BytesIO

# 预览图缓存（asset_id -> bytes），避免重复转换
_preview_cache: dict[str, bytes] = {}
_preview_cache_max = 100


def _find_file(file_path: str) -> str | None:
    """查找文件，支持路径偏差修正"""
    # 1. 精确路径
    if os.path.isfile(file_path):
        return file_path
    # 2. 在同级目录按文件名搜索（不区分大小写）
    parent = os.path.dirname(file_path)
    name = os.path.basename(file_path)
    if os.path.isdir(parent):
        for f in os.listdir(parent):
            if f.lower() == name.lower():
                return os.path.join(parent, f)
    # 3. 在父目录的子目录中搜索（如 NPC/CN4/xxx.tga）
    if os.path.isdir(parent):
        for sub in os.listdir(parent):
            sub_path = os.path.join(parent, sub)
            if os.path.isdir(sub_path):
                candidate = os.path.join(sub_path, name)
                if os.path.isfile(candidate):
                    return candidate
    return None


@app.get("/api/preview/{asset_id}")
async def get_asset_preview(asset_id: str):
    """获取资产预览图（贴图直接返回，TGA 自动转 PNG）"""
    try:
        store = _get_tag_store()
        tags = store.load(asset_id)
        if tags is None:
            return {"error": "资产不存在"}

        file_path = tags.file_path
        ext = os.path.splitext(file_path)[1].lower()

        # 贴图文件
        if ext in IMAGE_EXTENSIONS:
            actual_path = _find_file(file_path)
            if not actual_path:
                return {"error": "文件不存在"}

            # PNG/JPG 直接返回
            if ext in ('.png', '.jpg', '.jpeg', '.webp'):
                return FileResponse(actual_path, media_type=f'image/{ext[1:]}')

            # TGA/BMP/TIFF 用 Pillow 转 PNG（缩略图，最大 512px，带缓存）
            cache_key = f"{asset_id}:{ext}"
            if cache_key in _preview_cache:
                return StreamingResponse(BytesIO(_preview_cache[cache_key]), media_type='image/png')
            try:
                from PIL import Image
                img = Image.open(actual_path)
                img.thumbnail((256, 256), Image.LANCZOS)
                buf = BytesIO()
                img.save(buf, format='PNG', optimize=True)
                data = buf.getvalue()
                # 缓存
                if len(_preview_cache) < _preview_cache_max:
                    _preview_cache[cache_key] = data
                return StreamingResponse(BytesIO(data), media_type='image/png')
            except Exception as e:
                return {"error": f"图片转换失败: {str(e)}"}

        # 3D 模型：检查已渲染的预览图
        preview_dir = os.path.join(TA_AGENT_DIR, "tag_store", "previews")
        preview_path = os.path.join(preview_dir, f"{asset_id}.png")
        if os.path.isfile(preview_path):
            return FileResponse(preview_path, media_type='image/png')

        return {"error": "暂无预览", "type": "model", "file_ext": ext}

    except Exception as e:
        return {"error": str(e)}


# ===== 启动 =====

if __name__ == "__main__":
    print("=" * 50)
    print("  TAgent WebSocket Server")
    print("  ws://localhost:8080/ws")
    print("=" * 50)

    # 初始化记忆系统
    if HAS_MEMORY:
        try:
            memory_dir = os.path.join(TA_AGENT_DIR, ".ta_agent", "memory")
            provider = FileMemoryProvider(memory_dir)
            set_memory_provider(provider)
            print(f"  记忆系统: {memory_dir}")
        except Exception as e:
            print(f"  记忆系统: 初始化失败 ({e})")

    # 初始化会话管理器
    session_manager.init(os.path.join(TA_AGENT_DIR, ".ta_agent"))
    stats = session_manager.get_stats()
    print(f"  会话管理: {stats['active_sessions']} 个活跃会话, {stats['total_messages']} 条消息")

    # 注入分析进度回调
    from progress_hook import patch_analyzer_progress
    patch_analyzer_progress()

    uvicorn.run(app, host="0.0.0.0", port=8080)
