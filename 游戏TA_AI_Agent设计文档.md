# 游戏技术美术 AI Agent 设计文档

> 版本：v0.22 | 创建日期：2026-05-10 | 更新日期：2026-05-18
> 作者：liangmingxuan
> 状态：开发中

### 相关文档

| 文档 | 路径 | 说明 |
|------|------|------|
| 前端设计文档 | `F:\Proma\apps\tagent-web\DESIGN.md` | 前端架构、组件、协议、设计规范、待开发任务 |
| 开发规范 | `F:\ta_agent\CLAUDE.md` | 代码组织、工具开发规范、命名规范 |
| 项目 README | `F:\ta_agent\README.md` | 项目简介和快速开始 |

---

## 项目状态看板

### 里程碑进度

| 里程碑 | 状态 | 说明 |
|--------|------|------|
| 1. 本地资产检查 | ✅ 已完成 | AI 自动质检（面数/贴图/命名/材质） |
| 2. 资产自动入库 | ✅ 已完成 | 审核→重命名→UE5 导入→更新状态 |
| 3. 项目级管理平台 | 🔧 进行中 | 后端完成，前端待开发 |
| 4. 公司级资产助手 | ⬜ 远期 | 跨项目复用 + 新项目规划 |

### 当前在做

**后端**（ta_agent + server）：
- ✅ 会话管理系统（session_manager.py + REST API + WebSocket）
- ✅ 上下文分割机制（context_cutoff）
- ✅ 分析进度面板（rich.progress）
- ✅ 双模式 LLM 配置（云端/自建切换）
- ✅ 用户标识（WebSocket 传用户名）
- ✅ 材质贴图映射（Blender 读取材质节点树）
- ✅ 贴图缩略图自动生成
- ✅ 批量操作进度（入库/重命名/贴图检查）
- ✅ 清理记忆 / 提示词管理 / 用量统计 API
- ✅ 工具管理 / 插件管理 API
- ✅ UE5.7 导入兼容
- ✅ 会话消息截断 + 历史消息过滤

**前端**（fronted）：
- ✅ 流式对话、工具可视化、资产库、审核队列、语义搜索
- ✅ 会话管理 UI（SessionSelector + Popover）
- ✅ 消息导航（ScrollMinimap）
- ✅ 上下文分割线（ContextDivider）
- ✅ 设置页面（模型/Agent/记忆/工具/规范等）

### 接下来做什么

| # | 任务 | 优先级 | 工作量 | 端 | 说明 | 状态 |
|---|------|--------|--------|-----|------|------|
| 1 | 双模式 LLM 配置 | P0 | 0.5 天 | 后端 | config.py 支持云端/自建切换 | ✅ |
| 2 | 用户标识 | P0 | 1 天 | 后端 | WebSocket 传用户名/token，按用户隔离 | ✅ |
| 3 | 前端会话管理 UI | P0 | 2 天 | 前端 | SessionSelector + Popover | ✅ |
| 4 | WebSocket sessionId | P0 | 0.5 天 | 前端 | 连接时带 sessionId，切换时重连 | ✅ |
| 5 | 会话列表完善 | P0 | 0.5 天 | 后端 | 置顶、归档、日期分组、搜索 | ✅ |
| 6 | 消息导航 ScrollMinimap | P0 | 1 天 | 前端 | 右侧迷你导航条 | ✅ |
| 7 | 前端设置页面 | P0 | 1 天 | 前端 | 模型/Agent/记忆等设置页 | ✅ |
| 8 | 材质贴图映射 | P0 | 0.5 天 | 后端 | Blender 读取材质节点树 | ✅ |
| 9 | 贴图缩略图 | P0 | 0.5 天 | 后端 | 分析时自动生成 256px PNG | ✅ |
| 10 | 批量操作进度 | P0 | 0.5 天 | 后端 | 入库/重命名/贴图检查进度 | ✅ |
| 11 | 清理记忆 API | P1 | 0.5 小时 | 后端 | POST /api/memory/clear | ✅ |
| 12 | 提示词管理 API | P1 | 0.5 小时 | 后端 | GET/POST /api/config/prompt | ✅ |
| 13 | 用量统计 API | P1 | 1 小时 | 后端 | GET /api/usage，LLM 调用计数 | ✅ |
| 14 | 审核维度按类型区分 | P1 | 0.5 天 | 后端 | 模型/贴图/动画/材质不同审核维度 | ✅ |
| 15 | 命名自定义规则 | P1 | 0.5 天 | 后端 | @*.* 等自定义规则匹配 | ✅ |
| 16 | 预览图自动生成 | P1 | 0.5 天 | 后端 | Blender 解析时顺手渲染预览图 | ✅ |
| 17 | 文件过滤模式 | P1 | 0.5 天 | 后端 | analyze_assets 支持 file_pattern | ✅ |
| 18 | 类型推断兜底 | P1 | 0.5 天 | 后端 | 命名无法判断时用数据推断类型 | ✅ |
| 19 | 取消机制 | P1 | 0.5 天 | 后端 | WebSocket 断开时取消正在执行的工具 | ✅ |
| 20 | 详情面板配置化 | P1 | 0.5 天 | 前端 | 字段配置驱动，新增字段只改配置 | ✅ |
| 21 | 流水线系统 | P1 | 4.5 天 | 全栈 | 核心流程可视化 + 自定义阶段 + 执行记录，见 PIPELINE_DESIGN.md | ❌ |
| 22 | 自动审核策略 | P1 | 0.5 天 | 后端 | 高置信度自动通过 | ❌ |
| 23 | 数据同步工具 | P1 | 1 天 | 后端 | tools/sync.py，分析完推送到中心 | ❌ |
| 24 | 中心服务器 | P1 | 2 天 | 后端 | 轻量 FastAPI，CRUD + 权限 | ❌ |
| 25 | 权限管理 | P1 | 1.5 天 | 后端 | 美术/组长/主管 + 可见范围 | ❌ |
| 26 | 项目总览仪表盘 | P1 | 1 天 | 前端 | 资产统计、用户分布 | ❌ |
| 27 | 修正记录收集 | P2 | 1 天 | 后端 | 审核修改后记录 | ❌ |
| 28 | 经验聚合 | P2 | 2 天 | 后端 | 修正 → 模式 → 规则 | ❌ |
| 29 | 入库向导 | P2 | 1.5 天 | 前端 | 分步引导 | ❌ |
| 30 | SVN 双目录集成 | P2 | 2 天 | 后端 | ArtResources + Content | ❌ |
| 31 | SVN post-commit 监控 | P2 | 1 天 | 后端 | 自动分析新提交的文件 | ❌ |
| 32 | 桌面启动器 | P2 | 1 天 | 后端 | PyInstaller 打包 exe，自动开浏览器 | ❌ |
| 33 | 错误处理规范化 | P2 | 0.5 天 | 后端 | 消除静默 except:pass，统一日志记录 | ❌ |
| 34 | 配置集中管理 | P2 | 0.5 天 | 后端 | Blender/API Key 等硬编码移入 config.py | ❌ |
| 35 | 工具函数封装 | P3 | 1 天 | 后端 | 高频操作封装为可复用函数 | ❌ |
| 36 | 置信度校准 | P2 | 2 天 | 后端 | 基于历史纠正校准置信度 | ❌ |
| 37 | 记忆冷启动 | P2 | 1 天 | 后端 | 从项目配置自动生成 L0 画像 | ❌ |
| 38 | 推断可解释性 | P3 | 1 天 | 后端 | LLM 返回推理依据 | ❌ |
| 39 | UE5 导入回滚 | P2 | 1 天 | 后端 | 失败标记 + 重试工具 | ❌ |
| 40 | 资产去重 | P3 | 2 天 | 后端 | 入库前检查相似资产 | ❌ |
| 41 | 日志系统 | P3 | 0.5 天 | 后端 | 结构化日志替代 print | ❌ |

**最小可用版本**：任务 1-20 全部完成 ✅ → 单人可用
**流水线版本**：任务 21 完成 → 流程可视化 + 自定义阶段
**团队可用版本**：任务 22-26 完成 → 团队协作
**工程质量提升**：任务 33-41 → 代码健壮性、推断准确性

> 推广策略详见 `工作流程文档.md` 第八章：先帮美术省事（一键重命名、批量导入），再引入质量检查，不要一上来就当审核工具。

### 最近变更

| 版本 | 日期 | 关键改动 |
|------|------|---------|
| v0.22 | 05-18 | 双模式 LLM 配置、用户标识、材质贴图映射、贴图缩略图、批量操作进度、FBX 路径修复、会话消息截断、进度回调修复、UE5.7 导入兼容、历史消息过滤、记忆系统修复、LLM/用户/工具/记忆 REST API、审核维度按类型区分、命名自定义规则、预览图自动生成、文件过滤模式、类型推断兜底、取消机制、详情面板配置化 |
| v0.21 | 05-15 | 多会话管理、上下文分割、进度面板、路径 bug 修复、文档整理 |
| v0.20 | 05-14 | 入库流程重构、AI 推断过滤增强、UE5 Server 修复 |
| v0.19 | 05-14 | UE5 集成（文件通信）、Ctrl+C 打断、System Prompt 自修复 |

---

## 1. 项目背景

### 1.1 行业现状

2026年 AI Agent 正在从"聊天工具"变成"自主行动的数字员工"。当前行业主流应用集中在两个方向：

- **生图类**：Stable Diffusion、Midjourney 生成美术资产
- **编程类**：Claude Code、Codex 辅助代码编写

但在**游戏技术美术（TA）**领域，Agent 化的程度极低，存在大量未被覆盖的价值空间。

### 1.2 为什么需要这个平台

#### TA 层面：效率问题

TA 的核心工作是**管线（Pipeline）管理和质量把控**：

- 每天检查美术提交的资产是否合规
- 维护和优化资产导入流程
- 编写和维护 DCC 工具、引擎内工具
- 性能分析与优化
- 技术规范的制定与执行

这些工作**模式固定但数据量大、规则复杂且需要语义级判断**，非常适合 Agent 化。

#### 公司层面：资产管理问题

除 TA 效率外，更深层的问题是**公司级的资产管理缺失**：

- **规范落地不一致**：公司有技术规范，但每个项目执行人不同，规范在落地过程中千差万别
- **资产无法复用**：各项目做过的资产对公司来说都是可复用资源，但没有统一管理
- **新项目规划靠猜**：开新项目时不清楚已有资源，工作量和成本估算不准
- **知识随人走**：TA 离职后，项目经验和规范理解一起丢失

平台的目标不仅是提升 TA 效率，更是建设**公司的美术资产基础设施**。

### 1.3 架构选择：单 Agent + 多工具

经过分析，TA 的工作流本质是**线性串联**的（检查 → 修复 → 配置 → 导出），核心知识是同一套（TA 领域知识），工具之间是管道式的。因此：

**选择：单 Agent + 多工具架构**（而非多智能体框架）

```
用户（美术/TA）
    ↓
  Agent（一个 LLM，带 TA 领域 prompt）
    ├── 工具1：资产智能识别分类（多模态 LLM 识别）
    ├── 工具2：资产质检（面数、UV、命名...）
    ├── 工具3：Blender 操作（规范化、生成低模...）
    ├── 工具4：UE5 配置（设置 importer、创建 Blueprint...）
    ├── 工具5：规范查询（RAG，项目文档检索）
    └── 工具6：报告生成（质检结果、修复建议）
```

**为什么不用多智能体**：
- 流程是线性串联，不是并行任务
- 核心知识同一套，不需要不同专业 Agent
- 单 Agent 更好维护、好调试、成本低

**何时升级到多智能体**：当需要并行处理多个资产、或需要专业分工（shader 分析 vs 模型拓扑分析）时再考虑。

### 1.4 引擎迁移：Unity → UE5

公司已转向 UE5，这反而更适合做 Agent 化：

| | Unity | UE5 |
|---|---|---|
| 脚本系统 | C# Editor Script | Python（unreal 模块）+ C++ |
| 资产导入 | AssetImporter API | Datasmith / Import Task |
| 材质系统 | Material / MaterialInstance | Material / Material Instance / Material Function |
| 配置方式 | ScriptableObject (.asset) | Data Asset / DataTable |
| 蓝图 | 无 | 蓝图是核心 |

**UE5 的 Agent 优势**：Python 支持成熟（unreal 模块），与 Blender（Python）语言统一，Agent 工具层可以统一技术栈。

---

## 2. 现有工具链梳理

### 2.1 UE5 引擎内工具（Python + Unreal 模块）

| 工具类别 | 功能描述 | 当前实现方式 |
|---|---|---|
| 贴图规范工具 | 检查/设置贴图尺寸、格式、压缩方式、mipmap 等 | Import Task 自动配置 |
| 模型面数检查 | 验证模型面数是否在预算内 | Python 自动检查 + 报告 |
| Import Settings | 自动设置模型导入参数（缩放、法线、切线、材质等） | unreal 模块批量处理 |
| Blueprint 生成器 | 自动创建 Blueprint、添加 Component | Python Editor Utility |
| Component 配置器 | 根据资产类型自动添加对应组件 | 模板化配置 |
| 配置数据导出 | 导出 Data Asset / DataTable 存储流程配置 | unreal.AssetImportData |

### 2.2 DCC 工具链（Blender Python 插件）

| 工具类别 | 功能描述 | 当前实现方式 |
|---|---|---|
| 命名规范化 | 模型、SubMesh、骨骼名称标准化 | Python 脚本 |
| 低模生成 | 使用 Simplygon 同步生成低模 LOD | Simplygon 集成 |
| 资产导出 | 按规范导出 FBX 到 Unity 目录 | 导出脚本 |

### 2.3 当前流程概览

```
Blender（建模/绑定）
  ↓ 命名规范化脚本
  ↓ Simplygon 低模生成
  ↓ 导出 FBX
UE5（导入配置）
  ↓ Import Settings 自动设置
  ↓ 贴图规范检查
  ↓ 面数检查
  ↓ 创建 Blueprint
  ↓ 添加 Component
  ↓ 导出 Data Asset / DataTable 配置
完成资产入库
```

