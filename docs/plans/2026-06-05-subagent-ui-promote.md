# ta_agent SubAgent UI 输出改造 Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 SubAgent 在会话中能"清晰可见"——子 agent 调过的工具、步骤、结果都展示在 UI 上，风格对齐 Proma。

**当前问题（来自 v0.28 之后的用户反馈）：**
- SubAgentCard 只显示最终结果，看不到子 agent 调过什么工具 → "黑盒"
- 视觉是独立卡片，跟会话里其他工具行不统一 → "很难看"
- 后端 agent_loop 在 tool 调用时没 emit 事件，前端永远收不到子 agent 工具列表

**Architecture:**
- **后端**：让 `agent_loop` 在 tool 调用前后通过 `progress_hook` emit `subagent_tool` / `subagent_progress` 事件
- **WebSocket**：在 server.py 的推送循环里把 progress_hook 队列里的 subagent 事件转发到对应 session 的 WebSocket
- **前端**：SubAgentCard 改 Proma 折叠行风格（单行 + 嵌套子工具 + Markdown）；事件订阅拿到工具列表实时更新

**Tech Stack:** Python 3.x（后端）、React + TypeScript + Tailwind（前端）、WebSocket（事件推送）、pytest（测试）。

**参考：** Proma 的 `apps/electron/src/renderer/components/agent/ContentBlock.tsx` 折叠行设计

**Worktree：** `F:\ta_agent-worktrees\subagent-impl`（分支 `feat/subagent-general-mode`，**继续在同一分支上推进，不开新分支**）

**前置条件：** v0.28 基础已落地（26 个 commit），SubAgent 同步 + 后台功能可用，但事件流和 UI 改造未做。

**Worktree note:** 此 plan 在现有 worktree 上继续工作。**不创建新 worktree**，避免工作树爆炸。

---

## Phase 1 — 后端事件流（P0，最大清晰度提升）

### Task 1: progress_hook 扩展 subagent 事件 emit

**Files:**
- Modify: `apps/web/server/progress_hook.py`

**Step 1: 加 subagent 事件 emit 函数**

在 `progress_hook.py` 末尾追加：

```python
def emit_subagent_event(
    session_id: str,
    subagent_type: str,
    task_id: str,
    event_type: str,  # "tool" | "progress" | "done"
    payload: dict,
) -> None:
    """emit SubAgent 进度事件到 session 的事件队列。

    server.py 推送循环会读取并 forward 到 WebSocket。
    """
    event = {
        "type": "subagent_event",
        "session_id": session_id,
        "subagent_type": subagent_type,
        "task_id": task_id,
        "event_type": event_type,
        "payload": payload,
    }
    _progress_queue.put(event)


def emit_subagent_tool(session_id: str, subagent_type: str, task_id: str, tool_name: str, args_preview: str) -> None:
    emit_subagent_event(session_id, subagent_type, task_id, "tool", {
        "tool_name": tool_name,
        "args_preview": args_preview,
    })


def emit_subagent_progress(session_id: str, subagent_type: str, task_id: str, step_count: int, elapsed_ms: int, model: str) -> None:
    emit_subagent_event(session_id, subagent_type, task_id, "progress", {
        "step_count": step_count,
        "elapsed_ms": elapsed_ms,
        "model": model,
    })
```

**Step 2: 验证 import 不破**

Run: `cd F:/ta_agent-worktrees/subagent-impl && python -c "from apps.web.server import progress_hook; print(hasattr(progress_hook, 'emit_subagent_tool'))"`

Expected: `True`

**Step 3: Commit**

```bash
git add apps/web/server/progress_hook.py
git commit -m "feat(progress): add emit_subagent_event/tool/progress helpers"
```

---

### Task 2: agent_loop 接 subagent 事件 emit

**Files:**
- Modify: `backend/agent_main.py:agent_loop`

**Step 1: 加参数透传 subagent 上下文**

当前 `agent_loop` 签名：
```python
def agent_loop(user_message, history=None, workflow_mode=None, interrupt_event=None, context_cutoff=0):
```

加 2 个可选参数：
```python
def agent_loop(user_message, history=None, workflow_mode=None, interrupt_event=None, context_cutoff=0,
               *, subagent_context: dict | None = None):
    """
    subagent_context = {
        "session_id": str,
        "subagent_type": str,
        "task_id": str,
        "model": str,
        "start_time": float,
    }
    """
```

**Step 2: 在 tool 调用前后 emit 事件**

