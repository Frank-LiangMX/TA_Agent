# 项目进度

> 最后更新：2026-06-01

---

## 里程碑

| | 里程碑 | 状态 |
|--|--------|------|
| 1 | 本地资产检查（AI 质检：面数/贴图/命名/材质） | ✅ |
| 2 | 资产自动入库（审核→重命名→UE5 导入→更新状态） | ✅ |
| 3 | 项目级管理平台（Web 前端 + 流水线可视化） | ✅ |
| 4 | 公司级资产助手（中心服务器 + 多用户协作） | 🔧 进行中 |

## 已完成功能

### 后端核心
- Agent 主循环（流式输出、工具调用、历史压缩、重试）
- 工具注册系统（54 个工具，每个独立文件，统一注册）
- 会话管理（JSONL append-only、草稿、归档、分页读取）
- 上下文分割（context_cutoff 控制 LLM 可见范围）
- 分析进度面板（rich.progress 多阶段展示）
- 双模式 LLM 配置（云端 GLM-5/DeepSeek + 自建模型切换）
- 用户标识（WebSocket 传用户名，按用户隔离）
- 工具执行取消机制（RPC stopGeneration，不断开连接）
- LLM 思考模式（reasoning_effort 参数 + 不支持时自动重试）
- 多模态消息支持（图片 base64 发送给 LLM）
- LLM 调用日志（JSONL 持久化，时间/模型/token/耗时/状态）
- 模型自动发现（/v1/models 接口拉取可用模型列表）
- 路径管理优化（硬编码路径改动态计算 + config 常量统一）

### 资产分析
- 资产身份系统（三层：确定层/推断层/管理层）
- FBX 解析（Blender subprocess，含超时控制）
- 贴图质检（分辨率/格式/通道/色彩空间，支持批量）
- 命名规范检查（前缀/PascalCase/自定义规则）
- 面数预算检查
- AI 推断（分类/材质/风格/状态，带置信度）
- 语义搜索引擎（自然语言 → 结构化查询 → 多维度评分）
- 类型推断兜底（命名无法判断时用数据推断）
- 文件过滤模式（file_pattern 参数）

### 审核与入库
- 审核工作流（高/低置信度分组、批量通过、详情查看）
- 入库流程（规范命名、路径规划、导入清单生成）
- 审核维度按类型区分（模型/贴图/动画/材质）
- 预览图自动生成（Blender 解析时顺手渲染）

### 记忆系统
- 三层记忆（L0 项目画像 / L1 纠正规则 / L2 归档）
- 自动压缩 + 淘汰机制
- 依赖注入（FileMemoryProvider / NullMemoryProvider）

### UE5 集成
- 文件轮询通信（commands.jsonl / results.jsonl）
- FBX 导入 + 元数据写入
- UE5.7 兼容性修复
- 健康检查

### 流水线系统
- 流水线配置 CRUD（GET/POST /api/pipeline）
- 阶段执行（POST /api/pipeline/run）
- 执行记录查询（pipeline_runs.jsonl）
- 阶段状态查询

### Web 前端
- 流式对话（WebSocket 逐字输出、工具调用折叠展示）
- 20+ 工具结果专用渲染器
- 资产库（REST API + 筛选/排序/分页/预览图）
- 审核队列（Tab 分组、批量通过/拒绝、自然语言指令、自动切到有内容的 Tab）
- 语义搜索（自然语言搜索）
- 资产详情面板（配置驱动，新增字段只改配置）
- 消息导航（ScrollMinimap，工具消息已过滤）
- 上下文分割线（ContextDivider + Ctrl+K）
- 分析进度条（多阶段，集成到输入框上方）
- 会话管理 UI（SessionSelector + Popover + 批量管理）
- 项目总览仪表盘（统计卡片 + 条形图）
- 设置面板（11 个模块，原语组件体系）
- 资产流水线可视化（节点编辑器 + 分支管理）
- 3D 预览（前端生成按钮 + 后端 Blender 渲染）
- 动画系统（15 个动画组件）
- UI 风格对齐（纯灰中性主题，4 套主题变体）
- 首次引导遮罩（TourGuide，5 步引导）
- 使用指南（HelpGuide，设置页内置 ReactMarkdown）
- Agent 自我意识（System Prompt 引导回答）
- 卡片式输入框（工具栏：附件/模型切换/思考模式）
- 附件上传（图片粘贴/文件选择，图片转 base64 多模态）
- 模型切换器（工具栏下拉，一键切换激活模型）
- LLM 思考模式（Brain 按钮 + reasoning_effort 参数 + 容错重试）
- 消息复制按钮（用户/助手消息均支持）
- 流式输出优化（底部控件输出完成后才显示）