---

## 3. Agent 产品定位

### 3.1 核心定位

**游戏 TA 流程助手** —— 一个理解游戏资产管线、能执行质量检查、能操作工具链的 AI Agent。

不是"又一个生图工具"，也不是"又一个编程助手"，而是**专为 TA 工作流设计的智能体**。

### 3.2 目标用户

- 主要用户：技术美术（TA）
- 间接受益：美术（减少返工）、程序（减少沟通成本）、项目经理（可视化质量数据）

### 3.3 核心价值

1. **资产身份管理**：每个资产入库时自动生成结构化身份证，涵盖物理属性、材质、视觉特征、关联关系等全维度信息
2. **降低质检成本**：从人工逐项检查变为 Agent 自动扫描 + AI 语义级判断
3. **统一规范入口**：美术遇到问题不再"问 TA"，而是问 Agent
4. **知识沉淀**：将 TA 的经验转化为 Agent 的知识库，不随人员流动丢失
5. **语义化资源查找**：按标签组合查找资产，替代"翻文件夹"
6. **为未来 AI 铺路**：结构化标签数据可直接被未来场景生成、关卡设计等 AI Agent 消费

---

## 4. 功能模块设计

### 4.1 模块一：资产身份系统（Asset Identity System）

**优先级：最高** —— 整个 Agent 的核心，其他模块都围绕它运转。

#### 4.1.1 核心理念

传统资产管理是"管文件"——文件名、路径、大小。我们要做的是"管身份"——**每个资产入库时，Agent 给它建一张结构化的身份证**。

这张身份证不是扁平的 key-value，而是分层的、模块化的标签集合，覆盖一个资产从物理属性到视觉特征的全部信息。

**为什么叫"身份"而不是"分类"**：
- 分类是"这是建筑"，身份是"这是一座 45 米高的现代都市商业楼，钢筋混凝土结构，玻璃幕墙，轻微磨损，主立面朝南"
- 分类是给人看的标签，身份是**给机器消费的结构化数据**
- 身份信息一旦建立，任何下游系统（引擎导入、场景生成、资源检索）都能直接使用

#### 4.1.2 资产身份证结构（Tag Schema）

```
AssetIdentity:
  # ── 基础信息（工具自动提取，100% 准确）──
  basic:
    file_name: string           # 原始文件名
    file_type: string           # FBX / TGA / PNG / ...
    file_size: int              # 文件大小
    intake_date: string         # 入库时间
    source: string              # 来源（美术姓名/外包团队）

  # ── 几何属性（工具自动提取）──
  geometry:
    tri_count: int              # 三角面数
    vertex_count: int           # 顶点数
    bounding_box: {x, y, z}    # 包围盒尺寸（米）
    has_skeleton: bool          # 是否有骨骼
    bone_count: int             # 骨骼数量
    uv_channels: int            # UV 通道数
    has_vertex_color: bool      # 是否有顶点色
    lod_levels: int             # LOD 级别数

  # ── 贴图属性（工具自动提取）──
  texture:
    resolution: {width, height} # 分辨率
    format: string              # TGA / PNG / EXR / ...
    has_alpha: bool             # 是否有透明通道
    map_types: [string]         # Diffuse / Normal / Roughness / ...
    color_space: string         # sRGB / Linear

  # ── 资产分类（AI 分析 + 人工确认）──
  classification:
    category: string            # 建筑 / 角色 / 武器 / 载具 / 场景道具 / 自然物体 / ...
    subcategory: string         # 高层建筑 / 人形角色 / 冷兵器 / ...
    asset_type: string          # StaticMesh / SkeletalMesh / ...

  # ── 材质结构（AI 分析 + 人工确认）──
  material:
    primary: [string]           # 主要材质（钢筋混凝土、木材、金属...）
    secondary: [string]         # 次要材质（玻璃、塑料、织物...）
    surface_count: int          # 子材质/材质槽的数量

  # ── 视觉属性（AI 分析 + 人工确认）──
  visual:
    style: string               # 现代 / 古风 / 赛博朋克 / 写实 / 卡通 / ...
    color_palette: [string]     # 主色调（冷灰、暖棕、...）
    condition: string           # 全新 / 轻微磨损 / 重度磨损 / 破碎 / 锈蚀 / ...
    era: string                 # 当代 / 中世纪 / 未来 / ...
    scale_feeling: string       # 宏大 / 精致 / 粗犷 / ...

  # ── 空间属性（AI 分析）──
  spatial:
    orientation: string         # 主立面朝向（如果可判断）
    height_class: string        # 高层 / 中层 / 低层（建筑专用）
    size_class: string          # 大型 / 中型 / 小型（相对于人体参照）

  # ── 关联资源（工具自动匹配 + AI 推断）──
  relations:
    textures: [string]          # 关联贴图文件列表
    materials: [string]         # 关联材质文件列表
    lods: [string]              # 关联 LOD 文件
    collision: [string]         # 关联碰撞体
    parent_asset: string        # 所属大资产（如：某个建筑群中的单栋楼）
    child_assets: [string]      # 子资产列表

  # ── 管理信息（人工填写或自动填充）──
  meta:
    suggested_naming: string    # Agent 建议的规范命名
    suggested_path: string      # Agent 建议的引擎目录
    engine_path: string         # UE5 中的实际路径（导入成功后填写）
    source_path: string         # 源文件路径
    target_engine_dir: string   # 目标 UE5 Content 目录
    target_engine_path: string  # 目标引擎子路径（如 /Game/Weapons）
    tags: [string]              # 自由标签（供搜索用）
    reviewer: string            # 入库审核人
    review_status: string       # pending / approved / imported / rejected
    intake_date: string         # 入库日期
    notes: string               # 备注
```

#### 4.1.3 标签数据来源分层

不是所有标签都能自动获取。按来源分三层：

| 层级 | 来源 | 示例 | 准确度 | 是否需要人工确认 |
|---|---|---|---|---|
| **确定层** | 工具直接提取 | 面数、包围盒、贴图分辨率、文件名 | 100% | 否 |
| **推断层** | AI 分析 | 材质类型、风格、状态、分类 | 70-95% | 是（高置信度可自动通过） |
| **人工层** | 入库责任人填写 | 项目特有标签、关联关系修正、审核确认 | 100% | 是 |

**设计原则**：确定层的数据直接写入身份证，推断层的数据标记置信度并提交审核，人工层的数据由责任人补充。

#### 4.1.4 项目配置层（通用化设计）

不同引擎、不同项目的资产类型和标签需求不同。通过**项目配置**实现通用化：

```
ProjectConfig:
  # 项目基本信息
  project_name: string
  engine: UE5 | Unity | Godot | Custom
  genre: string                 # 科幻 / 奇幻 / 都市 / ...

  # 资产类型定义（项目可自定义）
  asset_types:
    - category: character
      subcategories: [humanoid, mech, creature, npc]
      required_tags: [skeleton_type, bone_count, lod_levels, style]
      naming_prefix: SK_        # 骨骼网格体前缀
      engine_path: /Characters/

    - category: building
      subcategories: [residential, commercial, industrial, landmark]
      required_tags: [height_class, material_primary, style, condition]
      naming_prefix: SM_
      engine_path: /Environment/Buildings/

    - category: weapon
      subcategories: [melee, ranged, energy, explosive]
      required_tags: [weapon_type, attachment_points, material_primary]
      naming_prefix: SM_
      engine_path: /Weapons/

    - category: vehicle
      subcategories: [ground, air, water, mech_vehicle]
      required_tags: [vehicle_type, seat_count, has_turret]
      naming_prefix: SK_
      engine_path: /Vehicles/

  # 命名规则
  naming_rules:
    static_mesh: "SM_{category}_{name}_{variant}"
    skeletal_mesh: "SK_{category}_{name}_{variant}"
    texture: "T_{asset_name}_{map_type}"
    material: "M_{asset_name}_{variant}"

  # 引擎导入配置映射
  import_presets:
    character:
      import_scale: 1.0
      generate_lod: true
      lod_levels: 3
      collision: false
      material_import: true
    building:
      import_scale: 1.0
      generate_lod: true
      lod_levels: 4
      collision: true
      material_import: true
    weapon:
      import_scale: 1.0
      generate_lod: true
      lod_levels: 2
      collision: true
      material_import: true
```

**换项目只改配置，Agent 核心逻辑不变。** 新项目上线时，TA 只需要定义这个配置文件，Agent 就能按照新项目的规范工作。

#### 4.1.5 Agent 完整工作流

```
用户："帮我处理这批资产，路径在 F:\Assets\NewBatch"
    ↓
① 扫描目录
   - 发现 15 个 FBX + 42 张贴图 + 3 个材质文件
   - 自动匹配资产组（同名的 FBX + 贴图归为一组）
    ↓
② 加载项目配置
   - 读取 ProjectConfig，确定引擎类型、资产分类体系、命名规则
    ↓
③ 对每个资产组，提取确定层数据
   - FBX：面数、包围盒、骨骼、UV
   - 贴图：分辨率、格式、通道、色彩空间
   - 文件：命名、路径、配套文件
    ↓
④ AI 分析推断层数据
   - 渲染预览图（Blender headless）
   - 多模态 LLM 分析：分类、材质、风格、状态、朝向
   - 生成推断结果 + 置信度
    ↓
⑤ 生成资产身份证草稿
   - 合并确定层 + 推断层数据
   - 对照项目配置检查完整性（required_tags 是否齐全）
    ↓
⑥ 输出分析报告 → 推送给入库责任人
   - 每个资产一张身份证卡片
   - 高置信度项自动标记为"建议通过"
   - 低置信度项标记为"需确认"
   - 命名不合规的附带修改建议
    ↓
⑦ 责任人审核确认
   - 确认/修改 AI 推断结果
   - 补充人工层标签
   - 批准入库
    ↓
⑧ 自动执行入库
   - 按规范重命名文件
   - 创建引擎目录结构（如果不存在）
   - 配置引擎导入参数（根据 asset_type 对应的 import_presets）
   - 写入引擎元数据（标签、注释）
   - 资产入库完成
    ↓
⑨ 标签入库
   - 身份证数据存入可搜索的数据库
   - 支持后续按任意标签组合检索
```

#### 4.1.5.1 工作流模式

Agent 支持两种工作流模式，通过 `WORKFLOW_MODE` 配置或 CLI 命令 `/mode` 切换：

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| `step_by_step` | 逐步模式（默认）：每完成一个阶段后汇报结果，等待用户确认再进入下一阶段 | 新用户、需要逐步确认的场景 |
| `auto` | 自动模式：分析完成后自动串联后续阶段，高置信度资产自动通过，仅低置信度资产询问用户 | 熟悉 Agent 的用户、批量处理 |

**逐步模式流程**：
```
阶段一：分析资产 → 汇报结果，询问"是否进入审核阶段？"
    ↓ 用户确认
阶段二：审核资产 → 汇报结果，询问"是否进入入库阶段？"
    ↓ 用户确认
阶段三：入库 → 完成
```

**自动模式流程**：
```
分析资产 → 获取待审核列表 → 高置信度自动批量通过
    ↓ 有低置信度资产
列出详情，询问用户 → 用户确认后入库
    ↓ 全部高置信度
直接入库
```

**CLI 命令**：
- `/mode step_by_step` — 切换到逐步模式
- `/mode auto` — 切换到自动模式
- `/status` — 查看当前模式

#### 4.1.6 标签检索：语义化资源查找

身份证建好后，开发时可以按标签组合查找资源：

```
用户："我需要一个现代都市风格的中型商业建筑，有玻璃幕墙，轻微磨损的效果"

Agent 检索标签库 → 返回：
  1. SM_Building_Commercial_01（匹配度 95%）
     - 风格：现代都市
     - 材质：玻璃幕墙 + 钢筋混凝土
     - 状态：轻微磨损
     - 尺寸：中型（12层）
  2. SM_Building_Office_03（匹配度 78%）
     - 风格：现代都市
     - 材质：玻璃幕墙 + 金属
     - 状态：全新（但可作为基础修改）
     - 尺寸：中型（8层）
```

这比"在文件夹里翻"高效得多，尤其是项目资产量大了以后。

#### 4.1.6.1 语义化检索实现（✅ 已实现）

**实现模块**: `tags/search.py`

**架构**:

```
用户自然语言查询
    ↓
QueryParser（LLM 解析）→ 结构化 SearchQuery
    ↓
TagStore（SQLite 预过滤）→ 候选集
    ↓
score_asset（多维度评分引擎）→ 按匹配度排序
    ↓
top_k 结果 + 匹配度百分比
```

**评分维度与权重**:

| 维度 | 权重 | 匹配方式 |
|---|---|---|
| category | 30 | 精确/模糊匹配 |
| style | 20 | 精确/模糊匹配 |
| materials | 15 | 列表交集（支持部分匹配） |
| subcategory | 15 | 精确/模糊匹配 |
| condition | 10 | 精确/模糊匹配 |
| color_palette | 5 | 列表交集 |
| size_class | 5 | 面数推断尺寸 |

**使用方式**:

```python
from tags.store import TagStore
from tags.search import SearchEngine

store = TagStore(store_dir)
engine = SearchEngine(store)

# 自然语言搜索
results = engine.search("我需要一个现代都市风格的商业建筑，有玻璃幕墙")
for r in results:
    print(f"{r.asset.asset_name}: {r.score:.1f}%")

# 结构化搜索（跳过 LLM，更快）
from tags.search import SearchQuery
query = SearchQuery(category="building", style="modern", materials=["glass"])
results = engine.search_structured(query, top_k=10)
```

**依赖**: 需要 LLM API（用于自然语言解析），结构化搜索不需要。

#### 4.1.7 远期价值：为未来 AI Agent 准备数据

资产身份标签不只是给人用的。随着 AI 在游戏引擎中的能力增强（自主搭建场景、关卡设计等），这些结构化标签会成为**AI Agent 的直接数据源**：

