"""
TAgent WebSocket 服务

将 ta_agent 的 CLI 交互模式转为 WebSocket 通信。
不修改 ta_agent 原目录任何文件，通过 sys.path 导入。

启动方式：
  cd fronted/server
  pip install -r requirements.txt
  python server.py

前端连接：默认 ws://localhost:8080/ws，可通过 TAGENT_RUNTIME_PORT 覆盖端口
"""

import sys
import os
import json
import time
import uuid
import asyncio
import traceback
from typing import Optional

# 将 ta_agent 加入 Python 路径（动态计算项目根目录）
TA_AGENT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, TA_AGENT_DIR)
sys.path.insert(0, os.path.join(TA_AGENT_DIR, "backend"))
sys.path.insert(0, os.path.join(TA_AGENT_DIR, "packages"))

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Body
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# 导入 ta_agent 模块（不修改原文件）
from config import get_llm_config, MEMORY_DIR, PIPELINE_RUNS_FILE, get_memory_namespace
from tools import TOOLS, TOOL_FUNCTIONS, execute_tool, get_tools_for_mode
from tools.workspace_context import set_workspace_path
from conventions.context import get_conventions_context, set_conventions_context
import session_manager

# 尝试导入记忆模块
try:
    from tools.memory import FileMemoryProvider
    from tools.core.memory_llm_tools import set_memory_provider
    HAS_MEMORY = True
except ImportError:
    HAS_MEMORY = False

# ===== 工具 → 流水线阶段映射 =====
# 执行工具时自动追踪到对应流水线阶段
TOOL_TO_STAGE = {
    "scan_directory": "scan",
    "check_file_info": "scan",
    "analyze_assets": "analyze",
    "run_ai_inference": "analyze",
    "check_naming": "analyze",
    "check_mesh_budget": "analyze",
    "check_texture_info": "analyze",
    "check_texture_batch": "analyze",
    "check_fbx_info": "analyze",
    "load_project_config": "scan",
    "check_project_config": "scan",
    "discover_conventions": "scan",
    "load_conventions": "scan",
    # review 阶段：只有实际完成审核的操作才触发建议
    "submit_review": "review_done",
    "batch_approve": "review_done",
    # intake 阶段
    "intake_asset": "intake",
    "intake_batch": "intake",
    "intake_approved": "intake",
}

# ===== 阶段建议规则 =====
# 根据最后执行的工具判断阶段，生成建议
# 注意：建议内容是用户可能想对 Agent 说的话
STAGE_SUGGESTIONS = {
    "scan": "开始分析这些资产",
    "analyze": "进入审核阶段",
    "review_done": "入库到 UE5，路径是",
    "intake": "查看入库清单",
}

# 延迟导入 agent 模块的函数（避免循环导入）
_agent_module = None

def get_agent_module():
    global _agent_module
    if _agent_module is None:
        # 打包版仅包含 backend/agent_main.py，根目录 agent.py 薄壳不在 _internal
        import agent_main as _agent_module
    return _agent_module


def _generate_suggestion(tool_names: list[str]) -> str | None:
    """
    根据本次对话调用的工具，生成建议的下一步提示。

    规则：
    - 如果最后调用了 analyze 相关工具 → 建议进入审核
    - 如果最后调用了 review 相关工具 → 建议入库
    - 如果最后调用了 intake 相关工具 → 建议在 UE5 中执行脚本
    """
    if not tool_names:
        return None

    # 从后往前找最后一个有阶段映射的工具
    for tool_name in reversed(tool_names):
        stage = TOOL_TO_STAGE.get(tool_name)
        if stage and stage in STAGE_SUGGESTIONS:
            return STAGE_SUGGESTIONS[stage]

    return None


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

import threading

class Session:
    """一个 WebSocket 连接对应一个会话"""

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.history: list = []  # 对话历史（不含 system prompt）
        self.workflow_mode: str = "step_by_step"
        self.created_at: float = time.time()
        self.context_cutoff: int = 0  # 上下文分割点索引
        self.cancel_event = threading.Event()  # 工具执行取消信号
        self.agent_running = False

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
    try:
        await ws.send_json({
            "type": "event",
            "event": event,
            "payload": payload,
        })
    except Exception:
        pass  # 客户端已断开，忽略


async def _run_agent_background(
    ws: WebSocket,
    session: Session,
    user_message: str,
    context_cutoff: int | None = None,
    thinking: bool = False,
    images: list[dict] | None = None,
    attachments: list[dict] | None = None,
):
    """后台运行 Agent，避免阻塞 WebSocket 收包（断线可及时 cancel）。"""
    session.agent_running = True
    try:
        await run_agent(
            ws,
            session,
            user_message,
            context_cutoff=context_cutoff,
            thinking=thinking,
            images=images,
            attachments=attachments,
        )
    except Exception as e:
        traceback.print_exc()
        await send_event(ws, "error", {
            "sessionId": session.session_id,
            "error": f"Agent 执行失败: {str(e)}",
        })
    finally:
        session.agent_running = False


def _bind_ws_session(
    connection_id: str,
    target_id: str,
    current_agent_mode: str,
) -> tuple[Session | None, str | None]:
    """将 WebSocket 连接绑定到目标会话，失败时返回 (None, error_message)。"""
    meta = session_manager.get_session(target_id, agent_mode=current_agent_mode)
    if not meta:
        return None, f"会话不存在: {target_id}"

    session = Session(target_id)
    session.history = session_manager.get_messages(target_id, limit=50)
    sessions[connection_id] = session

    from progress_hook import set_active_session

    set_active_session(target_id)
    ws_path = (meta.get("workspacePath") or "").strip()
    set_workspace_path(ws_path if ws_path else None)
    return session, None


async def send_response(ws: WebSocket, request_id: str, result: dict):
    """发送 RPC 响应"""
    try:
        await ws.send_json({
            "id": request_id,
            "result": result,
        })
    except Exception:
        pass


async def send_error(ws: WebSocket, request_id: str, error: str):
    """发送 RPC 错误"""
    try:
        await ws.send_json({
            "id": request_id,
            "error": error,
        })
    except Exception:
        pass


def _extract_reasoning_delta(delta) -> str:
    """从流式 delta 提取推理/思考文本（兼容 OpenAI、DeepSeek 等字段）。"""
    if delta is None:
        return ""
    parts: list[str] = []
    for attr in ("reasoning_content",):
        val = getattr(delta, attr, None)
        if isinstance(val, str) and val:
            parts.append(val)
    if not parts and hasattr(delta, "model_dump"):
        try:
            data = delta.model_dump(exclude_none=True)
            val = data.get("reasoning_content")
            if isinstance(val, str) and val:
                parts.append(val)
        except Exception:
            pass
    return "".join(parts)


# ===== Agent 核心逻辑（事件化版本） =====


def _convert_history_message(msg: dict) -> dict:
    """
    将历史消息格式转换为 LLM API 格式。

    存储格式（驼峰）→ LLM API 格式（下划线）：
    - toolCalls → tool_calls
    - toolCallId → tool_call_id
    """
    role = msg.get("role")
    converted = {"role": role}

    if role == "assistant":
        # assistant 消息：转换 toolCalls → tool_calls
        converted["content"] = msg.get("content")
        if msg.get("toolCalls"):
            converted["tool_calls"] = msg["toolCalls"]
    elif role == "tool":
        # 工具结果：转换 toolCallId → tool_call_id
        converted["tool_call_id"] = msg.get("toolCallId", "")
        converted["content"] = msg.get("content", "")
        if msg.get("name"):
            converted["name"] = msg["name"]
    else:
        # user / system：直接复制
        converted["content"] = msg.get("content", "")

    return converted


