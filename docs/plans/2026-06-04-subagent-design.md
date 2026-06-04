# ta_agent SubAgent 能力补齐 — 设计稿

> 日期：2026-06-04
> 状态：已通过 brainstorming 5 个 section 评审
> 目标：通用 mode 下对齐 Proma 的 SubAgent 体验
> 影响范围：仅 `agent_mode == 'general'`；TA 模式保持单 agent 不变

## 背景与动机

ta_agent 2026-05-10 的 ADR `single-agent-architecture.md` 明确拒绝多 agent，理由是 TA 工作流线性、维护成本低。但 2026-06-02 提交 `540d562` 引入了通用工作模式（"工作台双模式"），原 ADR 前提不再适用。

通用 mode 下的用户痛点：「感觉 Proma 比我自己的更好用」。对比分析见 `.context/note.md`（2026-06-04 ta_agent vs Proma 架构能力对比）。核心差距在 SubAgent、PlanMode、通用工具集。本设计稿只解决 SubAgent 一项。

对齐目标：**使用体验对齐 Proma**（用户原话："对齐 promma 的话就没问题"）。

## 决策概要

| 项 | 决策 |
|---|---|
| 模式门控 | 仅 `agent_mode == 'general'` 注册 Agent 工具；TA 模式不暴露 |
| SubAgent 集合 | 照搬 Proma 三件套：`explorer` / `researcher` / `code-reviewer` |
| 执行模型 | 同步默认 + `run_in_background` 可选 |
| 模型分级 | 三档：explorer/researcher 走轻量模型；code-reviewer 走主模型；用户可在 `app-config.json` 覆盖 |
| 工具过滤 | 每个 SubAgent 独立的 `allowed_tools` 白名单；不包含 Agent 工具本身（防递归） |
| 记忆隔离 | 子 agent 全新 context，不读 parent 记忆；可显式调 `memory_read_facts` |
| MCP 共享 | 子 agent 复用 parent 的 MCP 连接池，不重建 |
| 上下文共享 | 否。子 agent 不知道 parent 历史；parent 通过 `prompt` 参数传上下文 |
| UI 嵌套工具 | 默认折叠（对齐 Proma 行为） |
| UI 后台任务 | 缩成一行卡片 + [查看进度] 弹侧栏（对齐 Proma） |

## 1. 整体架构

**核心定位**：SubAgent 在 ta_agent 里是**模式门控的工具**，不是独立 agent 框架。

```
parent agent (general mode)
  └─ Agent 工具调用
       └─ SubAgentOrchestrator
            ├─ 模式门控: 仅 agent_mode == 'general' 时注册
            ├─ SubAgent 选择: explorer | researcher | code-reviewer
            ├─ 模型路由: 按 subagent 选模型（用户可覆盖）
            ├─ 工具过滤: 按 subagent 配 allowed_tools
            ├─ 隔离的子会话: 新 task_id，无 parent 消息历史
            ├─ 复用: agent_loop() + 现有工具/MCP/记忆基础设施
            └─ 进度事件: 走 progress_hook 推回 WebSocket
```

**复用关系**：
- 复用 `backend/agent_main.py:801-1099` 的 `agent_loop()` — SubAgent 内部就是跑一个普通 agent 循环
- 复用 `registry.py` 的 tier 系统 — SubAgent 工具是新增 `subagent` tier
- 复用 `progress_hook.py` 推送进度
- 复用 `permissions.py` 的 dangerous 分类 — SubAgent 默认走 `worker auto-allow`（参考 Proma `agent-permission-service.ts:136`）
- 复用 `memory/` 但隔离 — SubAgent 不读 parent 记忆，每次跑都从空白开始

**不引入新依赖** — 用现有 Python asyncio 跑子循环即可，不需要任何 sub-agent 框架（CrewAI/AutoGen）。

## 2. Agent 工具接口（parent 视角）

**parent agent 看到的工具 schema**（`packages/tools/agent_tool.py`）：

```json
{
  "type": "function",
  "function": {
    "name": "Agent",
    "description": "委派任务给一个专业子 agent 处理。子 agent 拥有独立的上下文、工具集和模型，适合拆解大型任务。返回的是子 agent 产出的简洁摘要。",
    "parameters": {
      "type": "object",
      "properties": {
        "subagent_type": {
          "type": "string",
          "enum": ["explorer", "researcher", "code-reviewer"],
          "description": "子 agent 类型"
        },
        "prompt": {
          "type": "string",
          "description": "清晰描述子 agent 要完成的任务。包含必要上下文；不要假设子 agent 知道 parent 的历史"
        },
        "description": {
          "type": "string",
          "maxLength": 200,
          "description": "5-10 字的任务简述，用于 UI 和日志展示"
        },
        "run_in_background": {
          "type": "boolean",
          "default": false,
          "description": "true 时立即返回 task_id，parent 继续干活；之后用 TaskOutput 取结果"
        }
      },
      "required": ["subagent_type", "prompt", "description"]
    }
  }
}
```

