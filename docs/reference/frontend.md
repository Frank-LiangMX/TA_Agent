# 前端设计参考

> 最后更新：2026-05-19
> 前端路径：`F:\ta_agent\fronted` | 端口 5175
> 后端路径：`F:\ta_agent` (Python) | WebSocket 端口 8080

---

## 一、目录结构

```
F:\ta_agent\fronted\
├── vite.config.ts                 # 端口 5175, host: 0.0.0.0
│
├── server/                        # Python WebSocket 后端
│   ├── server.py                  # FastAPI + WebSocket + REST API
│   ├── progress_hook.py           # 分析进度注入
│   └── requirements.txt
│
└── src/
    ├── main.tsx                   # 入口
    ├── App.tsx                    # 三面板布局 + 视图切换
    ├── types/index.ts             # 类型定义
    ├── styles/globals.css         # 主题变量 + 动画关键帧
    │
    ├── lib/
    │   ├── api.ts                 # API_BASE, WS_URL
    │   ├── cache.ts               # 全局数据缓存
    │   └── utils.ts               # 工具函数
    │
    ├── services/
    │   └── websocket.ts           # WebSocket 客户端
    │
    └── components/
        ├── layout/                # 三面板布局
        │   ├── Sidebar.tsx        # 左侧导航（动态徽章）
        │   ├── MainPanel.tsx      # 对话面板（流式输出）
        │   ├── DetailPanel.tsx    # 资产详情面板
        │   └── ResizeHandle.tsx   # 可拖动分隔条
        │
        ├── chat/                  # 对话相关
        │   ├── ChatMessage.tsx    # 消息气泡 + 工具调用折叠
        │   ├── ScrollMinimap.tsx  # 消息导航
        │   └── ContextDivider.tsx # 上下文分割线
        │
        ├── animations/
        │   └── index.tsx          # 15 个动画组件
        │
        ├── session/               # 会话管理
        │   ├── SessionSelector.tsx
        │   ├── SessionPopover.tsx
        │   ├── SessionItem.tsx
        │   └── SessionGroup.tsx
        │
        ├── tools/                 # 工具结果渲染
        │   ├── ToolResultRenderer.tsx  # 分发器
        │   └── results/           # 11 个专用渲染器 + 通用 JSON 兜底
        │
        ├── asset/
        │   └── AssetLibrary.tsx   # 资产库
        ├── review/
        │   └── ReviewQueue.tsx    # 审核队列
        ├── search/
        │   └── SearchView.tsx     # 语义搜索
        ├── analysis/
        │   └── AnalysisProgress.tsx # 分析进度条
        ├── dashboard/
        │   └── DashboardView.tsx  # 项目总览仪表盘
        ├── workflow/
        │   └── WorkflowView.tsx   # 资产流水线视图
        ├── settings/
        │   └── SettingsView.tsx   # 设置面板
        └── ui/                    # 通用 UI 组件
```

---

## 二、通信架构

```
浏览器 (localhost:5175)
    │
    ├─ WebSocket (ws://localhost:8080/ws)  ← 对话 + 流式事件
    │   支持 ?sessionId=xxx 恢复会话
    │
    └─ REST API (http://localhost:8080/api/*) ← 资产/会话/统计数据
```

### 2.1 WebSocket 协议

**客户端 → 服务端（RPC）**：

| 方法 | 参数 | 说明 |
|------|------|------|
| sendMessage | content, contextCutoff? | 发送消息 |
| setMode | mode | 切换工作流模式 |
| getHistory | - | 获取对话历史 |
| clearHistory | - | 清空历史 |
| clearContext | - | 清空上下文（保留历史） |
| getStatus | - | 获取状态 |
| listTools | - | 列出工具 |

**服务端 → 客户端（事件推送）**：

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

### 2.2 前端客户端用法

