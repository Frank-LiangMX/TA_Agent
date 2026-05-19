# TAgent Web 前端设计文档

> 游戏技术美术 AI Agent 前端界面
> 后端：`F:\ta_agent` (Python) + WebSocket 服务 (`F:\ta_agent\fronted\server/`)

---

## 项目状态看板

### 整体进度

| 模块 | 状态 | 说明 |
|------|------|------|
| 流式对话 | ✅ 完成 | WebSocket 逐字输出、工具调用折叠展示 |
| 工具可视化 | ✅ 完成 | 11 个工具专用渲染器 + 通用 JSON 兜底 |
| 资产库 | ✅ 完成 | REST API + 筛选/排序/分页/预览图 |
| 审核队列 | ✅ 完成 | Tab 分组、分页、批量通过/拒绝、自然语言指令 |
| 语义搜索 | ✅ 完成 | 自然语言搜索 |
| 资产详情 | ✅ 完成 | 几何/贴图/分类/视觉/材质/元信息 |
| 消息导航 | ✅ 完成 | ScrollMinimap（过滤工具消息、折叠/展开/搜索） |
| 上下文分割 | ✅ 完成 | ContextDivider + Ctrl+K 快捷键 |
| 分析进度条 | ✅ 完成 | 工具活动指示 + 多阶段进度（集成到输入框上方） |
| 动画系统 | ✅ 完成 | 15 个动画组件（BlurText/FadeIn/Shimmer 等） |
| 会话管理 | ✅ 完成 | SessionSelector + Popover + 批量管理 + RPC 切换 |
| UI 风格对齐 | ✅ 完成 | 对齐 Proma Agent 纯灰中性主题、4 套主题变体 |
| 项目总览仪表盘 | ✅ 完成 | 8 维度统计卡片 + 条形图 + 面数/会话/记忆 + 最近分析 |
| 设置面板 | ✅ 完成 | 11 个设置模块，对齐 Proma Agent 原语组件模式 |
| 资产流水线 | ✅ 完成 | 可视化节点编辑器 + 分支管理 + 执行触发 |
| 3D 预览 | ✅ 完成 | 前端生成按钮 + 后端 Blender 渲染 |
| 入库向导 | ❌ 未开始 | 分步引导流程 |

### 接下来做什么

| # | 任务 | 优先级 | 工作量 | 说明 |
|---|------|--------|--------|------|
| 1 | 入库向导 | P2 | 1.5 天 | 分步流程 |
| 2 | NanoBanana 集成 | P2 | 2 天 | 图像生成工具，见 PIPELINE_DESIGN.md |

### 组件完成度

| 组件 | 文件 | 状态 |
|------|------|------|
| Sidebar | `layout/Sidebar.tsx` | ✅ |
| MainPanel | `layout/MainPanel.tsx` | ✅ |
| DetailPanel | `layout/DetailPanel.tsx` | ✅ |
| ResizeHandle | `layout/ResizeHandle.tsx` | ✅ |
| ChatMessage | `chat/ChatMessage.tsx` | ✅ |
| ScrollMinimap | `chat/ScrollMinimap.tsx` | ✅ |
| ContextDivider | `chat/ContextDivider.tsx` | ✅ |
| ToolResultRenderer | `tools/ToolResultRenderer.tsx` | ✅ |
| AssetLibrary | `asset/AssetLibrary.tsx` | ✅ |
| ReviewQueue | `review/ReviewQueue.tsx` | ✅ |
| SearchView | `search/SearchView.tsx` | ✅ |
| Animations | `animations/index.tsx` | ✅ |
| SessionSelector | `session/SessionSelector.tsx` | ✅ |
| SessionPopover | `session/SessionPopover.tsx` | ✅ |
| DashboardView | `dashboard/DashboardView.tsx` | ✅ |
| WorkflowView | `workflow/WorkflowView.tsx` | ✅ |
| AssetMentionPopover | `chat/AssetMentionPopover.tsx` | ✅ |
| SettingsView | `settings/SettingsView.tsx` | ✅ |

---

## 一、已完成

### 1.1 项目基础