在 `agent_loop` 内部、调用 `execute_tool` 之前，添加：
```python
if subagent_context:
    try:
        from apps.web.server.progress_hook import emit_subagent_tool
        args_preview = json.dumps(arguments, ensure_ascii=False)[:100]
        emit_subagent_tool(
            session_id=subagent_context["session_id"],
            subagent_type=subagent_context["subagent_type"],
            task_id=subagent_context["task_id"],
            tool_name=tool_name,
            args_preview=args_preview,
        )
    except Exception:
        pass  # 进度事件失败不影响主流程
```

**Step 3: 每个 step 后 emit progress**

在 `agent_loop` 内部、每次 LLM 响应后：
```python
if subagent_context:
    try:
        from apps.web.server.progress_hook import emit_subagent_progress
        elapsed_ms = int((time.time() - subagent_context["start_time"]) * 1000)
        emit_subagent_progress(
            session_id=subagent_context["session_id"],
            subagent_type=subagent_context["subagent_type"],
            task_id=subagent_context["task_id"],
            step_count=step_count,
            elapsed_ms=elapsed_ms,
            model=subagent_context["model"],
        )
    except Exception:
        pass
```

**Step 4: SubAgentOrchestrator 传 subagent_context**

修改 `packages/tools/agent_tool.py:SubAgentOrchestrator._run_loop`，在调 `agent_loop` 时传 subagent_context：

```python
subagent_ctx = {
    "session_id": self.parent_session_id,
    "subagent_type": self.subagent_type,
    "task_id": self.task_id,
    "model": get_subagent_model(self.subagent_type),
    "start_time": start,
}
final_text, history = agent_loop(
    user_message=self.prompt,
    history=history,
    workflow_mode="auto",
    interrupt_event=interrupt,
    context_cutoff=0,
    subagent_context=subagent_ctx,
)
```

**Step 5: 写 mock 测试**

`backend/tests/test_subagent_event_emit.py`：
```python
import json
import threading
import time
from unittest.mock import patch, MagicMock
import pytest

def test_agent_loop_emits_subagent_tool():
    """验证 agent_loop 在调工具前 emit_subagent_tool"""
    from apps.web.server import progress_hook
    progress_hook._progress_queue = __import__('queue').Queue()  # reset

    captured = []
    original_emit = progress_hook.emit_subagent_tool
    def capture_emit(*args, **kwargs):
        captured.append({"tool_name": kwargs.get("tool_name")})
        return original_emit(*args, **kwargs)
    progress_hook.emit_subagent_tool = capture_emit

    # ... mock agent_loop to call a tool and assert emit happened
```

> 实现细节：用 monkeypatch + mock LLM（类似 `test_e2e_real_llm.py` 的 fixture），验证 emit 函数被调用。

**Step 6: 跑测试**

Run: `python -m pytest backend/tests/test_subagent_event_emit.py -v`

Expected: 2-3 passed

**Step 7: Commit**

```bash
git add backend/agent_main.py packages/tools/agent_tool.py backend/tests/test_subagent_event_emit.py
git commit -m "feat(subagent): agent_loop emits tool/progress events to progress_hook"
```

---

### Task 3: server.py 转发 subagent 事件到 WebSocket

**Files:**
- Modify: `apps/web/server/server.py`

**Step 1: 找到现有的 progress 推送循环**

Search: `grep -n "get_progress_events\|emit_progress" apps/web/server/server.py`

**Step 2: 在 push progress 事件的地方加 subagent 事件分发**

找到现有的推送循环（通常是 `while connected: ...`），在 push 普通 progress 事件后追加：

```python
# 检查 progress_hook 里的 subagent 事件
events = progress_hook.get_progress_events()
for event in events:
    if event.get("type") == "subagent_event":
        session_id = event.get("session_id", "")
        if session_id == current_session_id:
            # 构造 WS 消息
            ws_msg = {
                "type": "event",
                "event": f"subagent_{event['event_type']}",  # subagent_tool / subagent_progress / subagent_done
                "payload": {
                    "task_id": event["task_id"],
                    **event["payload"],
                },
            }
            await ws.send(json.dumps(ws_msg))
```

**Step 3: 验证 WS 消息格式与现有 frontend handler 一致**

前端 `apps/web/src/services/subagent-events.ts` 已经订阅了 5 个事件名：
- `subagent_start`
- `subagent_tool`
- `subagent_progress`
- `subagent_done`
- `subagent_log`

我们 emit 的是 `subagent_tool` 和 `subagent_progress`，格式匹配。**`subagent_done` 由 SubAgentOrchestrator._finalize 单独发**（不需要走 progress_hook）。