```
未来场景：
  场景生成 Agent："我需要在城市街道两侧放置商业建筑"
    → 直接查询标签库：category=building, subcategory=commercial, style=modern
    → 自动获取匹配资产列表
    → 根据 bounding_box 和 orientation 自动摆放
    → 根据 condition 和 style 保持视觉一致性

  关卡设计 Agent："这个区域需要一个废弃工厂的感觉"
    → 查询标签库：category=building, subcategory=industrial, condition=worn|broken
    → 配合 weathering 程度自动选择资产
    → 生成关卡布局
```

**今天做的标签工作，是为明天的 AI 自动化铺路。** 标签的结构化程度越高，未来 AI 消费这些数据时就越顺畅。

#### 4.1.8 工具接口设计

```python
tools = [
    # ── 扫描与匹配 ──
    scan_asset_directory(path),              # 扫描目录，返回资产文件列表
    group_assets(file_list),                 # 按命名规则自动分组（同名FBX+贴图归为一组）

    # ── 确定层数据提取 ──
    extract_fbx_metadata(fbx_path),          # 面数、包围盒、骨骼、UV、顶点色
    extract_texture_metadata(tex_path),      # 分辨率、格式、通道、色彩空间
    extract_file_metadata(file_path),        # 文件大小、修改时间

    # ── 推断层 AI 分析 ──
    render_preview_thumbnail(fbx_path),      # Blender 后台渲染预览图
    analyze_asset_identity(metadata, preview), # 多模态 LLM 分析，返回分类+材质+风格+状态

    # ── 身份证生成 ──
    generate_identity_card(asset_data, ai_analysis, project_config),  # 合并生成完整身份证
    validate_identity_completeness(identity, project_config),         # 检查 required_tags 是否齐全

    # ── 命名与路径 ──
    suggest_naming(identity, naming_rules),   # 根据身份和规则建议命名
    suggest_directory(identity, project_config),  # 根据身份建议引擎目录
    check_naming_convention(file_name, rules),    # 检查当前命名是否合规

    # ── 报告与审核 ──
    generate_intake_report(identities),       # 生成入库分析报告（HTML）
    confirm_identity(identity_id, corrections),   # 人工审核确认

    # ── 入库执行 ──
    rename_assets(asset_path, new_name),     # 重命名
    create_engine_directory(path),           # 创建引擎目录
    configure_import_settings(asset_type, preset),  # 配置引擎导入参数
    write_engine_metadata(identity),         # 写入引擎元数据

    # ── 检索 ──
    search_assets_by_tags(query),            # 按标签组合语义检索
]
```

#### 4.1.9 关键难点与解法

| 难点 | 解法 |
|---|---|
| 3D 模型怎么给 LLM "看" | Blender Python 后台渲染：加载模型、打光、渲染正交预览图，不需要 GUI |
| 分类体系不同项目不一样 | ProjectConfig 可配置，项目初期 TA 定义好分类树和标签需求 |
| LLM 判断不准确 | 置信度机制：高置信度自动通过，低置信度提交人工确认；逐步积累 few-shot |
| 批量导入时速度 | 先用规则快速提取确定层数据，只对需要 AI 分析的调用多模态 LLM；缓存机制避免重复分析 |
| 资产组匹配困难 | 命名规则驱动的自动分组 + AI 辅助推断关联关系 |
| 成本控制 | 分层处理：确定层零成本，推断层按需调用；用便宜模型做初步分析，复杂场景用强模型 |

#### 4.1.10 与现有 Agent 原型的关系

当前 Agent 原型已有能力：
- ✅ 目录扫描（`scan_directory`）
- ✅ 命名检查（`check_naming`）
- ✅ 贴图规格检查（`check_texture_batch`）
- ✅ FBX 信息读取（`check_fbx_info`）

这些工具对应的是**确定层数据提取**，是身份证系统的基础设施。

需要新增的能力：
- ❌ 资产分组（`group_assets`）
- ❌ 预览图渲染（`render_preview_thumbnail`）
- ❌ AI 分析层（`analyze_asset_identity`）
- ❌ 身份证生成（`generate_identity_card`）
- ❌ 标签数据库（存储和检索）
- ❌ 项目配置系统（`ProjectConfig`）

下一步优先做**项目配置系统 + 资产分组 + 身份证生成**，这三个搭好后，身份证系统的骨架就立起来了。

### 4.2 模块二：资产质检 Agent（Asset Validation Agent）

**优先级：高** —— 最直接的痛点，流程化质检。

#### 功能描述

自动扫描项目资产目录，对照项目规范文档，生成详细的质检报告。

#### 检查维度

| 检查项 | 规则示例 | 传统脚本 | Agent 增强 |
|---|---|---|---|
| 模型面数 | 角色 < 30K，场景 < 50K | ✅ 硬编码 | ✅ 可理解例外情况 |
| UV 范围 | 必须在 0-1 范围内 | ✅ 硬编码 | ✅ 解释影响 |
| 命名规范 | 前缀_类型_描述 | ✅ 正则匹配 | ✅ 理解意图 |
| 拓扑结构 | 角色需要合理布线 | ❌ 无法判断 | ✅ 语义级判断 |
| 材质参数 | PBR 参数在合理范围 | 部分 | ✅ 理解物理含义 |
| 骨骼命名 | 符合项目骨架规范 | ✅ 字符串匹配 | ✅ 理解层级关系 |
| LOD 设置 | 需要 3 级 LOD | ✅ 数量检查 | ✅ 检查质量差异 |
| 贴图尺寸 | 角色 2048，道具 1024 | ✅ 尺寸检查 | ✅ 根据类型判断 |

#### Agent 工作流

```
触发（手动/定时/提交时）
  ↓
扫描资产目录
  ↓
加载项目规范（RAG 知识库）
  ↓
逐项检查（调用工具）
  ↓
语义级判断（LLM 推理）
  ↓
生成质检报告（HTML/PDF）
  ↓
可选：自动修复常见问题
```

#### 工具接口设计

```python
# 资产质检 Agent 可调用的工具
tools = [
    scan_asset_directory(path),      # 扫描目录，返回资产列表
    check_mesh_info(fbx_path),       # 获取模型面数、顶点数等
    check_uv_range(fbx_path),        # 检查 UV 是否在 0-1
    check_naming_convention(name),   # 检查命名是否符合规范
    check_texture_settings(tex_path), # 检查贴图设置
    check_material_params(mat_path), # 检查材质参数
    load_project_specification(),    # 加载项目技术规范
    generate_report(results),        # 生成质检报告
    auto_fix(asset_path, issue),     # 自动修复
]
```

### 4.3 模块三：性能诊断 Agent（Performance Profiling Agent）

**优先级：高** —— TA 的另一大核心工作。

#### 功能描述

解析 UE5 Profiler 数据，自动定位性能瓶颈，给出优化建议。

#### 分析维度

| 分析项 | 数据来源 | Agent 输出 |
|---|---|---|
| Draw Call 分析 | UE5 GPU Profiler / RenderDoc | 哪些物体导致 draw call 过多，建议合批 |
| Overdraw 分析 | UE5 Shader Complexity | 哪些区域 overdraw 严重，建议优化 |
| Shader 变体分析 | 材质编译日志 | 变体数量、编译时间、冗余变体 |
| 内存分析 | UE5 Memory Profiler | 资源占用分布、泄漏风险 |
| 加载时间分析 | Asset 加载日志 | 哪些资源加载慢、建议异步/预加载 |
| Nanite/Lumen 分析 | UE5 特有 Profiler | 虚拟几何体和全局光照的性能开销 |

### 4.4 模块四：规范知识库 Agent（Specification Knowledge Agent）

**优先级：中** —— 解决"规范写了没人看"的问题。

#### 功能描述

将项目技术规范文档向量化，提供自然语言查询入口。

#### 使用场景

```
美术："这个模型能不能用半透明材质？"
Agent：查阅规范 → "根据项目规范，角色模型不建议使用半透明材质，
       因为会导致排序问题。如果必须使用，请确保...[具体规范条款]"

美术："贴图最大能用多大？"
Agent：查阅规范 → "武器贴图最大 1024x1024，角色贴图最大 2048x2048，
       地形贴图最大 4096x4096。详见规范 3.2 节。"
```

### 4.5 模块五：DCC 工具链 Agent（DCC Pipeline Agent）

**优先级：中** —— 将现有 Blender 脚本升级为 Agent 驱动。

#### 功能描述

在 Blender 中嵌入 Agent，美术可以通过自然语言操作工具链。Blender 和 UE5 都用 Python，Agent 的工具层可以统一技术栈。

#### 使用场景

```
美术："帮我把这个模型规范化"
Agent：→ 调用命名规范化脚本
      → 检查 SubMesh 命名
      → 检查骨骼命名
      → 生成低模（Simplygon）
      → 导出到 Unity 目录
      → 完成后报告："已完成规范化，发现 2 个问题：..."

美术："这个角色的布线不太对，导入 Unity 后法线有问题"
Agent：→ 分析模型拓扑
      → 检查法线设置
      → 诊断问题原因
      → 给出修复建议或自动修复
```

### 4.6 模块六：视觉 QA Agent（Visual Regression Agent）

**优先级：低（长期）** —— 最有价值但实现难度最高。

#### 功能描述

自动截图对比，检测渲染效果的变化。

#### 应用场景

- 新版本 vs 旧版本的渲染对比
- PC/主机/移动端的跨平台一致性
- Shader 修改后的回归测试

### 4.7 模块七：项目记忆系统（Project Memory System）

**优先级：高** —— Agent 的核心机制之一，决定 Agent 是否能"越用越准"。

#### 4.7.1 核心理念

当前推断层是无状态的——每次分析都是独立的，不保留历史。这意味着：
- 用户纠正过的错误，下次还会犯
- 项目的风格偏好，每次都要重新推断
- 用得越多并不会越准

项目记忆系统让 Agent 具备**跨会话的学习能力**：用户纠正一次，Agent 永远记住。

**设计原则**：
- **无纠正不记忆**：只有用户显式纠正才写入记忆，LLM 自己的推测永远不存（借鉴 GenericAgent）
- **最小充分指针**：记忆条目只编码精简规则，不存原始对话（借鉴 GenericAgent 存在性编码）
- **按需注入**：不全量塞入 prompt，根据当前资产特征匹配相关规则（借鉴 Mem0 检索策略）
- **自压缩**：记忆自动合并、淘汰，token 消耗始终可控

#### 4.7.2 三层记忆结构

| 层级 | 文件 | 内容 | 大小约束 | 注入时机 |
|---|---|---|---|---|
| **L0 项目画像** | `.ta_agent/memory/profile.md` | 项目风格、命名约定、目录结构 | 硬限 ≤20 行（≤500 tokens） | 每次推断都注入 |
| **L1 纠正规则** | `.ta_agent/memory/rules.jsonl` | 合并后的精简推断规则 | 硬限 ≤15 条 | 按相关性筛选，最多注入 5 条 |
| **L2 归档** | `.ta_agent/memory/archive.jsonl` | 原始纠正记录（压缩后归档） | 无限，不注入 | 仅在压缩合并时读取 |

#### 4.7.3 记忆生命周期

```
用户纠正分析结果
  ↓
写入 L2（原始纠正记录）
  ↓
L2 累积 > 10 条 → 触发自动压缩
  ↓
LLM 合并相似纠正 → 提炼为精简规则 → 写入 L1
  ↓
规则被多次命中且未再被纠正 → 确认为可靠规则（置信度上升）
  ↓
规则长期不命中（>30次分析未匹配）→ 降级淘汰
  ↓
L1 中确认可靠的规则 → 提炼为 L0 项目画像
```

#### 4.7.4 记忆注入方式

推断时，将记忆作为额外上下文注入 prompt：

```
[系统 prompt] 你是 TA Agent...

[项目画像 L0]
项目风格：低多边形卡通
命名约定：建筑用 BLD_ 前缀，角色用 CHR_ 前缀
目录结构：/Environment/Buildings/, /Characters/

[相关规则 L1]（按当前资产特征匹配，最多 5 条）
1. SM_前缀 + 包围盒窄长 + 金属材质 → weapon/sword（命中12次，置信度0.92）
2. 包围盒 > 5m + 建筑前缀 → building/wall（命中8次，置信度0.88）

[确定层数据] 面数:500, 材质:metal, 包围盒:2x0.1x0.1m...
```

#### 4.7.5 检索策略

不是全量注入所有记忆，而是根据当前资产特征做匹配：

| 匹配维度 | 匹配方式 |
|---|---|
| 文件名前缀（SM_/SK_） | 精确匹配 |
| 包围盒比例（窄长/扁平/等比） | 分类匹配 |
| 材质关键词（Metal/Glass/Concrete） | 关键词匹配 |
| 面数范围（低模/中模/高模） | 范围匹配 |
| 项目画像（风格/命名） | 每次全量注入 |

每条规则记录命中次数和纠错次数：

```json
{
  "pattern": "SM_前缀 + 包围盒窄长 + 金属材质",
  "conclusion": "weapon/sword",
  "hits": 15,
  "corrections": 2,
  "confidence": 0.87
}
```

#### 4.7.6 自动压缩机制

| 触发条件 | 动作 |
|---|---|
| L2 原始纠正 > 10 条 | LLM 合并相似纠正 → 提炼为 L1 规则 |
| L1 规则 > 15 条 | 淘汰最低置信度规则（confidence < 0.3 且 hits < 3） |
| L0 项目画像 > 20 行 | LLM 压缩为更精简的描述 |
| 单条规则被纠错 > 3 次 | 规则标记为不可靠，需要重新验证 |

#### 4.7.7 接口设计

