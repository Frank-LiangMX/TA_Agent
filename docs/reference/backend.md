# 后端设计参考

> 最后更新：2026-05-19

---

## 一、整体架构

```
┌─────────────────────────────────────────────────┐
│                   用户界面层                      │
│  CLI (agent.py) / Web 前端 / UE5 Widget         │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│               Agent 编排层（单 Agent）            │
│  ┌──────────────────────────────────────────┐   │
│  │     主控 LLM (GLM-5 / DeepSeek-V4-pro)       │
│  │   TA 领域 System Prompt + 工具调用        │   │
│  └──────────────────────────────────────────┘   │
│       │            │            │                │
│  ┌────▼────────────▼────────────▼────┐          │
│  │           工具注册中心              │          │
│  │  身份分析 | 质检 | 入库 | 检索     │          │
│  └───────────────────────────────────┘          │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│               资产身份系统（核心）                 │
│  AssetIdentity 标签库（三层：确定/推断/管理）     │
│  ProjectConfig 项目配置                          │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│                   工具层                          │
│  UE5 工具 (Python) | Blender 工具 (Python)      │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│                  知识库层                         │
│  项目技术规范 / 记忆系统 / 质检记录               │
└─────────────────────────────────────────────────┘
```

**架构选择**：单 Agent + 多工具（而非多智能体）。
- TA 工作流是线性串联，不是并行任务
- 核心知识同一套，不需要不同专业 Agent
- 单 Agent 更好维护、好调试、成本低
- 何时升级多智能体：需并行处理多个资产、或需专业分工时

---

## 二、资产身份系统（Asset Identity）

### 2.1 身份数据结构

每个资产入库时生成结构化的"身份证"，覆盖物理属性到视觉特征的全部信息：

```python
AssetTags:
  basic:           文件名、类型、大小、源路径、入库时间
  mesh:            三角面数、顶点数、包围盒、骨骼数、UV 通道数、是否顶点色
  textures:        贴图列表（分辨率、格式、通道、色彩空间、压缩方式）
  category:        分类（category + subcategory + confidence）
  material:        主材质列表、次材质列表、材质槽数
  visual:          风格、主色调、破损状态、年代感、尺度感
  spatial:         朝向、高度等级、尺寸等级
  relations:       关联贴图、关联材质、LOD 列表、碰撞体、父子资产
  meta:            状态(pending/approved/imported)、引擎路径、审核人、导入配置
  preview_images:  预览图路径列表
```

### 2.2 三层数据来源

| 层级 | 来源 | 准确度 | 需确认 |
|------|------|--------|--------|
| **确定层** | 工具直接提取（Blender/Pillow） | 100% | 否 |
| **推断层** | AI 分析（LLM 分类/材质/风格） | 70-95% | 高置信度可自动通过 |
| **管理层** | 入库流程产生（状态/路径） | 100% | 否 |

### 2.3 语义化检索

自然语言搜索通过 `tags/search.py` 实现：

```
用户查询 → QueryParser(LLM 解析) → 结构化 SearchQuery
  → TagStore(SQLite 预过滤) → score_asset(多维度评分) → top_k 结果
```

评分维度（权重）：
- category=30, style=20, materials=15, subcategory=15
- condition=10, color_palette=5, size_class=5

### 2.4 项目配置（ProjectConfig）

位于 `core/project_config.py`，实现项目间通用化。包含：
- 项目基本信息（名称、引擎类型、风格）
- 资产类型定义（分类 + 子分类 + 要求标签 + 命名前缀 + 引擎路径）
- 命名规则模板
- 引擎导入预设映射

**核心原则**：换项目只改配置，Agent 核心逻辑不变。

---

## 三、工具系统

### 3.1 注册模式

每个工具独立文件，统一注册到 `tools/registry.py`：

```python
# 1. Schema 定义（传给 LLM）
MY_TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "my_tool",
        "description": "...",
        "parameters": { ... }
    }
}

# 2. 执行函数
def my_tool(param1: str) -> dict:
    """返回 dict 格式结果"""
    return {"key": "value"}

# 3. registry.py 中注册
# TOOLS 列表 + TOOL_FUNCTIONS dict
```

### 3.2 工具分类

