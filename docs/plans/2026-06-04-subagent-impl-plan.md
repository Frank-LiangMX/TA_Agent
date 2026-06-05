# ta_agent SubAgent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 ta_agent 通用 mode 补齐 SubAgent 能力，对齐 Proma 体验。

**Architecture:** SubAgent 是模式门控的工具，模式 = general 时注册 `Agent` / `TaskOutput` / `TaskStop` 三个工具；内部复用 `agent_loop()`、`registry`、MCP 连接池、记忆系统；隔离的子 context、独立的 tool 白名单、三档模型分级 + 用户覆盖。

**Tech Stack:** Python 3.x（后端）、React + TypeScript + Tailwind（前端）、asyncio（子任务调度）、WebSocket（进度事件）、pytest（后端测试）。

**参考设计稿：** `docs/plans/2026-06-04-subagent-design.md`

**Worktree：** `F:\ta_agent-worktrees\subagent-impl`（分支 `feat/subagent-general-mode`）

---

## Phase 1 — 同步 SubAgent 最小可用

### Task 1: 搭建测试基础设施

**Files:**
- Create: `packages/tools/tests/__init__.py`
- Create: `packages/tools/tests/conftest.py`
- Create: `packages/tools/tests/test_smoke.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_smoke.py`
- Modify: `pytest.ini`（新增）或 `pyproject.toml`（如已有）

**Step 1: 写 smoke test 验证测试基础设施**

`packages/tools/tests/test_smoke.py`:

```python
def test_smoke():
    assert 1 + 1 == 2
```

`backend/tests/test_smoke.py`:

```python
def test_smoke():
    assert True
```

**Step 2: 跑测试确认通过**

Run: `cd F:/ta_agent-worktrees/subagent-impl && python -m pytest packages/tools/tests/test_smoke.py backend/tests/test_smoke.py -v`

Expected: 2 passed

**Step 3: 创建 pytest 配置（如不存在）**

创建 `pytest.ini` 在项目根：

```ini
[pytest]
testpaths = packages/tools/tests backend/tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = -v --tb=short
```

**Step 4: 跑全部 smoke test 验证**

Run: `python -m pytest -v`

Expected: 2 passed

**Step 5: Commit**

```bash
cd F:/ta_agent-worktrees/subagent-impl
git add pytest.ini packages/tools/tests/ backend/tests/
git commit -m "test(infra): add pytest infrastructure for tools and backend"
```

---

### Task 2: 实现 SubAgentSpec dataclass + SUBAGENTS 字典

**Files:**
- Create: `packages/tools/subagents.py`
- Test: `packages/tools/tests/test_subagents.py`

**Step 1: 写失败测试**

`packages/tools/tests/test_subagents.py`:

```python
from packages.tools.subagents import SubAgentSpec, SUBAGENTS, get_subagent_spec


def test_explorer_spec_exists():
    spec = get_subagent_spec("explorer")
    assert spec is not None
    assert spec.name == "explorer"
    assert spec.display_name == "代码探索"
    assert spec.model_tier == "haiku"
    assert "workspace_read_file" in spec.allowed_tools


def test_researcher_spec_exists():
    spec = get_subagent_spec("researcher")
    assert spec is not None
    assert spec.model_tier == "haiku"


def test_code_reviewer_spec_exists():
    spec = get_subagent_spec("code-reviewer")
    assert spec is not None
    assert spec.model_tier == "sonnet"


def test_unknown_subagent_returns_none():
    assert get_subagent_spec("nope") is None


def test_all_specs_have_required_fields():
    for name, spec in SUBAGENTS.items():
        assert spec.name == name
        assert spec.display_name
        assert spec.description_for_parent
        assert spec.system_prompt
        assert spec.allowed_tools
        assert spec.model_tier in ("haiku", "sonnet", "opus")


def test_no_subagent_can_recursively_call_agent():
    """子 agent 的工具白名单不能包含 Agent/TaskOutput/TaskStop"""
    forbidden = {"Agent", "TaskOutput", "TaskStop"}
    for name, spec in SUBAGENTS.items():
        bad = forbidden & set(spec.allowed_tools)
        assert not bad, f"{name} 不应在 allowed_tools 中包含 {bad}"
```

**Step 2: 跑测试确认失败**

Run: `python -m pytest packages/tools/tests/test_subagents.py -v`

Expected: ImportError or ModuleNotFoundError（因为 subagents.py 还不存在）

**Step 3: 实现 `packages/tools/subagents.py`**

```python
"""SubAgent 声明式定义。

每个 SubAgent 是模式门控的工具（在 agent_mode == 'general' 时通过 Agent 工具调用），
拥有独立的 system prompt、allowed_tools 白名单、model_tier。
"""
from dataclasses import dataclass, field
from typing import Literal


ModelTier = Literal["haiku", "sonnet", "opus"]


@dataclass(frozen=True)
class SubAgentSpec:
    name: str
    display_name: str
    description_for_parent: str
    system_prompt: str
    allowed_tools: list[str]
    model_tier: ModelTier = "haiku"
    max_iterations: int = 15
    max_runtime_sec: int = 300


SUBAGENTS: dict[str, SubAgentSpec] = {
    "explorer": SubAgentSpec(
        name="explorer",
        display_name="代码探索",
        description_for_parent=(
            "适合：理解代码库结构、定位文件、梳理调用关系。"
            "只能读，不能写。运行快、成本低。"
            "返回时附文件路径和行号。"
        ),
        system_prompt=(
            "你是一个代码探索专家。使用只读工具（workspace_read_file、"
            "workspace_list_dir、scan_directory、discover_conventions）回答问题。"
            "永远不要修改文件。最终返回一段简洁的代码地图 + 文件引用列表。"
        ),
        allowed_tools=[
            "workspace_read_file",
            "workspace_list_dir",
            "scan_directory",
            "discover_conventions",
            "check_file_info",
        ],
        model_tier="haiku",
    ),
    "researcher": SubAgentSpec(
        name="researcher",
        display_name="技术调研",
        description_for_parent=(
            "适合：调研第三方库、API 文档、最佳实践。"
            "返回时附带引用链接。"
        ),
        system_prompt=(
            "你是一个技术调研专家。返回时附带引用链接（来源 URL）。"
            "如果当前没有联网工具，坦诚说明并基于已有知识回答。"
        ),
        allowed_tools=[
            "workspace_read_file",
            "memory_read_facts",
        ],
        model_tier="haiku",
    ),
    "code-reviewer": SubAgentSpec(
        name="code-reviewer",
        display_name="代码评审",
        description_for_parent=(
            "适合：检查代码质量、潜在 bug、安全问题、风格一致性。"
            "输出按文件组织的 findings 列表。"
        ),
        system_prompt=(
            "你是一个严格的代码评审员。按严重程度（critical / warning / nit）"
            "组织发现的问题，每条标注文件路径和行号。"
        ),
        allowed_tools=[
            "workspace_read_file",
            "workspace_list_dir",
            "scan_directory",
        ],
        model_tier="sonnet",
        max_iterations=10,
    ),
}


def get_subagent_spec(name: str) -> SubAgentSpec | None:
    return SUBAGENTS.get(name)


def list_subagent_names() -> list[str]:
    return list(SUBAGENTS.keys())
```

**Step 4: 跑测试确认通过**

Run: `python -m pytest packages/tools/tests/test_subagents.py -v`

Expected: 6 passed

**Step 5: Commit**

```bash
cd F:/ta_agent-worktrees/subagent-impl
git add packages/tools/subagents.py packages/tools/tests/test_subagents.py
git commit -m "feat(subagents): add SubAgentSpec dataclass and 3 built-in subagents"
```

---

### Task 3: 实现 `resolve_allowed_tools`（含 mcp__* 通配符）

**Files:**
- Modify: `packages/tools/subagents.py`
- Modify: `packages/tools/tests/test_subagents.py`

**Step 1: 加失败测试**

在 `test_subagents.py` 末尾追加：

