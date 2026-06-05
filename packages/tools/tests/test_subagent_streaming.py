"""SubAgent LLM 流式回流（text 事件）端到端测试。"""
import os
import queue
import sys

import pytest

# 确保顶层 progress_hook 可被 import
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
_SERVER_DIR = os.path.join(_PROJECT_ROOT, "apps", "web", "server")
if _SERVER_DIR not in sys.path:
    sys.path.insert(0, _SERVER_DIR)

pytestmark = pytest.mark.skipif(
    not os.environ.get("RUN_LLM_E2E"),
    reason="需要 RUN_LLM_E2E=1 才跑（默认跳过）",
)


def test_real_llm_subagent_streams_text_events(monkeypatch):
    """真实 LLM 跑 explorer，验证 LLM 流式文本通过 stream_callback emit 给 progress_hook。

    agent_loop 在每个 delta.content 调 stream_callback(delta)，
    SubAgentOrchestrator._on_stream_delta 把 delta 转发到 progress_hook.emit_subagent_text。
    """
    sys.path.insert(0, ".")
    sys.path.insert(0, "backend")
    sys.path.insert(0, "packages")

    import progress_hook
    progress_hook._progress_queue = queue.Queue()

    captured = []

    def fake_emit_text(*, session_id, subagent_type, task_id, delta):
        captured.append({
            "session_id": session_id,
            "subagent_type": subagent_type,
            "task_id": task_id,
            "delta": delta,
        })

    monkeypatch.setattr(progress_hook, "emit_subagent_text", fake_emit_text)

    from packages.tools.agent_tool import SubAgentOrchestrator
    orch = SubAgentOrchestrator(
        subagent_type="explorer",
        prompt="Reply with a single short sentence in English.",
        description="streaming test",
        parent_session_id="e2e-streaming",
    )
    t0 = 0
    import time
    t0 = time.time()
    result = orch.run()
    elapsed = time.time() - t0

    print(f"\n[stream] status={result.status}, elapsed={elapsed:.1f}s")
    total_chars = sum(len(c["delta"]) for c in captured)
    print(f"[stream] emit count: {len(captured)}, total chars: {total_chars}")
    if captured:
        # 显示前 3 块
        for c in captured[:3]:
            print(f"[stream]   chunk: {c['delta'][:80]!r}")

    assert result.status in ("completed", "error")
    # 子 agent LLM 至少会 emit 几块文本
    assert len(captured) >= 1, f"应至少 emit 1 个文本块，实际 {len(captured)}"
    assert total_chars > 0
    # 验证 session_id 正确传递
    for c in captured:
        assert c["session_id"] == "e2e-streaming"
        assert c["subagent_type"] == "explorer"
        assert c["task_id"] == orch.task_id
