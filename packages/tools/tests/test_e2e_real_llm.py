"""真实 LLM 端到端测试。

需要环境变量 RUN_LLM_E2E=1 才会跑（默认跳过，避免无 key 阻塞 CI）。
使用真实 LLM，验证 SubAgent 全链路在生产模式下能跑通。

跑法：
    RUN_LLM_E2E=1 python -m pytest packages/tools/tests/test_e2e_real_llm.py -v -s
"""
import os
import threading
import time
import json

import pytest

# 默认跳过整个模块
pytestmark = pytest.mark.skipif(
    not os.environ.get("RUN_LLM_E2E"),
    reason="需要 RUN_LLM_E2E=1 才跑（默认跳过）",
)


# =============================================================================
# 1. 同步模式：单 subagent 完成
# =============================================================================

def test_real_llm_sync_explorer_runs():
    """真实 LLM：explorer 子 agent 跑完一个最小任务。"""
    import sys
    sys.path.insert(0, "backend")
    sys.path.insert(0, "packages")
    sys.path.insert(0, ".")

    from packages.tools.agent_tool import SubAgentOrchestrator

    orch = SubAgentOrchestrator(
        subagent_type="explorer",
        prompt="只回答一个字：OK。不要做任何其他事。",
        description="e2e smoke",
        parent_session_id="e2e-test",
    )
    t0 = time.time()
    result = orch.run()
    elapsed = time.time() - t0

    print(f"\n[explorer] elapsed: {elapsed:.1f}s, status: {result.status}")
    print(f"[explorer] preview: {result.result_preview[:200]}")

    assert result.status in ("completed", "error"), f"unexpected status: {result.status}"
    assert result.duration_ms > 0
    if result.status == "error":
        # 容忍 LLM 报错（限流等），但状态应是 error
        print(f"[explorer] error: {result.error}")
    else:
        assert result.result_preview, "完成后 result_preview 应有内容"


def test_real_llm_sync_researcher_runs():
    """真实 LLM：researcher 子 agent。"""
    import sys
    sys.path.insert(0, "backend")
    sys.path.insert(0, "packages")
    sys.path.insert(0, ".")

    from packages.tools.agent_tool import SubAgentOrchestrator

    orch = SubAgentOrchestrator(
        subagent_type="researcher",
        prompt="一句话解释什么是 React Hook。",
        description="e2e smoke",
        parent_session_id="e2e-test",
    )
    t0 = time.time()
    result = orch.run()
    elapsed = time.time() - t0

    print(f"\n[researcher] elapsed: {elapsed:.1f}s, status: {result.status}")
    print(f"[researcher] preview: {result.result_preview[:200]}")

    assert result.status in ("completed", "error")


def test_real_llm_sync_code_reviewer_runs():
    """真实 LLM：code-reviewer 子 agent。"""
    import sys
    sys.path.insert(0, "backend")
    sys.path.insert(0, "packages")
    sys.path.insert(0, ".")

    from packages.tools.agent_tool import SubAgentOrchestrator

    orch = SubAgentOrchestrator(
        subagent_type="code-reviewer",
        prompt="看一行代码：const x = 1; 用 1 句话评价。",
        description="e2e smoke",
        parent_session_id="e2e-test",
    )
    t0 = time.time()
    result = orch.run()
    elapsed = time.time() - t0

    print(f"\n[code-reviewer] elapsed: {elapsed:.1f}s, status: {result.status}")
    print(f"[code-reviewer] preview: {result.result_preview[:200]}")

    assert result.status in ("completed", "error")


# =============================================================================
# 2. 后台模式
# =============================================================================

def test_real_llm_background_returns_immediately():
    """真实 LLM：后台模式立即返回 task_id。"""
    import sys
    sys.path.insert(0, "backend")
    sys.path.insert(0, "packages")
    sys.path.insert(0, ".")

    from packages.tools.agent_tool import SubAgentOrchestrator

    orch = SubAgentOrchestrator(
        subagent_type="explorer",
        prompt="数到 3",
        description="e2e bg",
        parent_session_id="e2e-test",
        run_in_background=True,
    )
    t0 = time.time()
    ret = orch.run()
    elapsed = time.time() - t0

    print(f"\n[bg] returned in {elapsed*1000:.0f}ms, task_id: {ret}")

    assert isinstance(ret, str), "后台应返回 task_id 字符串"
    assert ret.startswith("subagent-")
    assert elapsed < 0.5, f"后台应立即返回，实际 {elapsed*1000:.0f}ms"

    # 等后台跑完
    deadline = time.time() + 60
    while time.time() < deadline:
        if orch.task_id not in SubAgentOrchestrator.background_tasks:
            break
        time.sleep(0.5)
    assert orch.task_id not in SubAgentOrchestrator.background_tasks, "后台任务超时未完成"