async def run_agent(
    ws: WebSocket,
    session: Session,
    user_message: str,
    context_cutoff: int | None = None,
    thinking: bool = False,
    images: list[dict] | None = None,
    attachments: list[dict] | None = None,
):
    """
    运行 Agent 循环，通过 WebSocket 推送事件。

    事件类型：
    - stream_text: 流式文本增量
    - tool_start: 工具调用开始
    - tool_result: 工具调用结果
    - agent_thinking: Agent 思考过程（delta=true 为增量）
    - done: 完成
    - error: 错误
    """
    agent = get_agent_module()
    client, model = agent.create_client()

    from config import get_agent_runtime_mode
    current_agent_mode = get_agent_runtime_mode()

    # 绑定会话工作区（通用模式文件工具依赖此路径）
    session_meta = session_manager.get_session(
        session.session_id, agent_mode=current_agent_mode
    ) or {}
    workspace_path = (session_meta.get("workspacePath") or "").strip()
    workspace_name = (session_meta.get("workspaceName") or "").strip()
    if not workspace_path and current_agent_mode == "general":
        from config import DEFAULT_WORKSPACE_NAME, get_default_workspace_path

        workspace_path = get_default_workspace_path()
        workspace_name = workspace_name or DEFAULT_WORKSPACE_NAME
    set_workspace_path(workspace_path or None)

    # 重置中断信号
    session.cancel_event.clear()

    system_prompt = agent.build_system_prompt(
        session.workflow_mode,
        agent_mode=current_agent_mode,
        workspace_path=workspace_path or None,
        workspace_name=workspace_name or None,
    )
    active_tools = get_tools_for_mode(current_agent_mode)
    messages = [{"role": "system", "content": system_prompt}]
    # 使用传入的 cutoff 或会话默认值
    cutoff = context_cutoff if context_cutoff is not None else session.context_cutoff

    # 加载历史消息并转换格式（存储用驼峰，LLM API 用下划线）
    for msg in session.history[cutoff:]:
        converted = _convert_history_message(msg)
        messages.append(converted)

    # 构建用户消息（支持多模态）
    if images:
        # 多模态：文本 + 图片
        user_content: list[dict] = [{"type": "text", "text": user_message}]
        for img in images:
            user_content.append({
                "type": "image_url",
                "image_url": {"url": img["data"]},
            })
        messages.append({"role": "user", "content": user_content})
    else:
        messages.append({"role": "user", "content": user_message})

    # 持久化用户消息（附件信息也保存）
    persist_content = user_message
    if attachments:
        att_names = ", ".join(a["name"] for a in attachments)
        persist_content += f"\n\n[附件: {att_names}]"
    session_manager.append_message(session.session_id, {
        "role": "user",
        "content": persist_content,
    })

    max_iterations = 15
    # 追踪本次对话调用的工具（用于生成建议）
    last_tool_names: list[str] = []

    for iteration in range(max_iterations):
        # 检查是否被用户中断
        if session.cancel_event.is_set():
            await send_event(ws, "done", {
                "sessionId": session.session_id,
                "content": "（已中断）",
                "suggestion": "",
            })
            return

        llm_start_time = None
        prompt_tokens_real = 0
        completion_tokens_real = 0
        try:
            # 构建 LLM 请求参数
            llm_kwargs = {
                "model": model,
                "messages": messages,
                "tools": active_tools,
                "tool_choice": "auto",
                "temperature": 0.1,
                "stream": True,
                "stream_options": {"include_usage": True},
            }
            # 思考模式：添加 reasoning_effort 参数
            if thinking:
                llm_kwargs["reasoning_effort"] = "high"

            # 流式调用 LLM
            try:
                stream = client.chat.completions.create(**llm_kwargs)
            except Exception as api_err:
                # 容错：如果 API 不支持 reasoning_effort，去掉后重试
                if thinking and ("reasoning_effort" in str(api_err).lower() or "unexpected" in str(api_err).lower()):
                    print(f"[Server] API 不支持 reasoning_effort，去掉后重试")
                    llm_kwargs.pop("reasoning_effort", None)
                    stream = client.chat.completions.create(**llm_kwargs)
                # 容错：如果 API 不支持 stream_options，去掉后重试
                elif "stream_options" in str(api_err).lower():
                    print(f"[Server] API 不支持 stream_options，去掉后重试")
                    llm_kwargs.pop("stream_options", None)
                    stream = client.chat.completions.create(**llm_kwargs)
                else:
                    raise
            _usage_stats["llm_calls"] += 1
            llm_start_time = time.time()
            # 粗略估算 token（中文约 1.5 token/字）
            _usage_stats["total_tokens_estimate"] += sum(len(str(m.get("content", ""))) for m in messages) * 2

            collected_content = ""
            collected_reasoning = ""
            # 按 index 收集工具调用块
            tool_call_chunks: dict[int, dict] = {}
            # 真实 token 计数（从 stream usage 字段累计；fallback 用估算）
            prompt_tokens_real = 0
            completion_tokens_real = 0
            async def emit_thinking_delta(text: str):
                if not text:
                    return
                await send_event(ws, "agent_thinking", {
                    "sessionId": session.session_id,
                    "text": text,
                    "delta": True,
                })
                await asyncio.sleep(0)

            for chunk in stream:
                # 检查中断
                if session.cancel_event.is_set():
                    break

                # 抓取 usage（最后 chunk 携带，openai 兼容协议）
                usage = getattr(chunk, "usage", None)
                if usage:
                    if getattr(usage, "prompt_tokens", None):
                        prompt_tokens_real = usage.prompt_tokens
                    if getattr(usage, "completion_tokens", None):
                        completion_tokens_real = usage.completion_tokens

                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if not delta:
                    continue

                reasoning_piece = _extract_reasoning_delta(delta)
                if reasoning_piece:
                    collected_reasoning += reasoning_piece
                    await emit_thinking_delta(reasoning_piece)

                if delta.content:
                    collected_content += delta.content
                    await send_event(ws, "stream_text", {
                        "sessionId": session.session_id,
                        "text": delta.content,
                    })
                    await asyncio.sleep(0)

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

            # 流式结束，检查是否被中断
            if session.cancel_event.is_set():
                llm_duration = (time.time() - llm_start_time) * 1000
                _log_llm_call(session.session_id, model, prompt_tokens_real, completion_tokens_real, llm_duration, False, thinking, "中断")
                await send_event(ws, "done", {
                    "sessionId": session.session_id,
                    "content": collected_content or "（已中断）",
                    "suggestion": "",
                })
                return

            # 记录 LLM 调用日志
            llm_duration = (time.time() - llm_start_time) * 1000
            # 真实 token 优先；fallback 用粗略估算（中文约 2 token/字）
            input_tokens_final = prompt_tokens_real or sum(len(str(m.get("content", ""))) for m in messages) * 2
            output_tokens_final = completion_tokens_real or len(collected_content) * 2
            # 同步写入累计估算（用真实值，更准确）
            if prompt_tokens_real or completion_tokens_real:
                # 减去之前粗略估算的部分，加上真实值
                _usage_stats["total_tokens_estimate"] -= sum(len(str(m.get("content", ""))) for m in messages) * 2
                _usage_stats["total_tokens_estimate"] += input_tokens_final + output_tokens_final
            _log_llm_call(session.session_id, model, input_tokens_final, output_tokens_final, llm_duration, True, thinking)

            # 流式结束，判断是否有工具调用
            if not tool_call_chunks:
                # 没有工具调用 → 最终回答
                final_answer = (collected_content or "").strip()
                thinking_for_done = collected_reasoning.strip() or None
                if not final_answer and thinking_for_done:
                    final_answer = thinking_for_done
                    thinking_for_done = None
                if not final_answer:
                    final_answer = "(LLM 返回了空回复)"
                session.history.append({"role": "user", "content": user_message})
                session.history.append({"role": "assistant", "content": final_answer})

                # 持久化助手回复（思考单独字段，不写入正文）
                persist_final: dict = {"role": "assistant", "content": final_answer}
                if thinking_for_done:
                    persist_final["thinking"] = thinking_for_done
                session_manager.append_message(session.session_id, persist_final)

                # 生成建议（根据最后调用的工具判断阶段）
                suggestion = _generate_suggestion(last_tool_names)

                await send_event(ws, "done", {
                    "sessionId": session.session_id,
                    "content": final_answer,
                    "thinking": thinking_for_done,
                    "suggestion": suggestion,
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
            # 验证工具调用格式，过滤掉格式错误的
            valid_tool_calls = []
            for tc in tool_calls_for_msg:
                func_name = tc.get("function", {}).get("name", "")
                # 检查工具名称是否包含多个工具名拼接（如 "load_project_configanalyze_assets"）
                if len(func_name) > 50 or not func_name.isidentifier():
                    print(f"[Server] 警告：过滤格式错误的工具调用: {func_name}")
                    continue
                # 检查工具名是否在已注册列表中
                if func_name not in TOOL_FUNCTIONS:
                    print(f"[Server] 警告：过滤未知工具调用: {func_name}")
                    continue
                valid_tool_calls.append(tc)

            thinking_for_persist = collected_reasoning.strip()
            if collected_content:
                thinking_for_persist = (
                    f"{thinking_for_persist}\n\n{collected_content}".strip()
                    if thinking_for_persist
                    else collected_content.strip()
                )

            if valid_tool_calls:
                persist_msg: dict = {"role": "assistant", "toolCalls": valid_tool_calls}
                if thinking_for_persist:
                    persist_msg["thinking"] = thinking_for_persist
                session_manager.append_message(session.session_id, persist_msg)
            elif collected_content:
                session_manager.append_message(session.session_id, {
                    "role": "assistant",
                    "content": collected_content,
                    **({"thinking": thinking_for_persist} if thinking_for_persist else {}),
                })

            # 如果所有工具调用都被过滤掉，作为最终回答处理
            if not valid_tool_calls and tool_calls_for_msg:
                print(f"[Server] 所有工具调用都被过滤，共 {len(tool_calls_for_msg)} 个")
                final_answer = collected_content or "(工具调用格式错误，已过滤)"
                await send_event(ws, "done", {
                    "sessionId": session.session_id,
                    "content": final_answer,
                    "thinking": thinking_for_persist or None,
                    "suggestion": _generate_suggestion(last_tool_names),
                })
                return

            # 逐个执行工具（只执行验证通过的）
            for tc in valid_tool_calls:
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

                # 权限检查（通用模式才拦截；TA 模式保留现有行为）
                if current_agent_mode == "general":
                    from tools.danger_patterns import classify
                    from tools.permissions import (
                        is_session_whitelisted,
                        is_permanently_whitelisted,
                        request_permission_and_wait,
                    )

                    classification = classify(func_name, func_args)

                    if classification == "hardline":
                        result = json.dumps({
                            "error": f"危险操作已被系统拦截（{func_name}）",
                        }, ensure_ascii=False)
                        await send_event(ws, "tool_result", {
                            "sessionId": session.session_id,
                            "toolCallId": tc["id"],
                            "name": func_name,
                            "result": result,
                        })
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tc["id"],
                            "content": result,
                        })
                        last_tool_names.append(func_name)
                        continue

                    if classification == "dangerous":
                        already_allowed = (
                            is_session_whitelisted(session.session_id, func_name, func_args)
                            or is_permanently_whitelisted(func_name, func_args)
                        )
                        if not already_allowed:
                            approved = await request_permission_and_wait(
                                ws,
                                session.session_id,
                                tc["id"],
                                func_name,
                                func_args,
                                classification,
                            )
                            if not approved:
                                result = json.dumps({
                                    "error": "用户拒绝执行此操作",
                                }, ensure_ascii=False)
                                await send_event(ws, "tool_result", {
                                    "sessionId": session.session_id,
                                    "toolCallId": tc["id"],
                                    "name": func_name,
                                    "result": result,
                                })
                                messages.append({
                                    "role": "tool",
                                    "tool_call_id": tc["id"],
                                    "content": result,
                                })
                                last_tool_names.append(func_name)
                                continue

                # 追踪工具调用
                last_tool_names.append(func_name)

                # 追踪流水线阶段（开始执行）
                stage_id = TOOL_TO_STAGE.get(func_name)
                if stage_id:
                    _append_run({
                        "runId": f"auto_{uuid.uuid4().hex[:8]}",
                        "stageId": stage_id,
                        "sessionId": session.session_id,
                        "status": "running",
                        "startedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
                        "toolsUsed": [func_name],
                        "summary": f"正在{TOOL_TO_STAGE.get(func_name, '')}...",
                    })

                # 执行工具（在线程池中运行，期间定期推送进度事件）
                from progress_hook import get_progress_events, is_cancelled

                from functools import partial

                loop = asyncio.get_event_loop()
                tool_task = loop.run_in_executor(
                    None,
                    partial(execute_tool, func_name, func_args, current_agent_mode),
                )

                # 轮询进度事件，直到工具执行完成或取消
                while not tool_task.done():
                    await asyncio.sleep(0.3)
                    # 检查取消信号
                    if is_cancelled():
                        tool_task.cancel()
                        result = json.dumps({"error": "用户取消", "cancelled": True}, ensure_ascii=False)
                        break
                    for evt in get_progress_events():
                        await send_event(ws, evt["type"], evt)
                else:
                    # 正常完成（未 break）
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

                # 自动追踪流水线阶段
                stage_id = TOOL_TO_STAGE.get(func_name)
                print(f"[pipeline] tool={func_name} stage={stage_id}")  # debug
                if stage_id:
                    # 从结果中提取摘要（确保是字符串）
                    summary = ""
                    try:
                        parsed = json.loads(result) if isinstance(result, str) else result
                        if isinstance(parsed, dict):
                            raw = parsed.get("message") or parsed.get("summary") or ""
                            if isinstance(raw, str):
                                summary = raw
                            elif isinstance(raw, dict) and "report_markdown" in raw:
                                summary = str(raw["report_markdown"])[:120]
                            elif not raw and "report_markdown" in parsed:
                                summary = str(parsed["report_markdown"])[:120]
                    except (json.JSONDecodeError, TypeError):
                        pass
                    if not summary:
                        summary = f"执行 {func_name}"

                    _append_run({
                        "runId": f"auto_{uuid.uuid4().hex[:8]}",
                        "stageId": stage_id,
                        "sessionId": session.session_id,
                        "status": "completed",
                        "startedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
                        "toolsUsed": [func_name],
                        "summary": summary,
                    })
                    print(f"[pipeline] WRITTEN stage={stage_id} session={session.session_id}")

                # 拦截 load_conventions
                if func_name == "load_conventions":
                    try:
                        conv_result = json.loads(result)
                        if conv_result.get("combined_context"):
                            set_conventions_context(conv_result["combined_context"])
                            messages[0] = {
                                "role": "system",
                                "content": agent.build_system_prompt(
                                    session.workflow_mode,
                                    agent_mode=current_agent_mode,
                                    workspace_path=workspace_path or None,
                                    workspace_name=workspace_name or None,
                                ),
                            }
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
            llm_duration = (time.time() - llm_start_time) * 1000 if llm_start_time else 0
            # 错误路径：用估算值（真实 token 不可用）
            err_input = prompt_tokens_real or sum(len(str(m.get("content", ""))) for m in messages) * 2
            err_output = completion_tokens_real or 0
            _log_llm_call(session.session_id, model, err_input, err_output, llm_duration, False, thinking, str(e)[:200])
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
    connection_id = uuid.uuid4().hex[:12]

    # 客户端可通过 query 参数传递会话 ID 和用户信息
    params = ws.query_params
    requested_session_id = params.get("sessionId")
    from config import get_agent_runtime_mode
    current_agent_mode = get_agent_runtime_mode()

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
        meta = session_manager.get_session(requested_session_id, agent_mode=current_agent_mode)
        if meta:
            session_id = requested_session_id
            history = session_manager.get_messages(session_id, limit=50)
        else:
            # 指定 ID 无效时复用最近会话，避免刷新/重连时误建新会话
            recent = session_manager.list_sessions(user=user_name or None, agent_mode=current_agent_mode)
            if recent:
                meta = recent[0]
                session_id = meta["sessionId"]
                history = session_manager.get_messages(session_id, limit=50)
            else:
                meta = session_manager.create_session(user=user_name)
                session_id = meta["sessionId"]
                history = []
    else:
        # 无 sessionId：显式新建（例如用户点击「新会话」）
        meta = session_manager.create_session(user=user_name)
        session_id = meta["sessionId"]
        history = []

    session = Session(session_id)
    session.history = history
    sessions[connection_id] = session

    # 设置活跃会话和取消信号
    from progress_hook import set_active_session, set_cancel_event
    set_active_session(session_id)
    set_cancel_event(session.cancel_event)

    # 发送连接确认
    await send_event(ws, "connected", {
        "sessionId": session_id,
        "user": user_name,
        "agentMode": current_agent_mode,
        "workspacePath": meta.get("workspacePath", ""),
        "workspaceName": meta.get("workspaceName", ""),
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

                if session.agent_running:
                    await send_error(ws, request_id, "当前会话正在生成，请等待完成或点击停止")
                    continue

                # 前端可指定 sessionId，须与连接绑定一致
                target_sid = (params.get("sessionId") or session.session_id or "").strip()
                if target_sid and target_sid != session.session_id:
                    bound, bind_err = _bind_ws_session(
                        connection_id, target_sid, current_agent_mode
                    )
                    if bind_err:
                        await send_error(ws, request_id, bind_err)
                        continue
                    session = bound
                    session_id = target_sid

                # 立即返回确认
                await send_response(ws, request_id, {"status": "processing"})

                # 获取前端传来的上下文分割点
                ctx_cutoff = params.get("contextCutoff")
                if ctx_cutoff is not None:
                    session.context_cutoff = int(ctx_cutoff)

                # 获取思考模式开关
                thinking = params.get("thinking", False)

                # 获取附件
                images = params.get("images", [])
                attachments = params.get("attachments", [])

                # 后台运行 Agent，保持 WS 可收 stopGeneration / 断线 cancel
                asyncio.create_task(
                    _run_agent_background(
                        ws,
                        session,
                        content.strip(),
                        context_cutoff=ctx_cutoff,
                        thinking=thinking,
                        images=images,
                        attachments=attachments,
                    )
                )

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
                mode_tools = get_tools_for_mode(current_agent_mode)
                tool_names = [t["function"]["name"] for t in mode_tools]
                await send_response(ws, request_id, {
                    "tools": tool_names,
                    "count": len(tool_names),
                    "agentMode": current_agent_mode,
                })

            elif method == "switchSession":
                target_id = params.get("sessionId", "")
                if not target_id:
                    await send_error(ws, request_id, "sessionId 不能为空")
                    continue

                if session.agent_running:
                    await send_error(ws, request_id, "正在生成回复，无法切换会话")
                    continue

                bound, bind_err = _bind_ws_session(
                    connection_id, target_id, current_agent_mode
                )
                if bind_err:
                    await send_error(ws, request_id, bind_err)
                    continue
                session = bound
                session_id = target_id
                meta = session_manager.get_session(target_id, agent_mode=current_agent_mode) or {}

                await send_response(ws, request_id, {
                    "sessionId": session_id,
                    "messageCount": len(session.history),
                    "workspacePath": meta.get("workspacePath", ""),
                    "workspaceName": meta.get("workspaceName", ""),
                })

            elif method == "stopGeneration":
                # 中断当前 Agent 生成（不断开连接）
                session.cancel_event.set()
                await send_response(ws, request_id, {"status": "stopped"})

            elif method == "respondPermission":
                from tools.permissions import resolve_permission
                req_id = params.get("requestId", "")
                decision = params.get("decision", "deny")
                ok = resolve_permission(req_id, decision)
                await send_response(ws, request_id, {"success": ok})

            else:
                await send_error(ws, request_id, f"未知方法: {method}")

    except WebSocketDisconnect:
        # 触发取消信号，停止正在执行的工具
        session.cancel_event.set()

        session_obj = sessions.get(connection_id)
        owns_session_slot = session_obj is session

        # 空会话自动清理（仅清理当前连接自己的 session 对象）
        if owns_session_slot and len(session.history) == 0:
            session_manager.delete_session(session_id, agent_mode=current_agent_mode)
            sessions.pop(connection_id, None)
            print(f"[WS] 空会话 {session_id} 已自动清理")
        elif owns_session_slot:
            sessions.pop(connection_id, None)
            print(f"[WS] 会话 {session_id} 断开")
        else:
            print(f"[WS] 会话 {session_id} 旧连接断开")

        if owns_session_slot:
            set_active_session(None)
    except Exception as e:
        print(f"[WS] 会话 {session_id} 异常: {e}")
        traceback.print_exc()
        session_obj = sessions.get(connection_id)
        if session_obj is session:
            if len(session.history) == 0:
                session_manager.delete_session(session_id, agent_mode=current_agent_mode)
            sessions.pop(connection_id, None)


# ===== REST 端点（辅助） =====

@app.get("/health")
async def health():
    from config import get_agent_runtime_mode

    return {
        "status": "ok",
        "app": "TAgentLocalRuntime",
        "version": "0.1.0",
        "runtime": "local",
        "agentMode": get_agent_runtime_mode(),
        "ws_sessions": len(sessions),
    }


# ===== REST 端点（会话管理） =====

@app.post("/api/sessions")
async def create_new_session(payload: dict = Body(default={})):
    """创建新会话"""
    meta = session_manager.create_session(
        title=payload.get("title", "新会话"),
        workflow_mode=payload.get("workflowMode", "step_by_step"),
        user=payload.get("user", ""),
        workspace_path=payload.get("workspacePath", ""),
    )
    return meta


@app.get("/api/sessions")
async def list_all_sessions(include_archived: bool = False, user: str = None):
    """获取会话列表（过滤空草稿，可按用户过滤）"""
    from config import get_agent_runtime_mode
    result = session_manager.list_sessions(
        include_archived,
        user=user,
        agent_mode=get_agent_runtime_mode(),
    )
    # 过滤掉 0 消息的草稿会话
    result = [s for s in result if not (s.get("isDraft") and s.get("messageCount", 0) == 0)]
    return {"sessions": result, "count": len(result)}


@app.get("/api/sessions/stats")
async def get_session_stats():
    """获取会话统计"""
    from config import get_agent_runtime_mode
    return session_manager.get_stats(agent_mode=get_agent_runtime_mode())


@app.get("/api/sessions/{session_id}")
async def get_session_detail(session_id: str):
    """获取单个会话详情"""
    from config import get_agent_runtime_mode
    meta = session_manager.get_session(session_id, agent_mode=get_agent_runtime_mode())
    if not meta:
        return {"error": f"会话不存在: {session_id}"}
    return meta


@app.get("/api/sessions/{session_id}/messages")
async def get_session_messages(session_id: str, limit: int = 0):
    """获取会话消息列表"""
    from config import get_agent_runtime_mode
    if not session_manager.get_session(session_id, agent_mode=get_agent_runtime_mode()):
        return {"error": f"会话不存在: {session_id}", "messages": [], "count": 0}
    messages = session_manager.get_messages(session_id, limit)
    return {"messages": messages, "count": len(messages)}


@app.patch("/api/sessions/{session_id}")
async def update_session_meta(session_id: str, payload: dict = Body(...)):
    """更新会话（标题、置顶、归档等）"""
    from config import get_agent_runtime_mode
    meta = session_manager.update_session(session_id, agent_mode=get_agent_runtime_mode(), **payload)
    if not meta:
        return {"error": f"会话不存在: {session_id}"}
    return meta


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    """删除会话"""
    from config import get_agent_runtime_mode
    ok = session_manager.delete_session(session_id, agent_mode=get_agent_runtime_mode())
    return {"success": ok}


@app.post("/api/sessions/search")
async def search_sessions(payload: dict = Body(...)):
    """跨会话搜索"""
    query = payload.get("query", "")
    if not query:
        return {"error": "query 不能为空"}
    from config import get_agent_runtime_mode
    results = session_manager.search_messages(
        query,
        max_results=payload.get("maxResults", 30),
        agent_mode=get_agent_runtime_mode(),
    )
    return {"results": results, "count": len(results)}


@app.get("/api/workspace/tree")
async def get_workspace_tree(session_id: str, max_depth: int = 2, max_items: int = 200):
    """获取会话工作区目录树（只读）"""
    from config import get_agent_runtime_mode
    meta = session_manager.get_session(session_id, agent_mode=get_agent_runtime_mode())
    if not meta:
        return {"error": f"会话不存在: {session_id}", "tree": []}

    workspace_path = meta.get("workspacePath") or ""
    if not workspace_path:
        return {"error": "当前会话未绑定工作区目录", "tree": []}
    if not os.path.isdir(workspace_path):
        return {"error": f"工作区目录不存在: {workspace_path}", "tree": []}

    max_depth = max(0, min(max_depth, 4))
    max_items = max(10, min(max_items, 1000))
    item_count = 0

    def build_node(path: str, depth: int) -> dict | None:
        nonlocal item_count
        if item_count >= max_items:
            return None

        name = os.path.basename(path.rstrip("\\/")) or path
        is_dir = os.path.isdir(path)
        node = {
            "name": name,
            "path": path,
            "type": "directory" if is_dir else "file",
            "children": [],
        }
        item_count += 1

        if is_dir and depth < max_depth:
            try:
                entries = sorted(os.scandir(path), key=lambda e: (not e.is_dir(), e.name.lower()))
            except OSError:
                return node
            for entry in entries:
                if item_count >= max_items:
                    break
                child = build_node(entry.path, depth + 1)
                if child:
                    node["children"].append(child)
        return node

    root = build_node(workspace_path, 0)
    return {
        "sessionId": session_id,
        "workspacePath": workspace_path,
        "maxDepth": max_depth,
        "maxItems": max_items,
        "tree": [root] if root else [],
    }


@app.get("/api/workspace/file")
async def get_workspace_file_preview(session_id: str, file_path: str, max_chars: int = 12000):
    """读取工作区内文件预览（只读文本）"""
    from config import get_agent_runtime_mode
    meta = session_manager.get_session(session_id, agent_mode=get_agent_runtime_mode())
    if not meta:
        return {"error": f"会话不存在: {session_id}"}

    workspace_path = meta.get("workspacePath") or ""
    if not workspace_path or not os.path.isdir(workspace_path):
        return {"error": "当前会话未绑定有效工作区目录"}

    try:
        workspace_abs = os.path.abspath(workspace_path)
        file_abs = os.path.abspath(file_path)
        if os.path.commonpath([workspace_abs, file_abs]) != workspace_abs:
            return {"error": "禁止读取工作区外文件"}
    except ValueError:
        return {"error": "无效文件路径"}

    if not os.path.isfile(file_abs):
        return {"error": "文件不存在"}

    ext = os.path.splitext(file_abs)[1].lower()
    text_exts = {
        ".txt", ".md", ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".env",
        ".py", ".ts", ".tsx", ".js", ".jsx", ".css", ".scss", ".html", ".xml",
        ".sql", ".sh", ".bat", ".ps1", ".csv", ".log",
    }
    if ext and ext not in text_exts:
        return {"error": f"暂不支持该文件类型预览: {ext}"}

    try:
        size = os.path.getsize(file_abs)
    except OSError:
        return {"error": "无法读取文件信息"}
    if size > 1_000_000:
        return {"error": "文件过大（>1MB），请使用本地编辑器查看"}

    max_chars = max(1000, min(max_chars, 50000))
    try:
        with open(file_abs, "r", encoding="utf-8", errors="replace") as f:
            content = f.read(max_chars + 1)
    except OSError as e:
        return {"error": f"读取文件失败: {e}"}

    truncated = len(content) > max_chars
    if truncated:
        content = content[:max_chars]

    return {
        "sessionId": session_id,
        "path": file_abs,
        "name": os.path.basename(file_abs),
        "size": size,
        "truncated": truncated,
        "content": content,
    }


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


# ===== REST 端点（应用配置） =====

@app.get("/api/config/app")
async def get_app_config():
    """获取应用配置（前端本地模式配置）"""
    from config import _get_runtime_app_config
    return _get_runtime_app_config()


@app.post("/api/config/app")
async def save_app_config(payload: dict = Body(...)):
    """保存应用配置（前端本地模式配置）"""
    from config import CONFIGS_DIR
    import json
    import os
    os.makedirs(CONFIGS_DIR, exist_ok=True)
    config_path = os.path.join(CONFIGS_DIR, "app-config.json")
    try:
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ===== REST 端点（用户自定义模型管理） =====

# ========== Provider / 模型配置 API ==========

@app.get("/api/config/providers")
async def get_providers():
    """获取所有 Provider"""
    from config import list_providers, get_active_provider_model
    providers = list_providers()
    active = get_active_provider_model()
    active_provider_id = active.get("provider_id") if active else None
    active_model_id = active.get("model") if active else None
    return {
        "providers": providers,
        "active_provider_id": active_provider_id,
        "active_model_id": active_model_id,
    }

@app.post("/api/config/providers")
async def create_provider(payload: dict = Body(...)):
    """创建新 Provider"""
    from config import add_provider
    name = payload.get("name", "")
    base_url = payload.get("base_url", "")
    api_key = payload.get("api_key", "")
    protocol = payload.get("protocol", "openai")
    extra_headers = payload.get("extra_headers") or {}
    models = payload.get("models", [])
    enabled = payload.get("enabled", True)
    if not name or not base_url:
        return {"success": False, "error": "name 和 base_url 不能为空"}
    return add_provider(
        name=name, base_url=base_url, api_key=api_key,
        protocol=protocol, extra_headers=extra_headers,
        models=models, enabled=enabled
    )

@app.put("/api/config/providers/{provider_id}")
async def modify_provider(provider_id: str, payload: dict = Body(...)):
    """更新 Provider"""
    from config import update_provider
    updates = {k: v for k, v in payload.items() if k not in ("id",)}
    return update_provider(provider_id, updates)

@app.delete("/api/config/providers/{provider_id}")
async def remove_provider(provider_id: str):
    """删除 Provider"""
    from config import delete_provider
    return delete_provider(provider_id)

@app.patch("/api/config/providers/{provider_id}/enabled")
async def toggle_provider(provider_id: str, payload: dict = Body(...)):
    """启用/禁用 Provider"""
    from config import set_provider_enabled
    enabled = payload.get("enabled", True)
    return set_provider_enabled(provider_id, enabled)

@app.post("/api/config/providers/{provider_id}/models")
async def add_model_to_provider(provider_id: str, payload: dict = Body(...)):
    """向 Provider 添加模型"""
    from config import add_model_to_provider as _add
    model_id = payload.get("id", "")
    model_name = payload.get("name", "")
    if not model_id:
        return {"success": False, "error": "模型 id 不能为空"}
    return _add(provider_id, model_id, model_name)

@app.post("/api/config/providers/{provider_id}/discover")
async def discover_provider_models(provider_id: str):
    """用存储的 API Key 发现模型"""
    from config import get_provider
    provider = get_provider(provider_id)
    if not provider:
        return {"success": False, "error": "Provider 不存在"}
    base_url = provider.get("base_url", "").rstrip("/")
    api_key = provider.get("api_key", "")
    # 复用 discover_models 的逻辑
    return await discover_models({"base_url": base_url, "api_key": api_key})

@app.put("/api/config/active-model")
async def set_active_model_endpoint(payload: dict = Body(...)):
    """设置当前选中的模型"""
    from config import set_active_model
    provider_id = payload.get("provider_id", "")
    model_id = payload.get("model_id", "")
    if not provider_id or not model_id:
        return {"success": False, "error": "provider_id 和 model_id 不能为空"}
    return set_active_model(provider_id, model_id)

@app.delete("/api/config/providers/{provider_id}/models/{model_id}")
async def remove_model_from_provider(provider_id: str, model_id: str):
    """从 Provider 移除模型"""
    from config import remove_model_from_provider as _remove
    return _remove(provider_id, model_id)

@app.patch("/api/config/providers/{provider_id}/models/{model_id}/enabled")
async def toggle_model(provider_id: str, model_id: str, payload: dict = Body(...)):
    """启用/禁用 Provider 下的模型"""
    from config import set_model_enabled
    enabled = payload.get("enabled", True)
    return set_model_enabled(provider_id, model_id, enabled)


@app.post("/api/models/discover")
async def discover_models(payload: dict = Body(...)):
    """从 base_url 自动发现可用模型列表"""
    base_url = payload.get("base_url", "").rstrip("/")
    api_key = payload.get("api_key", "")
    if not base_url:
        return {"success": False, "error": "请填写 Base URL"}

    import httpx
    # 尝试多个常见端点
    endpoints = [f"{base_url}/v1/models", f"{base_url}/models"]
    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    for url in endpoints:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    models = []
                    # OpenAI 格式: { "data": [{"id": "model-name", ...}] }
                    for m in data.get("data", data if isinstance(data, list) else []):
                        model_id = m.get("id", "")
                        if model_id:
                            models.append({
                                "id": model_id,
                                "name": m.get("name", model_id),
                            })
                    if models:
                        # 按名称排序
                        models.sort(key=lambda x: x["name"])
                        return {"success": True, "models": models}
        except Exception:
            continue

    return {"success": False, "error": "无法获取模型列表，请检查 Base URL 和 API Key 是否正确"}


@app.post("/api/wechat/message")
async def wechat_message(payload: dict = Body(...)):
    """接收微信 Bridge 转发的消息，调用 Agent 处理并返回回复"""
    text = payload.get("text", "")
    from_user = payload.get("from", "")

    if not text.strip():
        return {"reply": ""}

    print(f"[WeChat] 收到消息: {text[:100]} (from: {from_user})")

    try:
        from agent_main import agent_loop, build_system_prompt
        from config import get_llm_config
        from openai import OpenAI

        config = get_llm_config()
        client = OpenAI(
            base_url=config["base_url"],
            api_key=config["api_key"],
            timeout=120.0,
        )

        # 使用简化的 system prompt
        system_prompt = """你是 TAgent，一个游戏技术美术 AI 助手。
你可以帮助用户：分析资产、检查规范、搜索资产、审核资产等。
用简洁的中文回复。"""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
        ]

        # 同步调用（微信 Bridge 是同步的）
        response = client.chat.completions.create(
            model=config["model"],
            messages=messages,
            temperature=0.7,
            max_tokens=2000,
        )

        reply = response.choices[0].message.content or "(无回复)"
        print(f"[WeChat] 回复: {reply[:100]}")

        return {"reply": reply}

    except Exception as e:
        print(f"[WeChat] 处理失败: {e}")
        return {"reply": f"处理出错: {str(e)[:100]}"}


# ===== REST 端点（UE5 插件管理） =====

@app.get("/api/ue5/plugin")
async def check_ue5_plugin(project_path: str = ""):
    """检查 UE5 项目是否安装了 TAAssetBridge 插件"""
    if not project_path:
        # 尝试从 config 获取
        try:
            from config import UE5_PROJECT_PATH
            project_path = UE5_PROJECT_PATH
        except (ImportError, AttributeError):
            return {"installed": False, "error": "未配置 UE5 项目路径"}

    from tools.extensions.ue5_bridge import check_plugin_installed
    return check_plugin_installed(project_path)


@app.post("/api/ue5/plugin/install")
async def install_ue5_plugin(payload: dict = Body(...)):
    """安装 TAAssetBridge 插件到 UE5 项目"""
    project_path = payload.get("project_path", "")
    if not project_path:
        return {"error": "project_path 不能为空"}

    from tools.extensions.ue5_bridge import install_plugin
    return install_plugin(project_path)


@app.get("/api/ue5/ping")
async def ue5_ping():
    """测试 UE5 连接"""
    from tools.extensions.ue5_bridge import ue5_ping as _ping
    return _ping()


# ===== REST 端点（工具管理） =====

@app.get("/api/tools")
async def list_all_tools():
    """列出所有工具（按层级分组：core/extension/mcp/plugin）"""
    from config import get_agent_runtime_mode
    from tools.registry import TOOL_TIER, get_tools_for_mode, get_tier_summary_for_mode

    mode = get_agent_runtime_mode()
    mode_tools = get_tools_for_mode(mode)
    tools_info = []
    for schema in mode_tools:
        func_def = schema.get("function", {})
        name = func_def.get("name", "")
        tools_info.append({
            "name": name,
            "description": func_def.get("description", ""),
            "category": _categorize_tool(name),
            "tier": TOOL_TIER.get(name, "core"),
        })
    return {
        "tools": tools_info,
        "count": len(tools_info),
        "agentMode": mode,
        "tier_summary": get_tier_summary_for_mode(mode),
    }


def _categorize_tool(name: str) -> str:
    """根据工具名推断分类"""
    if name.startswith("workspace_"):
        return "工作区"
    if name.startswith("mcp__") or name.startswith("mcp_"):
        return "MCP"
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
    namespace = get_memory_namespace()
    memory_dir = os.path.join(MEMORY_DIR, namespace)
    os.makedirs(memory_dir, exist_ok=True)
    cleared = []
    for fname in ["corrections.jsonl", "rules.json", "profile.md", "index.md", "facts.md"]:
        fpath = os.path.join(memory_dir, fname)
        if os.path.exists(fpath):
            os.remove(fpath)
            cleared.append(fname)
    return {
        "success": True,
        "namespace": namespace,
        "cleared": cleared,
        "message": f"[{namespace}] 已清空: {', '.join(cleared)}",
    }


# ===== REST 端点（提示词管理） =====

@app.get("/api/config/prompt")
async def get_prompt():
    """获取当前 system prompt"""
    from agent_main import build_system_prompt
    prompt = build_system_prompt()
    return {"prompt": prompt, "length": len(prompt)}


# ===== REST 端点（用量统计） =====

# 用量日志文件
_USAGE_LOG_FILE = os.path.join(
    os.path.dirname(MEMORY_DIR), "usage_log.jsonl"
)


def _log_llm_call(
    session_id: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    duration_ms: float,
    success: bool,
    thinking: bool = False,
    error: str = "",
):
    """追加一条 LLM 调用日志"""
    entry = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "session": session_id,
        "model": model,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "duration_ms": round(duration_ms),
        "success": success,
        "thinking": thinking,
    }
    if error:
        entry["error"] = error
    try:
        os.makedirs(os.path.dirname(_USAGE_LOG_FILE), exist_ok=True)
        with open(_USAGE_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        pass


@app.get("/api/usage/logs")
async def get_usage_logs(limit: int = 100, offset: int = 0):
    """获取 LLM 调用日志"""
    if not os.path.exists(_USAGE_LOG_FILE):
        return {"logs": [], "total": 0}
    try:
        with open(_USAGE_LOG_FILE, "r", encoding="utf-8") as f:
            lines = f.readlines()
        lines.reverse()  # 最新的在前
        total = len(lines)
        logs = []
        for line in lines[offset:offset + limit]:
            line = line.strip()
            if line:
                try:
                    logs.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        return {"logs": logs, "total": total}
    except Exception:
        return {"logs": [], "total": 0}


@app.delete("/api/usage/logs")
async def clear_usage_logs():
    """清空用量日志"""
    try:
        if os.path.exists(_USAGE_LOG_FILE):
            os.remove(_USAGE_LOG_FILE)
    except Exception:
        pass
    return {"success": True}


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


# ===== REST 端点（规范管理） =====

@app.get("/api/conventions")
async def get_conventions():
    """获取已加载的规范文档"""
    from conventions.context import get_conventions_context
    from config import NAMING_CONVENTIONS, MESH_BUDGETS, TEXTURE_BUDGETS

    loaded_content = get_conventions_context()

    return {
        "loaded": bool(loaded_content),
        "content_length": len(loaded_content) if loaded_content else 0,
        "content_preview": loaded_content[:500] if loaded_content else "",
        "default_rules": {
            "naming_conventions": NAMING_CONVENTIONS,
            "mesh_budgets": MESH_BUDGETS,
            "texture_budgets": TEXTURE_BUDGETS,
        },
    }


@app.post("/api/conventions/clear")
async def clear_conventions():
    """卸载已加载的规范文档"""
    from conventions.context import set_conventions_context
    set_conventions_context("")
    return {"success": True, "message": "已卸载规范文档"}


# ===== REST 端点（权限管理） =====

# 权限配置（运行时内存）
_permission_config = {
    "mode": "ask",  # "safe" | "ask" | "allow-all"
    "tool_permissions": {},  # {tool_name: "safe"|"ask"|"allow-all"}
}


def _permissions_response() -> dict:
    from config import get_agent_runtime_mode
    from tools.registry import get_tools_for_mode

    mode = get_agent_runtime_mode()
    allowed_names = [s["function"]["name"] for s in get_tools_for_mode(mode)]
    default_perm = _permission_config["mode"]
    tools = {}
    for name in allowed_names:
        tools[name] = _permission_config["tool_permissions"].get(name, default_perm)
    return {
        "global_mode": _permission_config["mode"],
        "mode": _permission_config["mode"],
        "tools": tools,
        "tool_permissions": tools,
        "agentMode": mode,
    }


@app.get("/api/permissions")
async def get_permissions():
    """获取权限配置（工具列表仅含当前工作台模式可用工具）"""
    return _permissions_response()


@app.post("/api/permissions")
async def update_permissions(payload: dict = Body(...)):
    """更新权限配置"""
    global_mode = payload.get("global_mode") or payload.get("mode")
    if global_mode:
        _permission_config["mode"] = global_mode
    tools = payload.get("tools")
    if tools is None:
        tools = payload.get("tool_permissions")
    if tools is not None:
        from tools.registry import get_tools_for_mode
        from config import get_agent_runtime_mode

        allowed = {s["function"]["name"] for s in get_tools_for_mode(get_agent_runtime_mode())}
        for name, perm in tools.items():
            if name in allowed:
                _permission_config["tool_permissions"][name] = perm
    return {"success": True, **_permissions_response()}


@app.get("/api/permissions/whitelist")
async def get_permanent_whitelist():
    """获取永久白名单"""
    from tools.permissions import list_permanent
    return {"items": list_permanent()}


@app.post("/api/permissions/whitelist")
async def add_permanent_whitelist(payload: dict = Body(...)):
    """添加永久白名单项"""
    from tools.permissions import add_permanent
    add_permanent(payload.get("tool", ""), payload.get("pattern", "*"))
    return {"success": True}


@app.delete("/api/permissions/whitelist")
async def remove_permanent_whitelist(payload: dict = Body(...)):
    """删除永久白名单项"""
    from tools.permissions import remove_permanent
    remove_permanent(payload.get("tool", ""), payload.get("pattern", "*"))
    return {"success": True}


# ===== REST 端点（MCP 服务器管理） =====

@app.get("/api/mcp")
async def get_mcp_status():
    """获取 MCP 服务器连接状态"""
    try:
        from tools.mcp_bridge import get_mcp_status
        return {"servers": get_mcp_status()}
    except ImportError:
        return {"servers": {}, "error": "MCP 未安装"}
    except Exception as e:
        return {"servers": {}, "error": str(e)}


@app.get("/api/mcp/servers")
async def get_mcp_servers():
    """获取 MCP 服务器配置列表（从 mcp.json 读取）"""
    try:
        from tools.mcp_bridge import get_mcp_servers
        return {"servers": get_mcp_servers()}
    except Exception as e:
        return {"servers": {}, "error": str(e)}


@app.post("/api/mcp/servers")
async def add_mcp_server(payload: dict = Body(...)):
    """添加 MCP 服务器"""
    name = payload.get("name", "")
    cfg = payload.get("config", {})
    if not name:
        return {"success": False, "error": "服务器名称不能为空"}
    if not cfg.get("command"):
        return {"success": False, "error": "command 不能为空"}
    from tools.mcp_bridge import add_mcp_server
    return add_mcp_server(name, cfg)


@app.patch("/api/mcp/servers/{name}")
async def update_mcp_server(name: str, payload: dict = Body(...)):
    """更新 MCP 服务器配置（或切换 enabled）"""
    from tools.mcp_bridge import update_mcp_server
    return update_mcp_server(name, payload)


@app.delete("/api/mcp/servers/{name}")
async def delete_mcp_server(name: str):
    """删除 MCP 服务器"""
    from tools.mcp_bridge import remove_mcp_server
    return remove_mcp_server(name)


@app.post("/api/mcp/test")
async def mcp_test_connection(payload: dict = Body(...)):
    """测试 MCP 服务器连接（不保存配置，仅验证连通性和发现工具）"""
    cfg = payload.get("config", {})
    if not cfg.get("command"):
        return {"success": False, "error": "command 不能为空"}
    try:
        from tools.mcp_bridge import test_connection
        return test_connection(cfg)
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/mcp/reload")
async def mcp_reload():
    """重新加载所有 MCP 服务器"""
    try:
        from tools.mcp_bridge import reload_mcp_servers
        return reload_mcp_servers()
    except Exception as e:
        return {"success": False, "error": str(e)}


# ===== REST 端点（活动日志 + 流水线配置） =====

@app.get("/api/activity")
async def get_activity_log(limit: int = 50):
    """获取最近的工具调用活动日志"""
    try:
        # 获取最近的会话
        from config import get_agent_runtime_mode
        sessions = session_manager.list_sessions(agent_mode=get_agent_runtime_mode())
        if not sessions:
            return {"activities": [], "count": 0}

        # 从最近的会话中提取工具调用
        activities = []
        for session in sessions[:5]:  # 最近 5 个会话
            messages = session_manager.get_messages(session["sessionId"])
            for msg in messages:
                if msg.get("role") == "assistant" and msg.get("toolCalls"):
                    for tc in msg["toolCalls"]:
                        func = tc.get("function", {})
                        activities.append({
                            "type": "tool_call",
                            "tool": func.get("name", ""),
                            "args": func.get("arguments", {}),
                            "timestamp": msg.get("timestamp", ""),
                            "sessionId": session["sessionId"],
                            "sessionTitle": session.get("title", ""),
                        })
                elif msg.get("role") == "user":
                    activities.append({
                        "type": "user_message",
                        "content": msg.get("content", "")[:100],
                        "timestamp": msg.get("timestamp", ""),
                        "sessionId": session["sessionId"],
                    })

        # 按时间排序，取最新的
        activities.sort(key=lambda a: a.get("timestamp", ""), reverse=True)
        return {"activities": activities[:limit], "count": len(activities)}
    except Exception as e:
        return {"activities": [], "count": 0, "error": str(e)}


@app.get("/api/pipeline")
async def get_pipeline_config():
    """获取流水线配置"""
    config_path = os.path.join(os.path.dirname(MEMORY_DIR), "pipeline.json")
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    # 默认流水线配置
    return {
        "version": 1,
        "core_stages": [
            {"id": "scan", "label": "目录扫描", "icon": "FolderSearch", "description": "扫描资产目录，发现文件", "prompt": "扫描目录 {path}，列出所有资产文件，统计文件类型分布", "order": 1},
            {"id": "analyze", "label": "AI 分析", "icon": "Brain", "description": "推断分类、材质、风格", "prompt": "对 {path} 下的所有资产进行 AI 推断，分析分类、材质、风格、状态", "order": 2},
            {"id": "review", "label": "人工审核", "icon": "FileCheck", "description": "审核 AI 推断结果", "prompt": "展示 {path} 下待审核资产列表，等待用户逐个或批量确认", "order": 3},
            {"id": "intake", "label": "资产入库", "icon": "Package", "description": "导入项目引擎", "prompt": "将 {path} 下已审核通过的资产导入项目引擎", "order": 4},
        ],
        "custom_stages": [],
    }


@app.post("/api/pipeline")
async def update_pipeline_config(payload: dict = Body(...)):
    """更新流水线配置（添加/修改自定义阶段）"""
    config_path = os.path.join(os.path.dirname(MEMORY_DIR), "pipeline.json")
    os.makedirs(os.path.dirname(config_path), exist_ok=True)

    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    return {"success": True, "message": "流水线配置已更新"}


# 流水线执行记录
_pipeline_runs_path = PIPELINE_RUNS_FILE


def _append_run(run: dict):
    """追加执行记录到 JSONL"""
    os.makedirs(os.path.dirname(_pipeline_runs_path), exist_ok=True)
    with open(_pipeline_runs_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(run, ensure_ascii=False) + "\n")


def _load_runs(limit: int = 50, stage_id: str = None, session_id: str = None) -> list:
    """读取执行记录"""
    if not os.path.exists(_pipeline_runs_path):
        return []
    runs = []
    with open(_pipeline_runs_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    runs.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    if stage_id:
        runs = [r for r in runs if r.get("stageId") == stage_id]
    if session_id:
        runs = [r for r in runs if r.get("sessionId") == session_id]
    runs.sort(key=lambda r: r.get("startedAt", ""), reverse=True)
    return runs[:limit]


@app.post("/api/pipeline/run")
async def run_pipeline_stage(payload: dict = Body(...)):
    """执行流水线阶段（发送 prompt 给 Agent）"""
    stage_id = payload.get("stageId", "")
    variables = payload.get("variables", {})
    session_id = payload.get("sessionId")

    if not stage_id:
        return {"error": "stageId 不能为空"}

    # 读取流水线配置，找到对应阶段的 prompt
    config = await get_pipeline_config()
    stage = None
    for s in config.get("core_stages", []) + config.get("custom_stages", []):
        if s.get("id") == stage_id:
            stage = s
            break

    if not stage:
        return {"error": f"未找到阶段: {stage_id}"}

    prompt = stage.get("prompt", stage.get("description", ""))
    # 替换变量
    for key, value in variables.items():
        prompt = prompt.replace(f"{{{key}}}", str(value))

    # 如果没有自定义 prompt，使用默认的阶段指令
    if not prompt or prompt == stage.get("description", ""):
        default_prompts = {
            "scan": f"扫描目录 {variables.get('path', '')}，列出所有资产文件，统计文件类型分布",
            "analyze": f"对 {variables.get('path', '')} 下的资产进行 AI 推断，分析分类、材质、风格、状态",
            "review": "展示待审核资产列表，等待用户逐个或批量确认",
            "intake": "将已审核通过的资产导入项目引擎",
        }
        prompt = default_prompts.get(stage_id, f"执行 {stage['label']}")

    # 通过 WebSocket 发送给 Agent 执行
    # 找到当前活跃的 WebSocket 会话
    target_session_id = session_id
    if not target_session_id:
        # 使用最近的会话
        from config import get_agent_runtime_mode
        recent_sessions = session_manager.list_sessions(agent_mode=get_agent_runtime_mode())
        if recent_sessions:
            target_session_id = recent_sessions[0]["sessionId"]

    if not target_session_id:
        return {"error": "没有活跃的会话"}

    # 记录执行
    run_id = f"run_{uuid.uuid4().hex[:8]}"
    run_record = {
        "runId": run_id,
        "stageId": stage_id,
        "sessionId": target_session_id,
        "status": "running",
        "startedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "prompt": prompt,
        "variables": variables,
    }
    _append_run(run_record)

    # 将 prompt 作为用户消息发送给 Agent
    session_manager.append_message(target_session_id, {
        "role": "user",
        "content": prompt,
    })

    return {
        "success": True,
        "runId": run_id,
        "stageId": stage_id,
        "sessionId": target_session_id,
        "prompt": prompt,
        "message": f"已发送给 Agent 执行: {stage['label']}",
    }


@app.get("/api/pipeline/runs")
async def get_pipeline_runs(stageId: str = None, sessionId: str = None, limit: int = 20):
    """获取执行记录"""
    runs = _load_runs(limit=limit, stage_id=stageId, session_id=sessionId)
    return {"runs": runs, "count": len(runs)}


@app.get("/api/pipeline/state")
async def get_pipeline_state():
    """获取流水线各阶段状态"""
    config = await get_pipeline_config()
    runs = _load_runs(limit=100)

    # 合并 core_stages 和 custom_stages
    all_stages = config.get("core_stages", []) + config.get("custom_stages", [])

    stage_states = {}
    for stage in all_stages:
        sid = stage["id"]
        # 找该阶段最近的执行记录
        stage_runs = [r for r in runs if r.get("stageId") == sid]
        if stage_runs:
            latest = stage_runs[0]
            status = latest.get("status", "pending")
        else:
            status = "pending"
        stage_states[sid] = {
            "status": status,
            "lastRun": stage_runs[0] if stage_runs else None,
            "runCount": len(stage_runs),
        }

    return {
        "stages": all_stages,
        "states": stage_states,
        "totalRuns": len(runs),
    }


# ===== REST 端点（资产数据 — 直接查 SQLite） =====

def _get_tag_store():
    """获取 TagStore 实例（延迟导入）"""
    from tags.store import TagStore
    from config import TAG_STORE_DIR
    return TagStore(TAG_STORE_DIR)


def _asset_brief(tags) -> dict:
    """资产列表项摘要（用于匹配结果）"""
    from tags.type_utils import infer_asset_type
    resolved = infer_asset_type(tags.asset_name, tags.file_path, tags.asset_type)
    return {
        "asset_id": tags.asset_id,
        "asset_name": tags.asset_name,
        "file_path": tags.file_path,
        "asset_type": resolved,
        "status": tags.meta.status,
        "texture_maps": tags.textures.count if tags.textures else 0,
    }


def _find_matched_assets(tags, store, *, want_texture: bool) -> list[dict]:
    """按 asset_base_name 查找可能匹配的贴图或模型。"""
    from tags.naming_utils import asset_base_name
    from tags.type_utils import infer_asset_type

    base = asset_base_name(tags.asset_name)
    if not base:
        return []

    matched: list[dict] = []
    for candidate in store.search({}):
        if candidate.asset_id == tags.asset_id:
            continue
        ctype = infer_asset_type(candidate.asset_name, candidate.file_path, candidate.asset_type)
        if want_texture:
            if ctype != "texture":
                continue
        elif ctype == "texture":
            continue
        if asset_base_name(candidate.asset_name) != base:
            continue
        matched.append(_asset_brief(candidate))

    matched.sort(key=lambda item: item["asset_name"].lower())
    return matched


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
        from tags.naming_utils import asset_base_name
        from tags.type_utils import infer_asset_type

        store = _get_tag_store()
        tags = store.load(asset_id)
        if tags is None:
            return {"error": f"未找到资产: {asset_id}"}

        data = tags.to_dict()
        data["asset_base_name"] = asset_base_name(tags.asset_name)
        resolved_type = infer_asset_type(tags.asset_name, tags.file_path, tags.asset_type)
        data["asset_type"] = resolved_type or data.get("asset_type", "")

        if resolved_type == "texture":
            data["matched_meshes"] = _find_matched_assets(tags, store, want_texture=False)
        else:
            data["matched_textures"] = _find_matched_assets(tags, store, want_texture=True)

        return data
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/assets/{asset_id}/file")
async def download_asset_file(asset_id: str):
    """下载资产原始文件"""
    from pathlib import Path
    try:
        store = _get_tag_store()
        tags = store.load(asset_id)
        if tags is None:
            return {"error": f"未找到资产: {asset_id}"}
        file_path = Path(tags.file_path)
        if not file_path.exists():
            return {"error": f"文件不存在: {tags.file_path}"}
        return FileResponse(
            path=str(file_path),
            filename=file_path.name,
            media_type="application/octet-stream",
        )
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/reviews/pending")
async def get_pending_reviews(limit: int = 100):
    """获取待审核资产（使用 review.py 的分类审核逻辑）"""
    try:
        from tools.core.review import get_pending_reviews as _get_reviews
        result = _get_reviews(confidence_threshold=0.9, include_animation=False)
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}


@app.get("/api/intake/approved")
async def list_approved_for_intake():
    """获取已审核通过、可入库的资产列表"""
    try:
        from tags.type_utils import infer_asset_type
        store = _get_tag_store()
        assets = store.search({"status": "approved"})
        items = []
        for tags in assets:
            meta = tags.meta
            resolved_type = infer_asset_type(
                asset_name=tags.asset_name,
                file_path=tags.file_path,
                asset_type=tags.asset_type,
            )
            items.append({
                "asset_id": tags.asset_id,
                "asset_name": tags.asset_name,
                "file_path": tags.file_path,
                "asset_type": resolved_type,
                "category": tags.category.category if tags.category else "",
                "tri_count": tags.mesh.tri_count if tags.mesh else 0,
                "target_engine_path": getattr(meta, "target_engine_path", "") or "",
            })
        return {"count": len(items), "assets": items}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"count": 0, "assets": [], "error": str(e)}


