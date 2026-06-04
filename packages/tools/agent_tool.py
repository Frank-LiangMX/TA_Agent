"""Agent 工具实现 + SubAgentOrchestrator。

Agent 工具是一个『任务委派』工具，被 parent agent 调用时启动一个 SubAgentOrchestrator，
内部跑一个受控的子 agent 循环（复用 backend/agent_main.py 的 agent_loop）。
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Literal

SubAgentStatus = Literal["completed", "error", "stopped", "running"]


@dataclass
class SubAgentResult:
    task_id: str
    status: SubAgentStatus
    result_preview: str
    total_steps: int = 0
    total_tokens_in: int = 0
    total_tokens_out: int = 0
    duration_ms: int = 0
    error: str | None = None


@dataclass
class SubAgentOrchestrator:
    subagent_type: str
    prompt: str
    description: str
    parent_session_id: str
    run_in_background: bool = False
    task_id: str = field(default_factory=lambda: f"subagent-{uuid.uuid4().hex[:8]}")
    created_at_ms: int = field(default_factory=lambda: int(time.time() * 1000))

    def run(self) -> SubAgentResult | str:
        """同步路径返回 SubAgentResult；后台路径返回 task_id 字符串。"""
        if self.run_in_background:
            # Phase 3 再实现
            return self.task_id
        return self._run_loop()

    def _run_loop(self) -> SubAgentResult:
        """运行一次完整的子 agent 循环，捕获结果。"""
        import threading
        from backend.agent_main import agent_loop, build_system_prompt
        from backend.config import get_subagent_model
        from packages.tools.agent_logging import log_subagent_run

        start = time.time()
        interrupt = threading.Event()

        def _finalize(result: SubAgentResult) -> SubAgentResult:
            """统一记录日志并返回。"""
            log_subagent_run(
                session_id=self.parent_session_id,
                subagent_type=self.subagent_type,
                task_id=self.task_id,
                model=get_subagent_model(self.subagent_type),
                run_in_background=self.run_in_background,
                status=result.status,
                total_steps=result.total_steps,
                total_tokens_in=result.total_tokens_in,
                total_tokens_out=result.total_tokens_out,
                duration_ms=result.duration_ms,
                error=result.error,
            )
            return result

        # 构造子 agent 的 system prompt：base + subagent 专属 prompt
        from packages.tools.subagents import get_subagent_spec
        spec = get_subagent_spec(self.subagent_type)
        if spec is None:
            return _finalize(SubAgentResult(
                task_id=self.task_id,
                status="error",
                result_preview=f"未知 subagent_type: {self.subagent_type}",
                error="unknown_subagent_type",
                duration_ms=int((time.time() - start) * 1000),
            ))

        base_prompt = build_system_prompt(workflow_mode="auto", agent_mode="general")
        subagent_system = f"{base_prompt}\n\n---\n\n# 你的子角色任务\n\n{spec.system_prompt}\n\n请只完成子角色任务，不要越界调用任何写操作或 parent-only 工具。"

        # 隔离 history：子 agent 全新开始
        history: list = []
        messages = [
            {"role": "system", "content": subagent_system},
            {"role": "user", "content": self.prompt},
        ]

        # TODO Phase 2 进度事件接入：subagent_tool / subagent_progress
        try:
            final_text, history = agent_loop(
                user_message=self.prompt,
                history=history,
                workflow_mode="auto",
                interrupt_event=interrupt,
                context_cutoff=0,
            )
        except Exception as e:
            return _finalize(SubAgentResult(
                task_id=self.task_id,
                status="error",
                result_preview="",
                error=str(e)[:500],
                duration_ms=int((time.time() - start) * 1000),
            ))

        # 截断到 4000 字符
        preview = (final_text or "")[:4000]
        if len(final_text or "") > 4000:
            preview += f"\n... (截断，共 {len(final_text)} 字符)"

        # 粗略统计 step 数：history 中 assistant 出现次数
        steps = sum(1 for m in history if m.get("role") == "assistant")

        return _finalize(SubAgentResult(
            task_id=self.task_id,
            status="completed",
            result_preview=preview,
            total_steps=steps,
            total_tokens_in=0,  # TODO Phase 2 从 llm_calls.jsonl 取
            total_tokens_out=0,
            duration_ms=int((time.time() - start) * 1000),
        ))


# ========== Agent 工具（OpenAI function-calling 格式）==========
# 只在 general 模式注册；TA 模式不暴露

AGENT_TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "Agent",
        "description": (
            "委派任务给一个专业子 agent 处理。子 agent 拥有独立的上下文、工具集和模型，"
            "适合拆解大型任务。返回的是子 agent 产出的简洁摘要（最多 4000 字符）。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "subagent_type": {
                    "type": "string",
                    "enum": ["explorer", "researcher", "code-reviewer"],
                    "description": "子 agent 类型",
                },
                "prompt": {
                    "type": "string",
                    "description": (
                        "清晰描述子 agent 要完成的任务。包含必要上下文；"
                        "不要假设子 agent 知道 parent 的历史。"
                    ),
                },
                "description": {
                    "type": "string",
                    "maxLength": 200,
                    "description": "5-10 字的任务简述，用于 UI 和日志展示",
                },
                "run_in_background": {
                    "type": "boolean",
                    "default": False,
                    "description": (
                        "true 时立即返回 task_id，parent 继续干活；"
                        "之后用 TaskOutput 取结果。"
                    ),
                },
            },
            "required": ["subagent_type", "prompt", "description"],
        },
    },
}


def _agent_tool_function(
    subagent_type: str,
    prompt: str,
    description: str = "",
    run_in_background: bool = False,
) -> str:
    """Agent 工具的实际执行入口 — 启动 SubAgentOrchestrator 并返回结果。"""
    # parent_session_id 当前不可用（execute_tool 不传），占位
    parent_session_id = "parent"

    orch = SubAgentOrchestrator(
        subagent_type=subagent_type,
        prompt=prompt,
        description=description,
        parent_session_id=parent_session_id,
        run_in_background=run_in_background,
    )
    if run_in_bg:
        # 简化版：Phase 3 才做真正的后台
        return f"[后台任务已创建] task_id: {orch.task_id}（Phase 1 占位 — 实际不会跑）"

    result = orch.run()
    if isinstance(result, SubAgentResult):
        if result.status == "completed":
            return (
                f"## SubAgent ({subagent_type}) 完成\n\n"
                f"{result.result_preview}\n\n"
                f"---\n"
                f"用 {result.total_steps} 步 · 耗时 {result.duration_ms}ms"
            )
        elif result.status == "error":
            return f"## SubAgent ({subagent_type}) 出错\n\n{result.error}"
        else:
            return f"## SubAgent ({subagent_type}) 状态: {result.status}"
    return str(result)