| 项目 | 状态 | 说明 |
|------|------|------|
| 项目脚手架 | ✅ | Vite + React + TypeScript + Tailwind（端口 5175） |
| WebSocket 后端 | ✅ | FastAPI + uvicorn（端口 8080），通过 sys.path 导入 ta_agent |
| 平台抽象层 | ✅ | `@proma/platform` 包，PlatformServices 接口 |
| 数据缓存 | ✅ | `lib/cache.ts`，页面切换不丢失数据 |
| 可拖动面板 | ✅ | ResizeHandle 组件，直接操作 DOM 零重渲染 |
| 局域网访问 | ✅ | 前后端均监听 `0.0.0.0` |
| UI 风格对齐 | ✅ | 对齐 Proma Agent 纯灰中性主题，4 套主题变体，阴影替代边框 |

### 1.2 核心功能

| 功能 | 状态 | 说明 |
|------|------|------|
| 流式对话 | ✅ | WebSocket 流式输出，逐字显示 |
| 工具调用展示 | ✅ | 折叠面板 + 运行状态 + 可视化结果 |
| 工具结果可视化 | ✅ | 20+ 工具专用渲染器（见下方列表） |
| 资产库 | ✅ | REST API 直接查 SQLite，筛选/排序/分页加载 |
| 资产预览图 | ✅ | 贴图自动转 PNG 缩略图（256px，带缓存） |
| 审核队列 | ✅ | 高/低置信度分组，批量通过，单个审核 |
| 修改表单 | ✅ | 修正 AI 推断结果（分类/材质/风格/状态） |
| 语义搜索 | ✅ | 自然语言搜索，通过 Agent 的 search_assets 工具 |
| 资产详情面板 | ✅ | 完整展示（几何/贴图/分类/视觉/材质/元信息） |
| 侧边栏徽章 | ✅ | 待审核数量实时显示（30 秒刷新） |

### 1.3 工具结果可视化覆盖

| 工具 | 组件 | 展示效果 |
|------|------|---------|
| `check_mesh_budget` | MeshBudgetResult | 进度条 + 通过/警告/失败 |
| `check_texture_info` | TextureInfoResult | 信息卡片（分辨率/格式/通道） |
| `check_naming` | NamingCheckResult | 合规/不合规 + 问题列表 |
| `scan_directory` | ScanDirectoryResult | 文件统计 + 格式分布 |
| `analyze_assets` | AnalyzeAssetsResult | 统计卡片 + 分类分布 |
| `list_assets` | AssetListResult | 资产表格 |
| `search_assets` | SearchAssetsResult | 搜索结果列表 |
| `generate_report` | ReportResult | 通过/警告/失败统计 |
| `get_pending_reviews` | ReviewQueueResult | 高/低置信度分组 |
| `count_assets_by_type` | CountAssetsResult | 类型分布条形图 |
| `get_memory_stats` | MemoryStatsResult | 记忆系统状态卡片 |
| `check_directory_structure` | DirectoryResult | 目录合规检查 |
| `suggest_naming` | NamingSuggestResult | 命名建议 |
| `check_file_info` | FileInfoResult | 文件信息卡片 |
| 状态/错误/警告 | StatusResult | 通用状态文本展示 |
| 其他 | JsonResult | 可折叠 JSON（兜底） |

### 1.4 启动方式

```bash
# 一键启动（推荐）
F:\ta_agent\fronted\Start.bat    # 前端 + 后端
F:\ta_agent\fronted\Stop.bat     # 关闭

# 手动启动
# 终端 1：后端
cd F:\ta_agent\fronted\server
pip install -r requirements.txt
python server.py

# 终端 2：前端
cd F:\ta_agent\fronted
bun run dev
```

---

## 二、架构

### 2.1 目录结构