@app.get("/api/intake/project-configs")
async def list_intake_project_configs():
    """列出可用的项目配置（入库命名/路径规则）"""
    try:
        from core.project_config import list_project_configs
        return {"configs": list_project_configs()}
    except Exception as e:
        return {"configs": [], "error": str(e)}


@app.post("/api/intake/preview")
async def preview_intake(payload: dict = Body(...)):
    """试运行入库：预览规范名称与目标路径，不写库"""
    asset_ids = payload.get("asset_ids") or []
    target_engine_dir = (payload.get("target_engine_dir") or "").strip()
    project_config_name = payload.get("project_config_name") or None

    if not asset_ids:
        return {"error": "请选择至少一个资产"}
    if not target_engine_dir:
        return {"error": "请填写 UE Content 目录"}

    try:
        from tools.core.intake import intake_batch
        return intake_batch(
            asset_ids=asset_ids,
            target_engine_dir=target_engine_dir,
            project_config_name=project_config_name,
            dry_run=True,
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}


@app.post("/api/intake/run")
async def run_intake(payload: dict = Body(...)):
    """执行入库：更新资产记录并生成 UE 导入清单"""
    asset_ids = payload.get("asset_ids") or []
    target_engine_dir = (payload.get("target_engine_dir") or "").strip()
    project_config_name = payload.get("project_config_name") or None

    if not asset_ids:
        return {"error": "请选择至少一个资产"}
    if not target_engine_dir:
        return {"error": "请填写 UE Content 目录"}

    try:
        from tools.core.intake import intake_batch
        return intake_batch(
            asset_ids=asset_ids,
            target_engine_dir=target_engine_dir,
            project_config_name=project_config_name,
            dry_run=False,
        )
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
            "SELECT asset_id, asset_name, asset_type, category, analyzed_at FROM assets WHERE analyzed_at != '' ORDER BY analyzed_at DESC LIMIT 10"
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
        from config import get_agent_runtime_mode
        from tools.core.memory_llm_tools import get_memory_stats as _get_stats

        result = _get_stats()
        if isinstance(result, dict) and "error" not in result:
            result["agentMode"] = get_agent_runtime_mode()
        return result
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/memory/profile")
async def get_memory_profile():
    """获取当前模式 index / facts（设置页预览）"""
    try:
        from config import get_agent_runtime_mode, get_memory_namespace
        from tools.core.memory_llm_tools import get_memory_provider

        memory = get_memory_provider()
        ns = get_memory_namespace()
        if not memory:
            return {
                "error": "记忆系统未初始化",
                "index": "",
                "facts": "",
                "content": "",
                "namespace": ns,
            }

        index = ""
        facts = ""
        if hasattr(memory, "get_memory_index"):
            index = memory.get_memory_index() or ""
        if hasattr(memory, "get_memory_facts"):
            facts = memory.get_memory_facts() or ""
        if not index and not facts:
            legacy = memory.get_project_profile() or ""
            if legacy and not hasattr(memory, "get_memory_facts"):
                facts = legacy

        return {
            "index": index,
            "facts": facts,
            "content": facts,
            "namespace": ns,
            "agentMode": get_agent_runtime_mode(),
            "layout_version": 1,
        }
    except Exception as e:
        return {"error": str(e), "index": "", "facts": "", "content": ""}


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
        from config import TAG_STORE_DIR
        preview_dir = os.path.join(TAG_STORE_DIR, "previews")
        preview_path = os.path.join(preview_dir, f"{asset_id}.png")
        if os.path.isfile(preview_path):
            return FileResponse(preview_path, media_type='image/png')

        return {"error": "暂无预览", "type": "model", "file_ext": ext}

    except Exception as e:
        return {"error": str(e)}