**配套工具**（仅当使用后台模式时需要）：
- `TaskOutput(task_id, block, max_wait_ms)` — 获取后台 SubAgent 进度或最终结果
- `TaskStop(task_id)` — 取消一个后台 SubAgent

**设计选择：单 Agent 工具 + subagent_type 枚举**（不是「每个 subagent 一个工具」）。理由：
- 父 agent 只需学 1 个工具（节省 prompt token）
- 新增 subagent 不用动 prompt
- 与 Proma 模式完全一致

## 3. SubAgent 声明式定义

**新文件 `packages/tools/subagents.py`**：

```python
from dataclasses import dataclass
from typing import Literal

@dataclass
class SubAgentSpec:
    name: str                          # "explorer"
    display_name: str                  # "代码探索"
    description_for_parent: str        # 给 parent 看的一段说明（注入 system prompt）
    system_prompt: str                 # 子 agent 自己的 system prompt
    allowed_tools: list[str]           # 工具名白名单
    model_tier: Literal["haiku","sonnet","opus"]  # 默认分级
    max_iterations: int = 15
    max_runtime_sec: int = 300

SUBAGENTS: dict[str, SubAgentSpec] = {
    "explorer": SubAgentSpec(
        name="explorer",
        display_name="代码探索",
        description_for_parent=(
            "适合：理解代码库结构、定位文件、梳理调用关系。"
            "只能读，不能写。运行快、成本低。"
        ),
        system_prompt=(
            "你是一个代码探索专家。使用 Read/Grep/Glob 等只读工具回答问题。"
            "永远不要修改文件。最终返回一段简洁的代码地图 + 文件引用列表。"
        ),
        allowed_tools=[
            "workspace_read_file", "workspace_list_dir", "scan_directory",
            "discover_conventions", "check_file_info",
            "mcp__*",  # 任何 MCP 工具（启动时从 mcp_bridge 拉）
        ],
        model_tier="haiku",
    ),
    "researcher": SubAgentSpec(
        name="researcher",
        display_name="技术调研",
        description_for_parent=(
            "适合：调研第三方库、API 文档、最佳实践。"
            "可以联网搜索。结果是带引用的摘要。"
        ),
        system_prompt=(
            "你是一个技术调研专家。优先用 WebSearch / WebFetch 获取权威信息。"
            "返回时附带引用链接。"
        ),
        allowed_tools=[
            "workspace_read_file", "web_search", "web_fetch",
            "mcp__*",
        ],
        model_tier="haiku",
    ),
    "code-reviewer": SubAgentSpec(
        name="code-reviewer",
        display_name="代码评审",
        description_for_parent=(
            "适合：检查代码质量、bug、安全问题、风格一致性。"
            "输出按文件组织的 findings 列表。"
        ),
        system_prompt=(
            "你是一个严格的代码评审员。按严重程度（critical/warning/nit）"
            "组织发现的问题，每条标注文件路径和行号。"
        ),
        allowed_tools=[
            "workspace_read_file", "workspace_list_dir", "scan_directory",
            "mcp__*",
        ],
        model_tier="sonnet",
        max_iterations=10,
    ),
}
```

**MCP 工具通配符 `mcp__*`**：注册时把 `mcp_bridge.py` 当前已连接 server 的所有工具展开成具体名字（如 `mcp__playwright__browser_navigate`）。启动时一次性算清。

**用户覆盖点**（`app-config.json`）：
```json
{
  "subagent_model_overrides": {
    "explorer": "glm-4-flash",
    "code-reviewer": "glm-5"
  }
}
```

`backend/config.py` 增加 `get_subagent_model(subagent_type) -> str` 解析函数，先查 override，再回退到 `model_tier` 解析。

## 4. 前端显示（对齐 Proma）

**消息流布局** — 新增 `<SubAgentCard>` 组件（`apps/web/src/components/agent/SubAgentCard.tsx`，~300 行）：

```
┌──────────────────────────────────────────────────┐
│ ⏳ SubAgent · 代码探索 (explorer)                  │  ← 状态
│ "找到 LoginView 的依赖图"                           │  ← description
│ ─────────────────────────────────────────────── │
│  ↳ workspace_list_dir ./src                        │  ← 嵌套工具（默认折叠）
│  ↳ workspace_read_file src/LoginView.tsx           │
│ ─────────────────────────────────────────────── │
│ 已用 3 步 · 12.4s · glm-4-flash                    │  ← 进度/成本
└──────────────────────────────────────────────────┘
```