```
F:\ta_agent\fronted\
├── Start.bat / Stop.bat           # 一键启动/关闭
├── vite.config.ts                 # 端口 5175，host: 0.0.0.0
│
├── server/                        # Python WebSocket 后端
│   ├── server.py                  # FastAPI + WebSocket + REST API
│   ├── progress_hook.py           # 分析进度注入
│   └── requirements.txt           # fastapi, uvicorn, websockets, openai
│
└── src/
    ├── main.tsx                   # 入口
    ├── App.tsx                    # 三面板布局 + 视图切换
    ├── types/index.ts             # 类型定义
    ├── styles/globals.css         # 主题变量 + 动画关键帧
    │
    ├── lib/
    │   ├── api.ts                 # API_BASE, WS_URL
    │   ├── cache.ts               # 全局数据缓存（useAssets, useReviews）
    │   └── utils.ts               # 工具函数
    │
    ├── services/
    │   └── websocket.ts           # WebSocket 客户端（连接 + RPC + 事件订阅）
    │
    └── components/
        ├── layout/
        │   ├── Sidebar.tsx        # 左侧导航（动态徽章）
        │   ├── MainPanel.tsx      # 对话面板（流式输出）
        │   ├── DetailPanel.tsx    # 资产详情面板
        │   └── ResizeHandle.tsx   # 可拖动分隔条
        │
        ├── chat/
        │   ├── ChatMessage.tsx    # 消息气泡 + 工具调用折叠
        │   ├── ScrollMinimap.tsx  # 消息导航
        │   └── ContextDivider.tsx # 上下文分割线
        │
        ├── animations/
        │   └── index.tsx          # 动画组件库（15 个：BlurText/FadeIn/Shimmer/TypeWriter 等）
        │
        ├── session/               # 会话管理
        │   ├── SessionSelector.tsx
        │   ├── SessionPopover.tsx
        │   ├── SessionItem.tsx
        │   └── SessionGroup.tsx
        │
        ├── tools/
        │   ├── ToolResultRenderer.tsx  # 工具结果分发器
        │   └── results/               # 11 个专用渲染器 + 通用 JSON 兜底
        │
        ├── asset/
        │   └── AssetLibrary.tsx   # 资产库（筛选 + 预览图）
        │
        ├── review/
        │   └── ReviewQueue.tsx    # 审核队列（批量/单个审核）
        │
        ├── search/
        │   └── SearchView.tsx     # 语义搜索
        │
        ├── analysis/
        │   └── AnalysisProgress.tsx # 分析进度条（多阶段）
        │
        ├── atoms/                 # Jotai 状态管理（规划中，待实现）
        ├── hooks/                 # 自定义 Hooks（规划中，待实现）
        ├── common/                # 共享组件（规划中，待实现）
        │
        └── ui/                    # 通用 UI 组件
```

### 2.2 通信架构

```
浏览器 (localhost:5175)
    │
    ├─ React 前端
    │   ├─ services/websocket.ts    ← WebSocket 客户端
    │   ├─ lib/cache.ts             ← REST API 数据缓存
    │   └─ components/              ← UI 组件
    │
    ├─ WebSocket (ws://localhost:8080/ws)  ← 对话 + 流式事件
    └─ REST API (http://localhost:8080/api/*) ← 资产数据查询
        │
    └─ server.py (FastAPI)
        ├─ WebSocket: agent 对话循环（流式输出 + 工具调用）
        ├─ REST: 直接查询 SQLite（资产/审核/统计/预览图）
        └─ 通过 sys.path 导入 ta_agent 模块（不修改原文件）
```

---

## 三、WebSocket 协议

### 连接

```
ws://localhost:8080/ws
ws://localhost:8080/ws?sessionId=xxx  ← 恢复会话
```

### 客户端 → 服务端（RPC）

| 方法 | 参数 | 说明 |
|------|------|------|
| sendMessage | content, contextCutoff? | 发送消息 |
| setMode | mode | 切换工作流模式 |
| getHistory | - | 获取对话历史 |
| clearHistory | - | 清空历史 |
| clearContext | - | 清空上下文（保留历史） |
| getStatus | - | 获取状态 |
| listTools | - | 列出工具 |

### 服务端 → 客户端（事件推送）

| 事件 | 数据 | 说明 |
|------|------|------|
| connected | sessionId | 连接确认 |
| stream_text | text | 流式文本增量 |
| agent_thinking | text | 思考过程 |
| tool_start | toolCall | 工具调用开始 |
| tool_result | toolCallId, name, result | 工具结果 |
| analysis_progress | phase, current, total | 分析进度 |
| done | content | 完成 |
| error | error | 错误 |

### 前端客户端用法

```typescript
import { tagentClient } from '@/services/websocket'

// 连接（支持 sessionId 恢复会话）
tagentClient.connect(sessionId)

// 监听状态
tagentClient.onStatusChange((status) => {
  // 'connecting' | 'connected' | 'disconnected'
})

// 监听事件
tagentClient.on('stream_text', (payload) => { /* 流式文本 */ })
tagentClient.on('tool_start', (payload) => { /* 工具开始 */ })
tagentClient.on('tool_result', (payload) => { /* 工具结果 */ })
tagentClient.on('analysis_progress', (payload) => { /* 分析进度 */ })
tagentClient.on('done', (payload) => { /* 完成 */ })

// 发送消息
await tagentClient.sendMessage("扫描 D:/Project/Assets")

// 其他方法
await tagentClient.setMode('auto')
await tagentClient.clearHistory()
await tagentClient.clearContext()
await tagentClient.getStatus()
await tagentClient.listTools()
```

