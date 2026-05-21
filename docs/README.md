# 文档地图

> 最后更新：2026-05-20

## 文档结构

```
docs/
├── reference/                # 设计参考——改代码时查的 (稳定，编辑修改)
│   ├── backend.md            # 后端架构、数据流、工具系统、集成方案
│   ├── frontend.md           # 前端架构、WebSocket 协议、组件参考、设计规范
│   └── pipeline.md           # 资产流水线系统：核心概念 + 前后端 API
├── decisions/                # 架构决策记录——为什么这么做 (只追加，不修改)
├── experiments/              # 实验/试错——过程记录 (追加，成功/失败都保留)
│   ├── backend/
│   └── frontend/
└── guides/                   # 使用指南——流程说明
    ├── workflow.md           # 单人/团队工作流、SVN 集成、推广策略
    └── ue-plugin-mcp-guide.md  # UE 插件 MCP 化指南（供项目组开发参考）
```

## 阅读指引

| 你想做什么 | 看什么 |
|-----------|--------|
| 改后端代码 | `reference/backend.md` |
| 改前端代码 | `reference/frontend.md` |
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

## 写入规则

- **reference/**：只有验证过的、稳定的设计才写进去。编辑修改。
- **decisions/**：确定下来的架构决策，只追加不修改。
- **experiments/**：试错过程，乱是正常的。实验成功→把结论提炼进 `reference/`；失败→保留文件，避免重复踩坑。

## 历史

原先的 6 个文档于 2026-05-19 按此结构重组。
