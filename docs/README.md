# 文档地图

> 最后更新：2026-06-01

## 文档结构

```
docs/
├── reference/                # 设计参考——改代码时查的 (稳定，编辑修改)
│   ├── backend.md            # 后端架构、数据流、工具系统、集成方案
│   ├── frontend.md           # 前端架构、WebSocket 协议、组件参考、设计规范
│   ├── electron.md           # Electron 桌面应用架构、IPC、打包、Bridge 扩展
│   └── pipeline.md           # 资产流水线系统：核心概念 + 前后端 API
├── decisions/                # 架构决策记录——为什么这么做 (只追加，不修改)
│   ├── user-auth-design.md   # 用户认证、权限管理、管理员分配
│   ├── client-dual-mode-design.md  # 客户端双模式（本地/联机）
│   └── distributed-architecture.md # 分布式架构设计
├── experiments/              # 实验/试错——过程记录 (追加，成功/失败都保留)
│   ├── backend/
│   │   └── 2026-05-27-hidden-bugs-audit.md  # 隐藏问题排查报告
│   └── frontend/
│       ├── 2026-05-21-prompt-suggestion.md  # 提示建议功能实验
│       └── 2026-05-22-bug-report.md         # Bug 排查报告
└── guides/                   # 使用指南——流程说明
    ├── workflow.md           # 单人/团队工作流、SVN 集成、推广策略
    └── ue-plugin-mcp-guide.md  # UE 插件 MCP 化指南（供项目组开发参考）
```

## 阅读指引

| 你想做什么 | 看什么 |
|-----------|--------|
| 改后端代码 | `reference/backend.md` |
| 改前端代码 | `reference/frontend.md` |
| 改 Electron 桌面应用 | `reference/electron.md` |
| 了解资产流水线 | `reference/pipeline.md` |
| 了解为什么这么设计 | `decisions/` |
| 验证一个新思路 | 在 `experiments/` 对应目录下新建带日期的 `.md` |
| 了解团队怎么用这个工具 | `guides/workflow.md` |
| 了解项目全貌 | 根目录 `README.md` |
| 美术操作指南 | `guides/artist-guide.md` |
| UE 插件 MCP 化 | `guides/ue-plugin-mcp-guide.md` |
| 分布式架构设计 | `decisions/distributed-architecture.md` |
| 用户认证设计 | `decisions/user-auth-design.md` |
| 客户端双模式设计 | `decisions/client-dual-mode-design.md` |
| 管理员分配机制 | `decisions/user-auth-design.md` (5.2 节) |
| Bug 排查记录 | `experiments/frontend/2026-05-22-bug-report.md` |
| 隐藏问题排查 | `experiments/backend/2026-05-27-hidden-bugs-audit.md` |
| 双模式记忆设计草案 | `experiments/backend/2026-06-01-dual-mode-memory-design.md` |
| **工作台双模式（TA/通用）实施台账** | `experiments/backend/2026-06-01-workbench-dual-mode-roadmap.md` |

## 写入规则

- **reference/**：只有验证过的、稳定的设计才写进去。编辑修改。
- **decisions/**：确定下来的架构决策，只追加不修改。
- **experiments/**：试错过程，乱是正常的。实验成功→把结论提炼进 `reference/`；失败→保留文件，避免重复踩坑。

## 历史

- 2026-05-19：原先的 6 个文档按此结构重组
- 2026-05-26：添加联机模式、中心服务器、权限管理相关文档
- 2026-05-29：新增 Electron 架构文档，开始微信 Bridge 模块
- 2026-06-01：新增工作台双模式（TA/通用）实施台账，与记忆设计稿区分