---

## 四、REST API

| 端点 | 说明 |
|------|------|
| `GET /api/assets` | 资产列表 |
| `GET /api/assets/{id}` | 资产详情 |
| `GET /api/preview/{id}` | 资产预览图（TGA 自动转 PNG 256px） |
| `GET /api/reviews/pending` | 待审核资产 |
| `GET /api/stats` | 数据库统计 |
| `GET /api/memory/stats` | 记忆系统状态 |
| `POST /api/sessions` | 创建会话 |
| `GET /api/sessions` | 会话列表 |
| `GET /api/sessions/stats` | 会话统计 |
| `GET /api/sessions/{id}` | 会话详情 |
| `GET /api/sessions/{id}/messages` | 会话消息 |
| `PATCH /api/sessions/{id}` | 更新会话 |
| `DELETE /api/sessions/{id}` | 删除会话 |
| `POST /api/sessions/search` | 搜索会话 |

---

## 五、待开发

### P0：会话管理

### P0：会话管理 ✅

| 功能 | 说明 | 涉及文件 | 状态 |
|------|------|---------|------|
| 会话选择器 | MainPanel 头部：会话标题按钮 + Popover 弹出会话列表 | `components/session/SessionSelector.tsx` | ✅ 完成 |
| 会话列表 | Popover 内：搜索 + 置顶 + 日期分组 + 归档折叠 | `components/session/SessionPopover.tsx` | ✅ 完成 |
| 会话操作 | 新建、切换、删除、置顶、归档 | `services/sessions.ts` | ✅ 完成 |
| WebSocket sessionId | 连接时带 sessionId，切换会话时自动重连 | `services/websocket.ts` | ✅ 完成 |
| 历史恢复 | 切换会话时从后端加载历史消息 | `MainPanel.tsx` | ✅ 完成 |

### P0：消息导航 ✅

| 功能 | 说明 | 涉及文件 | 状态 |
|------|------|---------|------|
| ScrollMinimap | 对话区右侧迷你导航条，悬停展开，支持搜索和跳转 | `components/chat/ScrollMinimap.tsx` | ✅ 完成 |

### P1：上下文管理 ✅

| 功能 | 说明 | 涉及文件 | 状态 |
|------|------|---------|------|
| ContextDivider | 消息间分割线，分割线之前的消息不发送给 LLM | `components/chat/ContextDivider.tsx` | ✅ 完成 |
| 快捷键 | Ctrl+K 插入分割线 | `MainPanel.tsx` | ✅ 完成 |

### P1：分析工作流

| 功能 | 说明 | 状态 |
|------|------|------|
| 分析进度条 | 多阶段进度展示（扫描→提取→命名→面数→贴图→AI推断→存储） | ✅ 完成 |
| 分析报告 | 汇总统计 + 问题清单 + 导出 | ❌ 待开发 |

### P2：资产入库

| 功能 | 说明 |
|------|------|
| 入库向导 | 步骤式引导（选目录→分析→审核→确认入库） |
| 入库进度 | 批量入库进度展示 |

### P2：设置面板

| 功能 | 说明 |
|------|------|
| 项目配置 | 创建/编辑/切换项目配置（UE5/Unity/通用模板） |
| 规范查看器 | 查看已加载的规范文档 |
| 记忆系统 | 项目画像 + 推断规则 + 修正记录 |

### P3：增强功能

| 功能 | 说明 |
|------|------|
| 3D 预览 | Blender 渲染图展示 |
| 批量操作 | 批量重命名、批量移动 |
| 插件管理 | 安装/卸载 ta_agent 插件 |

---

## 六、设计规范

### 主题系统

对齐 Proma Agent 风格，支持 4 套主题变体（light + dark）：

| 主题 | 暗色色调 | 说明 |
|------|---------|------|
| Default | 纯灰 `0 0% 7%` | 中性灰，无色相 |
| Ocean | 蓝调 `210 35% 13%` | 深海蓝灰 |
| Forest | 绿调 `147 14% 15%` | 森系绿灰 |
| Slate | 莫兰迪紫 `260 6% 12%` | 柔和紫灰 |

