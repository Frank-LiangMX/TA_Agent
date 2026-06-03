# Changelog

TAgent 所有重要变更记录。版本遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.29.0] - 2026-06-03

### Added
- **本地 Runtime 健康检查** — Electron 启动后先 `GET /health` 验证是 TAgent 本机后端，再升级 WebSocket，避免误连到同名端口的其他服务
- **动态端口选择** — 8080 被占用时自动扫描 18080–18179 区间的空闲端口；Electron 主进程与前端通过 `/health` 协商真实端口
- **连接诊断面板** — 设置 → 账户与连接 → 连接诊断；支持 ping / health / ws-trace 三类检查，定位本机 / 中心服连接问题
- **多主题图标系统** — 4 套主题（default / forest / ocean / slate）× 2 模式（light / dark），附 `scripts/generate_theme_icons.py` 生成器
- **Agent 模式切换同步** — TA / 通用模式切换时自动同步打包后 Runtime 配置并重建 WebSocket 连接
- **Reference 文档**：
  - `docs/reference/local-runtime-connection.md` — 端口、双模式、排障、发版验收
  - `docs/reference/agent-onboarding.md` — Agent 上手
  - `docs/reference/frontend-connection.md` — 前端连接层

### Fixed
- 工作区会话按 Agent 模式隔离（避免 TA / 通用共享会话污染）
- WebSocket `send_event` / `send_response` / `send_error` 加断开保护
- 打包后端改用 `import agent_main`（根目录 `agent.py` 薄壳不再被打进 PyInstaller）
- Electron dev 启动脚本在 PowerShell 下更稳定

### Changed
- 前端 API 层从静态 `API_BASE` 改为 `localApiFetch` / `getApiBase`，便于打包后切换端口
- `build-electron.bat` 简化为 4 步 + 自动清理中间产物；输出目录带时间戳（后续会改为版本号）

## [0.28.0] - 2026-05-??

历史版本，未在此 changelog 维护。详见 `progress.md`。
