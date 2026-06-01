# 工作台双模式（TA / 通用）实施台账

> 创建：2026-06-01  
> 状态：**进行中**（开发前先查本表，避免与旧文档打架）  
> 关联设计：`docs/experiments/backend/2026-06-01-dual-mode-memory-design.md`

---

## 0. 先分清两个「双模式」

文档里出现过两套概念，不要混用：

| 名称 | 含义 | 配置字段 | 主文档 |
|------|------|----------|--------|
| **客户端双模式** | 本地独立运行 vs 联机连公司服务器 | `app-config.json` → `mode`: `local` / `online` | `docs/decisions/client-dual-mode-design.md` |
| **工作台双模式** | 游戏 TA 资产流水线 vs 通用办公/编码工作台 | `agent_mode`: `ta` / `general` | **本文件** |

二者正交：例如「本地 + 通用」「联机 + TA」均可。

---

## 1. 目标（工作台双模式）

| 目标 | 说明 |
|------|------|
| 界面隔离 | 通用模式不展示资产库/审核/流水线等 TA 专页 |
| 会话隔离 | 会话列表、WebSocket 恢复按 `agentMode` 过滤 |
| 记忆隔离 | `runtime/memory/ta` 与 `runtime/memory/general` 分目录 |
| 工具隔离 | 通用模式仅暴露白名单工具 + MCP |
| 工作区 | 每会话可绑目录；未指定则用共享「默认工作区」 |
| 隐私 | 系统提示不写本机绝对路径；`~` 在工具执行时展开 |
| 长期记忆 | 用户环境事实（如 Blender 路径）写入 L0，并注入对话 |

---

## 2. 已完成 ✅

### 2.1 配置与运行时

| 项 | 说明 | 代码位置 |
|----|------|----------|
| 运行模式读取 | 环境变量 `TAGENT_AGENT_MODE` > `app-config.json` > 默认 `ta` | `config.py` → `get_agent_runtime_mode()` |
| 记忆命名空间 | 与运行模式同名 `ta` / `general` | `config.py` → `get_memory_namespace()` |
| 默认工作区 | `runtime/workspaces/default`，显示名「默认工作区」 | `config.py` → `get_default_workspace_path()` |
| 会话创建 | 通用模式自动写 `workspacePath` / `workspaceName` | `session_manager.py` → `create_session()` |
| 空工作区回填 | `get_session` 时 general 会话补默认工作区 | `session_manager.py` → `_ensure_general_workspace()` |

### 2.2 后端 Agent

| 项 | 说明 | 代码位置 |
|----|------|----------|
| 通用系统提示 | 办公/编码 + 工作区说明，无 TA 流水线 | `agent.py` → `GENERAL_SYSTEM_PROMPT` |
| TA 系统提示 | 原 `BASE_SYSTEM_PROMPT` 保留 | `agent.py` |
| 路径隐私 | 提示中用 `~`；工具前 `expand_user_path` | `agent.py` 路径段；`tools/path_resolve.py` |
| L0 注入对话 | 每轮 `build_system_prompt` 附加 profile | `agent.py` → `_append_memory_profile()` |
| 工具白名单 | general 仅核心 + `mcp__*` | `tools/registry.py` → `GENERAL_CORE_TOOL_NAMES` |
| 工作区文件工具 | read / write / list（限制在工作区内） | `tools/core/workspace_tools.py` |
| 工作区上下文 | 每轮 `run_agent` 绑定会话目录 | `tools/workspace_context.py`；`server.py` → `run_agent` |
| WebSocket 恢复 | 无效 sessionId 复用最近会话，避免刷新新建 | `server.py` → `/ws` |
| 工具 API 按模式 | `/api/tools` 列表与 `tier_summary` 按模式统计 | `server.py`；`get_tier_summary_for_mode()` |

### 2.3 前端

| 项 | 说明 | 代码位置 |
|----|------|----------|
| 模式切换 UI | 设置 → 工作模式 → TA / 通用 | `ModeSettings.tsx` |
| 导航隔离 | general：对话 / 工作区 / 历史 / 设置 | `Sidebar.tsx`；`App.tsx` → `isViewAllowed` |
| 工作区页 | 文件树 + 只读预览 | `GeneralWorkspaceView.tsx`；`services/workspace.ts` |
| 历史页 | 按工作区分组、搜索 | `GeneralHistoryView.tsx` |
| 对话顶栏工作区 | 精简条：名称 + 设置/浏览 | `MainPanel.tsx` |
| 工具管理刷新 | 切换模式后 Tab 数量与列表一致 | `ToolSettings.tsx`；`SettingsView.tsx` |
| 记忆设置按模式 | namespace、L0 预览、文案区分 | `MemorySettings.tsx`；`/api/memory/profile` |
| 权限按模式 | 仅列出当前模式可用工具；修复 API 字段 | `PermissionSettings.tsx`；`/api/permissions` |
| L0 追加工具 | `append_profile_fact` 合并写入 | `memory_llm_tools.py` |
| 工作区页改路径 | 工作区页内更改目录 + 浏览 | `GeneralWorkspaceView.tsx` |
| 初始连接 | 优先 `localStorage` sessionId，减少误建新会话 | `App.tsx` |

### 2.4 记忆（部分）