### 颜色语义

| 含义 | 颜色 | Tailwind |
|------|------|----------|
| 通过/成功 | 绿色 | `text-success` / `bg-success/20` |
| 警告/待处理 | 黄色 | `text-warning` / `bg-warning/20` |
| 失败/拒绝 | 红色 | `text-destructive` / `bg-destructive/20` |
| 信息/主色 | 蓝色 | `text-primary` / `bg-primary/20` |

### 资产类型标签颜色

| 类型 | 颜色 |
|------|------|
| 动画 | 蓝色 `bg-blue-500/20` |
| 贴图 | 紫色 `bg-purple-500/20` |
| 模型 | 绿色 `bg-green-500/20` |
| 骨骼模型 | 翠绿 `bg-emerald-500/20` |
| 材质 | 橙色 `bg-orange-500/20` |

### 布局

- 左侧导航栏：默认 256px，可拖动（200-400px）
- 右侧详情面板：默认 320px，可拖动（250-500px），可关闭
- 中间主面板：flex-1 自适应
- 面板切换：用 `display: hidden` 保持组件挂载，不丢失状态
- 资产列表：分页加载（每次 50 个），滚动到底自动加载更多

### 边框与阴影

遵循 Proma 的「阴影优于边框」原则：

| 元素 | 样式 |
|------|------|
| 卡片/工具结果 | `shadow-sm`，无边框 |
| 面板分割线 | `border-border/40~50` 低透明度 |
| 输入框/下拉框 | `border border-border` 保留可见边框 |
| 侧边栏选中态 | `bg-foreground/[0.08]` + 微阴影 |
| 浮动面板 | `shadow-lg` |

### 性能优化

- 拖拽分隔线：直接操作 DOM width，不触发 React 重渲染
- 资产列表：分页加载，避免一次渲染 300+ 项
- 预览图：256px 缩略图 + 内存缓存（最多 100 张）
- 数据缓存：REST API 数据在内存中缓存，切换页面不重复请求

### 详情面板字段配置（Config-Driven）

详情面板使用**配置驱动**模式，新增字段只需改配置，不改组件代码。

#### 字段配置格式

```typescript
// components/layout/detailFields.ts

interface FieldConfig {
  key: string          // 数据字段名
  label: string        // 显示标签
  format: 'number' | 'string' | 'boolean' | 'list' | 'filesize'
  condition?: (asset: any) => boolean  // 可选：条件显示
}

// 模型资产的字段配置
const MESH_FIELDS: FieldConfig[] = [
  { key: 'tri_count', label: '三角面', format: 'number' },
  { key: 'vertex_count', label: '顶点数', format: 'number' },
  { key: 'bone_count', label: '骨骼数', format: 'number' },
  { key: 'has_uv', label: 'UV', format: 'boolean' },
  { key: 'material_count', label: '材质数', format: 'number' },
  // 新增字段只需加一行：
  // { key: 'fps', label: '帧率', format: 'number' },
  // { key: 'morph_target_count', label: '变形目标', format: 'number' },
]

// 贴图资产的字段配置
const TEXTURE_FIELDS: FieldConfig[] = [
  { key: 'count', label: '贴图数', format: 'number' },
  { key: 'max_resolution', label: '最大分辨率', format: 'string' },
  { key: 'formats_used', label: '格式', format: 'list' },
]

// 动画资产的字段配置
const ANIMATION_FIELDS: FieldConfig[] = [
  { key: 'bone_count', label: '骨骼数', format: 'number' },
  // { key: 'frame_range', label: '帧范围', format: 'string' },
  // { key: 'fps', label: '帧率', format: 'number' },
]
```

#### 组件渲染逻辑

```tsx
// DetailPanel.tsx 中
function FieldSection({ title, fields, data }: { title: string, fields: FieldConfig[], data: any }) {
  if (!data) return null
  return (
    <Section title={title}>
      {fields.map(field => {
        const value = data[field.key]
        if (field.condition && !field.condition(data)) return null
        return <InfoRow key={field.key} label={field.label} value={formatValue(value, field.format)} />
      })}
    </Section>
  )
}

// 使用
<FieldSection title="几何信息" fields={MESH_FIELDS} data={asset.mesh} />
<FieldSection title="贴图信息" fields={TEXTURE_FIELDS} data={asset.textures} />
```

