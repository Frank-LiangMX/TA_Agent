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
        """Phase 1 占位 — Phase 2 在此接 agent_loop。"""
        start = time.time()
        return SubAgentResult(
            task_id=self.task_id,
            status="completed",
            result_preview=f"[Phase 1 占位] {self.subagent_type} 已收到 prompt：{self.prompt[:50]}",
            total_steps=0,
            total_tokens_in=0,
            total_tokens_out=0,
            duration_ms=int((time.time() - start) * 1000),
        )
