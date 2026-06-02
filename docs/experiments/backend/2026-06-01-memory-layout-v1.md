# 记忆布局 v1（B+：index + facts + sops）

> 日期：2026-06-01 | 状态：已实现（v1）  
> 目标：L0 不再臃肿；稳定事实按需读取；为 C 方案（SOP 检索、session search、自动整理）预留扩展。

---

## 1. 为什么要改

原先 `profile.md`（L0）同时承担 **目录** 与 **事实库**，导致：

- Blender / Unity / 习惯全部堆进每轮 Prompt
- 重复条目（同键多条路径）
- 缺少开发者 **SOP 说明书** 层

v1 拆成三层（与 GenericAgent 指针对齐，编号仍保留 TA 的 L1/L2 纠正链）：

| 层 | 文件 | 职责 | 每轮注入 Prompt |
|----|------|------|-----------------|
| **index** | `index.md` | 短目录 + `[RULES]` 全局规矩 | ✅ 是 |
| **facts** | `facts.md` | 路径、偏好、项目约定详情 | ❌ 按需 `memory_read_facts` |
| **sops** | `sops/*.md` | 开发者写的流程说明书 | ❌ 按需 `memory_read_sop`（v1 工具已预留） |
| L1 | `rules.json` | TA 推断规则（纠正压缩） | 分析时按特征召回 |
| L2 | `corrections.jsonl` | 原始纠正 | 不注入 |

**legacy**：旧 `profile.md` 在首次启动时自动迁入 `facts.md`，并生成默认 `index.md`。

---

## 2. 目录结构

```text
.ta_agent/memory/{ta|general}/
  index.md           # ≤ ~1500 字符目标
  facts.md           # ≤ 8000 字符硬顶
  profile.md         # 迁移后不再写入（可删除）
  rules.json
  corrections.jsonl
  sops/
    README.md
    tagent_memory_sop.md      # 可选，从 docs 复制
    general_workspace_sop.md  # 可选
```

命名空间与运行模式一致：`memory/general/`、`memory/ta/`。

---

## 3. 写入规则（Agent）

1. **稳定事实**（路径、习惯）→ `append_profile_fact` → 写入 **facts** 对应 `section`
2. **全局一句规矩**（高 ROI）→ 可写 facts `## 习惯偏好` 或 index `[RULES]`
3. **不确定是否长期记忆** → 先问用户，再写入
4. **写入后** → `get_memory_stats` 看 `index_preview` / `facts_preview`
5. **需要具体路径** → `memory_read_facts(section="工具路径")`
6. **复杂流程** → 开发者维护 `sops/`，Agent 用 `memory_read_sop`

同键去重：`Blender:` / `Python:` 等 **键前缀** 在 section 内只保留最新一行。

---

## 4. 工具 API

| 工具 | 说明 |
|------|------|
| `append_profile_fact` | 追加/更新 facts 某 section |
| `memory_read_facts` | 读取 facts 全文或某 section |
| `memory_read_sop` | 读取 `sops/{name}.md` |
| `update_project_profile` | 合并更新 **facts** 全文（保留 index） |
| `get_memory_stats` | 统计 + index/facts 预览 |
| `record_correction` | TA L2（不变） |

---

## 5. 迁移

启动 `FileMemoryProvider` 时：

1. 若存在 `profile.md` 且无 `facts.md` → 内容迁入 `facts.md`
2. 若无 `index.md` → 从 facts 的 `##` 标题生成导航行 + 默认说明
3. `profile.md` 保留不删（用户可手动删），不再读取

---

## 6. 后续 C 方案（不 breaking）

| 增量 | 说明 |
|------|------|
| session_search | 搜历史会话，不改 index/facts 布局 |
| index 自动整理 | ROI cleanup，只 patch index |
| 更严写入 | No Execution No Memory 网关 |
| global_profile | 可选第四文件 |

---

## 7. 验收（通用模式）

1. 清空记忆 → 说「记住 Blender 路径」→ `facts.md` 有内容，`index.md` 有导航
2. 新开会话 → System 只含 index，不含 Blender 全文
3. 问路径 → Agent 应调 `memory_read_facts` 后回答
4. TA 模式纠正 → 仍写 L2/L1，与 facts 无关