#### 如何新增字段

1. 在 `detailFields.ts` 对应数组中加一行配置
2. 后端确保该字段在 `schema.py` 的 `to_dict()` 中返回
3. 完成，无需改组件代码

---

## 七、消息导航设计（ScrollMinimap）

### 功能概述

在对话区域右侧边缘显示迷你导航条，悬停展开为完整导航面板，支持快速跳转和搜索。

### 交互设计

#### 默认状态（收起）

右侧显示一排细条，每条代表一条消息。当前可视区域内的消息条高亮。

#### 悬停状态（展开）

```
对话区域                    ┌──────────────────┐
                           │ 消息导航    5/20  │
消息 A                     │ 🔍 搜索消息...   │
消息 B                     │                   │
消息 C                     │ 👤 扫描目录       │ ← 点击跳转
消息 D                     │ 🤖 找到 24 个资产  │
消息 E                     │ 🔧 scan_directory │
                           │ 🤖 分析完成       │
                           │                   │
                           │ ════════════════ │ ← 可拖动滚动条
                           └──────────────────┘
```

### 组件设计

```
文件：src/components/chat/ScrollMinimap.tsx

Props:
  messages: ChatMessage[]        // 所有消息
  visibleRange: [number, number] // 当前可视范围的索引
  onJumpTo: (index: number) => void // 跳转到指定消息

功能：
  - 消息条渲染（最多 20 条，超出则分组）
  - 可视区域高亮
  - 搜索过滤
  - 点击跳转（smooth scrollIntoView）
  - 拖动滚动条
```

### 消息条样式

| 消息类型 | 图标 | 颜色 |
|---------|------|------|
| 用户消息 | 👤 | 蓝色条 |
| AI 回复 | 🤖 | 灰色条 |
| 工具调用 | 🔧 | 黄色条 |
| 错误 | ❌ | 红色条 |

---

## 八、上下文分割线设计（ContextDivider）

### 功能概述

在消息之间插入分割线，分割线之前的消息不发送给 LLM。用于手动控制上下文窗口大小。

### 交互设计

#### 插入方式

- 输入框旁的"清除上下文"按钮（橡皮擦图标）
- 快捷键 Ctrl+K

#### 显示效果

```
消息 1（用户）
消息 2（AI）
消息 3（用户）
━━━━━━━ 清除上下文 ━━━ [×] ━━━━━  ← 分割线
消息 4（AI）
消息 5（用户）  ← 只有 4 和 5 会发给 LLM
```

- 虚线，中间显示"清除上下文"文字
- 右侧有 × 按钮可删除分割线
- 分割线之前的消息视觉上略淡（opacity: 0.6）

### 数据流

```
前端                          后端
│                              │
│ 用户点击"清除上下文"          │
│ ↓                            │
│ 在最后一条消息后插入分割线     │
│ 发送 { method: "clearContext" } │
│                              │
│                              │ 收到 clearContext
│                              │ session.context_cutoff = len(history)
│                              │
│ 用户发送新消息                │
│                              │ 构建 LLM 请求
│                              │ messages = history[context_cutoff:]
│                              │ 调用 LLM
│                              │
│ ← 流式响应                   │
```

### 与自动压缩的关系

| 机制 | 触发 | 作用范围 | 冲突 |
|------|------|---------|------|
| 手动分割线 | 用户主动点击 | session.history 截断 | 不冲突 |
| _truncate_tool_result | 工具结果 > 2000 字符 | 单条消息截断 | 不冲突 |
| _compress_history | API 上下文超限报错 | messages 数组压缩 | 叠加，先手动截断再自动压缩 |

---

## 九、NanoBanana 图像生成集成设计

### 服务概述

NanoBanana 是公司内部的通用图像生成服务（`tech.seasungame.com`），支持文生图、图生图、风格转换等多种能力。

### API 接口

```
POST https://tech.seasungame.com/ai_in_one/v2/images/generations
Content-Type: application/json
Authorization: Bearer {token}

{
    "model": "jsy-nanobanana2-art",       // 模型标识
    "prompt": "赛博朋克武器图标",           // 文本提示词
    "aspect_ratio": "5:4",                // 可选，宽高比
    "image_size": "1K",                   // 可选，分辨率
    "n": 1,                               // 生成数量
    "response_format": "b64_json",        // 返回 base64
    "image": ["<base64>"]                 // 可选，输入图片
}
```

