# 资产流水线系统设计文档

> 前后端协同开发参考文档
> 前端：`F:\ta_agent\fronted`
> 后端：`F:\ta_agent`

---

## 一、核心概念

### 流水线（Pipeline）

资产从扫描到入库的完整处理流程。每个流程步骤称为**阶段（Stage）**。

### 阶段（Stage）

流水线中的一个节点。每个阶段有：
- **提示词（prompt）**：发给 Agent 的自然语言指令，Agent 根据提示词自行决定调用什么工具
- **状态**：待执行 / 执行中 / 已完成 / 失败
- **分支**：从某个阶段分出的可选步骤

### 关键设计原则

**阶段不绑定具体工具**。每个阶段只描述"要做什么"，由 Agent 的 LLM 理解后自行选择工具。这样：
- 新增阶段只需写一段描述，不需要改代码
- 不同项目可以用不同的提示词实现相同的阶段目标
- Agent 可以在一个阶段内调用多个工具

---

## 二、数据结构

### 流水线配置（`~/.ta_agent/pipeline.json`）

```json
{
  "version": 1,
  "core_stages": [
    {
      "id": "scan",
      "label": "目录扫描",
      "icon": "FolderSearch",
      "description": "扫描资产目录，发现文件",
      "order": 1
    },
    {
      "id": "analyze",
      "label": "AI 分析",
      "icon": "Brain",
      "description": "推断分类、材质、风格",
      "order": 2
    },
    {
      "id": "review",
      "label": "人工审核",
      "icon": "FileCheck",
      "description": "审核 AI 推断结果",
      "order": 3
    },
    {
      "id": "intake",
      "label": "资产入库",
      "icon": "Package",
      "description": "导入项目引擎",
      "order": 4
    }
  ],
  "custom_stages": [
    {
      "id": "export_materials",
      "label": "导出材质JSON",
      "insertAfter": "scan",
      "prompt": "从已扫描的 FBX 文件中提取材质信息，导出为 JSON 文件到 {output_dir}",
      "description": "Blender 提取材质数据",
      "enabled": true
    },
    {
      "id": "lod_check",
      "label": "LOD 检查",
      "insertAfter": "analyze",
      "prompt": "检查所有模型是否有 LOD 层级，列出缺失 LOD 的高面数资产",
      "description": "验证 LOD 完整性",
      "enabled": true
    }
  ]
}
```

### 字段说明

**core_stages（核心阶段）**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 唯一标识 |
| `label` | string | ✅ | 显示名称 |
| `icon` | string | ❌ | 图标名（Lucide） |
| `description` | string | ❌ | 阶段描述 |
| `order` | number | ✅ | 排序（1-4） |

**custom_stages（自定义阶段）**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 唯一标识 |
| `label` | string | ✅ | 显示名称 |
| `insertAfter` | string | ✅ | 插入到哪个核心阶段之后 |
| `prompt` | string | ✅ | 发给 Agent 的提示词，支持 `{path}` 等变量 |
| `description` | string | ❌ | 阶段描述 |
| `enabled` | boolean | ❌ | 是否启用（默认 true） |

### 阶段执行记录（`~/.ta_agent/pipeline_runs.jsonl`）

每次执行记录一行：

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

#### `GET /api/pipeline`

获取流水线配置。

**响应**：
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
      "description": "Blender 提取材质数据",
      "enabled": true
    }
  ]
}
```

#### `POST /api/pipeline`

更新流水线配置。

**请求体**：完整的 pipeline.json 内容。

**响应**：
```json
{ "success": true, "message": "流水线配置已更新" }
```

### 3.2 阶段执行

#### `POST /api/pipeline/run`

执行指定阶段（发送 prompt 给 Agent）。

**请求体**：
```json
{
  "stageId": "mesh_check",
  "variables": {
    "path": "D:/Project/Assets"
  },
  "sessionId": "abc123"
}
```

**行为**：
1. 从 pipeline.json 读取 stage 的 prompt
2. 替换 `{path}` 等变量
3. 通过 session_manager 将 prompt 作为用户消息发送给 Agent
4. 记录执行到 pipeline_runs.jsonl

**响应**：
```json
{
  "success": true,
  "runId": "run_abc123",
  "stageId": "mesh_check",
  "sessionId": "abc123",
  "prompt": "检查所有模型资产的面数是否超标...",
  "message": "已发送给 Agent 执行: 面数检查"
}
```

### 3.3 执行记录

#### `GET /api/pipeline/runs`

获取执行记录。

**查询参数**：
- `stageId`：按阶段过滤（可选）
- `limit`：返回条数（默认 20）

**响应**：
```json
{
  "runs": [
    {
      "runId": "run_abc123",
      "stageId": "scan",
      "sessionId": "session_xyz",
      "status": "completed",
      "startedAt": "2026-05-18T14:30:00",
      "prompt": "扫描目录 D:/Project/Assets...",
      "variables": {"path": "D:/Project/Assets"}
    }
  ],
  "count": 1
}
```

### 3.4 阶段状态

#### `GET /api/pipeline/state`

获取流水线各阶段的当前状态。

**响应**：
```json
{
  "stages": [
    {"id": "scan", "label": "目录扫描", "order": 1},
    {"id": "analyze", "label": "AI 分析", "order": 2},
    {"id": "review", "label": "人工审核", "order": 3},
    {"id": "intake", "label": "资产入库", "order": 4}
  ],
  "states": {
    "scan": {"status": "completed", "lastRun": {...}, "runCount": 3},
    "analyze": {"status": "pending", "lastRun": null, "runCount": 0},
    "review": {"status": "pending", "lastRun": null, "runCount": 0},
    "intake": {"status": "pending", "lastRun": null, "runCount": 0}
  },
  "totalRuns": 3
}
```

> 以上 API 已在 `server.py` 中实现。执行记录存储在 `.ta_agent/pipeline_runs.jsonl`。

---

## 四、前端设计

### 4.1 页面结构

```
┌─────────────────────────────────────────────────┐
│ 🔀 资产流水线              [自定义阶段] [刷新]    │ ← header
├─────────────────────────────────────────────────┤
│                                                 │
│   ┌──────────┐                                  │
│   │ ① 目录扫描 │ ← 主线节点（蓝色边框）           │
│   │  248 资产  │                                 │
│   └────┬─────┘                                  │
│        │ ← SVG 连线箭头                          │
│   ┌────▼─────┐                                  │
│   │ ② AI 分析 │                                 │
│   │  248 已分析│    ┌──────────┐                  │
│   └────┬─────┘ ──→│ 面数检查  │ ← 分支节点       │
│        │          └──────────┘                  │
│   ┌────▼─────┐                                  │
│   │ ③ 人工审核 │                                 │
│   │  198 通过  │                                 │
│   └────┬─────┘                                  │
│        │                                        │
│   ┌────▼─────┐                                  │
│   │ ④ 资产入库 │                                 │
│   │  15 已入库 │                                 │
│   └──────────┘                                  │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 4.2 节点交互