@app.post("/api/preview/{asset_id}/render")
async def render_asset_preview_api(asset_id: str):
    """生成 FBX 模型预览图（调用 Blender 渲染）"""
    try:
        store = _get_tag_store()
        tags = store.load(asset_id)
        if tags is None:
            return {"error": "资产不存在"}

        # 只有有面数的模型才渲染
        if tags.mesh.tri_count <= 0:
            return {"error": "无网格数据，跳过渲染"}

        if tags.asset_type in ("animation", "texture", "material"):
            return {"error": f"资产类型 {tags.asset_type} 不支持渲染"}

        # 调用 Blender 渲染
        from tools.core.renderer import render_asset_preview
        result = render_asset_preview(tags.file_path)

        if result.get("success"):
            # 复制预览图到 tag_store/previews/
            from config import TAG_STORE_DIR
            preview_dir = os.path.join(TAG_STORE_DIR, "previews")
            os.makedirs(preview_dir, exist_ok=True)
            dst_path = os.path.join(preview_dir, f"{asset_id}.png")

            import shutil
            src_images = result.get("images", [])
            if src_images:
                # images 可能是 [{"angle": "front", "path": "..."}] 或 ["path"]
                first = src_images[0]
                src_path = first.get("path") if isinstance(first, dict) else first
                if src_path and os.path.isfile(src_path):
                    shutil.copy2(src_path, dst_path)
                    return {"success": True, "message": "预览图已生成"}
                else:
                    return {"error": "渲染完成但未找到图片文件"}
            else:
                return {"error": "渲染完成但未找到图片文件"}
        else:
            return {"error": result.get("error", "渲染失败")}

    except Exception as e:
        return {"error": str(e)}


