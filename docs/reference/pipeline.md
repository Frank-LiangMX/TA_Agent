# 资产流水线系统设计

> 前后端协同开发参考文档
> 前端：`F:\ta_agent\fronted` | 后端：`F:\ta_agent`

---

## 一、核心概念

### 流水线（Pipeline）

资产从扫描到入库的完整处理流程。每个步骤称为**阶段（Stage）**。

### 阶段（Stage）

流水线中的一个节点。每个阶段有：
- **提示词（prompt）**：发给 Agent 的自然语言指令，Agent 根据提示词自行决定调用什么工具
- **状态**：待执行 / 执行中 / 已完成 / 失败
- **分支**：从某个阶段分出的可选步骤

### 关键设计原则

**阶段不绑定具体工具**。每个阶段只描述"要做什么"，由 Agent 的 LLM 理解后自行选择工具：
- 新增阶段只需写一段描述，不需要改代码
- 不同项目可以用不同的提示词实现相同的阶段目标
- Agent 可以在一个阶段内调用多个工具

---

## 二、数据结构

### 流水线配置（`RUNTIME_DIR/configs/pipeline.json`）

```json
{
  "version": 1,
  "core_stages": [
    {"id": "scan", "label": "目录扫描", "icon": "FolderSearch", "description": "...", "order": 1},
    {"id": "analyze", "label": "AI 分析", "icon": "Brain", "description": "...", "order": 2},
    {"id": "review", "label": "人工审核", "icon": "FileCheck", "description": "...", "order": 3},
    {"id": "intake", "label": "资产入库", "icon": "Package", "description": "...", "order": 4}
  ],
  "custom_stages": [
    {
      "id": "export_materials",
      "label": "导出材质JSON",
      "insertAfter": "scan",
      "prompt": "从已扫描的 FBX 文件中提取材质信息，导出为 JSON 文件到 {output_dir}",
      "enabled": true
    }
  ]
}
```

**core_stages 字段**：id, label, icon, description, order（全部必填）
**custom_stages 额外字段**：insertAfter（必填，插入到哪个核心阶段之后）, prompt（必填，支持 {path} 变量）, enabled（可选，默认 true）

### 阶段执行记录（`RUNTIME_DIR/pipeline_runs.jsonl`）

每行一条执行记录：

```json
{
  "runId": "run_abc123",
  "stageId": "scan",
  "sessionId": "session_xyz",
  "status": "completed",
  "startedAt": "2026-05-18T14:30:00",
  "completedAt": "2026-05-18T14:32:15",
  "toolsUsed": ["scan_directory"],
  "summary": "扫描完成，发现 248 个资产"
}
```

---

## 三、后端 API

### 3.1 流水线配置

- `GET /api/pipeline` — 获取流水线配置
- `POST /api/pipeline` — 更新流水线配置（请求体：完整 RUNTIME_DIR/configs/pipeline.json）

### 3.2 阶段执行

`POST /api/pipeline/run`

```json
// 请求体
{ "stageId": "mesh_check", "variables": {"path": "D:/Project/Assets"}, "sessionId": "abc123" }

// 行为
1. 从 pipeline.json 读取 stage 的 prompt
2. 替换 {path} 等变量
3. 通过 session_manager 将 prompt 作为用户消息发送给 Agent
4. 记录执行到 RUNTIME_DIR/pipeline_runs.jsonl
```

### 3.3 查询

- `GET /api/pipeline/runs` — 执行记录（?stageId=&limit=20）
- `GET /api/pipeline/state` — 各阶段当前状态

---

## 四、执行流程

```
用户点击"面数检查"节点
    → 前端 POST /api/pipeline/run { stageId: "mesh_check", variables }
    → 后端读取 RUNTIME_DIR/configs/pipeline.json 中 mesh_check 的 prompt
    → 替换变量
    → 通过 WebSocket 发送给 Agent（复用 sendMessage 机制）
    → Agent LLM 理解 prompt → 决定调用 check_mesh_budget 工具
    → 前端跳转到对话页，显示执行过程
    → 执行完成 → 记录到 RUNTIME_DIR/pipeline_runs.jsonl
    → 流水线页面更新节点状态为"已完成"
```

---

## 五、扩展性

### 新增阶段

只需在 `RUNTIME_DIR/configs/pipeline.json` 中添加一个 stage 对象，写好 prompt。不需要改任何代码。

### 不同项目自定义

每个项目的 `RUNTIME_DIR/configs/pipeline.json` 独立：
- 角色项目：增加"骨骼检查"、"动画检查"
- 场景项目：增加"LOD 检查"、"碰撞体检查"
- UI 项目：增加"图标尺寸检查"

### 与对话联动

流水线执行的操作出现在对话历史中，用户可以继续追问。不产生独立上下文，复用现有会话机制。
