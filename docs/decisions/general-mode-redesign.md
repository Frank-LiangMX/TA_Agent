# 决策：通用 Agent 模式靠拢主流设计

> 日期：2026-06-03 | 状态：设计中 | 实施入口：`docs/decisions/general-mode-redesign-plan.md`（待写）

## 背景

`ta_agent` 当前支持两种 Agent 模式：

- **TA 模式**（`agent_mode: 'ta'`）：54 个工具，资产扫描、Blender 脚本、UE 导入等
- **通用模式**（`agent_mode: 'general'`）：18 个核心工具 + `mcp__*` 动态匹配

通用模式当前实现"轻量降级版"：
- 工作区只是 session 上的一个 `workspacePath` 字符串
- **零权限审批**（仅路径 containment 检查）
- 工具是硬编码白名单

但用户希望通用模式对标主流 Agent（Proma、DeepSeek-Reasonix、hermes-agent），提供真正可用的"通用编程助手"体验。

## 参考项目核心模式

| 维度 | Proma | DeepSeek-Reasonix | hermes-agent |
|---|---|---|---|
| 工作区 | 多工作区持久化 + per-session cwd | `Workspace` struct per agent run | 单个 `TERMINAL_CWD` env |
| 权限 | 3-mode (auto/bypass/plan) + per-session 白名单 | 纯策略 (allow/ask/deny) + rememberRule | 三层 (hardline/dangerous/per-session) + 永久白名单 |
| 工具 | SDK 原生 + 9 个 SAFE 白名单 | 17 个 builtin，compile-time 注册 | 70+ 工具，AST 扫描 + toolset 分组 |
| Bash 识别 | `SAFE_BASH_PATTERNS` 正则 | `bash_readonly.go` 子命令表 | `readOnlyBashCommands` 隐式 |

**共同模式：**
1. Bash 是通用工具，靠 read-only 分类器恢复只读语义
2. 读/写是第一道闸；写操作走 `allow/ask/deny` 矩阵
3. 危险模式**显式枚举**（rm -rf、chmod 777、force-push、curl\|sh、DROP TABLE）
4. 工具输出截断（DeepSeek 32KB / hermes 100KB）
5. "记住这次决定"是基础功能，区别只在持久化粒度

## 决策

### D1. 工作区：单路径 + 持久化（不学 Proma 多工作区）

- 维持 `workspacePath` 单路径设计（参考 DeepSeek-Reasonix 的 `Workspace` struct 思路）
- **新增**：路径写入 `app-config.json`，重连后自动恢复
- **不引入**多工作区管理 —— `ta_agent` 不是终端产品，过度设计

### D2. 权限：三层审批模型（学 hermes-agent）

```
HARDLINE（绝对禁止，内置不可绕过）
  rm -rf /, mkfs, shutdown, format, DROP DATABASE

DANGEROUS（每次询问，UI 弹窗）
  rm -r, chmod 777, git push --force, curl|sh, kill -9 -1

SAFE（自动放行，静默）
  Read, Glob, Grep, WebSearch
  ls, cat, git status/log/diff
```

- 审批 UI：MainPanel 底部"待审批"横条
- 白名单粒度：
  - **本次会话** → 内存 Map（Proma 风格）
  - **永久** → 写到 `app-config.json`（hermes 风格）

### D3. 工具：分 toolset（学 hermes-agent）

把当前的 `GENERAL_CORE_TOOL_NAMES` 硬编码白名单改造成可注册 toolset：

```
[DEFAULT_TOOLSET]    # 通用模式默认开启
  read_file, write_file, edit_file
  glob_files, grep_files
  list_dir, run_bash
  web_search, web_fetch

[TA_TOOLSET]         # TA 模式追加
  scan_assets, analyze_mesh
  blender_script, ue_import

[OPTIONAL_TOOLSETS]  # 按需开启
  computer_use, browser_automation
```

`get_tools_for_mode()` 改为按 mode 合并多个 toolset。

### D4. 工具输出截断

- 通用模式：上限 100KB（hermes 同款）
- 超出部分截断并附 `[truncated N bytes]` 提示

## 实施顺序

| 阶段 | 内容 | 工作量 | 风险 |
|---|---|---|---|
| 1 | `DANGEROUS_PATTERNS` 正则表 + 拦截 | 小 | 低 |
| 2 | MainPanel 审批横条 + 模态确认 | 中 | 中（动 UI 状态机） |
| 3 | 工作区路径持久化到 `app-config.json` | 小 | 低 |
| 4 | Toolset 注册机制重构 | 中 | 中（动 `registry.py`） |
| 5 | 工具输出截断 | 小 | 低 |

## 暂不做的（YAGNI）

- 多工作区切换（Proma 全套）
- Plan mode（需要 SDK 适配）
- 工具子命令细粒度权限（如 git 只允许 status）
- 永久黑名单（只支持永久白名单）

## 验收标准

- 通用模式下执行 `rm -rf /` 立即被拦截
- 通用模式下执行 `rm -r tmp/` 弹审批横条
- 通用模式下点"本次会话都允许"后，同一会话内不再弹
- 通用模式下点"永久允许"后，重启应用不再弹
- 工作区路径重启后自动恢复
- TA 模式行为不受影响

## 影响面

| 模块 | 是否改动 |
|---|---|
| `backend/agent_main.py` `create_client()` | 不动 |
| `packages/tools/registry.py` | 改（toolset 注册） |
| `packages/tools/workspace_context.py` | 改（持久化） |
| `apps/web/src/components/layout/MainPanel.tsx` | 改（审批 UI） |
| `apps/web/src/components/general/GeneralWorkspaceView.tsx` | 改（持久化） |
| `backend/config.py` | 改（白名单存储） |
| `apps/web/server/server.py` | 改（审批 RPC） |

## 关联文档

- `docs/decisions/client-dual-mode-design.md` — 客户端双模式（旧文，需要补充说明通用模式的工作区与权限）
- `docs/reference/agent-onboarding.md` — 需同步更新
- `AGENTS.md` § 2 状态表 — 完成后打勾