| 类别 | 工具 | 说明 |
|------|------|------|
| 扫描 | `scan_directory`, `check_file_info` | 目录扫描 |
| 模型 | `check_fbx_info`, `check_mesh_budget` | FBX 解析、面数检查 |
| 贴图 | `check_texture_info`, `check_texture_batch` | 贴图质检 |
| 命名 | `check_naming`, `suggest_naming` | 命名规范检查与建议 |
| 分析 | `analyze_assets`, `run_ai_inference`, `get_asset_detail` | 资产身份分析 |
| 搜索 | `search_assets`, `search_assets_by_tags` | 语义检索 |
| 审核 | `get_pending_reviews`, `submit_review`, `batch_approve` | 审核工作流 |
| 入库 | `intake_asset`, `intake_batch`, `intake_approved` | 入库自动化 |
| 渲染 | `render_asset_preview` | Blender 预览图渲染 |
| 配置 | `check_project_config`, `create_project_config`, `load_project_config` | 项目配置管理 |
| 记忆 | `record_correction`, `get_memory_stats`, `update_project_profile` | 记忆系统 |
| 规范 | `discover_conventions`, `load_conventions` | 规范发现与加载 |
| UE5 | `ue5_import_asset`, `ue5_health_check`, `ue5_ping` | UE5 引擎集成 |
| 流水线 | `pipeline_config`, `pipeline_run` | 流程管理 |
| 插件 | `/install`, `/uninstall` CLI | 工具热插拔 |

---

## 四、项目记忆系统

位于 `tools/memory/`，使 Agent 具备跨会话学习能力。

### 4.1 三层结构

| 层级 | 文件 | 内容 | 大小约束 | 注入时机 |
|------|------|------|----------|----------|
| L0 项目画像 | `profile.md` | 风格、命名约定、目录结构 | ≤20 行 / ≤500 tokens | 每次推断 |
| L1 纠正规则 | `rules.jsonl` | 合并后精简推断规则 | ≤15 条 | 按相关性注入 ≤5 条 |
| L2 归档 | `archive.jsonl` | 原始纠正记录 | 无限 | 仅在压缩时读取 |

### 4.2 设计原则

- **无纠正不记忆**：只有用户显式纠正才写入
- **最小充分**：只编码精简规则，不存原始对话
- **按需注入**：根据当前资产特征匹配相关规则
- **自压缩**：L2 > 10 条 → 自动合并为 L1 规则；L1 > 15 条 → 淘汰低置信度

### 4.3 注入方式

System Prompt 中插入记忆上下文，与确定层数据一同发送给 LLM：

```
[系统 prompt] 你是 TA Agent...

[项目画像 L0] 项目风格：低多边形卡通 ...
[相关规则 L1]（按当前资产特征匹配）
[确定层数据] 面数:500, 材质:metal, 包围盒:2x0.1x0.1m...
```

### 4.4 接口抽象

通过依赖注入解耦：

```python
class MemoryProvider(Protocol):
    def load(self, project_path): ...
    def get_context(self, asset_features) -> str: ...
    def save_correction(self, asset_path, ai_result, user_correction): ...
    def compress(self): ...
    def get_memory_stats(self) -> dict: ...
```

实现：`FileMemoryProvider`（单机）、`NullMemoryProvider`（测试用）。

---

## 五、会话管理系统

### 5.1 存储方案

```
~/.ta_agent/sessions/
├── index.json              # 会话索引
├── sess_a1b2c3.jsonl       # 每个会话一个文件，每行一条消息
└── ...
```

- **append-only**：崩溃安全，每条消息立即落盘
- **草稿机制**：新建会话为草稿，发首条消息后才出现在列表
- **自动归档**：超过 7 天未活跃自动归档
- **分页读取**：大文件反向扫描，只读最后 N 条

### 5.2 上下文分割

`agent_loop` 的 `context_cutoff` 参数控制 LLM 可见的历史范围：

```
history = [m0, m1, m2, m3, m4, m5]
            ↑ context_cutoff = 2
LLM 看到: [m2, m3, m4, m5]
持久化:   [m0, m1, m2, m3, m4, m5]（完整）
```

### 5.3 历史压缩