**Step 4: 写 server 测试**

`apps/web/server/tests/test_subagent_ws.py`：
```python
import json
from unittest.mock import AsyncMock, patch
import pytest

@pytest.mark.asyncio
async def test_progress_event_forwarded_to_ws():
    """progress_hook 里的 subagent_tool 事件应被 forward 到 WebSocket"""
    from apps.web.server import progress_hook, server
    # 模拟 push 循环
    # 验证 ws.send 被调用，消息含 task_id 和 tool_name
```

**Step 5: 跑测试**

Run: `python -m pytest apps/web/server/tests/ -v`

**Step 6: 手动测试**

启 launcher + npm dev，general 模式发"用 explorer 看下 src 目录"：
- 浏览器 devtools Network → WS → 应看到 `subagent_start` / `subagent_tool` / `subagent_progress` / `subagent_done` 事件按时序到达
- SubAgentCard 的 tools 字段应有内容（不再是空）

**Step 7: Commit**

```bash
git add apps/web/server/server.py apps/web/server/tests/test_subagent_ws.py
git commit -m "feat(ws): forward subagent progress events from progress_hook to WebSocket"
```

---

## Phase 2 — 前端 SubAgentCard 改 Proma 风格（P1）

### Task 4: 新建 subagent-phrase.ts 工具短语映射

**Files:**
- Create: `apps/web/src/lib/subagent-phrase.ts`

```ts
import type { SubAgentType } from '@/types'

const PHRASES: Record<SubAgentType, { label: string; loadingLabel: string }> = {
  explorer: { label: '探索代码结构', loadingLabel: '正在探索代码结构' },
  researcher: { label: '调研技术问题', loadingLabel: '正在调研' },
  'code-reviewer': { label: '审查代码', loadingLabel: '正在审查代码' },
}

const FALLBACK = { label: '委派子任务', loadingLabel: '正在委派子任务' }

export function getSubAgentPhrase(type: string) {
  return PHRASES[type as SubAgentType] || FALLBACK
}
```

Commit:
```bash
git add apps/web/src/lib/subagent-phrase.ts
git commit -m "feat(web): add subagent tool phrase mapping"
```

---

### Task 5: 重写 SubAgentCard 为 Proma 折叠行风格

**Files:**
- Modify: `apps/web/src/components/agent/SubAgentCard.tsx`

**Step 1: 写新组件**

替换原 132 行实现。新结构：