```python
# 记忆系统对外接口（抽象协议）
from typing import Protocol

class MemoryProvider(Protocol):
    """项目记忆提供者接口 — 所有记忆实现必须遵循此协议"""

    def load(self, project_path: str) -> None:
        """加载指定项目的记忆数据"""
        ...

    def get_context(self, asset_features: dict) -> str:
        """根据资产特征返回相关记忆上下文，注入推断 prompt。
        返回格式为结构化文本，无记忆时返回空字符串。"""
        ...

    def save_correction(self, asset_path: str, ai_result: dict, user_correction: dict) -> None:
        """记录用户纠正（仅在用户显式纠正时调用）。
        asset_path: 被纠正的资产路径
        ai_result: AI 原始推断结果
        user_correction: 用户给出的正确结果"""
        ...

    def compress(self) -> None:
        """手动触发记忆压缩（合并规则、淘汰低置信度）"""
        ...
```

#### 4.7.8 模块化与低耦合

记忆系统通过依赖注入与主流程解耦：

```python
# inferrer.py — 推断层使用记忆
class AssetInferrer:
    def __init__(self, llm_client, memory: MemoryProvider = None):
        self.llm = llm_client
        self.memory = memory or NullMemoryProvider()  # 无记忆时用空实现

    def infer(self, asset_data):
        # 1. 加载记忆上下文（空实现则返回 ""）
        memory_ctx = self.memory.get_context(asset_data.features) if self.memory else ""

        # 2. 拼接 prompt
        prompt = f"{system_prompt}\n{memory_ctx}\n{asset_data}"

        # 3. 调用 LLM 推断
        result = self.llm.chat(prompt)
        return result

# main.py — 通过依赖注入选择记忆实现
def create_inferrer(project_path: str) -> AssetInferrer:
    memory = FileMemoryProvider(project_path)  # 或 NullMemoryProvider()
    memory.load(project_path)
    return AssetInferrer(llm_client, memory=memory)
```

**可替换实现**：

| 实现 | 用途 |
|---|---|
| `NullMemoryProvider` | 空实现，不存不读，用于测试或不需要记忆的场景 |
| `FileMemoryProvider` | 文件系统实现（profile.md + rules.jsonl），单机版 |
| `DBMemoryProvider` | 数据库实现，团队共享版（未来扩展） |

#### 4.7.9 文件结构

```
<project_root>/
└── .ta_agent/
    └── memory/
        ├── profile.md          # L0 项目画像（≤20 行）
        ├── rules.jsonl         # L1 纠正规则（≤15 条）
        └── archive.jsonl       # L2 归档原始纠正
```

`rules.jsonl` 单行格式：

```json
{
  "id": "rule_001",
  "pattern": "SM_前缀 + 包围盒宽高比 > 10:1 + 金属材质",
  "conclusion": "weapon/sword",
  "hits": 15,
  "corrections": 2,
  "confidence": 0.87,
  "created_at": "2026-05-10T10:00:00",
  "last_hit": "2026-05-10T14:30:00"
}
```

`archive.jsonl` 单行格式：

```json
{
  "asset_path": "F:/Assets/sword_01.fbx",
  "ai_result": {"category": "building/pillar"},
  "user_correction": {"category": "weapon/sword"},
  "features": {"prefix": "SM_", "aspect_ratio": 12, "material": "metal"},
  "timestamp": "2026-05-10T10:00:00"
}
```

---

## 5. 技术架构

### 5.1 整体架构

```
┌─────────────────────────────────────────────────┐
│                   用户界面层                      │
│  UE5 Editor Utility Widget / Blender 面板 / Web  │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│               Agent 编排层（单 Agent）            │
│  ┌──────────────────────────────────────────┐   │
│  │     主控 Agent (GLM-5 / DeepSeek-V4-pro)      │
│  │   TA 领域 System Prompt + 工具调用能力     │   │
│  └──────────────────────────────────────────┘   │
│       │            │            │                │
│  ┌────▼────────────▼────────────▼────┐          │
│  │           工具注册中心              │          │
│  │  身份分析 | 质检 | 入库 | 检索 | DCC│          │
│  └───────────────────────────────────┘          │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│               资产身份系统（核心）                 │
│  ┌──────────────────────────────────────────┐   │
│  │  AssetIdentity 标签库                      │   │
│  │  确定层 → 自动提取                         │   │
│  │  推断层 → AI 分析                          │   │
│  │  人工层 → 责任人审核                       │   │
│  └──────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────┐   │
│  │  ProjectConfig 项目配置                    │   │
│  │  资产类型 / 命名规则 / 导入预设            │   │
│  └──────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│                   工具层                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ UE5工具  │ │Blender工具│ │外部工具  │           │
│  │(Python)  │ │(Python)  │ │(API)    │           │
│  └─────────┘ └─────────┘ └─────────┘           │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│                  知识库层                         │
│  项目技术规范 / 历史质检记录 / 最佳实践文档       │
│  (向量化存储，RAG 检索)                          │
└─────────────────────────────────────────────────┘
```

### 5.2 技术选型

| 组件 | 选型 | 理由 |
|---|---|---|
| LLM | GLM-5 / DeepSeek-V4-pro（OpenAI 兼容格式） | 当前可用，推理能力强，支持工具调用（function calling），成本低 |
| 备选 LLM | Claude Sonnet / GPT-4o | 后续可切换，架构已做抽象，切换 LLM 只改 API 配置 |
| Agent 架构 | 单 Agent + 多工具（原生 OpenAI Function Calling） | TA 流程是线性串联，不需要多 Agent 编排；不用框架，直接调 API |
| 标签数据库 | SQLite（✅ 已实现）/ PostgreSQL（生产阶段） | 资产身份证的结构化存储，支持多维度标签组合查询，4 万+ 资产毫秒级检索 |
| 向量知识库 | ChromaDB / FAISS | 项目规范文档的向量化存储，RAG 检索 |
| UE5 集成 | unreal Python 模块 + Editor Utility Widget | UE5 原生 Python 支持，与 Blender 统一技术栈 |
| Blender 集成 | Python 插件 + HTTP 通信 | Blender 原生 Python 支持 |
| 报告生成 | HTML 模板 + Jinja2 | 可视化入库分析报告 |

### 5.2 LLM 选型说明

当前使用 GLM-5 和 DeepSeek-V4-pro，两者均兼容 OpenAI API 格式，开发方式完全一致：

```python
# 统一的 LLM 调用方式（OpenAI 兼容格式）
from openai import OpenAI

# 切换模型只需要改 base_url 和 api_key
client = OpenAI(
    base_url="https://api.deepseek.com/v1",  # 或 GLM 的地址
    api_key="your-api-key"
)
```

**选型策略**：
- **DeepSeek-V4-pro**：推理能力强，适合需要复杂判断的场景（资产分类、性能诊断）
- **GLM-5**：中文理解好，适合规范查询、报告生成等中文密集场景
- **后续迁移**：架构已做 LLM 抽象层，切换到 Claude/GPT 只需改配置，不改业务逻辑

### 5.2.1 LLM 依赖度分析

Agent 的大部分工作**不需要 LLM**，LLM 只用于理解意图和推断：

**按功能数**：22% 需要 LLM（5/22 个功能）

| 需要 LLM | 不需要 LLM |
|----------|-----------|
| 对话交互（理解用户意图） | 目录扫描（os.walk） |
| AI 推断（分类/材质/风格） | FBX 解析（Blender subprocess） |
| 工具选择（决定调哪个工具） | 贴图检查（Pillow） |
| 语义搜索（自然语言理解） | 命名检查（regex） |
| 报告生成（格式化输出） | 面数检查（数值比较） |
| | 入库操作（文件复制） |
| | 审核操作（SQLite） |

**一次完整分析的调用明细**（100 个 FBX + 50 个贴图）：

```
[LLM] 用户发消息 → 理解意图 + 选择工具          1 次
      调用 analyze_assets → 内部执行            0 次
        扫描目录 (1000 文件) → os.walk          0 次
        分析贴图 (50 张) → Pillow               0 次
        分析 FBX (100 个) → Blender             0 次
        命名检查 → regex                        0 次
[LLM]   AI 推断 (50 个资产) → 批量调 LLM        5 次
[LLM] 返回结果 → 生成报告                       1 次
[LLM] 用户确认审核 → 理解意图                    1 次
      调用 batch_approve → SQLite               0 次
[LLM] 用户入库 → 理解意图                        1 次
      调用 intake_approved → 文件操作            0 次
[LLM] 汇报结果 → 生成总结                        1 次
```

**总计**：LLM 调用 10 次，本地执行 7 次

**耗时分布**：

```
Blender 解析 100 个 FBX   ████████████████████████████  50 分钟
AI 推断 50 个资产          ███                           5 分钟
其他 LLM 调用              █                             1 分钟
本地检查                   ▏                            10 秒
```

**结论**：
- LLM 调用次数少（10 次），每次轻量（1-3 秒）
- 瓶颈在 Blender（每个 FBX 30 秒），不在 LLM
- 多用户并发 LLM 调用：10 人同时用，峰值并发仅 10 个请求

### 5.2.2 双模式 LLM 设计

支持云端 API 和自建模型两种模式，通过配置切换：

```python
# config.py

# 模式 1：云端 API
CLOUD_CONFIG = {
    "base_url": "https://api.deepseek.com/v1",
    "api_key": "sk-xxx",
    "model": "deepseek-v4-pro",
}

# 模式 2：自建模型（vLLM / Ollama 部署，OpenAI 兼容接口）
LOCAL_CONFIG = {
    "base_url": "http://192.168.1.100:8000/v1",  # 公司 GPU 服务器
    "api_key": "none",
    "model": "qwen-14b",
}

# 切换只需改这一行
ACTIVE_LLM = "cloud"  # 或 "local"
```

**自建模型推荐**：

| 模型规模 | 显存需求 | 硬件 | 能力 |
|---------|---------|------|------|
| 7B | ~14 GB | 一张 RTX 4090 | 基础对话、简单分类 |
| 14B | ~28 GB | 一张 A100 40GB | 资产分类、材质推断（推荐） |
| 32B | ~64 GB | 一张 A100 80GB | 复杂分析、风格识别 |
| 70B | ~140 GB | 两张 A100 80GB | 接近商业 API 质量 |

**混合模式（可选）**：按任务类型自动选择 LLM：

```python
def get_llm_config(task_type="chat"):
    """简单任务用本地模型（快），复杂任务用云端 API（准）"""
    if task_type == "inference":
        return CLOUD_CONFIG      # AI 推断用大模型
    elif task_type == "chat":
        return LOCAL_CONFIG      # 对话用本地模型
    else:
        return configs[ACTIVE_LLM]
```

**统一接口**：无论云端还是自建，都用 OpenAI 兼容格式，Agent 代码零改动：

```python
client = OpenAI(base_url=config["base_url"], api_key=config["api_key"])
# 同样的调用方式，不关心 LLM 在哪里
response = client.chat.completions.create(model=model, messages=messages, ...)
```

### 5.3 通信架构

Agent 与引擎的通信采用**文件轮询**方式（避免 UE5 线程安全问题）：

```
Agent 侧                           UE5 侧
    │                                  │
    ├─ 写入 commands.jsonl ──────────→│ 轮询读取
    │   {"action":"import", ...}       │ 执行导入（主线程）
    │                                  │ 写入 results.jsonl
    ├─ 轮询读取 results.jsonl ←───────┤
    │   {"success":true, ...}          │
```

**为什么用文件通信而非 HTTP**：
- UE5 的 `AssetToolsHelpers` 等 API 必须在主线程调用
- HTTP Server 运行在子线程，直接调用 UE5 API 会报线程安全错误
- 文件通信天然在主线程执行，无需 `execute_on_game_thread`（UE5 Python 不支持此 API）

**文件结构**：
- `ue5_server/server.py`：UE5 侧命令轮询服务
- `ue5_server/commands.jsonl`：Agent 写入的命令队列
- `ue5_server/results.jsonl`：UE5 返回的执行结果
- `tools/ue5_bridge.py`：Agent 侧桥接工具（写命令、读结果）

### 5.4 UE5 集成方案

#### 实现架构

```
┌─────────────────────────────────────────────────────┐
│                    Agent 侧                          │
│  tools/ue5_bridge.py                                │
│  ├─ ue5_import_asset()     写入导入命令              │
│  ├─ ue5_health_check()     检查 Server 是否在线      │
│  └─ _send_command()        文件通信核心              │
└──────────────────────┬──────────────────────────────┘
                       │ commands.jsonl
                       ▼
┌─────────────────────────────────────────────────────┐
│                    UE5 侧                            │
│  ue5_server/server.py                               │
│  ├─ _poll_loop()           主线程轮询命令文件         │
│  ├─ _handle_import()       执行 FBX 导入             │
│  └─ _write_result()        写入执行结果              │
└─────────────────────────────────────────────────────┘
```

#### UE5 Server 启动方式

在 UE5 Editor 的 Python Console 中执行：
```python
exec(open(r"F:/ta_agent/ue5_server/server.py").read())
```

Server 在后台线程轮询 `commands.jsonl`，收到命令后在主线程执行 UE5 API 调用。

#### 支持的 UE5 操作

| 操作 | UE5 API | 状态 |
|------|---------|------|
| FBX 导入 | `unreal.AssetToolsHelpers.import_asset_tasks()` | ✅ 已实现 |
| 元数据写入 | `unreal.EditorAssetLibrary.set_metadata_tag()` | ✅ 已实现 |
| 资产查询 | `unreal.AssetRegistryHelpers.get_asset_registry()` | 待实现 |
| 材质检查 | `unreal.EditorAssetLibrary.find_asset_data()` | 待实现 |

#### 工具失败自修复

Agent 的 System Prompt 包含工具失败处理规则：
- 插件工具（tools/plugins/）：可直接修改代码
- 核心工具：只报告问题，等用户确认后再改
- 外部环境问题：建议修改桥接工具或生成新适配代码
```

### 5.5 Blender 集成方案

```python
# Blender 中的 Agent 面板
class TAAGENT_PT_main(bpy.types.Panel):
    bl_label = "TA Agent"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'

    def draw(self, context):
        layout = self.layout
        layout.prop(context.scene, "ta_agent_input")
        layout.operator("taagent.send_message")
        # 显示 Agent 回复
        # 显示工具执行结果

