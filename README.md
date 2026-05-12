# TA Agent - 游戏技术美术 AI Agent

> 专为游戏技术美术（TA）工作流设计的 AI 智能体

TA Agent 是一个理解游戏资产管线、能执行质量检查、能操作工具链的 AI Agent。它不是"又一个生图工具"，也不是"又一个编程助手"，而是**专为 TA 工作流设计的智能体**。

## 核心功能

### 资产身份系统

每个资产入库时，Agent 自动生成一张结构化的"身份证"，覆盖从物理属性到视觉特征的全部信息：

```
AssetIdentity:
  basic:      文件名、类型、大小、入库时间
  geometry:   面数、顶点数、包围盒、骨骼、UV
  texture:    分辨率、格式、通道、色彩空间
  category:   分类（建筑/角色/武器/载具...）
  material:   材质结构（主要/次要材质）
  visual:     风格、色调、状态、描述
  spatial:    关联资产、所属关系
```

### 三层数据来源

| 层级 | 来源 | 示例 | 准确度 |
|---|---|---|---|
| **确定层** | 工具直接提取 | 面数、包围盒、贴图分辨率 | 100% |
| **推断层** | AI 分析 | 材质类型、风格、状态 | 70-95% |
| **人工层** | 责任人填写 | 项目特有标签、审核确认 | 100% |

### 语义化资源检索

支持自然语言搜索资产：

```
用户："我需要一个现代都市风格的商业建筑，有玻璃幕墙"
Agent → 返回匹配资产列表（含匹配度百分比）
```

### 项目记忆系统

三层记忆结构，Agent 越用越准：

- **L0 项目画像**：项目风格、命名约定、目录结构
- **L1 纠正规则**：用户纠正后的精简推断规则
- **L2 归档**：原始纠正记录

## 项目结构

```
ta_agent/
├── agent.py              # Agent 主循环
├── analyzer.py           # 分析编排器（扫描→提取→推断→存储→报告）
├── config.py             # 配置管理
├── core/
│   └── project_config.py # 项目配置系统（命名规则、资产类型、导入预设）
├── tags/
│   ├── schema.py         # 资产标签数据结构
│   ├── extractor.py      # 标签提取器
│   ├── store.py          # SQLite 标签存储
│   ├── inferrer.py       # AI 推断层
│   └── search.py         # 语义化检索引擎
├── tools/
│   ├── registry.py       # 工具注册中心
│   ├── naming.py         # 命名规范检查
│   ├── mesh.py           # 模型面数检查
│   ├── mesh_fbx.py       # FBX 信息读取
│   ├── texture.py        # 贴图规格检查
│   ├── identity.py       # 资产身份分析
│   ├── review.py         # 人工审核工作流
│   ├── intake.py         # 入库工作流（Phase 3）
│   ├── renderer.py       # 渲染预览图
│   ├── render_studio.py  # 高质量渲染模块
│   ├── vision.py         # 多模态视觉分析
│   ├── memory/           # 记忆系统
│   ├── asset_operations.py # 文件操作（重命名、移动）
│   └── config_tools.py   # 项目配置工具
├── conventions/          # 规范发现与加载
├── tests/                # 测试
└── 游戏TA_AI_Agent设计文档.md
```

## 技术栈

| 组件 | 选型 |
|---|---|
| LLM | GLM-5 / DeepSeek-V4-pro（OpenAI 兼容格式） |
| Agent 架构 | 单 Agent + 多工具（原生 Function Calling） |
| 标签数据库 | SQLite（4 万+ 资产毫秒级检索） |
| 渲染 | Blender headless（Python API） |
| 引擎集成 | UE5 Python（unreal 模块） |

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 创建项目配置

```python
from core.project_config import create_example_config
config_path = create_example_config("my_game", engine="UE5")
```

### 3. 分析资产目录

```python
from analyzer import AssetIdentityAnalyzer

analyzer = AssetIdentityAnalyzer()
result = analyzer.analyze_directory(
    "F:/Assets/NewBatch",
    enable_ai_inference=True,   # 启用 AI 推断
    render_previews=True,       # 渲染预览图（需要 Blender）
)

print(f"分析了 {result['total_assets']} 个资产")
print(result['report_markdown'])
```

### 4. 审核资产

```python
from tools.review import get_pending_reviews, batch_approve

# 获取待审核列表
reviews = get_pending_reviews(store_dir)
print(reviews['summary'])

# 批量通过高置信度资产
high_conf_ids = [a['asset_id'] for a in reviews['high_confidence']]
batch_approve(high_conf_ids, store_dir)
```

### 5. 入库

```python
from tools.intake import intake_approved

# 一键入库所有已审核通过的资产
result = intake_approved(
    target_engine_dir="D:/UE5/MyProject/Content",
)
print(result['message'])

# 生成的导入清单和脚本在 tag_store/ 目录下
# 在 UE5 Python Console 中运行 import_assets.py 完成导入
```

### 6. 搜索资产

```python
from tags.search import SearchEngine
from tags.store import TagStore

store = TagStore("tag_store")
engine = SearchEngine(store)

# 自然语言搜索
results = engine.search("现代都市风格的商业建筑，有玻璃幕墙")
for r in results:
    print(f"{r.asset.asset_name}: {r.score:.1f}%")
```

## 工具一览

Agent 共注册 **36 个工具**，覆盖资产全生命周期：

| 类别 | 工具 | 说明 |
|---|---|---|
| **扫描** | `scan_directory`, `check_file_info` | 目录扫描、文件信息 |
| **模型** | `check_fbx_info`, `check_mesh_budget` | FBX 信息、面数检查 |
| **贴图** | `check_texture_info`, `check_texture_batch` | 贴图规格检查 |
| **命名** | `check_naming`, `suggest_naming` | 命名规范检查与建议 |
| **分析** | `analyze_assets`, `get_asset_detail` | 资产身份分析 |
| **搜索** | `search_assets`, `search_assets_by_tags` | 语义化资源检索 |
| **审核** | `get_pending_reviews`, `submit_review`, `batch_approve` | 人工审核工作流 |
| **入库** | `intake_asset`, `intake_batch`, `intake_approved` | 入库自动化 |
| **渲染** | `render_asset_preview` | Blender 预览图渲染 |
| **配置** | `check_project_config`, `create_project_config` | 项目配置管理 |
| **记忆** | `record_correction`, `get_memory_stats` | 项目记忆系统 |
| **规范** | `discover_conventions`, `load_conventions` | 规范发现与加载 |

## 实现路线图

- [x] **Phase 1**：资产身份系统骨架
- [x] **Phase 2**：AI 分析层 + 记忆系统 + 标签入库
- [ ] **Phase 3**：入库自动化 + 引擎集成（进行中）
- [ ] **Phase 4**：工作流串联 + 命名规范
- [ ] **Phase 5**：进阶功能（Blender Agent 面板、性能诊断、RAG 知识库）

## 设计文档

详细的架构设计、功能模块、技术选型见 [游戏TA_AI_Agent设计文档.md](游戏TA_AI_Agent设计文档.md)。

## License

MIT
