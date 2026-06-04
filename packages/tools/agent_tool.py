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

        start = time.time()
        interrupt = threading.Event()

        # 构造子 agent 的 system prompt：base + subagent 专属 prompt
        from packages.tools.subagents import get_subagent_spec
        spec = get_subagent_spec(self.subagent_type)
        if spec is None:
            return SubAgentResult(
                task_id=self.task_id,
                status="error",
                result_preview=f"未知 subagent_type: {self.subagent_type}",
                error="unknown_subagent_type",
                duration_ms=int((time.time() - start) * 1000),
            )

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
            return SubAgentResult(
                task_id=self.task_id,
                status="error",
                result_preview="",
                error=str(e)[:500],
                duration_ms=int((time.time() - start) * 1000),
            )

        # 截断到 4000 字符
        preview = (final_text or "")[:4000]
        if len(final_text or "") > 4000:
            preview += f"\n... (截断，共 {len(final_text)} 字符)"

        # 粗略统计 step 数：history 中 assistant 出现次数
        steps = sum(1 for m in history if m.get("role") == "assistant")

        return SubAgentResult(
            task_id=self.task_id,
            status="completed",
            result_preview=preview,
            total_steps=steps,
            total_tokens_in=0,  # TODO Phase 2 从 llm_calls.jsonl 取
            total_tokens_out=0,
            duration_ms=int((time.time() - start) * 1000),
        )