# 工具注册
def register_tools():
    """将 Blender 操作注册为 Agent 可调用的工具"""
    tools = [
        Tool("normalize_naming", normalize_naming),
        Tool("check_mesh", check_mesh_info),
        Tool("generate_lod", generate_lod),
        Tool("export_fbx", export_to_unity),
    ]
    return tools
```

### 5.6 会话管理系统

#### 设计目标

- 多会话并存（如"分析角色目录"、"分析武器目录"）
- 会话关闭后可恢复继续
- 历史会话列表和搜索
- 上下文分割（清空上下文但保留历史）

#### 存储方案：JSONL + 索引

```
~/.ta_agent/sessions/
├── index.json              # 会话索引（元数据列表）
├── sess_a1b2c3.jsonl       # 每会话一个文件，每行一条消息
└── ...
```

- **append-only 写入**：崩溃安全，每条消息立即落盘
- **草稿机制**：新建会话为草稿，发首条消息后才出现在列表
- **自动归档**：超过 7 天未活跃自动归档
- **分页读取**：大文件反向扫描，只读最后 N 条

#### CLI 命令

| 命令 | 作用 |
|------|------|
| `/sessions` | 列出所有会话 |
| `/new` | 创建新会话 |
| `/switch <id>` | 切换到指定会话 |
| `/delete <id>` | 删除会话 |
| `/clear` | 清空上下文（保留历史） |

#### 上下文分割

`agent_loop` 新增 `context_cutoff` 参数：

```
history = [msg0, msg1, msg2, msg3, msg4, msg5]
                    ↑ context_cutoff = 2

LLM 看到: [msg2, msg3, msg4, msg5]
持久化:   [msg0, msg1, msg2, msg3, msg4, msg5]（完整）
```

#### Server REST API

- `POST /api/sessions` — 创建
- `GET /api/sessions` — 列表
- `GET /api/sessions/{id}/messages` — 消息
- `PATCH /api/sessions/{id}` — 更新（标题、置顶）
- `DELETE /api/sessions/{id}` — 删除
- `POST /api/sessions/search` — 搜索

WebSocket 支持 `?sessionId=xxx` 恢复会话。

### 5.7 多用户架构

#### 核心原则：一套代码，两种部署

Agent 只有一种模式（跑在本机），前端和后端代码本地/中心通用，通过权限控制功能范围。

```
本地模式（单人）                    中心模式（团队）
├── 前端（同一套）                  ├── 前端（同一套）
├── 后端（同一套）                  ├── 后端（同一套）
├── 本机 SQLite                    ├── 中心 SQLite/PG
└── 无权限（单用户）                └── 有权限（多角色）
```

#### 架构

```
美术 A 的电脑                    中心服务器
├── Agent（本机运行）             ├── 数据库（所有人的元数据）
├── Blender                      ├── 规范文档库
├── 资产文件                     ├── 团队知识库
├── UE 引擎                      └── 用户管理
└── 本机 server.py
    ↑ 浏览器                      ↑ 浏览器
    http://localhost:8080          http://中心服务器:8080
```

Agent 不变，分析完后多一步同步：`POST /api/sync` 推送结果到中心服务器。

#### 权限模型

| 角色 | 可见范围 | 可操作 |
|------|---------|--------|
| 美术 | 自己的资产 | 分析、提交审核、入库 |
| 组长 | 本组所有资产 | 审核、统计、管理本组成员 |
| 主管 | 全部资产 | 全部操作、用户管理、配置管理 |

```python
# 中心服务器权限控制
@app.get("/api/assets")
async def list_assets(request):
    user = request.state.user
    if user.role == "admin":
        return store.list_all()                    # 主管看全部
    elif user.role == "lead":
        return store.list_by_group(user.group)     # 组长看本组
    else:
        return store.list_by_user(user.name)       # 美术看自己
```

#### 本地 vs 中心的区别

| | 本地模式 | 中心模式 |
|---|---|---|
| 前端 | 同一套 | 同一套 |
| 后端 | 同一套 | 同一套 |
| 数据库 | 本机 SQLite | 中心 SQLite/PG |
| 权限 | 无（单用户） | 有（多角色） |
| 资产可见 | 全部（只有自己的） | 按角色过滤 |
| 同步 | 不需要 | 自动推送到中心 |

#### 知识层级

| 层级 | 内容 | 来源 |
|------|------|------|
| L0 项目画像 | 资产分布、命名规律 | 服务器从所有资产统计 |
| L1 推断规则 | 从修正中提炼的规则 | 服务器从修正记录提炼 |
| L2 修正记录 | 原始修正数据 | 本机生成，推送服务器 |
| L3 对话历史 | 个人对话 | 仅本机 |

#### 部署方案

**本地模式**：双击 `Start.bat`，浏览器打开 `localhost:8080`，单人使用。

**中心模式**：公司服务器部署，浏览器打开 `http://中心服务器:8080`，团队使用。

**网络要求**：本地模式无需网络，中心模式需局域网，LLM 需互联网。

---

## 6. 实现路线图

### 里程碑总览

从 TA 效率工具到公司资产基础设施，分四步走：

| 里程碑 | 目标 | 核心交付 | 状态 |
|--------|------|---------|------|
| 1. 本地资产检查 | TA 个人效率 | AI 自动质检（面数/贴图/命名/材质） | ✅ 已完成 |
| 2. 资产自动入库 | 入库流程自动化 | 审核→记录规范名称→UE5 导入→更新 engine_path | ✅ 已完成 |
| 3. 项目级管理平台 | 项目团队资产管理 | 资产数据库 + Web 看板 + 多团队分组 + 插件扩展 + 多会话管理 | 进行中（后端完成，前端待开发） |
| 4. 公司级资产助手 | 公司资产基础设施 | 跨项目复用 + 新项目规划 + 接入 AI 生产工具 | 远期 |

### 当前任务清单

#### 后端任务

| 优先级 | 任务 | 工作量 | 说明 |
|--------|------|--------|------|
| P0 | 用户标识 | 1 天 | WebSocket 连接传用户名/token，按用户隔离会话 |
| P0 | 会话列表完善 | 0.5 天 | 置顶、归档、日期分组、搜索 |
| P1 | 自动审核策略 | 0.5 天 | 高置信度（≥90%）自动通过 |
| P1 | 修正记录收集 | 1 天 | 审核修改后记录到服务器 |
| P2 | 经验聚合 | 2 天 | 收集修正 → 分析模式 → 提炼规则 → 更新画像 |
| P2 | 规范文档同步 | 1 天 | 服务器存储规范，本机启动时拉取 |
| P2 | SVN 双目录集成 | 2 天 | ArtResources + Content 目录结构 |
| P3 | Blender 渲染预览 | 1 天 | 3D 模型自动生成预览图 |

#### 前端任务

| 优先级 | 任务 | 工作量 | 说明 |
|--------|------|--------|------|
| P0 | 会话管理 UI | 2 天 | SessionSelector + Popover + API 集成 |
| P0 | WebSocket sessionId | 0.5 天 | 连接时带 sessionId，切换会话时重连 |
| P0 | 消息导航 | 1 天 | ScrollMinimap 组件 |
| P1 | 上下文分割线 | 1 天 | ContextDivider + Ctrl+K |
| P1 | 项目总览仪表盘 | 1 天 | 资产统计、用户分布 |
| P2 | 入库向导 | 1.5 天 | 分步流程 |
| P3 | 3D 预览 | 1 天 | Blender 渲染预览图 |

#### 核心路径（最小可用版本）

```
后端：用户标识（1天）→ 会话列表完善（0.5天）→ 自动审核（0.5天）
前端：会话 UI（2天）→ WebSocket sessionId（0.5天）→ 消息导航（1天）
= 5.5 天 → 可部署给小团队试用
```

### Phase 1：资产身份系统骨架 — 4 周

**目标**：搭好身份证系统的核心框架，能对一批资产自动生成身份报告。

- [x] 项目配置系统（ProjectConfig 解析器）— `config_tools.py` + `core/project_config.py`
- [x] 资产目录扫描 + 资产自动分组（同名 FBX + 贴图归为一组）— `identity.py` (`analyze_assets`)
- [x] 确定层数据提取（面数、包围盒、贴图规格等）— `mesh.py`, `texture.py`, `mesh_fbx.py`
- [x] 身份证数据结构定义（AssetIdentity Schema）— `tags/schema.py` + `identity.py`
- [x] 身份证完整性校验（required_tags 检查）— `identity.py` (`analyze_assets` 内置)
- [x] 入库分析报告生成（HTML，每个资产一张身份证卡片）— `report.py`（基础汇总版）
- [x] Agent 编排层：接到"检查这个目录"后自动走完 扫描→提取→报告 全流程 — `agent.py` + System Prompt

### Phase 2：AI 分析层 + 记忆系统 + 标签入库 — 4 周

**目标**：Agent 具备视觉分析能力和项目记忆，推断越用越准。

- [x] Blender headless 渲染预览图
- [x] 多模态 LLM 资产分析（分类、材质、风格、状态）
- [x] 置信度机制（高置信度自动通过，低置信度提交审核）
- [x] **项目记忆系统（MemoryProvider 接口 + FileMemoryProvider 实现）**
- [x] **记忆注入推断层（L0 项目画像 + L1 规则按需注入）**
- [x] **用户纠正工作流 + 自动压缩机制**
- [x] 标签数据库（可搜索存储）— SQLite 后端，结构化字段索引，4 万+ 资产毫秒级查询
- [x] 语义化资源检索（按标签组合查找资产）— LLM 查询解析 + 多维度评分引擎，自然语言搜索匹配度 88.9%
- [x] **人工审核工作流（分级审核 + 批量通过 + 修改学习）**
- [x] **动画文件过滤（自动识别并跳过动画资产）**

#### Phase 2 补充：人工审核工作流实现

**置信度机制**：AI 推断时为每个字段返回置信度（0-100%），用于分级审核。

| 置信度 | 处理方式 |
|---|---|
| ≥ 90% | 高置信，建议批量通过 |
| 70-89% | 中置信，批量展示可选通过 |
| < 70% | 低置信，必须逐个审核 |

**审核工具**（`tools/review.py`）：

| 工具 | 功能 |
|---|---|
| `get_pending_reviews` | 获取待审核列表，按置信度分组 |
| `get_review_detail` | 获取单个资产完整审核详情 |
| `submit_review` | 提交审核结果（approve/reject/modify） |
| `batch_approve` | 批量通过高置信度资产 |

**审核工作流**：
```
分析完成 → get_pending_reviews（按置信度分组）
    ↓
┌─────────────────┬─────────────────┐
│  高置信度 ≥90%   │  低置信度 <90%   │
│  batch_approve   │  get_review_detail│
│  批量通过        │  逐个查看         │
└─────────────────┴─────────────────┘
                    ↓
              submit_review
              approve/reject/modify
                    ↓
              自动记录纠正（学习）
```

**动画文件过滤**：自动识别动画资产（AN_ 前缀或有骨骼无面数），跳过 AI 推断和渲染，不进入审核列表。

#### Phase 2 补充：渲染模块定位与验证

**核心认知**：渲染模块的价值在于 **Blender 阶段介入**，而非 UE5 阶段。

```
正确工作流：
  美术在 Blender 制作资产（有完整材质+贴图）
      ↓
  Agent 渲染预览图（有材质，质量高）✅
      ↓
  Agent 检查规范（命名、面数、UV）
      ↓
  Agent 导出 FBX
      ↓
  Agent 配置 UE5 导入参数
      ↓
  资产入库 UE5
```

**为什么在 Blender 阶段渲染**：

| 阶段 | 材质状态 | 渲染效果 |
|---|---|---|
| Blender 中 | 完整材质+贴图 | ✅ 高质量 |
| 导出 FBX | 仅材质槽名称（贴图路径丢失） | ❌ 灰模 |
| UE5 中 | 引擎私有格式，Blender 无法读取 | ❌ 不可用 |

**结论**：渲染模块适用于 Blender 原生工作流，在资产导出前进行预览和质检。

**渲染流程验证（v0.12）**：

| 验证项 | 状态 | 说明 |
|---|---|---|
| Blender headless 渲染 | ✅ 通过 | 命令行调用 Blender 渲染 |
| 多角度渲染 | ✅ 通过 | 正面、侧面、3/4、俯视 |
| 摄影棚灯光 | ✅ 通过 | 三点光（主光+补光+轮廓光） |
| 包围盒自动计算 | ✅ 通过 | 根据模型大小自动调整相机距离 |
| 无材质默认处理 | ✅ 通过 | 自动赋予默认材质 |
| Windows 编码兼容 | ✅ 通过 | UTF-8 + errors='replace' |

**待优化**：

| 项目 | 优先级 | 说明 |
|---|---|---|
| HDRI 环境光 | 中 | 需要用户提供 HDR 文件 |
| 自动查找贴图 | 低 | 依赖项目命名规范，后续按需实现 |
| 渲染质量 | 低 | 当前质量可用于资产识别，后续可提升采样数 |

**渲染预设**：

| 预设 | 用途 | 分辨率 | 采样 | 耗时 |
|---|---|---|---|---|
| `fast` | 快速预览 | 512x512 | 16 | ~30秒 |
| `studio` | 高质量展示 | 1024x1024 | 64 | ~2分钟 |
| `turntable` | 360° 预览 | 512x512 | 32 | ~1分钟 |
| `transparent` | 透明背景 | 1024x1024 | 64 | ~2分钟 |

**独立测试**：
```bash
# 命令行测试
python test_render.py model.fbx --preset fast
python test_render.py model.fbx --preset studio

# 代码调用
from tools.render_studio import RenderStudio
studio = RenderStudio(preset="studio")
result = studio.render("model.fbx", "output/")
```

**与 Phase 5 的关联**：渲染模块是 **Blender Agent 面板** 的基础组件，后续在 Blender 中嵌入 Agent 时，可直接复用此模块。