```python
from packages.tools.subagents import resolve_allowed_tools


def test_resolve_allowed_tools_expands_mcp_wildcard(monkeypatch):
    """mcp__* 通配符应展开为 mcp_bridge 当前已连接的所有 mcp__* 工具"""
    # 模拟 mcp_bridge 返回的已知工具名
    from packages.tools import registry
    monkeypatch.setattr(
        registry,
        "TOOLS",
        [
            {"function": {"name": "mcp__playwright__browser_navigate"}},
            {"function": {"name": "mcp__playwright__browser_snapshot"}},
            {"function": {"name": "workspace_read_file"}},
        ],
    )
    spec = SubAgentSpec(
        name="test",
        display_name="t",
        description_for_parent="t",
        system_prompt="t",
        allowed_tools=["workspace_read_file", "mcp__*"],
    )
    resolved = resolve_allowed_tools(spec)
    assert "workspace_read_file" in resolved
    assert "mcp__playwright__browser_navigate" in resolved
    assert "mcp__playwright__browser_snapshot" in resolved


def test_resolve_allowed_tools_preserves_specific_names():
    spec = SubAgentSpec(
        name="test",
        display_name="t",
        description_for_parent="t",
        system_prompt="t",
        allowed_tools=["workspace_read_file"],
    )
    resolved = resolve_allowed_tools(spec)
    assert resolved == ["workspace_read_file"]
```

**Step 2: 跑测试确认失败**

Run: `python -m pytest packages/tools/tests/test_subagents.py::test_resolve_allowed_tools_expands_mcp_wildcard -v`

Expected: ImportError (resolve_allowed_tools not defined)

**Step 3: 实现 `resolve_allowed_tools`**

在 `packages/tools/subagents.py` 末尾追加：

```python
def resolve_allowed_tools(spec: SubAgentSpec) -> list[str]:
    """把 spec.allowed_tools 里的 mcp__* 通配符展开为当前 mcp_bridge 已注册的具体工具名。"""
    # 局部 import 避免循环依赖（registry 反向 import subagents 不会发生）
    from packages.tools import registry

    # 当前已注册的所有 mcp__* 工具
    mcp_tool_names = [
        t["function"]["name"]
        for t in registry.TOOLS
        if t["function"]["name"].startswith("mcp__")
    ]

    resolved: list[str] = []
    for name in spec.allowed_tools:
        if name == "mcp__*":
            resolved.extend(mcp_tool_names)
        else:
            resolved.append(name)
    # 去重保序
    seen = set()
    out: list[str] = []
    for n in resolved:
        if n not in seen:
            seen.add(n)
            out.append(n)
    return out
```

**Step 4: 跑测试确认通过**

Run: `python -m pytest packages/tools/tests/test_subagents.py -v`

Expected: 8 passed

**Step 5: Commit**

```bash
cd F:/ta_agent-worktrees/subagent-impl
git add packages/tools/subagents.py packages/tools/tests/test_subagents.py
git commit -m "feat(subagents): resolve mcp__* wildcard in allowed_tools"
```

---

### Task 4: 实现模型路由 `get_subagent_model` + tests

**Files:**
- Modify: `backend/config.py`
- Create: `backend/tests/test_subagent_model_routing.py`

**Step 1: 写失败测试**

`backend/tests/test_subagent_model_routing.py`:

```python
import json
import pytest
from backend.config import get_subagent_model, _save_runtime_app_config


@pytest.fixture
def tmp_app_config(tmp_path, monkeypatch):
    """用 tmp_path 模拟 app-config.json"""
    cfg_path = tmp_path / "app-config.json"
    monkeypatch.setattr("backend.config.RUNTIME_APP_CONFIG", str(cfg_path))
    return cfg_path


def test_default_model_from_tier(tmp_app_config):
    """无覆盖时，按 tier 返回对应默认模型"""
    _save_runtime_app_config({"active_model": "glm-5", "active_provider": "p1"})
    assert get_subagent_model("explorer") == "glm-4-flash"  # tier=haiku
    assert get_subagent_model("researcher") == "glm-4-flash"
    assert get_subagent_model("code-reviewer") == "glm-5"  # tier=sonnet


def test_user_override_takes_precedence(tmp_app_config):
    _save_runtime_app_config({
        "active_model": "glm-5",
        "active_provider": "p1",
        "subagent_model_overrides": {"explorer": "custom-model"},
    })
    assert get_subagent_model("explorer") == "custom-model"
    assert get_subagent_model("code-reviewer") == "glm-5"  # 未覆盖仍走 tier


def test_unknown_subagent_falls_back_to_active(tmp_app_config):
    _save_runtime_app_config({"active_model": "main-model", "active_provider": "p1"})
    assert get_subagent_model("nonexistent") == "main-model"
```

**Step 2: 跑测试确认失败**

Run: `python -m pytest backend/tests/test_subagent_model_routing.py -v`

Expected: ImportError（get_subagent_model 不存在）

**Step 3: 在 `backend/config.py` 末尾实现 `get_subagent_model`**

先看 `backend/config.py` 已有结构（已在 Step 1 探索过 — 找 `RUNTIME_APP_CONFIG` 和 `_save_runtime_app_config` 的实际位置）。如果 `_save_runtime_app_config` 不存在，临时改用直接 `json.dump` 写文件。在 `backend/config.py` 末尾追加：

```python
# ========== SubAgent 模型路由 ==========

# tier -> 默认模型
_TIER_DEFAULT_MODELS: dict[str, str] = {
    "haiku": "glm-4-flash",
    "sonnet": "glm-5",
    "opus": "glm-5",
}


def get_subagent_model(subagent_type: str) -> str:
    """解析 SubAgent 实际使用的模型。优先级：user override > tier default > active model。"""
    from packages.tools.subagents import get_subagent_spec

    # 1. 加载 runtime config
    try:
        cfg = _get_runtime_app_config()
    except Exception:
        cfg = {}

    # 2. user override
    overrides = cfg.get("subagent_model_overrides", {}) or {}
    if subagent_type in overrides:
        return overrides[subagent_type]

    # 3. tier default
    spec = get_subagent_spec(subagent_type)
    if spec is not None:
        return _TIER_DEFAULT_MODELS.get(spec.model_tier, cfg.get("active_model", "glm-5"))

    # 4. fallback
    return cfg.get("active_model", "glm-5")
```

> 实现注意：
> - `_get_runtime_app_config` 是 `backend/config.py:85-100` 已有的私有函数。
> - 如果测试 fixture 直接调用 `_save_runtime_app_config` 不存在，可以把 fixture 改为：直接 `json.dump(payload, open(cfg_path, "w"))` 写文件，绕开 helper。
> - 如果 `_TIER_DEFAULT_MODELS` 中的 `"glm-4-flash"` 实际在你环境里没有，可改用你已有的轻量模型名。

**Step 4: 跑测试确认通过**

Run: `python -m pytest backend/tests/test_subagent_model_routing.py -v`

Expected: 3 passed

**Step 5: Commit**

```bash
cd F:/ta_agent-worktrees/subagent-impl
git add backend/config.py backend/tests/test_subagent_model_routing.py
git commit -m "feat(subagents): add get_subagent_model with tier+override routing"
```

---

### Task 5: 实现 `SubAgentOrchestrator` 骨架（同步路径）

**Files:**
- Create: `packages/tools/agent_tool.py`
- Test: `packages/tools/tests/test_agent_tool.py`

**Step 1: 写失败测试**

`packages/tools/tests/test_agent_tool.py`:

```python
import pytest
from packages.tools.agent_tool import SubAgentOrchestrator, SubAgentResult


def test_orchestrator_returns_result_dataclass():
    result = SubAgentResult(
        task_id="t1",
        status="completed",
        result_preview="ok",
        total_steps=1,
        total_tokens_in=10,
        total_tokens_out=5,
    )
    assert result.task_id == "t1"
    assert result.status == "completed"


def test_orchestrator_sync_run_returns_result(monkeypatch):
    """同步 run 应该返回 SubAgentResult，不抛异常"""
    from packages.tools import agent_tool

    def fake_run_loop(self, **kwargs):
        return SubAgentResult(
            task_id=self.task_id,
            status="completed",
            result_preview="mock output",
            total_steps=2,
            total_tokens_in=100,
            total_tokens_out=20,
        )

    monkeypatch.setattr(SubAgentOrchestrator, "_run_loop", fake_run_loop)

    orch = SubAgentOrchestrator(
        subagent_type="explorer",
        prompt="find x",
        description="test",
        run_in_background=False,
        parent_session_id="p1",
    )
    result = orch.run()
    assert isinstance(result, SubAgentResult)
    assert result.status == "completed"
    assert result.result_preview == "mock output"
```

