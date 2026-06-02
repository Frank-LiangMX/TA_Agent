# TA Agent - 游戏技术美术 AI Agent

> 专为游戏技术美术（TA）工作流设计的 AI 智能体，从资产质检到入库，全流程自动化。

## 核心能力

- **AI 质检** — 自动解析 FBX/贴图，校验命名规范，检查面数、分辨率等技术指标
- **智能审核** — 高置信度自动通过，低置信度人工确认，越用越准
- **一键入库** — 重命名 + 移动 + 生成 UE5 导入脚本
- **语义搜索** — 自然语言查找资产（如"中世纪风格的金属武器"）
- **项目记忆** — 纠正一次永远记住，跨会话保持

## 快速开始

### 启动

```bat
dev-web.bat       :: Web UI 模式（后端 8080 + 前端 5175）
dev-electron.bat  :: Electron 桌面模式
dev-cli.bat       :: CLI 命令行模式
```

### 分析资产

```python
from analyzer import AssetIdentityAnalyzer

analyzer = AssetIdentityAnalyzer()
result = analyzer.analyze_directory("F:/Assets/NewBatch")
print(result['report_markdown'])
```

### 搜索资产

```python
from tags.search import SearchEngine
from tags.store import TagStore

store = TagStore("tag_store")
engine = SearchEngine(store)
results = engine.search("中世纪风格的武器")
```

## 文档

| 文档 | 内容 |
|------|------|
| [美术资产流程Agent_介绍文档](docs/business/美术资产流程Agent_介绍文档.md) | 产品完整介绍 |
| [游戏TA_AI_Agent设计文档](游戏TA_AI_Agent设计文档.md) | 架构设计与技术细节 |
| [实施台账](docs/experiments/backend/2026-06-01-workbench-dual-mode-roadmap.md) | 当前进度与待办 |
| [资产身份系统设计](docs/decisions/assets-identity-system.md) | 资产身份数据结构 |
| [记忆系统设计](docs/decisions/memory-system.md) | L0/L1/L2 三层记忆架构 |

## License

MIT