**四种状态**：running（蓝色 spinner）/ completed（绿色对勾）/ error（红色感叹号）/ stopped（灰色斜杠）。

**后台模式**：
```
┌──────────────────────────────────────────────────┐
│ ⏳ SubAgent · 技术调研 (researcher) · 后台         │
│ "调研 react-router v7 迁移方案"                    │
│ task_id: abc-123                                  │
│ [查看进度] [停止]                                  │
└──────────────────────────────────────────────────┘
```

**嵌套工具调用**：默认折叠（对齐 Proma `progress.md:74` "工具消息已过滤" 行为）。点开看完整步骤。

**WebSocket 事件**（`apps/web/src/types/events.ts` 新增 5 个）：

```typescript
type AgentEvent =
  | { type: 'subagent_start', subagent_type, task_id, description, run_in_background }
  | { type: 'subagent_tool', task_id, tool_name, args_preview }
  | { type: 'subagent_progress', task_id, step_count, elapsed_ms, model }
  | { type: 'subagent_done', task_id, status: 'completed'|'error'|'stopped', result_preview, total_steps, total_tokens }
  | { type: 'subagent_log', task_id, level, message }
```

**取消交互**：
- 父 chat 顶部"停止生成"按钮同时取消 parent + 所有 in-flight subagent
- SubAgentCard 的 [停止] 按钮只取消这一个
- 都走 `progress_hook.is_cancelled`

**UI 文件改动清单**：
- 新增 `apps/web/src/components/agent/SubAgentCard.tsx`
- 新增 `apps/web/src/components/agent/SubAgentSidePanel.tsx`（后台任务详情）
- 改 `ChatMessage.tsx` 注册 `subagent_task` 消息类型
- 改 `apps/web/src/types/events.ts` 加 5 个新 event type
- 改 `apps/web/src/services/websocket.ts` 处理新 event
- 新增 `apps/web/src/components/settings/SubAgentSettings.tsx`（让用户调模型覆盖）

## 5. 错误处理、取消、边界

**错误分类与降级**：

| 错误类型 | 处理 |
|---|---|
| LLM 错误（rate limit / 5xx / 超时） | 复用 `agent_main.py:866-902` 的 3x retry + 退避；失败 → `subagent_done status='error'` |
| 工具执行错误 | 错误作为 tool_result 返回给子 agent，让它自己恢复 |
| max_iterations 耗尽 | `subagent_done status='error'`, message="达到最大迭代次数" |
| max_runtime_sec 超时 | 同上 + timeout 标记 |
| 用户取消 | 复用 `progress_hook.is_cancelled`，子 agent 当前 tool_task.cancel() |

**防递归**：子 agent 的工具白名单不包含 `Agent` / `TaskOutput` / `TaskStop` 本身。

**Parent 取消 → SubAgent 取消**：`progress_hook.py` 扩展为 `Map<session_id, Event>`：

```python
class ProgressHook:
    _cancel_events: dict[str, asyncio.Event] = {}

    def set_cancel_event(self, session_id: str) -> asyncio.Event:
        ev = asyncio.Event()
        self._cancel_events[session_id] = ev
        return ev

    def cancel_session(self, session_id: str):
        if ev := self._cancel_events.get(session_id):
            ev.set()
```

**结果截断**：子 agent 最终只回一段 ≤ 4000 字符的摘要（`subagent_done.result_preview`）。

**上下文预算**：子 agent 触发 `InvalidParameter`（输入过长）→ 自动 `keep_recent=6` 重试（复用 `agent_main.py:886-893`）。

**记忆隔离**：默认不读 parent 记忆；可显式调 `memory_read_facts` 查询。

**MCP 共享**：子 agent 复用 parent 的 MCP 连接池（`mcp_bridge.py` 已有连接）。

**异常日志**：每个 subagent_run 写一行到 `subagent_runs.jsonl`（同级 `llm_calls.jsonl`）：

```json
{
  "ts": "2026-06-04T14:35:22.123Z",
  "session_id": "...",
  "subagent_type": "explorer",
  "task_id": "abc-123",
  "model": "glm-4-flash",
  "run_in_background": false,
  "status": "completed",
  "total_steps": 5,
  "total_tokens_in": 12450,
  "total_tokens_out": 820,
  "duration_ms": 12400,
  "error": null
}
```

## 6. 实施分 4 个 Phase