**认证**：Bearer Token，通过 `Authorization` header 传递。

**返回**：OpenAI 兼容格式，`data[0].b64_json` 为 base64 编码的 PNG 图片。

### 可用模型

| 模型 | 说明 |
|------|------|
| `jsy-nanobanana2-art` | 通用图像生成（默认） |
| `jsy-nanobanana-art` | Banana v1 |
| `nanobanana-art-gufeng` | 古风风格 |
| `nanobanana-art-xiandai` | 现代风格 |

### 功能矩阵

| 功能 | 方式 | 说明 |
|------|------|------|
| 文生图 | prompt only | 无 image 字段 |
| 图生图 | prompt + image | 草图/线稿 → 高清成品 |
| 风格转换 | prompt + image + model | 切换不同风格模型 |
| 批量生成 | n > 1 | 一次生成多张 |

### 架构设计

```
┌─────────────────────────────────────────────────────┐
│  前端 (TAgent Web)                                   │
│  ├─ 设置页面：NanoBanana 配置区（server/token/model） │
│  ├─ 工具结果渲染：图片展示组件                        │
│  └─ 对话中可上传图片作为输入                          │
└────────────────────┬────────────────────────────────┘
                     │ WebSocket / REST
┌────────────────────▼────────────────────────────────┐
│  后端 (server.py)                                    │
│  ├─ POST /api/config/nanobanana  保存配置            │
│  ├─ GET  /api/config/nanobanana  读取配置            │
│  └─ 工具调用分发                                      │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│  工具层 (tools/nanobanana.py)                        │
│  ├─ nanobanana_generate(prompt, image?, model?)      │
│  ├─ 图片 base64 编码/解码                            │
│  ├─ 结果保存到附件目录                                │
│  └─ 返回 ToolResult（含图片路径）                     │
└────────────────────┬────────────────────────────────┘
                     │ HTTP POST
┌────────────────────▼────────────────────────────────┐
│  NanoBanana 服务                                     │
│  tech.seasungame.com/ai_in_one/v2/images/generations │
└─────────────────────────────────────────────────────┘
```

### 文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `tools/nanobanana.py` | 新建 | 图像生成工具（API 调用 + 图片处理） |
| `config.py` | 改动 | 新增 `NANOBANANA_CONFIG` |
| `server.py` | 改动 | 新增配置 API 端点 |
| `components/settings/ToolSettings.tsx` | 改动 | NanoBanana 配置 UI |
| `components/tools/results/` | 新建 | 图片结果渲染组件 |

### 配置存储

```python
# config.py
NANOBANANA_CONFIG = {
    "server": "https://tech.seasungame.com/ai_in_one/v2/images/generations",
    "token": "",           # Bearer Token
    "model": "jsy-nanobanana2-art",
    "aspect_ratio": "5:4",
    "image_size": "1K",
}
```

### Agent 工具定义

```python
{
    "function": {
        "name": "nanobanana_generate",
        "description": "使用 NanoBanana 生成图片。支持文生图（只传 prompt）和图生图（传 prompt + image 路径）",
        "parameters": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "图像生成提示词，描述想要生成的内容"
                },
                "image_path": {
                    "type": "string",
                    "description": "输入图片路径（可选）。传入则为图生图模式，不传则为文生图模式"
                },
                "model": {
                    "type": "string",
                    "description": "模型名称（可选），默认使用配置中的模型"
                },
                "aspect_ratio": {
                    "type": "string",
                    "description": "宽高比（可选）：1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9"
                },
                "image_size": {
                    "type": "string",
                    "description": "分辨率（可选）：1K, 2K, 4K"
                }
            },
            "required": ["prompt"]
        }
    }
}
```

### 前端结果渲染

图片结果渲染组件 `NanobananaResult.tsx`：
- 展示生成的图片（base64 或文件路径）
- 显示使用的 prompt 和 model
- 支持点击放大查看
- 支持下载保存

### 实现优先级

| 阶段 | 内容 | 说明 |
|------|------|------|
| Phase 1 | `tools/nanobanana.py` + `config.py` | 后端工具 + 配置 |
| Phase 2 | `server.py` 配置 API | REST 接口 |
| Phase 3 | 前端设置 UI | 配置页面 |
| Phase 4 | 图片结果渲染 | 前端展示 |
| Phase 5 | 对话图片上传 | 支持图生图 |