### Phase 3：入库自动化 + 引擎集成 — 3 周

**目标**：审核通过后自动完成入库全流程。

#### 3.1 架构认知：Agent 与引擎的关系

**核心问题**：Agent 能否在不打开 Blender/UE5 的情况下完成整个入库流程？

**答案**：大部分能，但 UE5 导入和元数据写入需要在 UE5 内部执行。

| 操作 | 能否自动化 | 说明 |
|---|---|---|
| 扫描目录、读取 FBX 信息 | ✅ 能 | 用 Python `fbx` 库，不需要 Blender |
| 读取贴图信息 | ✅ 能 | 用 PIL/Pillow，不需要任何引擎 |
| AI 推断（分类、材质、风格） | ✅ 能 | 调用 LLM API |
| 渲染预览图 | ✅ 能 | `blender --background`（headless 模式） |
| 重命名、移动文件 | ✅ 能 | Python 文件操作 |
| 创建目录结构 | ✅ 能 | Python 文件操作 |
| **配置 UE5 导入参数** | ❌ 不能 | 需要 `unreal` 模块，必须在 UE5 内部运行 |
| **写入 UE5 元数据** | ❌ 不能 | 同上 |
| **执行 UE5 导入** | ❌ 不能 | 同上 |

**根本原因**：UE5 的 Python API（`unreal` 模块）只能在 UE5 Editor 进程内部使用，外部 Python 无法直接调用。

#### 3.2 解决方案：分阶段实现

**阶段 1（MVP）：半自动方案（方案 A）**

Agent 完成 90% 的工作，最后一步由用户在 UE5 中运行一个导入脚本。

```
Agent Backend（完全自动化）：
  ① 从 TagStore 加载已审核通过的资产
  ② 加载 ProjectConfig
  ③ 生成规范名称（基于命名规则）
  ④ 确定目标路径（基于 asset_type → engine_path）
  ⑤ 创建引擎目录结构
  ⑥ 重命名 + 移动文件（含关联贴图）
  ⑦ 生成 import_manifest.json（导入清单）
  ⑧ 生成 import_assets.py（UE5 导入脚本）
     ↓
用户在 UE5 中（一键操作）：
  ⑨ 打开 UE5 Python Console
  ⑩ 运行 import_assets.py
  ⑪ 脚本自动读取清单，执行导入 + 写入元数据
```

**阶段 2（完善）：全自动方案（方案 B）**

在 UE5 中安装轻量级插件，暴露 HTTP API，Agent Backend 通过 HTTP 调用 UE5。

```
Agent Backend  ←→  HTTP  ←→  UE5 插件
    ↓                        ↓
执行分析、文件操作        执行导入、写入元数据
```

#### 3.3 入库工作流编排（tools/intake.py）

**职责**：串联所有入库步骤，从"审核通过"到"文件就位 + 导入清单生成"。

```python
# 接口设计
def intake_asset(
    asset_id: str,           # 资产 ID（从 TagStore 获取）
    target_engine_dir: str,  # UE5 Content 目录
    project_config_name: str = None,  # 项目配置名称
    dry_run: bool = False,   # 试运行模式
) -> dict:
    """
    对单个资产执行入库流程

    返回：
    {
        "success": bool,
        "asset_id": str,
        "steps": [
            {"step": "rename", "status": "success", "detail": "..."},
            {"step": "create_dir", "status": "success", "detail": "..."},
            {"step": "move", "status": "success", "detail": "..."},
        ],
        "final_path": str,
        "message": str,
    }
    """
```

**工作流逻辑**：

```
intake_asset(asset_id, target_engine_dir)
    ↓
① 从 TagStore 加载资产标签（AssetTags）
    ↓
② 确定资产类型
   - 优先使用 AI 推断结果（category.category）
   - 回退到命名前缀判断（SM_ → static_mesh, SK_ → skeletal_mesh）
    ↓
③ 生成规范名称
   - 调用 ProjectConfig.suggest_naming(category, name, variant)
   - 例：sword_01.fbx → SM_Weapon_Sword_01.fbx
    ↓
④ 确定目标路径
   - target_engine_dir + engine_path + 新文件名
   - 例：D:/UE5/MyProject/Content/Game/Weapons/SM_Weapon_Sword_01.fbx
    ↓
⑤ 创建目标目录（如果不存在）
    ↓
⑥ 重命名 + 移动文件
   - 同时移动关联的贴图文件（Diffuse、Normal、Roughness 等）
   - 贴图按 T_{asset_name}_{map_type} 规则重命名
    ↓
⑦ 更新 TagStore 记录
   - 更新 engine_path、review_status="imported"
    ↓
⑧ 返回入库结果
```

**关联资产处理**：

```
原目录：
  sword_01.fbx
  sword_01_D.png  (Diffuse)
  sword_01_N.png  (Normal)
  sword_01_R.png  (Roughness)

入库后：
  /Game/Weapons/SM_Weapon_Sword_01.fbx
  /Game/Weapons/T_Weapon_Sword_01_D.png
  /Game/Weapons/T_Weapon_Sword_01_N.png
  /Game/Weapons/T_Weapon_Sword_01_R.png
```

#### 3.4 批量入库（tools/intake.py）

```python
def intake_batch(
    asset_ids: list[str],    # 资产 ID 列表
    target_engine_dir: str,
    project_config_name: str = None,
    dry_run: bool = False,
) -> dict:
    """
    批量入库，生成汇总结果和导入清单

    返回：
    {
        "total": int,
        "success": int,
        "failed": int,
        "results": [...],
        "manifest_path": str,  # import_manifest.json 路径
        "script_path": str,    # import_assets.py 路径
    }
    """
```

#### 3.5 导入清单生成

Agent 生成两个文件，供 UE5 使用：

**import_manifest.json**（导入配置）：

```json
{
  "target_content_dir": "/Game/Weapons/",
  "generated_at": "2026-05-12T10:00:00",
  "project_config": "my_game",
  "assets": [
    {
      "source_path": "D:/UE5/MyProject/Content/Game/Weapons/SM_Weapon_Sword_01.fbx",
      "asset_type": "static_mesh",
      "category": "weapon",
      "import_preset": {
        "import_scale": 1.0,
        "generate_lod": true,
        "lod_levels": 2,
        "collision": true,
        "material_import": true
      },
      "metadata": {
        "category": "weapon",
        "subcategory": "melee",
        "style": "medieval",
        "materials": ["metal", "leather"],
        "tri_count": 5200,
        "condition": "worn"
      }
    }
  ]
}
```

**import_assets.py**（UE5 导入脚本）：

```python
"""
TA Agent 自动生成的 UE5 导入脚本
在 UE5 Python Console 中运行此脚本即可完成批量导入
"""
import unreal
import json
import os

def import_from_manifest(manifest_path: str):
    """读取清单并执行导入"""
    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    success_count = 0
    fail_count = 0

    for asset_info in manifest['assets']:
        try:
            # 创建导入任务
            task = unreal.AssetImportTask()
            task.set_editor_property('filename', asset_info['source_path'])
            task.set_editor_property('destination_path', manifest['target_content_dir'])
            task.set_editor_property('replace_existing', True)
            task.set_editor_property('automated', True)

            # 配置 FBX 导入参数
            fbx_ui = unreal.FbxImportUI()
            preset = asset_info['import_preset']
            fbx_ui.set_editor_property('import_mesh', True)
            fbx_ui.set_editor_property('import_textures', preset['material_import'])
            fbx_ui.set_editor_property('import_materials', preset['material_import'])

            if asset_info['asset_type'] == 'skeletal_mesh':
                fbx_ui.set_editor_property('import_as_skeletal', True)
                mesh_data = unreal.SkeletalMeshImportData()
            else:
                fbx_ui.set_editor_property('import_as_skeletal', False)
                mesh_data = unreal.StaticMeshImportData()

            mesh_data.set_editor_property('import_scale', preset['import_scale'])
            fbx_ui.set_editor_property('static_mesh_import_data', mesh_data)
            task.set_editor_property('options', fbx_ui)

            # 执行导入
            unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])

            if task.get_editor_property('result'):
                # 写入元数据
                asset_name = os.path.splitext(os.path.basename(asset_info['source_path']))[0]
                asset_path = manifest['target_content_dir'] + '/' + asset_name
                for key, value in asset_info['metadata'].items():
                    unreal.EditorAssetLibrary.set_metadata_tag(
                        asset_path, key, str(value)
                    )
                unreal.EditorAssetLibrary.save_asset(asset_path)
                success_count += 1
                print(f"  ✅ {asset_name}")
            else:
                fail_count += 1
                print(f"  ❌ {asset_name} - 导入失败")

        except Exception as e:
            fail_count += 1
            print(f"  ❌ {asset_info['source_path']} - {str(e)}")

    print(f"\n导入完成: {success_count} 成功, {fail_count} 失败")

# 执行
import_from_manifest(r"manifest_path_placeholder")
```

#### 3.6 引擎元数据写入

写入 UE5 的元数据包含资产的完整身份信息，供后续查询和 AI 消费：

| 字段 | 类型 | 说明 |
|---|---|---|
| asset_type | string | static_mesh / skeletal_mesh / texture |
| category | string | weapon / character / building / ... |
| subcategory | string | melee / humanoid / commercial / ... |
| style | string | medieval / modern / cyberpunk / ... |
| materials | string(JSON) | 主要材质列表 |
| condition | string | new / worn / broken / ... |
| tri_count | string | 三角面数 |
| description | string | AI 生成的描述 |

**写入方式**：使用 `unreal.EditorAssetLibrary.set_metadata_tag()`，数据存储在 `.uasset` 文件内部，不依赖外部数据库。

#### 3.7 入库审计日志

每次入库操作记录到审计日志：

```json
// .ta_agent/intake_log.jsonl
{
  "timestamp": "2026-05-12T10:30:00",
  "asset_id": "abc123",
  "original_name": "sword_01.fbx",
  "final_name": "SM_Weapon_Sword_01.fbx",
  "source_path": "F:/Assets/sword_01.fbx",
  "target_path": "D:/UE5/MyProject/Content/Game/Weapons/SM_Weapon_Sword_01.fbx",
  "category": "weapon",
  "action": "intake",
  "status": "success"
}
```

#### 3.8 Phase 3 实现顺序

| 步骤 | 内容 | 依赖 | 文件 | 状态 |
|---|---|---|---|---|
| 1 | 入库工作流编排 | 无 | tools/intake.py | ✅ 已完成 |
| 2 | 批量入库 + 清单生成 | 步骤 1 | tools/intake.py | ✅ 已完成 |
| 3 | 入库审计日志 | 步骤 1 | tools/intake.py | ✅ 已完成 |
| 4 | UE5 导入脚本生成 | 步骤 2 | tools/intake.py | ✅ 已完成 |
| 5 | UE5 HTTP 插件（方案 B） | 步骤 1-4 | tools/ue5_bridge.py | ❌ 待开发 |

**MVP 完成标准**：步骤 1-4 完成后，用户可以在 Agent 中一键生成导入清单，然后在 UE5 中运行脚本完成批量导入。**MVP 已达成。**

#### 3.9 Phase 3 与 Phase 4 的关系

Phase 3 完成后，Phase 4 的"工作流串联"变为：

```
用户："帮我处理这批资产"
    ↓
Phase 1-2 已有能力：扫描 → 提取 → AI 推断 → 审核
    ↓
Phase 3 新增能力：审核通过 → 自动入库（重命名+移动+生成清单）
    ↓
Phase 4 串联：整个流程一条命令走完
```

Phase 4 的核心任务调整为：
- [x] Workflow Engine：多步骤自动执行编排（✅ 已实现 step_by_step / auto 两种工作流模式，通过 System Prompt 注入驱动 LLM 自动串联阶段）
- [x] 命名规范检查 + 自动建议修正（✅ 已集成到 intake.py 入库流程，生成名称后自动调用 check_naming 校验）
- [x] 入库历史记录和审计日志（✅ Phase 3 已实现，intake_log.jsonl）
- [x] 批量入库支持（✅ Phase 3 已实现，intake_batch + intake_approved）

### Phase 4：工作流串联 + 命名规范 — 3 周

**目标**：Agent 能一次性接到任务，自动走完 质检→分类→配置→入库 全流程。

- [x] Workflow Engine：多步骤自动执行编排（✅ 已实现）
- [x] 命名规范检查 + 自动建议修正（✅ 已集成到入库流程）
- [x] 批量入库支持（一次处理整个目录）（✅ Phase 3 已实现）
- [x] 入库历史记录和审计日志（✅ Phase 3 已实现）

### Phase 5：进阶功能 — 长期

- [ ] **Blender Agent 面板**（优先级最高）
- [ ] 性能诊断模块（UE5 Profiler 数据分析）
- [ ] 规范知识库问答（RAG）
- [ ] 视觉回归测试（截图对比）
- [ ] 多 Agent 并行处理大批量资产
- [ ] 为未来场景生成 Agent 提供标签数据接口

#### Phase 5 重点：Blender Agent 面板

**核心价值**：在资产制作阶段（Blender）就介入，而非等到入库后才检查。

**完整工作流**：
```
美术在 Blender 制作资产（有完整材质+贴图）
      ↓
点击 Agent 面板"检查并入库"
      ↓
Agent 自动执行：
  1. 渲染预览图（有材质，高质量）
  2. 检查命名规范
  3. 检查面数预算
  4. 检查 UV 规范
  5. AI 推断资产分类
      ↓
生成检查报告（问题+建议）
      ↓
美术确认/修复问题
      ↓
Agent 自动执行：
  6. 导出 FBX
  7. 配置 UE5 导入参数
  8. 写入引擎元数据
      ↓
资产入库 UE5
```

**技术依赖**：

| 组件 | 状态 | 说明 |
|---|---|---|
| 渲染模块 | ✅ 已完成 | render_studio.py |
| 规范检查 | ✅ 已完成 | naming.py, mesh.py |
| AI 推断 | ✅ 已完成 | inferrer.py |
| Blender 面板 | ❌ 待开发 | bpy.types.Panel |
| UE5 入库 | ❌ 待开发 | unreal 模块 |