```typescript
import { tagentClient } from '@/services/websocket'

tagentClient.connect(sessionId)  // 连接（可恢复会话）
tagentClient.onStatusChange((status) => { /* connecting/connected/disconnected */ })
tagentClient.on('stream_text', (payload) => { /* 流式文本 */ })
tagentClient.on('tool_start', (payload) => { /* 工具开始 */ })
tagentClient.on('tool_result', (payload) => { /* 工具结果 */ })
tagentClient.on('done', (payload) => { /* 完成 */ })

await tagentClient.sendMessage("扫描 D:/Project/Assets")
await tagentClient.setMode('auto')
await tagentClient.clearContext()
await tagentClient.getStatus()
```

---

## 三、REST API

| 端点 | 说明 |
|------|------|
| `GET /api/assets` | 资产列表（筛选/排序/分页） |
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
| `PATCH /api/sessions/{id}` | 更新会话（标题/置顶/归档） |
| `DELETE /api/sessions/{id}` | 删除会话 |
| `POST /api/sessions/search` | 搜索会话 |
| `GET/POST /api/pipeline` | 流水线配置 CRUD |
| `POST /api/pipeline/run` | 执行阶段 |
| `GET /api/pipeline/runs` | 执行记录 |
| `GET /api/pipeline/state` | 阶段状态 |

---

## 四、工具结果渲染

20+ 工具专用渲染器，统一注册在 `ToolResultRenderer.tsx`：

| 工具 | 渲染组件 | 展示效果 |
|------|---------|---------|
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
| 兜底 | JsonResult | 可折叠 JSON |

---

## 五、设计规范

### 5.1 布局

- 三面板：左侧导航 256px（可拖动 200-400px）| 中间主面板 flex-1 | 右侧详情 320px（可拖动 250-500px，可关闭）
- 面板切换用 `display: hidden` 保持组件挂载，不丢失状态
- 资产列表分页加载（每次 50 个），滚动到底自动加载更多

### 5.2 主题系统

对齐 Proma Agent 纯灰中性主题，支持 4 套主题变体（light + dark）：

| 主题 | 暗色色调 | 说明 |
|------|---------|------|
| Default | `0 0% 7%` 纯灰 | 中性灰，无色相 |
| Ocean | `210 35% 13%` 蓝调 | 深海蓝灰 |
| Forest | `147 14% 15%` 绿调 | 森系绿灰 |
| Slate | `260 6% 12%` 紫灰 | 柔和紫灰 |

### 5.3 颜色语义

| 含义 | 颜色 | Tailwind |
|------|------|----------|
| 通过/成功 | 绿色 | `text-success` / `bg-success/20` |
| 警告/待处理 | 黄色 | `text-warning` / `bg-warning/20` |
| 失败/拒绝 | 红色 | `text-destructive` / `bg-destructive/20` |
| 信息/主色 | 蓝色 | `text-primary` / `bg-primary/20` |

### 5.4 资产类型标签颜色

| 类型 | 颜色 |
|------|------|
| 动画 | `bg-blue-500/20` |
| 贴图 | `bg-purple-500/20` |
| 模型 | `bg-green-500/20` |
| 骨骼模型 | `bg-emerald-500/20` |
| 材质 | `bg-orange-500/20` |

### 5.5 边框与阴影

遵循"阴影优于边框"原则：

| 元素 | 样式 |
|------|------|
| 卡片/工具结果 | `shadow-sm`，无边框 |
| 面板分割线 | `border-border/40~50` 低透明度 |
| 输入框/下拉框 | `border border-border` 保留可见边框 |
| 侧边栏选中态 | `bg-foreground/[0.08]` + 微阴影 |
| 浮动面板 | `shadow-lg` |

### 5.6 性能优化

- 拖拽分隔线：直接操作 DOM width，不触发 React 重渲染
- 资产列表：分页加载，避免一次渲染 300+ 项
- 预览图：256px 缩略图 + 内存缓存（最多 100 张）
- 数据缓存：REST API 数据在内存缓存，切换页面不重复请求

---

## 六、组件参考

### 6.1 详情面板（Config-Driven）

新增字段只需改配置，不改组件代码：