**Step 2: 跑测试确认失败**

Run: `python -m pytest packages/tools/tests/test_agent_tool.py -v`

Expected: ModuleNotFoundError

**Step 3: 实现 `packages/tools/agent_tool.py` 骨架**

```python
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
```

**Step 4: 跑测试确认通过**

Run: `python -m pytest packages/tools/tests/test_agent_tool.py -v`

Expected: 2 passed

**Step 5: Commit**

```bash
cd F:/ta_agent-worktrees/subagent-impl
git add packages/tools/agent_tool.py packages/tools/tests/test_agent_tool.py
git commit -m "feat(subagents): add SubAgentOrchestrator skeleton (Phase 1 placeholder)"
```

---

### Task 6: SubAgentOrchestrator 接入 agent_loop（核心实现）

**Files:**
- Modify: `packages/tools/agent_tool.py`
- Modify: `packages/tools/tests/test_agent_tool.py`

**Step 1: 加失败测试**

在 `test_agent_tool.py` 末尾追加：

```python
def test_orchestrator_invokes_agent_loop(monkeypatch):
    """验证 _run_loop 调用了 backend.agent_main.agent_loop，并传了正确的参数"""
    from packages.tools import agent_tool

    captured = {}

    def fake_agent_loop(*, user_message, history, workflow_mode, interrupt_event, context_cutoff):
        captured["user_message"] = user_message
        captured["history"] = history
        captured["interrupt_event"] = interrupt_event
        return "mocked final answer", history + [{"role": "user", "content": user_message}]

    monkeypatch.setattr("backend.agent_main.agent_loop", fake_agent_loop)

    # mock get_subagent_model 返回固定模型
    monkeypatch.setattr("backend.config.get_subagent_model", lambda t: "mock-model")

    # mock create_client 不真调 LLM
    class FakeMsg:
        def __init__(self, content): self.content = content
    class FakeChoice:
        def __init__(self, content): self.message = FakeMsg(content)
    class FakeResponse:
        def __init__(self, content): self.choices = [FakeChoice(content)]
    class FakeClient:
        def chat(self): return self
        completions = None
    fake_client = FakeClient()
    fake_client.chat.completions = type("C", (), {
        "create": staticmethod(lambda **kwargs: FakeResponse("[no tool call]"))
    })()
    monkeypatch.setattr("backend.agent_main.create_client", lambda: (fake_client, "mock-model"))

    orch = SubAgentOrchestrator(
        subagent_type="explorer",
        prompt="list files in src",
        description="test",
        parent_session_id="p1",
    )
    result = orch._run_loop()

    assert captured["user_message"] == "list files in src"
    assert captured["history"] == []  # 隔离：子 agent 全新 history
    assert result.status == "completed"
    assert "mocked final answer" in result.result_preview or result.total_steps >= 0
```

**Step 2: 跑测试确认失败**

Run: `python -m pytest packages/tools/tests/test_agent_tool.py::test_orchestrator_invokes_agent_loop -v`

Expected: 失败 — Phase 1 placeholder 不调 agent_loop

**Step 3: 改 `_run_loop` 接 agent_loop**

修改 `packages/tools/agent_tool.py` 里的 `_run_loop` 方法：

```python
def _run_loop(self) -> SubAgentResult:
    """运行一次完整的子 agent 循环，捕获结果。"""
    import threading
    from backend.agent_main import agent_loop, build_system_prompt, _compress_history
    from backend.config import get_subagent_model

    start = time.time()
    interrupt = threading.Event()

    # 构造子 agent 的 system prompt：base + subagent 专属 prompt
    # build_system_prompt 会自动根据 get_agent_runtime_mode() 选 general prompt
    # 我们追加 subagent 自己的 system_prompt
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
```

**Step 4: 跑测试确认通过**

Run: `python -m pytest packages/tools/tests/test_agent_tool.py -v`

Expected: 3 passed

**Step 5: Commit**

```bash
cd F:/ta_agent-worktrees/subagent-impl
git add packages/tools/agent_tool.py packages/tools/tests/test_agent_tool.py
git commit -m "feat(subagents): wire SubAgentOrchestrator to agent_loop"
```

---

### Task 7: 注册 Agent 工具到 general 模式

**Files:**
- Modify: `packages/tools/agent_tool.py`
- Modify: `packages/tools/registry.py`
- Modify: `packages/tools/__init__.py`
- Test: `packages/tools/tests/test_agent_registration.py`

**Step 1: 写失败测试**

`packages/tools/tests/test_agent_registration.py`:

```python
def test_agent_tool_registered_in_general_mode():
    from packages.tools import registry
    tools = registry.get_tools_for_mode(agent_mode="general")
    names = {t["function"]["name"] for t in tools}
    assert "Agent" in names


def test_agent_tool_not_in_ta_mode():
    from packages.tools import registry
    tools = registry.get_tools_for_mode(agent_mode="ta")
    names = {t["function"]["name"] for t in tools}
    assert "Agent" not in names
```

**Step 2: 跑测试确认失败**

Run: `python -m pytest packages/tools/tests/test_agent_registration.py -v`

Expected: AssertionError（"Agent" 不在 general 模式工具列表）

**Step 3: 在 `packages/tools/agent_tool.py` 末尾追加 Agent 工具 schema + 函数**

```python
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


def _agent_tool_function(arguments: dict, *, parent_session_id: str) -> str:
    """Agent 工具的实际执行入口 — 启动 SubAgentOrchestrator 并返回结果。"""
    subagent_type = arguments["subagent_type"]
    prompt = arguments["prompt"]
    description = arguments.get("description", "")
    run_in_bg = arguments.get("run_in_background", False)

    orch = SubAgentOrchestrator(
        subagent_type=subagent_type,
        prompt=prompt,
        description=description,
        parent_session_id=parent_session_id,
        run_in_background=run_in_bg,
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
```

**Step 4: 在 `packages/tools/registry.py` 注册 Agent 工具到 general 模式**

在 `DEFAULT_TOOLSET.tool_names` 里加 `"Agent"`：

```python
DEFAULT_TOOLSET = Toolset(
    name="default",
    description="通用模式默认工具集",
    tool_names={
        "Agent",  # 新增：SubAgent 委派
        "workspace_read_file",
        "workspace_write_file",
        # ... 其余不变
    },
)
```

并在 `TOOLS` 列表追加（找 `TOOLS = [...]` 的位置，在最后追加）：

```python
from packages.tools.agent_tool import AGENT_TOOL_SCHEMA, _agent_tool_function

TOOLS.append(AGENT_TOOL_SCHEMA)
TOOL_FUNCTIONS["Agent"] = _agent_tool_function
```

> 重要：`TOOLS` 列表的最后追加必须在 import 时执行。如果 `TOOLS = [...]` 是字面量列表，改为模块级方法：在 `registry.py` 末尾加：
>
> ```python
> # 注册 Agent 工具（仅 general 模式生效）
> try:
>     from packages.tools.agent_tool import AGENT_TOOL_SCHEMA, _agent_tool_function
>     TOOLS.append(AGENT_TOOL_SCHEMA)
>     TOOL_FUNCTIONS["Agent"] = _agent_tool_function
>     _tag_tier("Agent", "subagent")
> except ImportError:
>     pass  # agent_tool 还没装好时不影响
> ```

**Step 5: 跑测试确认通过**

Run: `python -m pytest packages/tools/tests/test_agent_registration.py -v`

Expected: 2 passed

**Step 6: Commit**