**与现有模块的关系**：
- 渲染模块（render_studio.py）→ 预览图生成
- 规范检查模块（naming.py, mesh.py）→ 质检
- AI 推断模块（inferrer.py）→ 资产分类
- 标签系统（tags/）→ 身份证生成

---

## 7. 工具扩展性架构

### 7.1 设计目标

Agent 的核心工具由团队开发，但项目中往往有大量**项目特有的工具需求**（如自定义材质检查、团队报告、特定引擎操作等）。这些工具应该能由项目人员自行开发并接入 Agent，**无需修改 Agent 核心代码**。

### 7.2 当前架构

工具通过 `tools/registry.py` 集中注册：

```python
# 当前：硬编码注册
TOOLS = [NAMING_SCHEMA, MESH_SCHEMA, ...]           # Schema 列表
TOOL_FUNCTIONS = {"check_naming": check_naming, ...}  # 函数映射

def execute_tool(tool_name, arguments):
    func = TOOL_FUNCTIONS[tool_name]
    return func(**arguments)  # 统一调用接口
```

**关键特性**：`execute_tool` 只认 `TOOL_FUNCTIONS` 字典，不关心函数来源。这意味着只要工具注册到这个字典，无论是核心工具还是外部工具，对 LLM 来说没有区别。

### 7.3 三阶段扩展方案

#### 阶段一：插件目录（近期实现）

在 `tools/plugins/` 目录下放置 `.py` 文件，启动时自动发现并注册。

```
tools/
├── naming.py          ← 核心工具
├── mesh.py            ← 核心工具
├── plugins/           ← 项目人员自定义工具
│   ├── ue5_material_check.py
│   ├── blender_auto_rig.py
│   └── team_report.py
```

**插件格式**：

```python
# tools/plugins/ue5_material_check.py

SCHEMA = {
    "type": "function",
    "function": {
        "name": "check_ue5_material",
        "description": "检查 UE5 材质实例参数是否符合规范",
        "parameters": {
            "type": "object",
            "properties": {
                "material_path": {"type": "string", "description": "材质路径"}
            },
            "required": ["material_path"]
        }
    }
}

def check_ue5_material(material_path: str) -> dict:
    """项目人员自己写的检查逻辑"""
    return {"valid": True, "issues": []}
```

**registry.py 改动**：启动时扫描 `tools/plugins/` 目录，自动 import 并注册到 `TOOLS` 和 `TOOL_FUNCTIONS`。

**约束**：
- 插件文件必须导出 `SCHEMA`（dict）和与 Schema 中 `name` 同名的函数
- 插件之间工具名不能冲突
- 插件与核心工具同等对待，无"二等公民"

#### 插件库与 CLI 管理

随项目附带一批"官方插件"，放在 `tools/plugins_available/` 目录，用户通过 CLI 命令选择性启用：

```
tools/
├── plugins/              ← 启用的插件（自动加载）
├── plugins_available/    ← 可用插件库（不自动加载）
│   ├── svn_tools.py
│   ├── plastic_tools.py
│   └── ue5_material_check.py
```

CLI 命令：
- `/plugins` — 查看已启用和可安装的插件
- `/install <name>` — 从 plugins_available 复制到 plugins，重启生效
- `/uninstall <name>` — 从 plugins 删除，重启生效

#### 阶段二：HTTP 远程工具（接引擎时）

当需要对接 UE5/Unity 等引擎时，引擎侧运行 HTTP Server，Agent 通过 HTTP Client 调用。

```
Agent ←→ HTTP ←→ UE5 Editor（Python HTTP Server）
Agent ←→ HTTP ←→ Unity Editor（C# HTTP Server）
```

**实现方式**：在 `TOOL_FUNCTIONS` 中注册 HTTP 适配器包装的函数：

```python
def http_tool(url: str, schema: dict):
    """将 HTTP 接口包装为 Agent 工具"""
    def wrapper(**kwargs):
        import requests
        return requests.post(url, json=kwargs).json()
    wrapper.__name__ = schema["function"]["name"]
    return wrapper, schema

# 注册
TOOLS.append(IMPORT_ASSET_SCHEMA)
TOOL_FUNCTIONS["import_asset"] = http_tool("http://localhost:8000/import_asset", IMPORT_ASSET_SCHEMA)
```

**适用场景**：UE5 材质检查、蓝图生成、Unity 资产导入等引擎内操作。

#### 阶段三：MCP 协议接入（平台化时）

MCP（Model Context Protocol）是 Anthropic 定义的 AI 工具调用开放标准。当需要对接多个引擎、多个 DCC、或接入第三方工具生态时引入。

```
Agent ←→ MCP Client ←→ MCP Server（UE5 工具）
Agent ←→ MCP Client ←→ MCP Server（Maya 工具）
Agent ←→ MCP Client ←→ MCP Server（自研引擎工具）
```

**MCP 与 HTTP 的区别**：

| | HTTP | MCP |
|---|---|---|
| 本质 | 通用网络通信协议 | AI Agent 工具调用专用协议 |
| 工具发现 | 无，需手动注册 | 内置 `list_tools`，自动发现 |
| 参数描述 | 可选（Swagger/OpenAPI） | 强制 JSON Schema |
| 适用场景 | 简单远程调用 | 多引擎/多工具生态统一接入 |

**协议由 Anthropic 定义并开源**（Python/TypeScript SDK），Server 由工具提供方自行编写，暴露具体业务逻辑。

**实现方式**：

```python
def mcp_tool(server_name: str, tool_name: str):
    """将 MCP Server 上的工具包装为 Agent 工具"""
    def wrapper(**kwargs):
        return mcp_client.call_tool(server_name, tool_name, kwargs)
    wrapper.__name__ = tool_name
    return wrapper
```

### 7.4 三层共存架构

三种接入方式最终注册到同一个 `TOOL_FUNCTIONS` 字典，`execute_tool` 无需修改：

```python
TOOL_FUNCTIONS = {
    # 核心工具：进程内 Python 调用（最快）
    "check_naming":       check_naming,
    "analyze_assets":     analyze_assets,

    # HTTP 远程工具：调引擎服务
    "ue5_import_asset":   http_tool("http://ue5:8000/import_asset", ...),

    # MCP 工具：调 MCP Server
    "check_material":     mcp_tool("ue5-server", "check_material"),
}
```

```
┌─────────────────────────────────────────┐
│           Agent（LLM + 工具调度）         │
│         统一的 TOOL_FUNCTIONS            │
│              ▲    ▲    ▲                │
├──────────────┼────┼────┼────────────────┤
│   进程内调用  │  HTTP │  MCP │           │
│   (Python)   │ Client│ Client│           │
│  核心工具     │  远程工具 │ AI工具生态 │     │
│  最快         │  最通用   │ 最标准    │     │
└──────────────┴────┴────┴────────────────┘
```

### 7.5 与引擎对接的具体方案

| 引擎 | 对接方式 | 说明 |
|------|---------|------|
| UE5 | 进程内 Python / HTTP / MCP | UE5 有原生 Python 支持（unreal 模块），可直接调用或起 HTTP Server |
| Unity | HTTP / MCP | Unity 用 C#，需在 Editor 内起 HTTP Server 或 MCP Server |
| 自研引擎 | HTTP / MCP / 命令行 | 取决于引擎暴露的接口类型 |
| Blender | 进程内 Python / HTTP | Blender 有原生 Python 支持（bpy 模块） |
| Maya | HTTP / MCP | Maya 有 Python 支持（maya.cmds），但通常独立进程运行 |

### 7.6 实现路线

| 阶段 | 内容 | 时机 | 改动范围 |
|------|------|------|---------|
| 1 | 插件目录 + 自动发现 | **现在** | 改 registry.py，加扫描逻辑 |
| 2 | HTTP Client 适配器 | 接引擎时 | 加 http_tool 包装函数 |
| 3 | MCP Client 集成 | 多引擎/平台化时 | 加 MCP SDK 依赖 + mcp_tool 包装函数 |

**核心原则**：`execute_tool` 不变，只扩展接入层。核心工具和外部工具对 LLM 无区别。

### 7.7 可靠性机制

#### 断点续传

分析大量资产时，如果中途断开（窗口关闭、电脑死机），所有进度会丢失。为此在 `analyzer.py` 中实现了 checkpoint 机制：

- 每完成一个阶段（扫描→贴图→FBX→AI 推断），将中间结果存入 `.ta_agent/checkpoints/` 目录
- 再次运行时自动检测 checkpoint，提示用户"发现上次中断的分析，自动继续"
- 分析完成后自动清除 checkpoint
- Checkpoint 24 小时后自动过期

#### AI 推断阈值确认

当启用 AI 推断且资产数较多时，先只跑基础分析（几何/贴图/命名），汇报结果后再询问用户是否继续 AI 推断：

- 阈值默认 50 个资产（`ai_inference_threshold` 参数）
- 超过阈值：返回 `need_inference_confirm: true`，等用户确认后调用 `run_ai_inference`
- 未超过阈值：自动完成推断，无需确认

#### 自定义规则持久化

用户通过对话告诉 Agent 的规则（如"@前缀是动画文件"）会持久化到项目配置文件：

- `ProjectConfig` 新增 `custom_rules` 字段
- `add_custom_rule` 工具：将规则写入 project.yaml
- `analyzer._detect_asset_type` 优先匹配自定义规则
- 规则重启不丢失，项目间隔离

#### API 调用重试

LLM API 可能因超时、限流、服务过载而失败。在 `agent_loop` 中实现自动重试：

- 最多重试 3 次
- 等待时间：10s → 20s → 30s（指数退避）
- 可重试错误：504、502、503、timeout、overloaded、429
- 不可恢复错误（如 API Key 无效）直接报错

#### 动画文件识别

支持多种动画文件识别方式：
- 命名前缀 `AN_` → 动画
- 文件名以 `@` 开头 → 动画（常见于 Unity/UE 动画命名规范）
- FBX 有骨架但无网格 → 纯动画文件
- 自定义规则匹配 → 按项目配置

#### AI 推断过滤

AI 推断前自动过滤不适合分析的资产：
- 动画文件（asset_type == "animation"）
- 面数为 0 的 FBX（解析失败或空文件）
- 纯贴图资产（无 FBX 的独立贴图）

过滤结果会打印跳过原因和数量，如：`跳过 45 个资产（38 个动画，7 个无网格）`

#### 对话历史智能压缩

长时间对话会导致请求体超过 API 限制（413 错误）。实现智能压缩机制：

- 前 2 条消息保留（初始上下文）
- 最近 12 条消息完整保留（近期对话连贯）
- 中间部分只保留 user 消息和 assistant 的最终回复（关键决策），丢弃工具调用的中间过程
- 压缩后仍超过 30 条，则只保留首尾

---

## 8. 竞品分析

### 7.1 通用 Coding Agent

| 工具 | 优势 | 局限 |
|---|---|---|
| Claude Code | 强大的代码理解和生成 | 不理解游戏资产管线 |
| Cursor | IDE 集成好 | 无法操作 DCC 和引擎 |
| Codex | 代码补全快 | 无法理解项目规范 |

**我们的差异化**：这些工具是通用编程助手，而我们是**游戏 TA 领域专家**。它们能写代码，但不能判断"这个模型的拓扑结构是否适合做骨骼动画"。

### 7.2 游戏 AI 工具

| 工具 | 优势 | 局限 |
|---|---|---|
| NVIDIA ACE | LLM 驱动的游戏 NPC | 面向游戏内 AI，不是开发工具 |
| Inworld AI | 游戏角色对话 | 同上 |
| Unity Muse | Unity 官方 AI 功能 | 偏通用，不够深入 TA 流程，且项目已迁移至 UE5 |

**我们的差异化**：我们专注于**开发流程中的 TA 工作**，而非游戏内 AI。

### 7.3 资产管理工具

| 工具 | 优势 | 局限 |
|---|---|---|
| ShotGrid | 资产管理成熟 | 没有 AI 能力，不检查质量 |
| Perforce | 版本管理 | 不理解资产内容 |

**我们的差异化**：传统工具管理"文件"，我们管理"资产质量"。

### 8.4 通用技能平台 vs 垂直领域 Agent

当前市面上的 Agent 平台（Coze、AgentGPT、Manus 等）主打"技能市场"模式，用户可以给 Agent 装各种插件覆盖通用场景。

| 维度 | 技能型 Agent（通用平台） | 本平台（垂直领域） |
|------|----------------------|----------------|
| 覆盖范围 | 广泛，多行业多场景 | 窄而深，只做游戏美术资产 |
| 核心价值 | 技能数量多 | 领域知识深 |
| 工具来源 | 用户自己装插件 | 内置 30 个领域专用工具 |
| 记忆能力 | 通用键值对存储 | 针对资产特征的三层记忆架构 |
| 数据资产 | 无 | 结构化资产数据库，越用越有价值 |

**行业趋势**：2025 年行业报告指出，"99% 的通用 Agent 产品在泛用方向上很快会死亡"，而垂直领域 Agent 因为有深度领域知识和工作流整合能力，B 端落地更成熟。

**我们的壁垒**：领域 Know-How（理解 FBX 结构、贴图通道、面数预算）+ 数据积累（结构化资产数据库）+ 记忆系统（针对资产特征的精准匹配）。

### 8.5 技术参考：GenericAgent

平台的记忆和学习机制参考了 A3 Lab（深圳 Aquaintelling + 复旦大学）的 GenericAgent 项目（arXiv:2604.17091）。

**核心数据**（Lifelong AgentBench 基准测试）：

| 指标 | 数据 |
|------|------|
| 任务完成率 | 100% |
| Token 消耗 vs Claude Code | 仅 27.7% |
| 重复任务 9 轮后 Token 下降 | 89.6% |