# ===== 启动 =====

if __name__ == "__main__":
    runtime_host = os.environ.get("TAGENT_RUNTIME_HOST", "0.0.0.0")
    try:
        runtime_port = int(os.environ.get("TAGENT_RUNTIME_PORT", "8080"))
    except ValueError:
        runtime_port = 8080

    print("=" * 50)
    print("  TAgent WebSocket Server")
    print(f"  ws://localhost:{runtime_port}/ws")
    print("=" * 50)

    # 初始化记忆系统（使用统一路径配置）
    if HAS_MEMORY:
        try:
            namespace = get_memory_namespace()
            provider = FileMemoryProvider(namespace=namespace)
            set_memory_provider(provider)
            print(f"  记忆系统: {MEMORY_DIR}/{namespace}")
        except Exception as e:
            print(f"  记忆系统: 初始化失败 ({e})")

    # 初始化会话管理器（使用统一路径配置）
    session_manager.init()
    from config import get_agent_runtime_mode
    stats = session_manager.get_stats(agent_mode=get_agent_runtime_mode())
    print(f"  会话管理: {stats['active_sessions']} 个活跃会话, {stats['total_messages']} 条消息")

    # 注入分析进度回调
    from progress_hook import patch_analyzer_progress
    patch_analyzer_progress()

    uvicorn.run(app, host=runtime_host, port=runtime_port)