```bash
cd F:/ta_agent-worktrees/subagent-impl
git add packages/tools/agent_tool.py packages/tools/registry.py packages/tools/__init__.py packages/tools/tests/test_agent_registration.py
git commit -m "feat(subagents): register Agent tool in general mode toolset"
```

---

### Task 8: system prompt 注入 SubAgent 描述（仅 general 模式）

**Files:**
- Modify: `backend/agent_main.py:build_system_prompt`
- Test: `backend/tests/test_subagent_prompt_injection.py`

**Step 1: 写失败测试**

`backend/tests/test_subagent_prompt_injection.py`:

```python
from backend.agent_main import build_system_prompt


def test_general_prompt_includes_subagent_section():
    prompt = build_system_prompt(workflow_mode="auto", agent_mode="general")
    assert "## 可用的 SubAgent" in prompt
    assert "explorer" in prompt
    assert "researcher" in prompt
    assert "code-reviewer" in prompt


def test_ta_prompt_excludes_subagent_section():
    prompt = build_system_prompt(workflow_mode="auto", agent_mode="ta")
    assert "## 可用的 SubAgent" not in prompt
    assert "explorer" not in prompt.split("项目规范")[0]  # 排除巧合


def test_general_prompt_includes_subagent_usage_tip():
    prompt = build_system_prompt(workflow_mode="auto", agent_mode="general")
    # 提示何时该用 subagent
    assert "Agent" in prompt
    assert "委派" in prompt or "subagent" in prompt.lower()
```

**Step 2: 跑测试确认失败**

Run: `python -m pytest backend/tests/test_subagent_prompt_injection.py -v`

Expected: AssertionError（"## 可用的 SubAgent" 不在 prompt 中）

**Step 3: 在 `build_system_prompt` 的 general 分支末尾追加 SubAgent 描述**

在 `backend/agent_main.py:build_system_prompt` 里找到 general 分支（`if runtime_mode == "general":` 块），在最后追加：

```python
# SubAgent 描述注入（仅 general 模式）
if runtime_mode == "general":
    from packages.tools.subagents import SUBAGENTS
    subagent_lines = ["\n## 可用的 SubAgent\n"]
    subagent_lines.append(
        "你可以用 `Agent` 工具委派任务给以下子角色。子 agent 拥有独立上下文和工具集，"
        "适合拆解大型任务（如代码探索、技术调研、代码评审）。\n"
    )
    for name, spec in SUBAGENTS.items():
        subagent_lines.append(
            f"### {spec.display_name} (`{name}`)\n"
            f"{spec.description_for_parent}\n"
        )
    subagent_lines.append(
        "\n**调用示例**：\n"
        '```\n'
        "Agent(subagent_type=\"explorer\", prompt=\"...\", description=\"...\")\n"
        '```\n'
    )
    prompt += "\n".join(subagent_lines)
```

**Step 4: 跑测试确认通过**

Run: `python -m pytest backend/tests/test_subagent_prompt_injection.py -v`

Expected: 3 passed

**Step 5: Commit**

```bash
cd F:/ta_agent-worktrees/subagent-impl
git add backend/agent_main.py backend/tests/test_subagent_prompt_injection.py
git commit -m "feat(subagents): inject subagent descriptions into general system prompt"
```

---

### Task 9: subagent_runs.jsonl 日志

**Files:**
- Create: `packages/tools/agent_logging.py`
- Test: `packages/tools/tests/test_agent_logging.py`

**Step 1: 写失败测试**

`packages/tools/tests/test_agent_logging.py`:

```python
import json
import os
import tempfile
from packages.tools.agent_logging import log_subagent_run, SUBAGENT_RUNS_LOG


def test_log_subagent_run_writes_jsonl(tmp_path, monkeypatch):
    log_path = tmp_path / "subagent_runs.jsonl"
    monkeypatch.setattr("packages.tools.agent_logging.SUBAGENT_RUNS_LOG", str(log_path))

    log_subagent_run(
        session_id="s1",
        subagent_type="explorer",
        task_id="t1",
        model="glm-4-flash",
        run_in_background=False,
        status="completed",
        total_steps=3,
        total_tokens_in=100,
        total_tokens_out=20,
        duration_ms=1234,
        error=None,
    )

    assert log_path.exists()
    content = log_path.read_text(encoding="utf-8").strip()
    record = json.loads(content)
    assert record["subagent_type"] == "explorer"
    assert record["status"] == "completed"
    assert record["duration_ms"] == 1234


def test_log_appends_multiple_records(tmp_path, monkeypatch):
    log_path = tmp_path / "subagent_runs.jsonl"
    monkeypatch.setattr("packages.tools.agent_logging.SUBAGENT_RUNS_LOG", str(log_path))

    for i in range(3):
        log_subagent_run(
            session_id="s1", subagent_type="explorer", task_id=f"t{i}",
            model="m", run_in_background=False, status="completed",
            total_steps=1, total_tokens_in=0, total_tokens_out=0, duration_ms=0,
        )

    lines = log_path.read_text(encoding="utf-8").strip().split("\n")
    assert len(lines) == 3
    for line in lines:
        json.loads(line)  # 都能解析
```

**Step 2: 跑测试确认失败**

Run: `python -m pytest packages/tools/tests/test_agent_logging.py -v`

Expected: ModuleNotFoundError

**Step 3: 实现 `packages/tools/agent_logging.py`**

```python
"""SubAgent 运行日志。"""
import json
import os
import time
from typing import Literal

# 路径：同级 llm_calls.jsonl — 找 backend.config 里的 RUNTIME_DIR
def _resolve_log_path() -> str:
    try:
        from backend.config import RUNTIME_DIR
        return os.path.join(RUNTIME_DIR, "subagent_runs.jsonl")
    except Exception:
        return os.path.join(os.path.expanduser("~"), ".tagent", "subagent_runs.jsonl")


SUBAGENT_RUNS_LOG = _resolve_log_path()