当 API 上下文超限时报错时，自动压缩历史：
- 保留前 2 条（初始上下文）
- 保留最近 12 条
- 中间部分只保留 user 消息和非工具调用的 assistant 消息
- 保留的 tool 结果截断至 2000 字符

### 5.4 工作流模式

| 模式 | 说明 |
|------|------|
| `step_by_step` | 逐步模式（默认）：每阶段后汇报，等待用户确认 |
| `auto` | 自动模式：高置信度自动通过，仅低置信度询问 |

CLI 切换：`/mode step_by_step` / `/mode auto`

---

## 六、通信架构

### 6.1 CLI 模式

`agent.py` 主循环：接收消息 → LLM 选择工具 → 执行工具 → 返回结果。

### 6.2 Web 模式

```
浏览器 (localhost:5175)
  ├─ WebSocket (ws://localhost:8080/ws)  ← 对话 + 流式事件
  └─ REST API (http://localhost:8080/api/*) ← 资产数据查询
```

WebSocket 事件流：`stream_text` | `tool_start` | `tool_result` | `analysis_progress` | `done` | `error`

REST API：

| 端点 | 说明 |
|------|------|
| `GET /api/assets` | 资产列表 |
| `GET /api/assets/{id}` | 资产详情 |
| `GET /api/preview/{id}` | 资产预览图 |
| `GET /api/reviews/pending` | 待审核资产 |
| `GET /api/stats` | 数据库统计 |
| `GET /api/memory/stats` | 记忆系统状态 |
| `POST /api/sessions` | 创建会话 |
| `GET /api/sessions` | 会话列表 |
| `GET /api/sessions/{id}/messages` | 会话消息 |
| `PATCH /api/sessions/{id}` | 更新会话 |
| `DELETE /api/sessions/{id}` | 删除会话 |
| `GET/POST /api/pipeline` | 流水线配置 |
| `POST /api/pipeline/run` | 执行阶段 |
| `GET /api/pipeline/runs` | 执行记录 |
| `GET /api/pipeline/state` | 阶段状态 |

### 6.3 引擎通信：文件轮询

```
Agent                            UE5
  ├─ 写入 commands.jsonl ──────→│ 轮询读取
  │  {"action":"import",...}     │ 主线程执行
  ├─ 轮询读取 ←───────────────│ 写入 results.jsonl
  │  results.jsonl               │
```

**为何文件通信**：UE5 `AssetToolsHelpers` API 必须在主线程调用，HTTP Server 运行在子线程会线程安全错误。

---

## 七、UE5 集成

| 操作 | UE5 API | 实现文件 |
|------|---------|----------|
| FBX 导入 | `unreal.AssetToolsHelpers.import_asset_tasks()` | `tools/ue5_bridge.py` |
| 元数据写入 | `unreal.EditorAssetLibrary.set_metadata_tag()` | `tools/ue5_bridge.py` |
| 健康检查 | 文件轮询探测 | `tools/ue5_bridge.py` |

**导入路径规则**：
1. `dest_path` 必须是文件夹路径（不包含资产名），UE5 自动用源文件名命名
2. 用户给具体路径时直接使用
3. 用户给模糊路径时根据项目配置和资产类型推断子目录

---

## 八、LLM 配置

### 8.1 双模式设计

| 模式 | 配置 | 适用场景 |
|------|------|----------|
| 云端 API | GLM-5 / DeepSeek-V4-pro | 复杂推断、报告生成 |
| 自建模型 | Qwen-14B 等（vLLM/Ollama） | 日常对话、简单分类 |

切换方式：`/llm switch <name>` 或前端设置页。

### 8.2 视觉分析

独立于文本 LLM 配置，使用支持多模态的模型：

```python
VISION_CONFIG = {
    "base_url": "https://api-inference.modelscope.cn/v1",
    "model": "Qwen/Qwen3-VL-8B-Instruct",
}
```

---

## 九、多用户架构（中心模式）

一套代码，两种部署：

| 维度 | 本地模式 | 中心模式 |
|------|----------|----------|
| 数据库 | 本机 SQLite | 中心 SQLite/PostgreSQL |
| 权限 | 无 | 美术/组长/主管 三级 |
| 部署 | 单机启动 | 服务器 + 多客户端 |

权限模型：美术看自己 → 组长看本组 → 主管看全部。
