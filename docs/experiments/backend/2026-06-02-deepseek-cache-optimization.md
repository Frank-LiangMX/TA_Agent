# DeepSeek 前缀缓存命中率优化分析

> 创建日期：2026-06-02
> 状态：分析完成（待实施）
> 关联参考：Reasonix 开源项目（esengine/DeepSeek-Reasonix）

---

## 1. 背景

DeepSeek API 提供自动前缀缓存机制：当连续请求的 messages 数组前缀字节相同时，命中的 token 按缓存价计费（约为未命中的 1/50）。对于长时间编码会话，缓存命中率直接决定成本。

本分析对比了 Reasonix（DeepSeek 原生 Agent）的缓存策略与 ta_agent 现状，识别可迁移的优化点。

---

## 2. Reasonix 缓存策略摘要

Reasonix 将"字节稳定的 prompt 前缀"作为最高架构约束，贯穿所有设计决策：

| 策略 | 做法 | 复杂度 |
|------|------|--------|
| 系统提示一次性组装 | 启动时组装，会话内永不修改 | 架构层面 |
| Compose-on-Tail | 临时状态（计划模式、内存更新）注入用户消息尾部 | ~30 行 |
| reasoning_content 不回传 | 响应专用字段，下一轮请求不带回去 | ~5 行 |
| 双模型隔离会话 | 规划器和执行器各自独立会话，互不干扰前缀 | 架构层面 |
| 低频压缩 | 仅在 token 达到窗口 80% 时触发，用模型做摘要而非截断 | ~200 行 |

---

## 3. ta_agent 现状分析

### 3.1 系统提示组装流程

`build_system_prompt()`（`backend/agent_main.py:616`）每轮调用，组装以下组件：

| 组件 | 来源 | 同一会话内是否变化 |
|------|------|-------------------|
| Base prompt（TA/General） | `BASE_SYSTEM_PROMPT` / `GENERAL_SYSTEM_PROMPT` | 不变 |
| System context（OS 等） | `_get_system_context()` | 不变 |
| Workspace section | `_format_workspace_section()` | 不变 |
| Workflow mode instructions | `MODE_INSTRUCTIONS[mode]` | 不变 |
| Conventions 文档 | `retrieve_conventions()` / `get_conventions_context()` | 不变（除非调用 `load_conventions`） |
| Memory index | `_append_memory_profile()` 读磁盘 | 不变（除非 memory 写入工具修改了 `index.md`） |

**结论：如果 conventions 和 memory 未变化，系统提示每轮重建产出的字节完全一致。** 重建本身是冗余计算，但不会破坏 DeepSeek 的前缀缓存。

### 3.2 已有的缓存兼容处理

#### reasoning_content 不回传 ✅

`server.py` 的 `_convert_history_message()`（206 行）只提取 `content` 和 `toolCalls`，`thinking` 字段存在持久化里但不发给 API。**这一点已经做对了。**

#### conventions 变化时主动重建 messages[0] ✅

`agent_main.py:1077-1083` 和 `server.py:642-658`：当 `load_conventions` 工具被调用后，代码主动重建系统提示并替换 `messages[0]`。**处理正确。**

### 3.3 存在的问题

#### 问题 1：Memory 写入未触发系统提示重建

当模型调用 `append_profile_fact`、`update_project_profile` 或 `record_correction` 时：
1. `index.md` 被修改
2. 下一轮 `agent_loop()` 的 `_append_memory_profile()` 读到新内容
3. 系统提示字节变化 → 前缀缓存失效

与 conventions 的处理不一致：conventions 变化时代码**主动重建** `messages[0]`，但 memory 变化时**无此机制**，仅在下次 `agent_loop` 自然读到新内容。

**影响**：memory 写入是低频事件（由模型自主触发），但在写入后的下一轮会破坏缓存。

#### 问题 2：历史压缩策略过于激进

`_compress_history()`（`agent_main.py:717`）在消息超过 20 条时触发截断：
- assistant 消息截断到 1000 字符
- tool 结果截断到 200 字符
- user 消息截断到 2000 字符

问题：
1. **触发频率高**：20 条消息阈值远低于 Reasonix 的上下文窗口 80%，在工具密集的会话中几轮就会触发
2. **截断破坏前缀**：截断后的内容字节变了，导致前缀不匹配
3. **截断长度不固定**：基于字符数截断，每次压缩结果可能因消息内容不同而不同

对比 Reasonix：仅在 token 达到窗口 80% 时触发，用模型做摘要，保留最近 16K token 原文。

---

## 4. 优化方案

### 4.1 Memory 写入后重建系统提示（对齐 conventions 处理方式）

**改动位置**：`agent_main.py` 工具执行循环 + `server.py` 工具执行循环

**改动内容**：在 memory 写入工具执行后，像 conventions 一样重建 `messages[0]`。

**涉及工具**：`append_profile_fact`、`update_project_profile`、`record_correction`

**代码量**：~5 行 × 2 处

**风险**：低。memory 写入是低频事件，重建开销可忽略。

### 4.2 压缩策略优化

**改动位置**：`agent_main.py` 的 `_compress_history()`

**改动内容**：
1. 提高触发阈值：从 20 条改为基于 token 估算的动态阈值（如上下文窗口的 70%）
2. 固定截断长度：使用固定 token 数而非字符数，保证截断结果稳定
3. 保留最近消息原文：最近 N 条消息不截断（类似 Reasonix 的 `defaultTailTokens`）

**代码量**：~30-50 行

**风险**：中。需要验证截断策略对不同会话长度的适应性，以及模型在收到截断历史后的推理质量。

---

## 5. 预期收益

| 场景 | 当前 | 优化后 |
|------|------|--------|
| 常规对话（无 memory 写入，<20 条消息） | 缓存应已命中 | 无变化 |
| 工具密集会话（>20 条消息） | 压缩触发，缓存失效 | 延迟压缩，缓存存活更久 |
| Memory 写入后 | 下一轮缓存失效 | 主动重建，字节一致 |

**核心结论**：ta_agent 的系统提示在稳定状态下已经是字节一致的，前缀缓存理论上应能命中。主要的缓存破坏来自压缩策略过于激进和 memory 写入后的隐式前缀变化。

---

## 6. 不需要改的部分

| 我最初认为需要改的 | 实际情况 |
|-------------------|---------|
| 缓存系统提示，避免每轮重建 | 不需要。重建产出的字节一致，无害 |
| conventions 注入到用户消息 | 不应该。现有机制（重建 messages[0]）已正确处理 |
| 重新设计系统提示组装 | 不需要。组装逻辑本身没有问题 |

---

## 7. 待确认事项

1. DeepSeek 的前缀缓存是否对 messages 数组的每一项都做字节匹配，还是只匹配 system 消息？（影响压缩策略的优化方向）
2. 当前 DeepSeek API 的 `prompt_cache_hit_tokens` 统计是否准确？（可用于验证优化效果）
3. `_compress_history()` 的 20 条阈值是否是根据实际场景调优过的？（改动前需了解原始设计意图）
4. 是否需要在前端展示缓存命中率统计？（便于观测优化效果）

---

## 8. 实施建议

- **Phase 1**：memory 写入后重建 messages[0]（~10 行改动，风险极低）
- **Phase 2**：压缩策略优化（~50 行改动，需测试验证）
- **Phase 3**（可选）：前端缓存命中率展示（便于长期观测）
