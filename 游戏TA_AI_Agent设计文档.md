# 游戏技术美术 AI Agent 设计文档

> 版本：v0.13 | 创建日期：2026-05-10 | 更新日期：2026-05-12
> 作者：技术美术团队
> 状态：概念设计阶段

---

## 1. 项目背景

### 1.1 行业现状

2026年 AI Agent 正在从"聊天工具"变成"自主行动的数字员工"。当前行业主流应用集中在两个方向：

- **生图类**：Stable Diffusion、Midjourney 生成美术资产
- **编程类**：Claude Code、Codex 辅助代码编写

但在**游戏技术美术（TA）**领域，Agent 化的程度极低，存在大量未被覆盖的价值空间。

### 1.2 为什么 TA 需要 Agent

TA 的核心工作是**管线（Pipeline）管理和质量把控**：

- 每天检查美术提交的资产是否合规
- 维护和优化资产导入流程
- 编写和维护 DCC 工具、引擎内工具
- 性能分析与优化
- 技术规范的制定与执行

这些工作**模式固定但数据量大、规则复杂且需要语义级判断**，非常适合 Agent 化。

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
    engine_path: string         # 实际入库路径
    tags: [string]              # 自由标签（供搜索用）
    reviewer: string            # 入库审核人
    review_status: string       # pending / approved / rejected
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

### 5.3 通信架构

```
UE5 Editor  ←→ HTTP Server ←→ Agent Backend
Blender     ←→ HTTP Server ←→ Agent Backend
Web Console ←→ HTTP Server ←→ Agent Backend
```

Agent Backend 可以是：
- 本地 Python 服务（开发阶段）
- 云服务（生产阶段，支持团队共享）

**关键优势**：UE5 的 Python（unreal 模块）和 Blender 的 Python 统一后，Agent 的工具层可以用同一种语言实现，大大简化开发和维护。

### 5.4 UE5 集成方案

```python
# UE5 Editor 中的 Agent 面板（Editor Utility Widget + Python）
import unreal

class TAAgentWidget:
    """UE5 Editor Utility Widget，通过 Python 与 Agent 通信"""

    def send_message(self, message: str):
        """通过 HTTP 发送到 Agent Backend"""
        import requests
        response = requests.post("http://localhost:8000/chat", json={
            "message": message,
            "context": self.get_ue5_context()
        })
        result = response.json()
        # 解析并执行工具调用
        if result.get("tool_calls"):
            for call in result["tool_calls"]:
                self.execute_tool(call)
        return result

    def get_ue5_context(self):
        """收集 UE5 当前上下文（选中的资产、打开的关卡等）"""
        selected = unreal.EditorUtilityLibrary.get_selected_assets()
        return {
            "selected_assets": [a.get_name() for a in selected],
            "current_level": unreal.EditorLevelLibrary.get_editor_level(),
        }

    def execute_tool(self, tool_call):
        """执行 Agent 返回的工具调用"""
        tool_name = tool_call["name"]
        args = tool_call["arguments"]
        if tool_name == "set_import_settings":
            self.set_import_settings(**args)
        elif tool_name == "create_blueprint":
            self.create_blueprint(**args)
        # ... 更多工具
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

---

## 6. 实现路线图

### Phase 1：资产身份系统骨架 — 4 周

**目标**：搭好身份证系统的核心框架，能对一批资产自动生成身份报告。

- [ ] 项目配置系统（ProjectConfig 解析器）
- [ ] 资产目录扫描 + 资产自动分组（同名 FBX + 贴图归为一组）
- [ ] 确定层数据提取（面数、包围盒、贴图规格等）
- [ ] 身份证数据结构定义（AssetIdentity Schema）
- [ ] 身份证完整性校验（required_tags 检查）
- [ ] 入库分析报告生成（HTML，每个资产一张身份证卡片）
- [ ] Agent 编排层：接到"检查这个目录"后自动走完 扫描→提取→报告 全流程

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

| 步骤 | 内容 | 依赖 | 文件 |
|---|---|---|---|
| 1 | 入库工作流编排 | 无 | tools/intake.py |
| 2 | 批量入库 + 清单生成 | 步骤 1 | tools/intake.py |
| 3 | 入库审计日志 | 步骤 1 | tools/intake.py |
| 4 | UE5 导入脚本生成 | 步骤 2 | tools/intake.py |
| 5 | UE5 HTTP 插件（方案 B） | 步骤 1-4 | tools/ue5_bridge.py |

**MVP 完成标准**：步骤 1-4 完成后，用户可以在 Agent 中一键生成导入清单，然后在 UE5 中运行脚本完成批量导入。

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
- [ ] Workflow Engine：多步骤自动执行编排（扫描→分析→审核→入库）
- [ ] 命名规范检查 + 自动建议修正（集成到入库流程）
- [ ] 入库历史记录和审计日志（Phase 3 已包含）
- [ ] 批量入库支持（Phase 3 已包含）

### Phase 4：工作流串联 + 命名规范 — 3 周

**目标**：Agent 能一次性接到任务，自动走完 质检→分类→配置→入库 全流程。

- [ ] Workflow Engine：多步骤自动执行编排
- [ ] 命名规范检查 + 自动建议修正
- [ ] 批量入库支持（一次处理整个目录）
- [ ] 入库历史记录和审计日志

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

## 7. 竞品分析

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
