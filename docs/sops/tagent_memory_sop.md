# TAgent 记忆写入 SOP

> 给 Agent：决定某条信息是否写入长期记忆、写到哪里。

## 写到哪里

| 内容 | 写入 |
|------|------|
| 工具路径、venv、编辑器等环境事实 | `append_profile_fact` → section **工具路径** |
| 工作习惯（如不擅自用 Playwright） | section **习惯偏好**；若一句全局规矩也可写在 index `[RULES]` |
| TA 命名/质量等项目约定摘要 | section **项目约定**（TA）；细节放 conventions |
| 一次性任务、当前文件名 | **不写入** |
| 复杂操作流程 | 请开发者写 `sops/xxx_sop.md`，index 加指针 |

## 写入前

- 用户明确说「记住」→ 必须调用工具，禁止口头答应
- 不确定 → 问：「是否记入长期记忆？」

## 写入后

- 调用 `get_memory_stats`，核对 `facts_preview` / `index_preview`
- 向用户说明时只引用 preview 里存在的内容

## 读取

- 需要具体路径 → `memory_read_facts(section="工具路径")`
- 需要流程 → `memory_read_sop(name="...")`