### Electron 桌面应用
- Electron 框架搭建（electron/ 目录）
- 开发模式（加载 Vite 开发服务器 5175）
- 打包模式（加载本地 dist/ 静态文件）
- 启动逻辑优化（异步检测、窗口闪退修复）
- 打包产物管理（.gitignore 配置）

### MCP 集成
- mcp.json 配置（MCP 标准格式）
- mcp_bridge.py（连接/发现/Schema 转换/执行/CRUD/热加载/工具注册）
- UI 管理（McpSettings.tsx：添加/删除/启用禁用/测试连接/重新加载）
- Agent 对话管理（6 个 MCP 管理工具）
- System Prompt MCP 管理指引 + 常用服务器速查表

### 中心服务器（新增）
- FastAPI 服务器框架（server/ 目录）
- SQLite 数据库（资产、审核、项目、记忆、用户、用量）
- REST API（资产/审核/项目/记忆/认证/用量）
- 用量统计管理页面（/admin/usage）
- 部署文档（server/README.md）

### 工程优化
- 流水线系统后端（pipeline API + 执行记录）
- 材质贴图映射（Blender 读取材质节点树）
- 贴图缩略图自动生成（256px PNG）
- 批量操作进度（入库/重命名/贴图检查）
- 会话消息截断 + 历史消息过滤
- 清理记忆 / 提示词管理 / 用量统计 API
- 工具管理 / 插件管理 API
- 文档重组（reference + decisions + experiments + guides）
- CLAUDE.md 精简（冗余裁剪 + 文档管理规范）
- 工具重组（物理拆分为 core/extensions/plugins/mcp 四层，前端 4 Tab 展示）
- 进度追踪（progress.md 里程碑 + 待办 + 版本日志）

---

## 工作台双模式（TA / 通用）

> **单一事实来源**：[实施台账](docs/experiments/backend/2026-06-01-workbench-dual-mode-roadmap.md)  
> 含：已完成项、P1–P3 待办、与记忆设计稿 Phase 对齐、文档待更新列表、发版验收清单。  
> 开发前请先改台账，再视情况同步 `reference/`。

---

## 待办

### P1（核心体验）
- [ ] 入库向导 — 分步引导流程（前端）
- [ ] 客户端双模式 — 本地模式 + 联机模式切换
- [ ] SSO 登录集成 — 接入公司 XSJSSO 登录系统
- [ ] 数据同步 — 客户端与服务器数据同步

### P2（体验提升）
- [ ] 置信度校准 — 基于历史纠正校准 AI 置信度
- [ ] 记忆冷启动 — 从项目配置自动生成 L0 画像
- [ ] UE5 导入回滚 — 失败标记 + 重试工具
- [ ] UE5 插件 — Editor 启动时自动加载 Server
- [ ] 经验聚合 — 修正→模式→规则
- [ ] SVN 双目录集成 — ArtResources + Content
- [ ] SVN post-commit 监控 — 自动分析新提交
- [ ] UE 插件 MCP 化 — 项目工具统一 MCP 接口

### P3（工程质量）
- [ ] 资产去重 — 入库前检查相似资产
- [ ] 推断可解释性 — LLM 返回推理依据
- [ ] 多模态视觉分析 — 集成 Qwen-VL 到推断流程
- [ ] 日志系统 — 结构化日志替代 print
- [ ] 自动化测试 — 单元测试覆盖率 > 80%
- [ ] Docker 部署 — 服务器容器化部署

---

## 版本日志

详见 [docs/release-notes/](docs/release-notes/)