**Phase 1 — 同步 SubAgent（最小可用）**
- 新文件 `packages/tools/subagents.py`（SubAgentSpec + SUBAGENTS 字典）
- 改 `packages/tools/registry.py`：在 general 模式工具白名单加 `Agent` 工具
- 新文件 `packages/tools/agent_tool.py`（Agent 工具 + SubAgentOrchestrator 同步路径）
- 改 `backend/agent_main.py`：注入 SubAgent 描述到 system prompt（仅 general 模式）+ 注册 `subagent_runs.jsonl` 日志
- 新增 ADR `docs/decisions/subagent-architecture.md`
- 不动前端（先用通用的 tool_call 显示，能跑就行）

**Phase 2 — 前端 SubAgentCard**
- 新增 `apps/web/src/components/agent/SubAgentCard.tsx`
- 改 `ChatMessage.tsx` 注册 `subagent_task` 消息类型
- 改 `apps/web/src/types/events.ts` 加 5 个 event type
- 改 `apps/web/src/services/websocket.ts` 处理新 event
- 嵌套工具调用默认折叠

**Phase 3 — 后台 + TaskOutput/TaskStop**
- 扩 `packages/tools/agent_tool.py`：加 `run_in_background=True` 路径
- 新增 `apps/web/src/components/agent/SubAgentSidePanel.tsx`：查看后台任务完整 stream
- SubAgentCard 加 [停止] 按钮

**Phase 4 — 模型覆盖 + 设置页 + 收尾**
- 改 `backend/config.py`：加 `subagent_model_overrides` 字段
- 新增 `apps/web/src/components/settings/SubAgentSettings.tsx`
- 改 `progress_hook.py`：per-session cancel event
- 端到端测试

## 7. 测试策略

**单元测试**（`packages/tools/tests/`）
- `test_subagents.py`：SubAgentSpec 解析、工具白名单过滤、模型路由
- `test_agent_tool.py`：mock LLM，验证调用参数、结果截断、错误传播
- `test_progress_hook.py`：per-session cancel event 行为

**集成测试**（`backend/tests/`）
- `test_subagent_sync.py`：跑通 explorer 探索一个 mock 项目，验证返回摘要格式
- `test_subagent_cancel.py`：parent 取消时所有 in-flight subagent 都被取消
- `test_subagent_recursion_block.py`：子 agent 调 Agent 工具被工具白名单拦截

**端到端测试**（手动 checklist）
- 跑通用 mode 提"分析 src 目录的代码结构" → 看到 SubAgentCard 弹出 → 嵌套工具折叠 → 最终结果正确
- 后台跑 researcher → 父级继续发新消息 → TaskOutput 拉结果
- 取消父级 → 多个 SubAgentCard 同时被取消
- `app-config.json` 改 explorer 的 model → 下次调用生效

## 8. ADR 收尾

1. **保留** `docs/decisions/single-agent-architecture.md` 不删除（历史决策），加附录说明前提已变（2026-06-04 起通用 mode 已扩展为双模式）
2. **新增** `docs/decisions/subagent-architecture.md`：记录 SubAgent 的范围、模式门控、复用现有基础设施、Proma 对齐决策

## 验收标准

- [ ] SubAgent 暴露给 parent 的工具签名与 Proma 一致
- [ ] 同步 / 后台两种模式都支持
- [ ] 嵌套工具默认折叠
- [ ] 后台任务用侧栏看完整 stream
- [ ] 模型可分档、可覆盖
- [ ] TA 模式完全无影响（不注册 Agent 工具）
- [ ] 子 agent 防递归（无 Agent/TaskOutput/TaskStop 在白名单）
- [ ] Parent 取消时所有 in-flight subagent 也取消
- [ ] `subagent_runs.jsonl` 记录每次运行

## 引用

- `.context/note.md`（2026-06-04 ta_agent vs Proma 架构能力对比）
- `docs/decisions/single-agent-architecture.md`（被本次决策的附录更新）
- `backend/agent_main.py:801-1099`（被复用的 agent_loop）
- `packages/tools/registry.py:122-475`（被扩展的工具 tier）
- `packages/tools/progress_hook.py`（被扩展的 cancel event）
- `packages/tools/permissions.py`（被复用的危险分类）
- `backend/agent_main.py:866-902`（被复用的 LLM retry）
- `backend/agent_main.py:886-893`（被复用的历史压缩）
- `progress.md`（项目进度台账，待更新本任务的 P1/P2 待办）
- Proma 对照：`F:\Proma\apps\electron\src\main\lib\agent-orchestrator.ts`、`agent-permission-service.ts:136`（worker auto-allow）、`agent-prompt-builder.ts:33-88`（SUBAGENT_METADATA）