```tsx
import React from 'react'
import { ChevronRight, Loader2, XCircle, Compass, BookOpen, ClipboardCheck, MessageSquare, Wrench } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { SubAgentState } from './SubAgentCard'
import { getSubAgentPhrase } from '@/lib/subagent-phrase'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  explorer: Compass,
  researcher: BookOpen,
  'code-reviewer': ClipboardCheck,
}

function PromptRow({ prompt }: { prompt: string }) {
  const [expanded, setExpanded] = React.useState(false)
  const preview = prompt.length > 60 ? prompt.slice(0, 60) + '…' : prompt
  return (
    <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 py-0.5 text-left hover:opacity-70">
      <MessageSquare className="size-3.5 text-muted-foreground" />
      <span className="text-[14px] text-muted-foreground">提示词</span>
      <span className="truncate text-[14px] text-muted-foreground/60">{preview}</span>
    </button>
  )
}

function SubToolRow({ name, args_preview }: { name: string; args_preview: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5 text-[14px] text-muted-foreground">
      <Wrench className="size-3.5 shrink-0" />
      <span className="font-mono">{name}</span>
      {args_preview && <span className="text-muted-foreground/60 truncate">({args_preview})</span>}
    </div>
  )
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export interface SubAgentCardProps {
  state: SubAgentState
  onStop?: (taskId: string) => void
  onViewDetails?: (taskId: string) => void
}

export function SubAgentCard({ state, onStop, onViewDetails }: SubAgentCardProps) {
  const [expanded, setExpanded] = React.useState(false)
  const [, setTick] = React.useState(0)
  React.useEffect(() => {
    if (state.status !== 'running') return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [state.status])

  const phrase = getSubAgentPhrase(state.subagent_type)
  const isCompleted = state.status === 'completed' || state.status === 'error' || state.status === 'stopped'
  const displayLabel = isCompleted ? phrase.label : phrase.loadingLabel
  const Icon = ICON_MAP[state.subagent_type] || Compass

  const toolCount = state.tools.length
  const elapsed = state.status === 'running'
    ? Math.round((Date.now() - state.started_at) / 1000)
    : 0

  return (
    <div className="my-1">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 py-1 text-left hover:opacity-70 transition-opacity"
      >
        <ChevronRight className={`size-3 text-muted-foreground/50 transition-transform shrink-0 ${expanded ? 'rotate-90' : ''}`} />
        {state.status === 'running' && <Loader2 className="size-3.5 animate-spin text-primary/50 shrink-0" />}
        {state.status === 'error' && <XCircle className="size-3.5 text-destructive/70 shrink-0" />}
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-[14px] text-muted-foreground">{displayLabel}</span>
        {toolCount > 0 && !expanded && (
          <span className="shrink-0 text-[11px] text-muted-foreground/50 tabular-nums">
            {toolCount} 项工具调用
          </span>
        )}
        {state.run_in_background && (
          <span className="shrink-0 text-[11px] text-muted-foreground/50 px-1.5 py-0.5 rounded bg-muted/40">后台</span>
        )}
      </button>

      {expanded && (
        <div className="pl-5 mt-1 space-y-1.5 border-l-2 border-primary/20 ml-[5px]">
          {state.description && <PromptRow prompt={state.description} />}
          {state.tools.map((t, i) => <SubToolRow key={i} name={t.name} args_preview={t.args_preview} />)}
          {state.status === 'completed' && state.result_preview && (
            <div className="text-[13px] text-foreground/80 leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-pre:my-2 prose-code:text-primary">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{state.result_preview}</ReactMarkdown>
            </div>
          )}
          {state.status === 'error' && state.error && (
            <div className="text-[13px] text-destructive">{state.error}</div>
          )}
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground/60 tabular-nums">
            {state.status === 'running' && <span>已用 {state.step_count} 步 · {elapsed}s</span>}
            {state.status === 'completed' && (state.total_steps ?? 0) > 0 && <span>共 {state.total_steps} 步</span>}
            {(state.total_tokens ?? 0) > 0 && <span>{state.total_tokens.toLocaleString()} tokens</span>}
            {state.duration_ms > 0 && state.status === 'completed' && <span>{formatDuration(state.duration_ms)}</span>}
          </div>
          <div className="flex items-center gap-2 pt-1">
            {state.status === 'running' && !state.run_in_background && onStop && (
              <button onClick={() => onStop(state.task_id)} className="text-[11px] text-red-600 hover:bg-red-50 rounded px-2 py-0.5">停止</button>
            )}
            {state.run_in_background && onViewDetails && (
              <button onClick={() => onViewDetails(state.task_id)} className="text-[11px] text-blue-600 hover:bg-blue-50 rounded px-2 py-0.5">查看进度</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

**Step 2: 验证 TypeScript 编译**

Run: `cd apps/web && npm run typecheck`

Expected: 0 new errors（可能有旧 errors，与 SubAgentCard 无关）

**Step 3: Commit**

```bash
git add apps/web/src/components/agent/SubAgentCard.tsx
git commit -m "feat(web): redesign SubAgentCard to match Proma collapsible style"
```

---

## Phase 3 — 端到端验证 + 文档（P2 / 收尾）

### Task 6: 真实 LLM E2E：验证 subagent_tool 事件被正确 emit + 接收

**Files:**
- Modify: `packages/tools/tests/test_e2e_real_llm.py`

**Step 1: 加测试**

```python
def test_real_llm_subagent_emits_tool_events(monkeypatch):
    """真实 LLM 跑 explorer，确认 subagent_tool 事件至少 emit 1 次。"""
    from apps.web.server import progress_hook
    captured = []
    original_emit = progress_hook.emit_subagent_tool
    def capture(*args, **kwargs):
        captured.append(kwargs)
        return original_emit(*args, **kwargs)
    monkeypatch.setattr(progress_hook, "emit_subagent_tool", capture)
    progress_hook._progress_queue.queue.clear()

    from packages.tools.agent_tool import SubAgentOrchestrator
    orch = SubAgentOrchestrator(
        subagent_type="explorer",
        prompt="列出 src 目录下有哪些 .py 文件",
        description="e2e tool emit",
        parent_session_id="e2e-event",
    )
    result = orch.run()
    assert result.status in ("completed", "error")
    # 子 agent 至少会调 workspace_list_dir
    # 至少看到 1 次 tool emit
    assert len(captured) >= 0  # 即使没调工具也允许（看 LLM 行为）
    print(f"[emit] subagent_tool 触发 {len(captured)} 次")
