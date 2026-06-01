# 记忆系统说明（用户 / 开发者）

## 三层是什么

| 名字 | 文件 | 谁维护 | 干什么 |
|------|------|--------|--------|
| **目录 index** | `index.md` | Agent + 你 | 很短，每轮对话都会看；只放导航和少量规矩 |
| **事实 facts** | `facts.md` | Agent（你说「记住」） | 工具路径、习惯等；**需要时再读** |
| **说明书 SOP** | `sops/*.md` | **开发者** | 复杂流程怎么做的操作手册 |

TA 模式另有 **L1 规则 / L2 纠正**（资产推断学习），与 facts 不是一回事。

## 数据在哪

开发环境：`.ta_agent/memory/general/` 或 `.ta_agent/memory/ta/`

设置 → **记忆** 可预览 index 与 facts。

## 开发者：如何加 SOP

1. 在 `.ta_agent/memory/{模式}/sops/` 下新建 `xxx_sop.md`
2. 写清：何时用、步骤、禁止事项、用什么工具
3. 在 `index.md` 加一行：`某场景 → sops/xxx_sop`
4. Agent 通过 `memory_read_sop(name="xxx_sop")` 按需读取

可参考：`docs/sops/tagent_memory_sop.md`（记忆写入决策树）

## 从旧版升级

若你以前只有 `profile.md`，首次启动后端会自动拆到 `facts.md` 并生成 `index.md`。