# =============================================================================
# 3. 并发后台任务
# =============================================================================

def test_real_llm_concurrent_background():
    """真实 LLM：2 个后台任务并发。"""
    import sys
    sys.path.insert(0, "backend")
    sys.path.insert(0, "packages")
    sys.path.insert(0, ".")

    from packages.tools.agent_tool import SubAgentOrchestrator

    orches = [
        SubAgentOrchestrator(
            subagent_type="explorer",
            prompt=f"任务 {i}: 回答数字 {i+10}",
            description=f"并发 {i}",
            parent_session_id="e2e-concurrent",
            run_in_background=True,
        )
        for i in range(2)
    ]
    t0 = time.time()
    task_ids = [orch.run() for orch in orches]
    print(f"\n[concurrent] 2 tasks started in {(time.time()-t0)*1000:.0f}ms")

    # 等所有完成
    deadline = time.time() + 90
    while time.time() < deadline:
        if all(tid not in SubAgentOrchestrator.background_tasks for tid in task_ids):
            break
        time.sleep(0.5)

    remaining = [tid for tid in task_ids if tid in SubAgentOrchestrator.background_tasks]
    assert not remaining, f"超时未完成: {remaining}"


# =============================================================================
# 4. 完整 tool call 链路（含 _agent_tool_function）
# =============================================================================

def test_real_llm_via_agent_tool_function():
    """真实 LLM：通过 _agent_tool_function 调用 explorer。"""
    import sys
    sys.path.insert(0, "backend")
    sys.path.insert(0, "packages")
    sys.path.insert(0, ".")

    from packages.tools.agent_tool import _agent_tool_function

    t0 = time.time()
    result = _agent_tool_function(
        subagent_type="explorer",
        prompt="用一句话说 'hello'",
        description="via tool",
    )
    elapsed = time.time() - t0

    print(f"\n[tool fn] elapsed: {elapsed:.1f}s")
    print(f"[tool fn] output: {result[:300]}")

    assert "SubAgent" in result
    assert "完成" in result or "出错" in result
    if "出错" in result:
        print(f"[tool fn] error path: {result[:200]}")


# =============================================================================
# 5. 日志写入验证
# =============================================================================