**借鉴的核心思想**：
- **技能结晶**：完成任务后自动将执行路径固化为可复用技能
- **No Execution, No Memory**：只有经过验证的结果才写入记忆
- **分层记忆 + 按需加载**：深层记忆不全量加载，按相关性检索后注入上下文

---

## 8. 风险与挑战

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| LLM 幻觉导致误判 | 质检结果不准确 | 设置置信度阈值，低置信度项标记为"需人工确认" |
| Unity/Blender API 变更 | 工具失效 | 抽象工具层，隔离引擎版本差异 |
| 项目规范复杂度高 | Agent 理解不全 | RAG + 分层规范（通用规范 + 项目规范） |
| 美术接受度低 | 推广困难 | 从"辅助"而非"替代"切入，先做报告再做自动修复 |
| 性能开销 | 扫描大项目慢 | 增量扫描、缓存机制、异步处理 |

---

## 9. 成功指标

| 指标 | 目标 | 衡量方式 |
|---|---|---|
| 质检时间减少 | 从 2 小时 → 10 分钟 | 对比人工检查时间 |
| 规范问题发现率 | 提升 50% | 对比人工检查发现的问题数 |
| 美术返工率 | 降低 30% | 统计资产返工次数 |
| TA 工具使用频率 | 每日使用 | 日志统计 |
| 知识库查询准确率 | > 90% | 抽样评估 |

---

## 10. 附录

### 10.1 名词解释

| 术语 | 解释 |
|---|---|
| TA | Technical Artist，技术美术 |
| DCC | Digital Content Creation，数字内容创作工具（Maya、Blender、Houdini 等） |
| Agent | 具备自主感知、决策和执行能力的 AI 智能体 |
| RAG | Retrieval-Augmented Generation，检索增强生成 |
| MCP | Model Context Protocol，Anthropic 推出的模型上下文协议 |
| A2A | Agent-to-Agent，Google 推出的智能体间通信协议 |
| LOD | Level of Detail，细节层次 |
| PCG | Procedural Content Generation，程序化内容生成 |

### 10.2 参考资料

- [智源研究院 2026 十大 AI 技术趋势](http://k.sina.com.cn/article_7857201856_1d45362c0019057gsk.html)
- [Claude Agent SDK 文档](https://docs.anthropic.com)
- [DeepSeek API 文档](https://platform.deepseek.com/api-docs)
- [智谱 GLM API 文档](https://open.bigmodel.cn/dev/api)
- [UE5 Python 脚本文档](https://docs.unrealengine.com/5.0/en-US/scripting-the-unreal-editor-using-python/)
- [Blender Python API 文档](https://docs.blender.org/api/current/)
- [UE5 Editor Utility Widget](https://docs.unrealengine.com/5.0/en-US/editor-utility-widgets-in-unreal-engine/)
- [2026年 AI Agent 企业级应用落地路径](https://blog.csdn.net/yiyao_agent/article/details/159797647)
- [2026年最新 AI Agent 框架全面解析](https://download.csdn.net/blog/column/12343638/159691011)
- [GenericAgent 开源框架](https://github.com/GenericAgent) — 记忆体设计参考（四层记忆、存在性编码、无纠正不记忆）
- [Mem0 开源记忆框架](https://github.com/mem0ai/mem0) — 检索策略参考（语义+关键词混合检索）

### 10.3 变更记录

| 版本 | 日期 | 变更内容 |
|---|---|---|
| v0.1 | 2026-05-10 | 初始版本，包含概念设计、功能模块、技术架构、路线图 |
| v0.2 | 2026-05-10 | 重大更新：1) 引擎从 Unity 迁移至 UE5；2) 新增资产智能识别分类模块（核心差异化功能）；3) 架构调整为单 Agent + 多工具；4) 更新技术选型和集成方案；5) 调整路线图优先级 |
| v0.3 | 2026-05-10 | LLM 选型更新：从 Claude API 改为 GLM-5 / DeepSeek-V4-pro（OpenAI 兼容格式）；新增 LLM 选型说明和切换策略 |
| v0.4 | 2026-05-10 | 重大重设计：模块一从"资产智能识别分类"升级为"资产身份系统"（Asset Identity System）；新增完整的 AssetIdentity 标签结构（7 大维度）；新增 ProjectConfig 项目配置层实现通用化；新增标签数据三层来源模型（确定/推断/人工）；新增标签语义检索和远期 AI 场景生成数据接口设计；重写工作流为 9 步完整流程；路线图重新规划，资产身份系统作为 Phase 1 核心 |
| v0.5 | 2026-05-10 | 新增模块七：项目记忆系统（Project Memory System）；设计三层记忆结构（L0 项目画像 / L1 纠正规则 / L2 归档）；参考 GenericAgent 的"无纠正不记忆"原则和存在性编码、Mem0 的按需检索策略；设计 MemoryProvider 抽象接口实现低耦合；设计自动压缩机制（规则合并、置信度淘汰、画像提炼）；路线图调整，记忆系统纳入 Phase 2 |
| v0.6 | 2026-05-10 | 新增 Blender headless 渲染模块：blender_asset_renderer.py（多角度渲染：正面/侧面/俯视/3/4）；新增 tools/renderer.py 工具模块；集成到 analyzer.py 分析流程（render_previews 参数）；渲染图片路径存入 MetaInfo.preview_images；路线图更新 |
| v0.7 | 2026-05-10 | 多模态 LLM 资产分析：新增 tools/vision.py 视觉分析模块（base64 编码、多模态消息构建）；tags/inferrer.py 支持多模态输入（图片+文本联合推断）；新增 VISION_PROMPT 视觉分析专用提示词；config.py 新增 USE_VISION 开关和 VISION_CONFIG 视觉模型独立配置；渲染图清理机制（.gitignore、clean_previews、clean_orphan_previews）；路线图更新 |
| v0.8 | 2026-05-11 | 语义化资源检索实现：新增 tags/search.py（QueryParser + SearchEngine + 多维度评分引擎）；支持自然语言查询（LLM 解析）和结构化查询；SQLite 标签数据库后端迁移（tags/store.py）；测试验证自然语言搜索匹配度 88.9%；设计文档更新 4.1.6.1 节；路线图 Phase 2 语义化检索标记完成 |
| v0.9 | 2026-05-11 | 修复数据库路径不一致问题：analyzer.py 默认路径从临时目录（tempfile）统一为项目目录（tag_store/）；消除 analyzer.py 与 tools/identity.py 的路径分歧，确保所有分析结果存储到同一数据库 |
| v0.10 | 2026-05-11 | 批量分析进度反馈：analyze_directory() 新增 on_progress 回调，贴图分析/资产分析/AI 推断三阶段实时打印进度；接通 infer_batch() 已有的 on_progress 回调（之前未接线）；tools/identity.py 自动打印进度到控制台 |
| v0.11 | 2026-05-11 | Phase 2 收尾：1) 人工审核工作流实现（tools/review.py + review_schema.py）：get_pending_reviews 分级审核、get_review_detail 详情查看、submit_review 审核提交、batch_approve 批量通过；2) Schema 扩展：MaterialStructure/VisualAttributes 新增置信度字段；3) 动画文件过滤：自动识别动画资产并跳过 AI 推断和渲染，不进入审核列表；4) Agent System Prompt 优化：明确审核流程独立于分析流程，避免审核后重复分析 |
| v0.12 | 2026-05-11 | 新增独立高质量渲染模块（tools/render_studio.py）：支持 HDRI 环境光、摄影棚三点光、多角度渲染、PBR 材质、可配置分辨率和采样；预设配置：studio/turntable/fast/transparent；支持命令行独立测试和代码调用两种方式；渲染流程验证完成（Windows 编码兼容、无材质默认处理、包围盒自动计算）；设计文档更新：明确渲染模块定位（Blender 阶段介入），补充 Phase 5 Blender Agent 面板工作流设计 |
| v0.13 | 2026-05-12 | Phase 3 详细设计：1) 明确 Agent 与引擎的关系——Agent 运行在 Blender/UE5 外部，UE5 导入/元数据写入需要在 UE5 内部执行；2) 设计两阶段实现方案：方案 A（MVP，半自动，Agent 生成导入清单+脚本，用户在 UE5 中一键运行）、方案 B（全自动，UE5 HTTP 插件）；3) 设计入库工作流编排（tools/intake.py）：审核通过→重命名→创建目录→移动文件→生成清单；4) 设计导入清单格式（import_manifest.json + import_assets.py）；5) 设计引擎元数据写入方案（unreal.EditorAssetLibrary.set_metadata_tag）；6) 设计入库审计日志；7) 调整 Phase 3/4 边界，批量入库和审计日志纳入 Phase 3 |
| v0.14 | 2026-05-12 | 工作流模式实现：1) 新增 step_by_step（逐步模式）和 auto（自动模式）两种工作流模式；2) System Prompt 动态注入模式指令，驱动 LLM 按模式行为执行；3) agent_loop 新增 workflow_mode 参数；4) CLI 新增 /mode 和 /status 命令支持运行时切换；5) 设计文档新增 4.1.5.1 工作流模式章节；6) Phase 4 Workflow Engine 标记为已完成 |
| v0.15 | 2026-05-12 | 1) 命名规范集成到入库流程：intake.py 生成名称后自动调用 check_naming 校验，不合规时记录 warning；2) intake.py 补全缺失前缀（BP_/S_/FX_）；3) 修复审计日志 original_name bug（之前错误存储新名称）；4) 设计文档 Phase 1/3/4 checkbox 全面更新，Phase 4 全部标记完成；5) Phase 3 实现步骤表增加状态列，MVP 标记为已达成 |
| v0.16 | 2026-05-12 | 1) 新增第 7 章"工具扩展性架构"：设计三阶段扩展方案（插件目录→HTTP 远程工具→MCP 协议）；2) 定义插件格式规范（SCHEMA + 同名函数）；3) 设计三层共存架构（进程内/HTTP/MCP 统一注册到 TOOL_FUNCTIONS）；4) 明确各引擎对接方案（UE5 原生 Python、Unity HTTP、自研引擎 MCP）；5) 新增 v0.16 changelog |
| v0.17 | 2026-05-12 | 1) 1.2 节扩展为公司级视角：新增"规范落地不一致"、"资产无法复用"、"新项目规划靠猜"等公司级痛点；2) 路线图新增里程碑总览（4 步：本地检查→自动入库→项目管理→公司助手）；3) 竞品分析新增"通用技能平台 vs 垂直领域 Agent"对比；4) 竞品分析新增 GenericAgent 引用（arXiv:2604.17091）及量化数据；5) v0.17 changelog |
| v0.18 | 2026-05-13 | 1) 新增 7.7 可靠性机制：断点续传（checkpoint 存盘+自动恢复）、AI 推断阈值确认（资产数>50 时先汇报基础结果再确认）、自定义规则持久化（custom_rules 写入 project.yaml）、API 调用重试（3 次指数退避）；2) 插件库机制：tools/plugins_available/ + /install /uninstall /plugins CLI 命令；3) 动画文件识别扩展：支持 @ 前缀；4) CLI 多行输入改用 prompt_toolkit；5) CLI 输出改用 rich markdown 渲染；6) v0.18 changelog |
| v0.19 | 2026-05-14 | 1) UE5 集成实现：文件通信方案（commands.jsonl/results.jsonl），避免 UE5 线程安全问题；ue5_server/server.py（UE5 侧命令轮询）+ tools/ue5_bridge.py（Agent 侧桥接工具）；2) 5.3 通信架构更新：从 HTTP 方案改为文件轮询方案；3) 5.4 UE5 集成方案重写：实际实现架构、启动方式、支持的操作列表；4) System Prompt 新增工具失败自修复规则（插件可直接改，核心工具需确认）；5) Ctrl+C 打断功能：Agent 执行中可中断回到输入状态；6) 入库结果截断：intake_batch 只返回前 10 个详情避免上下文过大；7) v0.19 changelog |
| v0.20 | 2026-05-14 | 1) 入库流程重构：不再移动源文件，只记录规范名称和目标引擎路径，源文件保留在原始位置；UE5 导入直接从源路径导入，成功后更新 engine_path 和状态为 imported；2) MetaInfo 新增字段：target_engine_dir、target_engine_path；状态新增 imported；3) AI 推断过滤增强：除动画外，新增面数为 0 的 FBX 过滤（解析失败的文件不参与推断）；4) 对话历史智能压缩：超过 20 条时保留首尾+关键决策，丢弃工具调用中间过程；5) UE5 Server 修复：用 does_asset_exist 替代读取 AssetImportTask.Result（UE5.7 兼容）；队列架构+Slate Tick 主线程回调；6) 413 错误防护：历史截断避免请求体过大；7) v0.20 changelog |
| v0.21 | 2026-05-15 | 1) 多会话管理系统：新增 session_manager.py（JSONL append-only + JSON 索引），支持创建/切换/删除/搜索会话，草稿机制、置顶、自动归档；2) CLI 会话集成：agent.py 新增 /sessions /new /switch /delete /clear 命令，启动时自动恢复最近会话历史；3) 上下文分割机制：agent_loop 新增 context_cutoff 参数，/clear 清空上下文但保留历史，与 server.py 的 clearContext 事件对齐；4) Server 会话 API：新增 8 个 REST 端点（/api/sessions/*），WebSocket 支持 sessionId 参数恢复会话；5) 分析进度面板：新增 rich.progress 多阶段进度条，通过模块级回调注入 identity.py；6) FBX 路径 bug 修复：analyzer.py 改用 file["path"] 替代 dir_path+filename，修复子目录文件找不到的问题；7) 工具结果截断：新增 _truncate_tool_result()，超过 2000 字符自动截断避免上下文溢出；8) 输入过长自动恢复：API 返回 input length 错误时自动压缩历史重试；9) 最大迭代次数 10→15；10) System Prompt 优化：禁止 analyze_assets 前调用 scan_directory；11) 多用户架构设计文档整理：MULTI_USER_ARCHITECTURE.md 从 1820 行精简到 491 行，新增任务规划、前后端模块拆分、前端会话 UI 实现规格；12) v0.21 changelog |
