# 输入建议功能实验

> 创建时间：2026-05-21
> 最后更新：2026-05-21
> 状态：✅ 已完成

---

## 目标

在对话输入框上方显示 AI 生成的建议提示，帮助用户快速进行下一步操作。

## 背景

参考业界通用实现，在 Agent 完成任务后，可以根据上下文生成建议的下一步提示，显示在输入框上方。用户点击即可发送，提升交互效率。

---

## 设计方案

### 交互流程

```
Agent 完成任务
    ↓
后端生成建议（基于上下文）
    ↓
WebSocket 发送 prompt_suggestion 事件
    ↓
前端在输入框上方显示建议卡片
    ↓
用户点击 → 填充到输入框 / 直接发送
```

### UI 设计

```
┌─────────────────────────────────────────────────┐
│  💡 建议：审核完成，是否进入入库阶段？            × │
├─────────────────────────────────────────────────┤
│                                                 │
│  [消息列表区域]                                  │
│                                                 │
├─────────────────────────────────────────────────┤
│  [输入框]                                       │
│  [发送按钮]                                     │
└─────────────────────────────────────────────────┘
```

### 建议来源

**方案 C：混合方案（已采用）**
- 规则匹配为主，根据最后调用的工具判断阶段
- 分析完成 → "是否进入审核阶段？"
- 审核完成 → "是否入库？入库需要提供 UE5 Content 路径"
- 入库完成 → "导入清单已生成，请在 UE5 中运行脚本"

---

## 实现方案

### 后端改动

**文件**：`fronted/server/server.py`

```python
# 1. 定义阶段建议规则
STAGE_SUGGESTIONS = {
    "analyze": "分析完成，是否进入审核阶段？",
    "review": "审核完成，是否入库？入库需要提供 UE5 Content 路径。",
    "intake": "入库完成。导入清单已生成，请在 UE5 Python Console 中运行脚本完成导入。",
}

# 2. 在 agent_loop 中追踪工具调用
last_tool_names: list[str] = []

# 3. 生成建议函数
def _generate_suggestion(tool_names: list[str]) -> str | None:
    """根据本次对话调用的工具，生成建议的下一步提示。"""
    for tool_name in reversed(tool_names):
        stage = TOOL_TO_STAGE.get(tool_name)
        if stage and stage in STAGE_SUGGESTIONS:
            return STAGE_SUGGESTIONS[stage]
    return None

# 4. WebSocket 发送时附带建议
await send_event(ws, "done", {
    "sessionId": session.session_id,
    "content": final_answer,
    "suggestion": suggestion,
})
```

### 前端改动

**文件**：`fronted/src/components/layout/MainPanel.tsx`

```tsx
// 1. 添加状态
const [promptSuggestion, setPromptSuggestion] = useState<string | null>(null)

// 2. 监听 done 事件
const unsubDone = tagentClient.on('done', (payload: any) => {
  const { content, sessionId, suggestion } = payload
  if (suggestion) {
    setPromptSuggestion(suggestion)
  }
  // ...
})

// 3. 渲染建议卡片（输入框上方）
{promptSuggestion && (
  <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-amber-50 rounded-lg border border-amber-200">
    <span className="text-sm text-amber-600">💡 建议：</span>
    <button onClick={() => setInput(promptSuggestion)}>
      {promptSuggestion}
    </button>
    <button onClick={() => setPromptSuggestion(null)}>×</button>
  </div>
)}
```

---

## 文件改动清单

| 文件 | 改动内容 | 代码量 |
|------|---------|--------|
| `fronted/server/server.py` | 添加建议生成逻辑、WebSocket 事件 | ~30 行 |
| `fronted/src/components/layout/MainPanel.tsx` | 添加状态、事件监听、UI 组件 | ~20 行 |

**总计：约 50 行代码**

---

## 实验记录

### 2026-05-21 规划

- 确定采用规则匹配方案（方案 C）
- 后端根据工具调用历史判断阶段
- 前端复用现有 WebSocket 事件机制

### 2026-05-21 实现 ✅

**后端改动**：
- ✅ 添加 `STAGE_SUGGESTIONS` 规则映射
- ✅ 添加 `_generate_suggestion()` 函数
- ✅ 在 `run_agent()` 中追踪工具调用
- ✅ 在 `done` 事件中附带 `suggestion` 字段

**前端改动**：
- ✅ 添加 `promptSuggestion` 状态
- ✅ 监听 `done` 事件获取建议
- ✅ 渲染建议卡片 UI（输入框上方）
- ✅ 点击建议填充到输入框
- ✅ 发送消息时清除建议

---

## 结论

输入建议功能已实现，采用规则匹配方案，根据工具调用历史生成阶段相关的建议。用户点击建议可快速填充到输入框，提升交互效率。

**后续优化方向**：
- 可考虑让 LLM 生成更智能的建议
- 可根据用户历史行为调整建议内容

---

## 问题修复记录

### 2026-05-21 修复：scan 阶段无建议

**问题**：发送"分析当前目录下的资产"后，建议为 `None`。

**原因**：`check_project_config` 和 `scan_directory` 映射到 `"scan"` 阶段，但 `STAGE_SUGGESTIONS` 中没有 `"scan"` 的建议。

**修复**：添加 `"scan"` 阶段的建议：

```python
STAGE_SUGGESTIONS = {
    "scan": "扫描完成，是否开始分析资产？",
    "analyze": "分析完成，是否进入审核阶段？",
    "review_done": "审核完成，是否入库？入库需要提供 UE5 Content 路径。",
    "intake": "入库完成。导入清单已生成，请在 UE5 Python Console 中运行脚本完成导入。",
}
```

**验证**：测试脚本确认建议正确生成：
```
Tools called: ['check_project_config', 'scan_directory', 'check_file_info']
Suggestion: 扫描完成，是否开始分析资产？
```

### 2026-05-21 改进：建议内容与 UI 样式

**问题**：
1. 建议内容是 Agent 对用户的建议，而不是用户可能想对 Agent 说的话
2. UI 样式（amber 色系）与整体设计风格不一致

**修复**：

1. **修正建议内容**：改为用户可能想对 Agent 说的话
```python
STAGE_SUGGESTIONS = {
    "scan": "开始分析这些资产",
    "analyze": "进入审核阶段",
    "review_done": "入库到 UE5，路径是",
    "intake": "查看入库清单",
}
```

2. **优化 UI 样式**：使用与整体设计一致的风格
```tsx
{promptSuggestion && (
  <div className="flex items-center gap-2 mb-3 animate-msg-pop">
    <button
      onClick={() => {
        setInput(promptSuggestion)
        setPromptSuggestion(null)
      }}
      className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-accent rounded-full text-sm text-muted-foreground hover:text-foreground transition-colors border border-border/50"
    >
      <span className="text-xs opacity-60">→</span>
      <span className="truncate">{promptSuggestion}</span>
    </button>
    <button onClick={() => setPromptSuggestion(null)} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
      ×
    </button>
  </div>
)}
```

**设计要点**：
- 使用 `bg-muted` / `bg-accent` 而非 amber 色系
- `rounded-full` 胶囊样式，更现代
- `animate-msg-pop` 入场动画与消息一致
- 箭头 `→` 暗示"下一步操作"
- 悬停时 `hover:bg-accent` 提供交互反馈