| 项 | 说明 | 代码位置 |
|----|------|----------|
| 分模式存储目录 | `memory/{namespace}/profile.md` 等 | `tools/memory/file_provider.py` |
| 通用模式记忆指引 | 工具路径等写入 `update_project_profile` | `agent.py` GENERAL 段；`memory_llm_tools.py` 描述 |
| 分析流程注入 L0/L1 | 仅资产推断链路 | `tools/memory/memory_tools.py` → `build_memory_context()` |

---

## 3. 未完成 / 待做 📋

### P1 — 通用模式「能用、不串」

| 项 | 优先级 | 说明 |
|----|--------|------|
| 参考文档同步 | 高 | 更新 `reference/backend.md`、`reference/frontend.md` 工作台章节（见 §6） |
| 通用模式用户指南 | 高 | `guides/general-workbench.md`：工作区、历史、记忆、与 TA 切换 |
| `record_correction` 通用语义 | 中 | 现 Schema 偏资产纠正；通用优先 `append_profile_fact` |

### P2 — 体验与 Proma 对齐

| 项 | 说明 |
|----|------|
| 历史 vs 标签栏说明 | 空状态/引导：标签=当前打开，历史=浏览归档 |
| 设置页编辑 L0 | 可预览；手动编辑 API/UI 可选 |
| 文件树写操作 | 与 `workspace_write_file` 能力对齐的 UI（可选） |
| 任务/工具时间线 | 长任务可观测（曾讨论，未做） |

### P3 — 设计文档 Phase（见记忆设计稿）

| Phase | 内容 | 设计稿章节 |
|-------|------|------------|
| P1 | 模式隔离存储 + 按模式注入 + 统计 | 已基本完成 |
| P2 | L0 **自动**提炼 pipeline（非仅靠工具手动） | §5.1 |
| P3 | `global_user_profile` + 跨模式手动同步 | §4.1、§8 |
| P3 | 通用模式只读 Subagent 并行 | §9 |
| P4 | 记忆审计 UI + 历史数据迁移工具 | §8、§12 |

### 搁置 / 明确不做（当前版本）

| 项 | 说明 |
|----|------|
| 旧会话兼容 | 用户要求不保留 legacy；缺 `agentMode` 的条目按当前模式匹配 |
| 系统提示写死本机路径 | 已改为 `~` + 工具展开 |
| 通用模式暴露 TA 资产工具 | 已白名单拦截 |

---

## 4. 已知问题 / 技术债 ⚠️

| 问题 | 影响 | 建议处理 |
|------|------|----------|
| `progress.md` 未跟踪工作台双模式 | 容易以为没做 | 见 §6，本表为单一事实来源 |
| `README.md` 双模式仍写「规划中」 | 对外表述过时 | 改为链接本表 |
| `update_project_profile` 整段覆盖 | 模型若仍调用整段更新可能冲掉 L0 | 已提供 `append_profile_fact`，需观察使用率 |
| 插件层仍可向 TOOLS 注册 | general 若安装 TA 向插件可能出现在 plugin Tab | 插件按模式标签或安装时校验 |
| 微信 Bridge | 有 UI 壳，与通用工作流未打通 | `electron/wechat/`；单独排期 |
| Electron 刷新 | Ctrl+R；模式切换需重启后端读 `agent_mode` | `docs/reference/electron.md` 可补一句 |

---

## 5. 验收清单（发版前自检）

- [ ] `agent_mode=general` 时侧边栏无 TA 专页
- [ ] 新建通用会话默认工作区为「默认工作区」，工具可 `workspace_list_dir`
- [ ] 切换 TA ↔ 通用后，工具管理 Tab 数量变化且列表正确
- [ ] 系统提示中无当前用户真实绝对路径
- [ ] 用户说「记住 Blender 路径」后，下轮对话 L0 段可见（且写入 `memory/general/profile.md`）
- [ ] 刷新页面不无故新增空会话
- [ ] TA 模式分析/审核/入库行为与改前一致

---

## 6. 文档维护分工

| 文档 | 动作 |
|------|------|
| **本文件** | 每完成一项改 §2/§3；发版前勾 §5 |
| `2026-06-01-dual-mode-memory-design.md` | **设计**不变；实现状态以本表为准 |
| `docs/README.md` | 已加本表链接 |
| `README.md` | 双模式小节改为链接本表 |
| `progress.md` | 增加「工作台双模式」条目指向本表（不重复罗列） |
| `reference/backend.md` | **待写**：§ 工作台模式、工具白名单、工作区 API、记忆注入 |
| `reference/frontend.md` | **待写**：通用导航、General* 视图、模式切换 |
| `guides/general-workbench.md` | **待新建**：用户向说明 |

---

## 7. 建议开发顺序（接下来）

```
1. 同步 reference 文档（避免后人改错）
2. general-workbench 用户指南（短）
3. MemorySettings / PermissionSettings 按模式
4. L0 合并更新工具或 API
5. 设计稿 P2：L0 自动 pipeline
6. 设计稿 P3：global_user_profile + Subagent
```

---

## 8. 变更记录

| 日期 | 变更 |
|------|------|
| 2026-06-01 | 初版：汇总 TA/通用已实现项、待办、文档分工、与记忆设计稿 Phase 对齐 |
| 2026-06-01 | 记忆/权限按模式、append_profile_fact、工作区页改路径 |