def log_subagent_run(
    *,
    session_id: str,
    subagent_type: str,
    task_id: str,
    model: str,
    run_in_background: bool,
    status: Literal["completed", "error", "stopped"],
    total_steps: int,
    total_tokens_in: int,
    total_tokens_out: int,
    duration_ms: int,
    error: str | None = None,
) -> None:
    """追加一行 subagent_runs.jsonl。"""
    record = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + f".{int((time.time()%1)*1000):03d}Z",
        "session_id": session_id,
        "subagent_type": subagent_type,
        "task_id": task_id,
        "model": model,
        "run_in_background": run_in_background,
        "status": status,
        "total_steps": total_steps,
        "total_tokens_in": total_tokens_in,
        "total_tokens_out": total_tokens_out,
        "duration_ms": duration_ms,
        "error": error,
    }
    try:
        os.makedirs(os.path.dirname(SUBAGENT_RUNS_LOG), exist_ok=True)
        with open(SUBAGENT_RUNS_LOG, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception:
        # 日志失败不影响主流程
        pass
```

**Step 4: 改 `SubAgentOrchestrator._run_loop` 调用 log_subagent_run**

在 `packages/tools/agent_tool.py` 的 `_run_loop` 方法里，**每个 return 之前** 插入一行：

```python
from packages.tools.agent_logging import log_subagent_run

# 在 return SubAgentResult(...) 之前加：
log_subagent_run(
    session_id=self.parent_session_id,
    subagent_type=self.subagent_type,
    task_id=self.task_id,
    model=get_subagent_model(self.subagent_type),
    run_in_background=self.run_in_background,
    status=result_status,  # "completed" | "error" | "stopped"
    total_steps=steps,
    total_tokens_in=0,
    total_tokens_out=0,
    duration_ms=int((time.time() - start) * 1000),
    error=err_str,
)
```

**Step 5: 跑测试确认通过**

Run: `python -m pytest packages/tools/tests/test_agent_logging.py packages/tools/tests/test_agent_tool.py -v`

Expected: 5 passed

**Step 6: Commit**

```bash
cd F:/ta_agent-worktrees/subagent-impl
git add packages/tools/agent_logging.py packages/tools/agent_tool.py packages/tools/tests/test_agent_logging.py
git commit -m "feat(subagents): add subagent_runs.jsonl logging"
```

---

### Task 10: ADR + 收尾 Phase 1

**Files:**
- Create: `docs/decisions/subagent-architecture.md`
- Modify: `docs/decisions/single-agent-architecture.md`（追加更新说明）
- Modify: `progress.md`（更新待办）

**Step 1: 创建新 ADR**

`docs/decisions/subagent-architecture.md`:

```markdown
# 决策：通用模式 SubAgent 架构

> 日期：2026-06-04 | 状态：已采纳
> 配合：brainstorming 5 section + 设计稿 `docs/plans/2026-06-04-subagent-design.md`

## 背景

2026-05-10 ADR `single-agent-architecture.md` 明确拒绝多 agent。2026-06-02 提交 `540d562` 引入通用工作模式后，原 ADR 前提（"TA 工作流线性"）不再适用 — 通用 mode 是新场景，不属于线性 TA 流程。

## 决策

为通用 mode 引入 **SubAgent 能力**，以「模式门控的工具」形式存在：

- 仅 `agent_mode == 'general'` 时注册 `Agent` 工具
- TA 模式不暴露，保持单 agent
- 复用现有 `agent_loop()` / `registry` / MCP / 记忆基础设施
- 不引入新框架（CrewAI / AutoGen / LangGraph）

## 设计要点

- 三个 SubAgent：`explorer` / `researcher` / `code-reviewer`（对齐 Proma）
- 同步默认 + `run_in_background` 可选（Phase 3 完整支持）
- 三档模型分级 + 用户可覆盖
- 工具白名单隔离 + 防递归（子 agent 工具集不含 Agent/TaskOutput/TaskStop）
- 记忆隔离（子 agent 全新 context）
- 进度事件：Phase 2 走 WebSocket 推 `subagent_*` 事件

## 何时升级

- 通用 mode 用户量上来后，按 `subagent_runs.jsonl` 看哪类任务用 subagent 最多
- TA 模式如果出现"批量并行处理多个资产"的明确需求，重启评估（届时单 ADR 升级可能不够，可能需要新架构）
```

**Step 2: 追加旧 ADR 更新说明**

在 `docs/decisions/single-agent-architecture.md` 末尾追加：

```markdown
---

## 更新记录

### 2026-06-04

原 ADR 适用前提（"TA 工作流线性"）已变 — 项目于 2026-06-02 引入通用工作模式（提交 `540d562`），通用 mode 是非 TA 工作流的新场景。

**结论**：
- TA 模式仍保持单 agent（本 ADR 决定不变）
- 通用 mode 引入 SubAgent 能力 — 见 [subagent-architecture.md](subagent-architecture.md)
```

**Step 3: 更新 `progress.md` 状态**

在 `progress.md` 的"待办 > P1（核心体验）"加一条：

```markdown
- [x] 通用模式 SubAgent 能力（Phase 1 同步最小可用，2026-06-04；Phase 2-4 见实施计划）
```

**Step 4: 跑全部测试**

Run: `python -m pytest -v`

Expected: 所有测试通过

**Step 5: Commit**

```bash
cd F:/ta_agent-worktrees/subagent-impl
git add docs/decisions/ progress.md
git commit -m "docs: add subagent ADR + update single-agent ADR with changelog"
```

---

## Phase 2 — 前端 SubAgentCard

### Task 11: 加 5 个 WebSocket event 类型

**Files:**
- Modify: `apps/web/src/types/events.ts`（或对应 type 定义文件）

**Step 1: 找到现有 event 类型文件**

Run: `grep -rn "tool_start\|tool_result\|agent_thinking" apps/web/src/types/ 2>&1 | head -10`

确认 event 类型的存放位置。可能在 `apps/web/src/types/index.ts` 或 `apps/web/src/services/websocket.ts`。

**Step 2: 加新 event 类型**

在找到的文件里追加：

```typescript
export interface SubAgentStartEvent {
  type: 'subagent_start'
  subagent_type: 'explorer' | 'researcher' | 'code-reviewer'
  task_id: string
  description: string
  run_in_background: boolean
}

export interface SubAgentToolEvent {
  type: 'subagent_tool'
  task_id: string
  tool_name: string
  args_preview: string
}

export interface SubAgentProgressEvent {
  type: 'subagent_progress'
  task_id: string
  step_count: number
  elapsed_ms: number
  model: string
}

export interface SubAgentDoneEvent {
  type: 'subagent_done'
  task_id: string
  status: 'completed' | 'error' | 'stopped'
  result_preview: string
  total_steps: number
  total_tokens: number
}

export interface SubAgentLogEvent {
  type: 'subagent_log'
  task_id: string
  level: 'info' | 'warn' | 'error'
  message: string
}

export type SubAgentEvent =
  | SubAgentStartEvent
  | SubAgentToolEvent
  | SubAgentProgressEvent
  | SubAgentDoneEvent
  | SubAgentLogEvent
```

**Step 3: TypeScript 编译验证**

Run: `cd apps/web && npm run typecheck`（或 `tsc --noEmit`）

Expected: 0 errors

**Step 4: Commit**

```bash
cd F:/ta_agent-worktrees/subagent-impl
git add apps/web/src/types/
git commit -m "feat(web): add 5 subagent event types"
```

---

### Task 12: SubAgentCard 组件 — running 状态

**Files:**
- Create: `apps/web/src/components/agent/SubAgentCard.tsx`

**Step 1: 创建文件骨架**

```typescript
import React from 'react'
import { Loader2, CheckCircle2, AlertCircle, Slash, ChevronRight, ChevronDown } from 'lucide-react'
import type { SubAgentEvent } from '@/types'

export type SubAgentState = {
  task_id: string
  subagent_type: 'explorer' | 'researcher' | 'code-reviewer'
  description: string
  run_in_background: boolean
  status: 'running' | 'completed' | 'error' | 'stopped'
  started_at: number
  model?: string
  step_count: number
  tools: { name: string; args_preview: string }[]
  result_preview?: string
  total_steps?: number
  total_tokens?: number
}

export interface SubAgentCardProps {
  state: SubAgentState
  onStop?: (taskId: string) => void
  onViewDetails?: (taskId: string) => void
}

const TYPE_LABEL: Record<SubAgentState['subagent_type'], string> = {
  explorer: '代码探索',
  researcher: '技术调研',
  'code-reviewer': '代码评审',
}

export function SubAgentCard({ state, onStop, onViewDetails }: SubAgentCardProps) {
  const [toolsExpanded, setToolsExpanded] = React.useState(false)
  const elapsed = Math.round((Date.now() - state.started_at) / 1000)

  return (
    <div className="my-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 text-sm">
        {state.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
        {state.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
        {state.status === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
        {state.status === 'stopped' && <Slash className="h-4 w-4 text-slate-400" />}
        <span className="font-medium">SubAgent · {TYPE_LABEL[state.subagent_type]} ({state.subagent_type})</span>
        {state.run_in_background && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">后台</span>
        )}
      </div>

      {/* Description */}
      <div className="mt-1 text-sm text-slate-600">"{state.description}"</div>

      {/* Tools (collapsed by default) */}
      {state.tools.length > 0 && (
        <div className="mt-2 border-t border-slate-100 pt-2">
          <button
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
            onClick={() => setToolsExpanded(!toolsExpanded)}
          >
            {toolsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            嵌套工具调用 ({state.tools.length})
          </button>
          {toolsExpanded && (
            <div className="mt-1 space-y-0.5 pl-4 text-xs text-slate-600">
              {state.tools.map((t, i) => (
                <div key={i} className="font-mono">
                  ↳ {t.name}({t.args_preview})
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Result (only when completed) */}
      {state.status === 'completed' && state.result_preview && (
        <div className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs text-slate-700">
          {state.result_preview.slice(0, 500)}
          {state.result_preview.length > 500 && '...'}
        </div>
      )}

      {/* Error message */}
      {state.status === 'error' && state.result_preview && (
        <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">
          {state.result_preview}
        </div>
      )}

      {/* Footer */}
      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>
          {state.status === 'running' ? (
            <>已用 {state.step_count} 步 · {elapsed}s · {state.model || '...'}</>
          ) : state.status === 'completed' ? (
            <>共 {state.total_steps || 0} 步 · {state.total_tokens || 0} tokens</>
          ) : state.status === 'error' ? (
            <>出错</>
          ) : (
            <>已停止</>
          )}
        </span>
        <div className="flex gap-2">
          {state.status === 'running' && !state.run_in_background && onStop && (
            <button
              className="rounded px-2 py-0.5 text-red-600 hover:bg-red-50"
              onClick={() => onStop(state.task_id)}
            >
              停止
            </button>
          )}
          {state.run_in_background && onViewDetails && (
            <button
              className="rounded px-2 py-0.5 text-blue-600 hover:bg-blue-50"
              onClick={() => onViewDetails(state.task_id)}
            >
              查看进度
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

**Step 2: TypeScript 编译验证**

Run: `cd apps/web && npm run typecheck`

Expected: 0 errors

**Step 3: Commit**

```bash
cd F:/ta_agent-worktrees/subagent-impl
git add apps/web/src/components/agent/SubAgentCard.tsx
git commit -m "feat(web): add SubAgentCard component (all 4 states)"
```

---

### Task 13: 把 SubAgentCard 集成到 ChatMessage

**Files:**
- Modify: `apps/web/src/components/chat/ChatMessage.tsx`
- Modify: `apps/web/src/types/index.ts`（如果需要扩展 ChatMessage 类型）

**Step 1: 加失败测试（如项目有 vitest/jest 配置）**

如无现成测试框架，先手动跑 typecheck 验证。先看 `apps/web/package.json` 有没有 test script。

**Step 2: 扩展 ChatMessage 数据结构**

在 `apps/web/src/types/index.ts` 的 `ChatMessage` 类型里加：

```typescript
export interface SubAgentMessagePart {
  type: 'subagent_task'
  state: import('@/components/agent/SubAgentCard').SubAgentState
}

export interface ChatMessage {
  // ... 现有字段
  parts?: (TextPart | ToolCallPart | SubAgentMessagePart)[]
}
```

**Step 3: 在 ChatMessage.tsx 里渲染 SubAgentCard**

找到 ChatMessage.tsx 中 `hasTools` 渲染的位置，追加：

```typescript
import { SubAgentCard } from '@/components/agent/SubAgentCard'

// 在 parts 循环渲染处：
{message.parts?.map((part, i) => {
  if (part.type === 'subagent_task') {
    return <SubAgentCard key={i} state={part.state} onStop={...} onViewDetails={...} />
  }
  // ... 其他 part type
})}
```

**Step 4: TypeScript 编译**

Run: `cd apps/web && npm run typecheck`

Expected: 0 errors

**Step 5: Commit**

```bash
cd F:/ta_agent-worktrees/subagent-impl
git add apps/web/src/components/chat/ChatMessage.tsx apps/web/src/types/index.ts
git commit -m "feat(web): integrate SubAgentCard into ChatMessage"
```

---

### Task 14: websocket.ts 处理新 event

**Files:**
- Modify: `apps/web/src/services/websocket.ts`
- Create: `apps/web/src/stores/subagent-store.ts`（或扩展现有 store）

**Step 1: 加 SubAgent state 存储**

新建 `apps/web/src/stores/subagent-store.ts`（如项目用 jotai，原文件应该在 `apps/web/src/atoms/`）：

```typescript
import { atom, map } from 'nanostores'  // 或 jotai: import { atom } from 'jotai'

// 用 map 存所有 in-flight + 最近完成的 subagent 状态
export const subagentStates = map<Record<string, SubAgentState>>({})

export function upsertSubAgentState(state: SubAgentState) {
  subagentStates.setKey(state.task_id, state)
}

export function updateSubAgentState(taskId: string, patch: Partial<SubAgentState>) {
  const current = subagentStates.get()[taskId]
  if (current) {
    subagentStates.setKey(taskId, { ...current, ...patch })
  }
}
```

> 视项目使用的状态库调整（jotai 的话用 atom + atomFamily）。

**Step 2: 在 websocket.ts 加 event handler**

找到现有 event handler 注册的位置（通常有一个 switch 或 map），加 5 个新 case：

```typescript
case 'subagent_start': {
  upsertSubAgentState({
    task_id: ev.task_id,
    subagent_type: ev.subagent_type,
    description: ev.description,
    run_in_background: ev.run_in_background,
    status: 'running',
    started_at: Date.now(),
    step_count: 0,
    tools: [],
  })
  break
}
case 'subagent_tool': {
  const cur = subagentStates.get()[ev.task_id]
  if (cur) {
    cur.tools.push({ name: ev.tool_name, args_preview: ev.args_preview })
    upsertSubAgentState({ ...cur })
  }
  break
}
case 'subagent_progress': {
  updateSubAgentState(ev.task_id, {
    step_count: ev.step_count,
    model: ev.model,
  })
  break
}
case 'subagent_done': {
  updateSubAgentState(ev.task_id, {
    status: ev.status,
    result_preview: ev.result_preview,
    total_steps: ev.total_steps,
    total_tokens: ev.total_tokens,
  })
  break
}
```

**Step 3: TypeScript 编译**

Run: `cd apps/web && npm run typecheck`

Expected: 0 errors

**Step 4: Commit**

```bash
cd F:/ta_agent-worktrees/subagent-impl
git add apps/web/src/services/websocket.ts apps/web/src/stores/subagent-store.ts
git commit -m "feat(web): handle 5 subagent events in websocket client"
```

---

### Task 15: Phase 2 端到端 smoke test

**Step 1: 手动起 dev server**

Run: `cd F:/ta_agent-worktrees/subagent-impl && python launcher.py --no-browser`（后端）+ `cd apps/web && npm run dev`（前端）

**Step 2: 浏览器走流程**

1. 切到 general 模式
2. 在 chat 输入：`请用 explorer 子 agent 看一下 src 目录的代码结构`
3. 验证：
   - ChatMessage 里出现 SubAgentCard
   - 状态从 running → completed
   - 嵌套工具默认折叠
   - 点击展开能看到 workspace_list_dir 等调用
   - 最终结果正确显示

**Step 3: 检查 WebSocket 流量**

浏览器 devtools → Network → WS → 看 `subagent_*` 5 个事件是否按时序到达。

**Step 4: 如果有问题就修，没问题就 Phase 2 done**

不用 commit（手动验证不写代码），但把验证记录加到 commit message 里（下次再提交时）：

```bash
cd F:/ta_agent-worktrees/subagent-impl
git status  # 应该干净，因为没改代码
```

---

## Phase 3 — 后台 + TaskOutput/TaskStop

### Task 16: SubAgentOrchestrator 真后台路径

**Files:**
- Modify: `packages/tools/agent_tool.py`
- Test: `packages/tools/tests/test_agent_tool.py`

**Step 1: 加失败测试**

```python
def test_orchestrator_background_returns_task_id_immediately(monkeypatch):
    from packages.tools import agent_tool
    import threading

    started = threading.Event()
    def slow_loop(self):
        started.set()
        time.sleep(2)  # 模拟慢任务
        return SubAgentResult(
            task_id=self.task_id, status="completed",
            result_preview="slow done", total_steps=1,
        )
    monkeypatch.setattr(SubAgentOrchestrator, "_run_loop", slow_loop)

    orch = SubAgentOrchestrator(
        subagent_type="explorer", prompt="slow task", description="test",
        parent_session_id="p1", run_in_background=True,
    )
    ret = orch.run()
    assert isinstance(ret, str)  # 立即返回 task_id
    assert ret == orch.task_id
    started.wait(timeout=1)  # 确认后台确实在跑
```

**Step 2: 跑测试确认失败**

Run: `python -m pytest packages/tools/tests/test_agent_tool.py::test_orchestrator_background_returns_task_id_immediately -v`

Expected: AssertionError（同步路径返回 SubAgentResult 不是 str）

**Step 3: 改 `SubAgentOrchestrator.run` 加后台路径**

```python
# 在 SubAgentOrchestrator 类里加类变量存后台任务
class SubAgentOrchestrator:
    # ... 现有字段
    background_tasks: dict[str, "SubAgentOrchestrator"] = {}  # task_id -> 实例

    def run(self) -> SubAgentResult | str:
        if self.run_in_background:
            SubAgentOrchestrator.background_tasks[self.task_id] = self
            thread = threading.Thread(target=self._run_in_thread, daemon=True)
            thread.start()
            return self.task_id
        return self._run_loop()

    def _run_in_thread(self):
        result = self._run_loop()
        SubAgentOrchestrator.background_tasks.pop(self.task_id, None)
        # TODO Phase 3 任务：完成后发 subagent_done 事件
```

**Step 4: 跑测试确认通过**

Run: `python -m pytest packages/tools/tests/test_agent_tool.py -v`

Expected: 4 passed

**Step 5: Commit**

```bash
cd F:/ta_agent-worktrees/subagent-impl
git add packages/tools/agent_tool.py packages/tools/tests/test_agent_tool.py
git commit -m "feat(subagents): add true background execution path"
```

---

### Task 17: 注册 TaskOutput / TaskStop 工具

**Files:**
- Modify: `packages/tools/agent_tool.py`
- Modify: `packages/tools/registry.py`
- Test: `packages/tools/tests/test_agent_registration.py`

**Step 1: 加失败测试**

```python
def test_taskoutput_and_taskstop_registered_in_general_mode():
    from packages.tools import registry
    tools = registry.get_tools_for_mode(agent_mode="general")
    names = {t["function"]["name"] for t in tools}
    assert "TaskOutput" in names
    assert "TaskStop" in names
```

**Step 2: 跑测试确认失败**

Run: `python -m pytest packages/tools/tests/test_agent_registration.py::test_taskoutput_and_taskstop_registered_in_general_mode -v`

Expected: AssertionError

**Step 3: 在 `packages/tools/agent_tool.py` 末尾追加 TaskOutput/TaskStop schema + 函数**

```python
TASKOUTPUT_TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "TaskOutput",
        "description": "获取后台 SubAgent 的进度或最终结果。",
        "parameters": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
                "block": {"type": "boolean", "default": True, "description": "true 时阻塞等待完成"},
                "max_wait_ms": {"type": "number", "default": 30000},
            },
            "required": ["task_id"],
        },
    },
}

TASKSTOP_TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "TaskStop",
        "description": "取消一个后台 SubAgent。",
        "parameters": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
            },
            "required": ["task_id"],
        },
    },
}


def _taskoutput_function(arguments: dict, *, parent_session_id: str) -> str:
    task_id = arguments["task_id"]
    block = arguments.get("block", True)
    max_wait = arguments.get("max_wait_ms", 30000) / 1000
    orch = SubAgentOrchestrator.background_tasks.get(task_id)
    if orch is None:
        return f"[TaskOutput] task_id={task_id} 不存在或已结束"
    if block and orch._thread and orch._thread.is_alive():
        orch._thread.join(timeout=max_wait)
    if orch._thread and orch._thread.is_alive():
        return f"[TaskOutput] task_id={task_id} 仍在运行（超时 {max_wait}s）"
    return f"[TaskOutput] task_id={task_id} 已完成"


def _taskstop_function(arguments: dict, *, parent_session_id: str) -> str:
    task_id = arguments["task_id"]
    orch = SubAgentOrchestrator.background_tasks.get(task_id)
    if orch is None:
        return f"[TaskStop] task_id={task_id} 不存在"
    orch._cancel_event.set()
    return f"[TaskStop] task_id={task_id} 已发出停止信号"
```

在 SubAgentOrchestrator 类加 `_thread` 和 `_cancel_event` 字段：

```python
class SubAgentOrchestrator:
    # ... 现有字段
    _thread: threading.Thread | None = None
    _cancel_event: threading.Event = field(default_factory=threading.Event)
```

在 `_run_in_thread` 里设置：

```python
def _run_in_thread(self):
    self._thread = threading.current_thread()
    result = self._run_loop()
    SubAgentOrchestrator.background_tasks.pop(self.task_id, None)
```

**Step 4: 在 `registry.py` 注册**

参照 Task 7 的模式，追加：

```python
try:
    from packages.tools.agent_tool import (
        AGENT_TOOL_SCHEMA, TASKOUTPUT_TOOL_SCHEMA, TASKSTOP_TOOL_SCHEMA,
        _agent_tool_function, _taskoutput_function, _taskstop_function,
    )
    TOOLS.extend([AGENT_TOOL_SCHEMA, TASKOUTPUT_TOOL_SCHEMA, TASKSTOP_TOOL_SCHEMA])
    TOOL_FUNCTIONS["Agent"] = _agent_tool_function
    TOOL_FUNCTIONS["TaskOutput"] = _taskoutput_function
    TOOL_FUNCTIONS["TaskStop"] = _taskstop_function
    for n in ("Agent", "TaskOutput", "TaskStop"):
        _tag_tier(n, "subagent")
except ImportError:
    pass
```

并在 `DEFAULT_TOOLSET.tool_names` 加 `"TaskOutput"` 和 `"TaskStop"`。

**Step 5: 跑测试确认通过**

Run: `python -m pytest packages/tools/tests/test_agent_registration.py -v`

Expected: 3 passed

**Step 6: Commit**

```bash
cd F:/ta_agent-worktrees/subagent-impl
git add packages/tools/agent_tool.py packages/tools/registry.py packages/tools/tests/test_agent_registration.py
git commit -m "feat(subagents): add TaskOutput and TaskStop tools for background mode"
```

---

### Task 18: progress_hook.py per-session cancel event

**Files:**
- Modify: `apps/web/server/progress_hook.py`

**Step 1: 读现有 progress_hook.py**

看 `apps/web/server/progress_hook.py:11-64`，确认 `_cancel_event` 当前的形态（单 event 还是 map）。

**Step 2: 改为 per-session map**

如当前是单 event（`is_cancelled: bool`），改为：

```python
class ProgressHook:
    _cancel_events: dict[str, asyncio.Event] = {}

    def get_or_create_cancel_event(self, session_id: str) -> asyncio.Event:
        if session_id not in self._cancel_events:
            self._cancel_events[session_id] = asyncio.Event()
        return self._cancel_events[session_id]

    def cancel_session(self, session_id: str) -> None:
        if ev := self._cancel_events.get(session_id):
            ev.set()

    def clear_cancel_event(self, session_id: str) -> None:
        self._cancel_events.pop(session_id, None)

    def is_cancelled(self, session_id: str) -> bool:
        ev = self._cancel_events.get(session_id)
        return ev.is_set() if ev else False
```

并在每个 session 结束时调用 `clear_cancel_event`。

**Step 3: 父取消时遍历所有 in-flight subagent**

在 `server.py` 的 `stopGeneration` handler 里，加：

```python
for task_id, orch in SubAgentOrchestrator.background_tasks.items():
    if orch.parent_session_id == session_id:
        orch._cancel_event.set()
```

**Step 4: Commit**

```bash
cd F:/ta_agent-worktrees/subagent-impl
git add apps/web/server/progress_hook.py apps/web/server/server.py
git commit -m "feat(web): per-session cancel events + cascade to subagents"
```

---

### Task 19: SubAgentSidePanel 组件

**Files:**
- Create: `apps/web/src/components/agent/SubAgentSidePanel.tsx`

**Step 1: 创建组件**

```typescript
import React from 'react'
import { X } from 'lucide-react'
import type { SubAgentState } from './SubAgentCard'

export interface SubAgentSidePanelProps {
  state: SubAgentState | null
  onClose: () => void
}

export function SubAgentSidePanel({ state, onClose }: SubAgentSidePanelProps) {
  if (!state) return null
  return (
    <div className="fixed right-0 top-0 z-50 h-full w-96 overflow-y-auto bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-200 p-3">
        <h3 className="text-sm font-medium">SubAgent · {state.subagent_type}</h3>
        <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-3 p-3 text-sm">
        <div>
          <div className="text-xs text-slate-500">描述</div>
          <div>"{state.description}"</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">task_id</div>
          <div className="font-mono text-xs">{state.task_id}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">状态</div>
          <div>{state.status} · {state.step_count} 步 · {state.model || '...'}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">工具调用（{state.tools.length}）</div>
          <div className="space-y-1">
            {state.tools.map((t, i) => (
              <div key={i} className="rounded bg-slate-50 p-1 font-mono text-xs">
                ↳ {t.name}({t.args_preview})
              </div>
            ))}
          </div>
        </div>
        {state.result_preview && (
          <div>
            <div className="text-xs text-slate-500">结果</div>
            <div className="whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">
              {state.result_preview}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 2: TypeScript 编译**

Run: `cd apps/web && npm run typecheck`

**Step 3: Commit**

```bash
cd F:/ta_agent-worktrees/subagent-impl
git add apps/web/src/components/agent/SubAgentSidePanel.tsx
git commit -m "feat(web): add SubAgentSidePanel for background task details"
```

---

### Task 20: SubAgentCard 加 [停止] 按钮 + 集成 SidePanel

**Files:**
- Modify: `apps/web/src/components/agent/SubAgentCard.tsx`
- Modify: `apps/web/src/App.tsx` 或对应顶层组件

**Step 1: SidePanel 状态挂在顶层**

在 `App.tsx` 里：

```typescript
const [sidePanelTaskId, setSidePanelTaskId] = useState<string | null>(null)

// 在渲染末尾：
<SubAgentSidePanel
  state={sidePanelTaskId ? subagentStates.get()[sidePanelTaskId] : null}
  onClose={() => setSidePanelTaskId(null)}
/>
```

**Step 2: 改 SubAgentCard 的 onStop 触发 TaskStop RPC**

在 SubAgentCard 的 onStop 里调：

```typescript
tagentClient.rpc('taskStop', { task_id: state.task_id })
```

（具体 RPC 名称按项目实际定义）

**Step 3: 手动测试**

跑 dev server，验证：
- 点 [停止] 能取消 subagent
- 后台任务的 [查看进度] 弹出 SidePanel

**Step 4: Commit**

```bash
cd F:/ta_agent-worktrees/subagent-impl
git add apps/web/src/components/agent/SubAgentCard.tsx apps/web/src/App.tsx
git commit -m "feat(web): wire [Stop] and [View Details] buttons"
```

---

### Task 21: Phase 3 端到端测试

**Step 1: 手动 checklist**

1. 跑 `python launcher.py --no-browser` + `cd apps/web && npm run dev`
2. general mode 下发 `请用 researcher 后台调研 react-router v7 迁移方案`
3. 验证：
   - SubAgentCard 出现，标记「后台」
   - 父 agent 继续跑（不被卡住）
   - 点 [查看进度] 弹 SidePanel，能看到 streaming 进度
   - 等完成后调 TaskOutput 拿结果
4. 发 `请用 explorer 跑 3 个并行任务`，验证：
   - 3 个 SubAgentCard 并列显示
   - 都可以独立停止
   - 父级取消时 3 个全部停止

**Step 2: 跑全部测试**

Run: `python -m pytest -v && cd apps/web && npm run typecheck`

**Step 3: Commit (如有修改)**

---

## Phase 4 — 模型覆盖 + 设置页 + 收尾

### Task 22: SubAgentSettings 组件

**Files:**
- Create: `apps/web/src/components/settings/SubAgentSettings.tsx`

**Step 1: 写组件**

```typescript
import React from 'react'

interface SubAgentSettingsProps {
  overrides: Record<string, string>  // {"explorer": "glm-4-flash"}
  availableModels: string[]
  onChange: (overrides: Record<string, string>) => void
}

const SUBAGENT_NAMES: Record<string, string> = {
  explorer: '代码探索 (explorer)',
  researcher: '技术调研 (researcher)',
  'code-reviewer': '代码评审 (code-reviewer)',
}

export function SubAgentSettings({ overrides, availableModels, onChange }: SubAgentSettingsProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">SubAgent 模型覆盖</h3>
      <p className="text-xs text-slate-500">
        默认按子 agent 的 model_tier 选模型（explorer/researcher 用轻量模型，code-reviewer 用主模型）。
        在此可单独覆盖任一子 agent 的模型。
      </p>
      {Object.entries(SUBAGENT_NAMES).map(([name, label]) => (
        <div key={name} className="flex items-center gap-2">
          <label className="w-48 text-sm">{label}</label>
          <select
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            value={overrides[name] || ''}
            onChange={(e) => {
              const next = { ...overrides }
              if (e.target.value) {
                next[name] = e.target.value
              } else {
                delete next[name]
              }
              onChange(next)
            }}
          >
            <option value="">（使用 tier 默认）</option>
            {availableModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}
```

**Step 2: TypeScript 编译**

Run: `cd apps/web && npm run typecheck`

**Step 3: Commit**

```bash
cd F:/ta_agent-worktrees/subagent-impl
git add apps/web/src/components/settings/SubAgentSettings.tsx
git commit -m "feat(web): add SubAgentSettings for per-subagent model override"
```

---

### Task 23: 集成 SubAgentSettings 到 settings 路由

**Files:**
- Modify: `apps/web/src/components/settings/AgentSettings.tsx`（或对应 settings 入口）

**Step 1: 找到 settings 入口**

Look for `AgentSettings` 或 settings 路由配置。

**Step 2: 加 SubAgent 选项卡/区块**

```typescript
import { SubAgentSettings } from './SubAgentSettings'

// 在 settings 容器里加一个 Tab "SubAgent 模型"
// 状态：subagentOverrides，从 app-config.json 读，通过 IPC 写
```

**Step 3: 跑 + 验证**

跑 dev server，进设置页验证：
- SubAgent 设置项出现
- 修改 explorer 的模型覆盖
- 重启 agent 后用 explorer 验证走的覆盖模型

**Step 4: Commit**

```bash
cd F:/ta_agent-worktrees/subagent-impl
git add apps/web/src/components/settings/
git commit -m "feat(web): integrate SubAgentSettings into settings page"
```

---

### Task 24: 端到端测试 + 收尾

**Step 1: 跑全部测试**

Run: `python -m pytest -v && cd apps/web && npm run typecheck`

**Step 2: 端到端 checklist**

- [ ] general mode 跑 explorer / researcher / code-reviewer 都能返回正确结果
- [ ] 同步 / 后台两种模式都工作
- [ ] 父级取消级联到所有 in-flight subagent
- [ ] 设置页覆盖 explorer 模型 → 下次调用生效
- [ ] TA 模式完全无 SubAgent 痕迹
- [ ] 嵌套工具默认折叠，可展开
- [ ] 后台任务 [查看进度] 弹侧栏
- [ ] subagent_runs.jsonl 记录每次运行

**Step 3: 更新 progress.md 待办**

把 "通用模式 SubAgent 能力" 从 P1 移到「已完成功能」section，描述 4 个 Phase 全部完成。

**Step 4: 准备合并**

```bash
cd F:/ta_agent-worktrees/subagent-impl
git log --oneline main..HEAD
# 应该有 20+ commits，每 phase 一组
git diff main --stat
# 确认改动范围合理
```

**Step 5: 触发合并到 main（用户决定）**

告诉用户：
- 在 worktree 跑完 4 个 Phase
- 创建 PR / 直接 merge 到 main / 或者再迭代
- 让用户决定

---

## 验收对照（来自设计稿 §8）

- [ ] SubAgent 暴露给 parent 的工具签名与 Proma 一致
- [ ] 同步 / 后台两种模式都支持
- [ ] 嵌套工具默认折叠
- [ ] 后台任务用侧栏看完整 stream
- [ ] 模型可分档、可覆盖
- [ ] TA 模式完全无影响（不注册 Agent 工具）
- [ ] 子 agent 防递归（无 Agent/TaskOutput/TaskStop 在白名单）
- [ ] Parent 取消时所有 in-flight subagent 也取消
- [ ] `subagent_runs.jsonl` 记录每次运行