| 操作 | 行为 |
|------|------|
| 点击节点 | 展开详情（执行记录、使用的工具、耗时） |
| 点击节点 `+` 按钮 | 弹出添加分支表单 |
| 点击"执行"按钮 | 发送 prompt 给 Agent，跳转到对话页 |
| 拖拽分支节点 | 调整分支顺序（可选，P2） |

### 4.3 节点状态

| 状态 | 视觉 | 条件 |
|------|------|------|
| 待执行 | 灰色边框 + 灰色图标 | 无执行记录 |
| 执行中 | 脉冲动画 + 蓝色边框 | Agent 正在执行 |
| 已完成 | 绿色勾 + 绿色边框 | 有成功的执行记录 |
| 失败 | 红色叉 + 红色边框 | 执行出错 |

### 4.4 添加分支表单

```
┌─────────────────────────────────────────┐
│ 添加分支步骤                             │
│                                         │
│ 名称: [面数检查________________]         │
│ 描述: [检查模型面数是否超标______]        │
│ 提示词: [检查所有模型资产的面数...]       │
│                                         │
│ [取消]  [添加]                           │
└─────────────────────────────────────────┘
```

- **提示词**是最重要的字段，发给 Agent 执行
- 提示词支持变量：`{path}` = 当前项目路径
- Agent 根据提示词自行决定调用什么工具

---

## 五、执行流程

```
用户点击"面数检查"节点
    │
    ▼
前端 POST /api/pipeline/run
    { stageId: "mesh_check", variables: { path: "D:/..." } }
    │
    ▼
后端读取 pipeline.json 中 mesh_check 的 prompt
    "检查所有模型资产的面数是否超标，列出超标资产及超标比例"
    │
    ▼
替换变量 → "检查所有模型资产的面数是否超标..."
    │
    ▼
通过 WebSocket 发送给 Agent（复用现有 sendMessage 机制）
    │
    ▼
Agent LLM 理解 prompt → 决定调用 check_mesh_budget 工具
    │
    ▼
前端跳转到对话页，显示执行过程
    │
    ▼
执行完成 → 记录到 pipeline_runs.jsonl
    │
    ▼
流水线页面更新节点状态为"已完成"
```

---

## 六、前后端分工

### 后端（已完成 ✅）

| 任务 | 说明 | 状态 |
|------|------|------|
| `GET/POST /api/pipeline` | 流水线配置 CRUD | ✅ |
| `POST /api/pipeline/run` | 执行阶段（读 prompt → 发给 Agent） | ✅ |
| `GET /api/pipeline/runs` | 查询执行记录 | ✅ |
| `GET /api/pipeline/state` | 各阶段状态 | ✅ |
| `pipeline_runs.jsonl` | 执行记录持久化 | ✅ |
| 默认配置 | core_stages + custom_stages 格式 | ✅ |

### 前端（开发中 🔧）

| 任务 | 说明 | 工作量 | 状态 |
|------|------|--------|------|
| 流水线可视化 | 节点 + SVG 连线布局 | 2 天 | 前端 agent 开发中 |
| 节点交互 | 点击展开、执行、添加分支 | 1 天 | 前端 agent 开发中 |
| 自定义阶段管理 | 增删改自定义阶段、排序 | 1 天 | 待做 |
| 执行记录 + 对话联动 | 历史查询、跳转对话页 | 0.5 天 | 待做 |

---

## 七、扩展性

### 新增阶段

只需在 `pipeline.json` 中添加一个 stage 对象，写好 prompt：
```json
{
  "id": "uv_check",
  "label": "UV 检查",
  "prompt": "检查所有模型的 UV 是否完整，列出缺失 UV 的资产",
  "parentId": "analyze"
}
```

不需要改任何代码，Agent 会根据 prompt 自动选择工具。

### 不同项目自定义

每个项目的 `pipeline.json` 独立，不同项目可以有不同的流水线：
- 角色项目：增加"骨骼检查"、"动画检查"分支
- 场景项目：增加"LOD 检查"、"碰撞体检查"分支
- UI 项目：增加"图标尺寸检查"分支

### 与 Agent 对话联动

流水线执行的操作会出现在对话历史中，用户可以在对话页继续追问：
- 流水线执行"面数检查" → Agent 回复结果
- 用户在对话页追问"超标最严重的是哪个？" → Agent 继续分析
