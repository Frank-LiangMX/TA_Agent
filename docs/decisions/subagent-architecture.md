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