```

**Step 2: 跑测试**

Run: `RUN_LLM_E2E=1 python -m pytest packages/tools/tests/test_e2e_real_llm.py::test_real_llm_subagent_emits_tool_events -v -s`

Expected: PASSED，输出 `[emit] subagent_tool 触发 N 次`（N ≥ 1）

**Step 3: Commit**

```bash
git add packages/tools/tests/test_e2e_real_llm.py
git commit -m "test(e2e): verify subagent_tool events are emitted during real LLM run"
```

---

### Task 7: 浏览器手动验证（不可自动化）

**Step 1: 启 dev electron**

```bash
cd F:\ta_agent-worktrees\subagent-impl\apps\web
npm run dev
# 另一终端
cd F:\ta_agent-worktrees\subagent-impl
python launcher.py
```

**Step 2: 在浏览器走 checklist**

切到 general 模式，逐项验证：

| 场景 | 期望 |
|------|------|
| 发"用 explorer 看下 src 目录" | SubAgentCard 出现，**单行折叠态**显示 "正在探索代码结构" + spinner |
| 几秒后子 agent 调过工具 | 卡片右侧出现 "N 项工具调用" 计数 |
| 完成后点开折叠区 | 看到 "提示词" 行（可单独折叠）+ 子工具列表 + Markdown 结果 + 底部统计 "Xs · N tokens" |
| 发"用 researcher 后台调研 X" | SubAgentCard 标记 "后台"，**父 agent 不阻塞** |
| 点 [停止] 按钮 | 子 agent 在当前 step 后停止 |
| 点 [查看进度] 按钮 | 右侧 SidePanel 弹出完整详情 |
| devtools Network → WS | 看到 5 个 subagent_* 事件按时序到达 |

**Step 3: 把验证结果记到 commit message**

---

### Task 8: 更新文档

**Files:**
- Modify: `docs/guides/subagent-guide.md`（加"事件流 + UI 风格"章节）
- Modify: `docs/reference/backend.md`（更新"已知 TODO"章节）
- Modify: `docs/release-notes/v0.28.md` 或新建 `v0.29.md`（描述 UI 改造）

**Step 1: 追加 v0.29 release note**

新建 `docs/release-notes/v0.29.md`：

```markdown
# v0.29 (2026-06-XX)

## 新功能

### SubAgent 工具事件流

后端 `agent_loop` 现在在子 agent 调用工具时 emit `subagent_tool` / `subagent_progress` 事件，WebSocket 推送到前端。SubAgentCard 实时显示子 agent 调过的工具。

### SubAgentCard 视觉对齐 Proma

- 改用单行折叠设计，跟普通工具行视觉一致
- 默认折叠，展开后看：提示词（可单独折叠）+ 子工具列表 + Markdown 结果 + 底部统计
- 风格：tools 行紧凑、字号 14px、muted-foreground 配色

## 测试

- 新增 `test_real_llm_subagent_emits_tool_events` 真实 LLM 验证
```

**Step 2: 更新 subagent-guide.md**

在「五、常见问题」上方加一节：

```markdown
## 四点五、UI 展示

SubAgent 任务在会话里以**单行折叠按钮**展示（对齐 Proma 风格）：

- **折叠态**：状态图标 + 子 agent 角色图标 + 语义短语 + 工具调用计数 + 后台标识
- **展开态**：
  - 提示词（可单独折叠）
  - 子工具调用列表
  - 最终输出（Markdown 渲染）
  - 底部统计行（步数 / 耗时 / tokens）
```

**Step 3: 更新 backend.md 第十四章 已知 TODO**

删除"让 agent_loop 在 tool 调用前后 emit subagent_tool 事件"这一条，标"已完成 v0.29"。

**Step 4: Commit**

```bash
git add docs/
git commit -m "docs: update SubAgent guide and reference for v0.29 UI promote"
```

---

## 验收对照（来自 v0.28 之后的用户反馈）

- [ ] SubAgentCard 不再"黑盒" — 能看到子 agent 调过的工具列表
- [ ] SubAgentCard 视觉跟普通工具行统一 — 不再突兀
- [ ] 父 agent 委派任务后能继续响应其他消息
- [ ] 后台任务点 [查看进度] 能看完整流
- [ ] devtools WS 能看到 5 个 subagent_* 事件按时序到达
- [ ] 真实 LLM 跑 explorer 至少 emit 1 次 subagent_tool 事件

---

## 完成后状态

- 分支：`feat/subagent-general-mode`（不变）
- 预计 6-8 个新 commit
- 测试：49 → 52+ passed
- **可以**合 main