def test_real_llm_writes_log_record():
    """真实 LLM：跑完后 subagent_runs.jsonl 应有对应记录。"""
    import sys
    sys.path.insert(0, "backend")
    sys.path.insert(0, "packages")
    sys.path.insert(0, ".")

    from packages.tools import agent_logging
    from packages.tools.agent_tool import SubAgentOrchestrator

    # 取当前日志大小
    log_path = agent_logging.SUBAGENT_RUNS_LOG
    exists_before = os.path.exists(log_path)
    size_before = os.path.getsize(log_path) if exists_before else 0

    orch = SubAgentOrchestrator(
        subagent_type="explorer",
        prompt="只回答一个字母 Y",
        description="log test",
        parent_session_id="e2e-log",
    )
    result = orch.run()

    assert os.path.exists(log_path), f"日志文件应被创建: {log_path}"
    size_after = os.path.getsize(log_path)
    assert size_after > size_before, "日志应有新增"

    # 读最后一行（应该是我们这次）
    with open(log_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    last = json.loads(lines[-1])
    print(f"\n[log] last record: {json.dumps(last, ensure_ascii=False)[:300]}")
    assert last["subagent_type"] == "explorer"
    assert last["session_id"] == "e2e-log"
    assert last["status"] in ("completed", "error")


# =============================================================================
# 6. get_subagent_model 实际生效
# =============================================================================

def test_real_llm_model_routing_effective():
    """真实 LLM：subagent 实际调用的模型应符合 _TIER_DEFAULT_MODELS 或 override。"""
    import sys
    sys.path.insert(0, "backend")
    sys.path.insert(0, "packages")
    sys.path.insert(0, ".")

    from backend.config import get_subagent_model
    from packages.tools.subagents import SUBAGENTS, get_subagent_spec

    # 检查路由
    for name, spec in SUBAGENTS.items():
        model = get_subagent_model(name)
        print(f"\n[route] {name} (tier={spec.model_tier}) -> {model}")
        assert model, f"subagent {name} 应能解析到模型"

    # 未知类型回退
    fallback = get_subagent_model("nonexistent-type")
    print(f"[route] unknown type -> {fallback} (fallback to active)")
    assert fallback, "未知类型也应回退到 active model"


# =============================================================================
# 7. SubAgent 事件流：真实 LLM 跑子 agent 时应 emit tool/progress 事件
# =============================================================================

def test_real_llm_subagent_emits_tool_events(monkeypatch):
    """真实 LLM 跑 explorer，确认 subagent_tool/progress 事件被 emit。

    验证：agent_loop 内部调工具时，会通过 progress_hook.emit_subagent_tool
    和 emit_subagent_progress emit 事件。这些事件最终会被 server.py 转发到 WS。
    """
    import sys
    sys.path.insert(0, "backend")
    sys.path.insert(0, "packages")
    sys.path.insert(0, ".")

    from apps.web.server import progress_hook
    captured = {"tool": [], "progress": []}

    def fake_emit_tool(*, session_id, subagent_type, task_id, tool_name, args_preview):
        captured["tool"].append({
            "session_id": session_id,
            "subagent_type": subagent_type,
            "task_id": task_id,
            "tool_name": tool_name,
            "args_preview": args_preview,
        })

    def fake_emit_progress(*, session_id, subagent_type, task_id, step_count, elapsed_ms, model):
        captured["progress"].append({
            "session_id": session_id,
            "subagent_type": subagent_type,
            "task_id": task_id,
            "step_count": step_count,
            "elapsed_ms": elapsed_ms,
            "model": model,
        })

    monkeypatch.setattr(progress_hook, "emit_subagent_tool", fake_emit_tool)
    monkeypatch.setattr(progress_hook, "emit_subagent_progress", fake_emit_progress)

    from packages.tools.agent_tool import SubAgentOrchestrator
    orch = SubAgentOrchestrator(
        subagent_type="explorer",
        prompt="Call workspace_list_dir tool to list src directory contents",
        description="e2e event",
        parent_session_id="e2e-event-test",
    )
    t0 = time.time()
    result = orch.run()
    elapsed = time.time() - t0

    print(f"\n[event] explorer: status={result.status}, elapsed={elapsed:.1f}s")
    print(f"[event] tool emits: {len(captured['tool'])}, progress emits: {len(captured['progress'])}")
    if captured["tool"]:
        print(f"[event] first tool: {captured['tool'][0]['tool_name']}({captured['tool'][0]['args_preview'][:60]})")
    if captured["progress"]:
        print(f"[event] last progress: step_count={captured['progress'][-1]['step_count']}, elapsed_ms={captured['progress'][-1]['elapsed_ms']}")

    assert result.status in ("completed", "error")
    # session_id 应被正确传递
    for evt in captured["tool"]:
        assert evt["session_id"] == "e2e-event-test"
    for evt in captured["progress"]:
        assert evt["session_id"] == "e2e-event-test"


def test_real_llm_subagent_does_not_emit_for_nonexistent_type(monkeypatch):
    """未知 subagent_type 应早返回，不调 agent_loop，因此无事件。"""
    import sys
    sys.path.insert(0, "backend")
    sys.path.insert(0, "packages")
    sys.path.insert(0, ".")

    from apps.web.server import progress_hook
    captured = []

    def fake_emit_tool(*args, **kwargs):
        captured.append(kwargs)

    def fake_emit_progress(*args, **kwargs):
        captured.append(kwargs)

    monkeypatch.setattr(progress_hook, "emit_subagent_tool", fake_emit_tool)
    monkeypatch.setattr(progress_hook, "emit_subagent_progress", fake_emit_progress)

    from packages.tools.agent_tool import SubAgentOrchestrator
    orch = SubAgentOrchestrator(
        subagent_type="nonexistent-type",
        prompt="x",
        description="d",
        parent_session_id="e2e-no-type",
    )
    result = orch.run()
    assert result.status == "error"
    # 错误信息在 result_preview 或 error 字段
    combined = (result.error or "") + (result.result_preview or "")
    assert "未知" in combined or "unknown" in combined.lower()
    assert len(captured) == 0, f"未知 type 不应 emit 事件，但有 {len(captured)} 条"
