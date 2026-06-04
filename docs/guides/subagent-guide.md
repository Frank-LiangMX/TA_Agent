# 通用模式 SubAgent 使用指南

> 适用版本：v0.28+（仅 **general** 模式生效，TA 模式不暴露）
> 阅读对象：终端用户、推广 demo

---

## 一、是什么

SubAgent 是通用工作台（general mode）下的**任务委派工具**：主 agent 可以把一个子任务甩给"专业子角色"（代码探索 / 技术调研 / 代码评审）执行，子角色用受限的、独立上下文的 agent 循环跑完后把结果摘要返回。

跟主 agent 的区别：

- **独立 context**：子 agent 拿不到父 agent 的历史，prompt 要自包含
- **受限工具白名单**：子 agent 只能用它专属的工具集（**不能**调 Agent / TaskOutput / TaskStop → 防止递归）
- **独立模型**：默认按 `model_tier` 选便宜模型（haiku 档），可单独覆盖
- **同步 / 后台两种模式**：同步直接拿结果，后台返回 task_id 后续用 TaskOutput 取

## 二、什么时候用

| 场景 | 用哪个 |
|------|--------|
| 让 AI 看一下某段代码长啥样、调用关系 | `explorer` |
| 调研一个第三方库 / API / 最佳实践 | `researcher` |
| 检查刚写的代码有没有 bug / 风格问题 | `code-reviewer` |

主 agent 会**自己判断**是否需要调 SubAgent 工具。你只需要在自然语言里**提一下** SubAgent 偏好，比如：

> "用 explorer 帮我看一下 `src/lib/auth` 这个目录"

> "请 researcher 调研一下 React 19 server component 的迁移注意事项"

如果你不指定，主 agent 也会自己选合适的（看任务是不是探索 / 调研 / 评审类）。

## 三、怎么用

### 3.1 同步任务（最常用）

直接在聊天框说：

```
帮我用 explorer 看一下 src 目录的代码结构
```

主 agent 会自动委派子任务，结果直接显示在当前消息里（带 "SubAgent · 代码探索" 卡片）。

### 3.2 后台任务（耗时 > 30s 时用）

```
请用 researcher 后台调研 react-router v7 的迁移方案
```

行为：

- 父 agent **不阻塞**——立即返回，task_id 显示在卡片里
- 父 agent 继续响应你的其他消息
- 后台任务跑完时，前端会推 `subagent_done` 事件自动更新卡片
- 父 agent 可以调 `TaskOutput` 工具拿结果，也可以让用户自己看 SidePanel

### 3.3 停止后台任务

点 SubAgentCard 的 **[停止]** 按钮，或者用 `TaskStop(task_id="...")` 工具。

### 3.4 看后台任务详情

点 SubAgentCard 右上角的 **[查看进度]** 按钮 → 弹出右侧 SidePanel，能看到：
- 完整任务状态
- 嵌套工具调用列表
- 完整结果（不截断）

## 四、配置

### 4.1 模型覆盖

默认模型选择规则：

| SubAgent | 默认 tier | 默认模型（可被覆盖） |
|----------|----------|---------------------|
| explorer | haiku | `glm-4-flash`（轻量） |
| researcher | haiku | `glm-4-flash`（轻量） |
| code-reviewer | sonnet | `glm-5`（主模型） |

> 注：如果你环境里没装这些默认模型，**会回退到当前激活模型**。

想给某个 subagent 单独换模型？

1. 设置 → **Agent** 标签页
2. 滚到底部 → "SubAgent 模型覆盖"
3. 在下拉框里选模型
4. 保存（自动持久化到 `app-config.json` 的 `subagent_model_overrides` 字段）

### 4.2 查看运行日志

每次 subagent 跑完，**追加一行**到：

- **Windows**: `%USERPROFILE%\.tagent\subagent_runs.jsonl`
- **macOS / Linux**: `~/.tagent/subagent_runs.jsonl`

字段：

```json
{
  "ts": "2026-06-05T12:34:56.789Z",
  "session_id": "xxx",
  "subagent_type": "explorer",
  "task_id": "subagent-abc123",
  "model": "glm-4-flash",
  "run_in_background": false,
  "status": "completed",
  "total_steps": 3,
  "total_tokens_in": 0,
  "total_tokens_out": 0,
  "duration_ms": 1234,
  "error": null
}
```

## 五、UI 展示

SubAgent 任务在会话里以**单行折叠按钮**展示（对齐 Proma 风格，v0.29+）：

- **折叠态**：
  - 状态图标（运行中 spinner / 错误 X / 成功）
  - 子 agent 角色图标（Compass / BookOpen / ClipboardCheck）
  - 语义短语（"正在探索代码结构" / "正在审查代码" 等）
  - 工具调用计数（"N 项工具调用"）
  - 后台任务标记

- **展开态**：
  - 提示词（可单独折叠成单行）
  - 子工具列表（每行一个工具名 + 参数预览）
  - 最终输出（**Markdown 渲染**）
  - 底部统计行（步数 / 耗时 / tokens）

> 实现细节：v0.29 起，agent_loop 在子 agent 调工具时会 emit `subagent_tool` 事件，
> server.py 转发到 WebSocket，前端实时更新 SubAgentCard 的工具列表。
> 不再是"提交后看到完整结果"的盲盒。

## 六、常见问题

### Q: 我看不到 "SubAgent · xxx" 卡片？

- 确认你在 **general 模式**（左下角或顶部"工作模式"切换）
- TA 模式不显示 SubAgent 工具

### Q: 点了 [停止] 但子 agent 还在跑？

- 当前实现：子 agent 没有实时中断机制，会在**当前 step 完成后**自然结束
- 不会无限阻塞——`max_iterations: 15` 是硬上限

### Q: 后台任务消失 / 列表找不到？

- 后台任务完成后会从 `SubAgentOrchestrator.background_tasks` 自动移除
- 但 `subagent_runs.jsonl` 里**永远有记录**
- 要拿历史结果，用 `TaskOutput(task_id="...")` 工具或查日志文件

## 七、与 TA 资产流程的关系

**SubAgent 是通用工作台的能力，TA 资产流程完全不变**：

- TA 模式不暴露 Agent 工具
- SubAgent 白名单不含任何 TA 专用工具（`check_mesh_budget` / `texture_info` 等）
- TA 工作流仍然走单 agent 路径

详见 `docs/decisions/subagent-architecture.md`。