```typescript
// detailFields.ts
const MESH_FIELDS: FieldConfig[] = [
  { key: 'tri_count', label: '三角面', format: 'number' },
  { key: 'vertex_count', label: '顶点数', format: 'number' },
  { key: 'bone_count', label: '骨骼数', format: 'number' },
  { key: 'has_uv', label: 'UV', format: 'boolean' },
  { key: 'material_count', label: '材质数', format: 'number' },
]

const TEXTURE_FIELDS: FieldConfig[] = [
  { key: 'count', label: '贴图数', format: 'number' },
  { key: 'max_resolution', label: '最大分辨率', format: 'string' },
  { key: 'formats_used', label: '格式', format: 'list' },
]

const ANIMATION_FIELDS: FieldConfig[] = [
  { key: 'bone_count', label: '骨骼数', format: 'number' },
]
```

### 6.2 ScrollMinimap（消息导航）

对话区右侧迷你导航条，悬停展开。

- 消息条渲染（最多 20 条，超出分组）
- 可视区域高亮
- 搜索过滤
- 点击跳转（smooth scrollIntoView）
- 拖动滚动条

消息条样式：用户消息=蓝色 | AI 回复=灰色 | 工具调用=黄色 | 错误=红色

### 6.3 ContextDivider（上下文分割线）

消息间的分割线，之前的内容不发送给 LLM。

- 插入方式：Ctrl+K 快捷键 或 输入框旁"清除上下文"按钮
- 虚线样式，中间显示"清除上下文"文字
- 右侧 × 按钮删除分割线
- 分割线之前的消息视觉淡化（opacity: 0.6）

### 6.4 分析进度条

多阶段进度展示，集成到输入框上方：

```
扫描目录  ✓        AI 分析  48/50  sword_01.fbx
██████████████████████████████░░░░░░░░░░░░░░░░░░░
```

阶段：扫描 → 分析贴图 → 分析 FBX → AI 推断 → 完成

### 6.5 资产流水线视图

可视化节点编辑器 + SVG 连线：

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ ① 目录扫描 │ →  │ ② AI 分析 │ →  │ ③ 人工审核 │ →  │ ④ 资产入库 │
│  248 资产  │     │  248 已分析│    │  198 通过  │    │  15 已入库 │
└──────────┘     └────┬─────┘     └──────────┘     └──────────┘
                      │
                 ┌────▼─────┐
                 │ 面数检查  │  ← 分支节点
                 └──────────┘
```

| 操作 | 行为 |
|------|------|
| 点击节点 | 展开详情（执行记录、工具、耗时） |
| 点击 `+` | 弹出添加分支表单 |
| 点击"执行" | 发送 prompt 给 Agent，跳转对话页 |

节点状态：待执行=灰色 | 执行中=脉冲动画+蓝色 | 已完成=绿色勾 | 失败=红色叉

### 6.6 设置面板

11 个设置模块：

| 模块 | 说明 |
|------|------|
| 模型 | LLM 配置切换 |
| Agent | 工作流模式、工具配置 |
| 记忆 | 项目画像 + 推断规则 + 修正记录 |
| 工具 | 插件管理 |
| 规范 | 已加载的规范文档查看 |
| 项目配置 | 创建/编辑/切换项目配置 |
| 渲染 | Blender 路径、渲染参数 |
| UE5 | 引擎路径、导入设置 |
| 用户 | 用户信息、权限 |
| 视觉模型 | Qwen-VL 配置 |
| NanoBanana | 图像生成服务配置 |

---

## 七、启动方式

```bash
# 根目录统一入口
F:\ta_agent\dev-web.bat          # 前端 + 后端
F:\ta_agent\stop-web.bat         # 关闭

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

## 八、桌面应用（规划中）

> 详见实验文档：`docs/experiments/frontend/2026-05-19-electron-desktop-app.md`

计划使用 Electron 实现双模式：
- **桌面应用**：Electron 窗口 + 本地 Python 进程
- **浏览器访问**：服务器部署，团队远程使用

实验验证后，稳定设计将写入本节。
