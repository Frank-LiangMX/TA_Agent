# TA Agent 开发规范

## 代码组织

### 模块解耦原则
- 单文件上限 **300-400 行**，超过则拆分
- 每个工具独立文件，统一注册到 `tools/registry.py`
- 接口定义与实现分离（如 `provider.py` + `file_provider.py`）

### 开发产出清理
- **测试文件完成使命后立即删除**：功能开发完成后，对应的测试文件（`tests/` 下）如果没有 CI 持续维护，必须自行清除，不留脏代码
- **调试代码禁止提交**：`print`、`import pdb`、临时日志、注释掉的代码块，在任务完成前全部清理
- **实验分支的产物**：实验成功后，把结论写进 `docs/experiments/`，实验代码分支删除；实验失败同样保留文档记录，代码分支删除
- **pycache 等缓存目录**：提交前检查 `.pytest_cache`、`__pycache__` 等缓存目录是否在 `.gitignore` 中，不在则清理

### 根目录文件规范
- **根目录只允许存放**：入口文件（`agent.py`、`launcher.py`）、配置文件（`.gitignore`、`mcp.json`、`TAgent.spec`）、文档（`README.md`、`CLAUDE.md`、`progress.md`）、构建脚本（`*.bat`）
- **禁止在根目录创建新的 .py 代码文件**：新增模块必须放入对应的子目录（`tools/`、`tags/`、`core/` 等）
- **历史遗留**：根目录现有的 `analyzer.py`、`config.py`、`session_manager.py`、`batch_render.py`、`run_render.py`、`quickstart.py` 是历史债务，后续重构时逐步迁入 `core/` 或 `scripts/`

### 运行数据目录规范
- **本地 Agent 运行数据统一存放在 AppData 子目录**：`%APPDATA%\tagent-desktop\agent-running-data`
- **唯一入口**：Python 代码必须从 `config.py` 导入 `RUNTIME_DIR`、`SESSIONS_DIR`、`MEMORY_DIR`、`CONFIGS_DIR`、`TAG_STORE_DIR`、`PIPELINE_RUNS_FILE`、`PREVIEWS_DIR` 等路径常量
- **禁止硬编码运行数据路径**：不要写死 `F:\ta_agent`、`.ta_agent`、`tag_store`、`sessions`、`pipeline_runs.jsonl` 等运行数据路径
- **禁止自己拼运行根目录**：如需新增运行数据目录，先在 `config.py` 增加路径常量，再由业务代码导入使用
- **环境变量覆盖**：仅允许 `TAGENT_RUNTIME_DIR` 作为显式调试覆盖；Electron 兼容 `ELECTRON_USER_DATA`，但仍应指向 `agent-running-data`
- **Electron userData 分层**：Electron/Chromium 自身缓存留在 `%APPDATA%\tagent-desktop`，Agent 会话、记忆、资产库、流水线记录、日志必须放入 `agent-running-data`
- **中心服务器例外**：根目录 `server/` 是中心服务器，使用 `TAGENT_DATA_DIR` / `server/config.py` 管理共享服务数据，不与本地 Agent 的 `RUNTIME_DIR` 混用

## 工具开发规范

### 新增工具标准模板
```python
# tools/xxx.py

# 1. Schema 定义（传给 LLM）
SCHEMA = {
    "type": "function",
    "function": {
        "name": "tool_name",
        "description": "工具描述",
        "parameters": {
            "type": "object",
            "properties": { ... },
            "required": [...]
        }
    }
}

# 2. 执行函数（返回 dict）
def tool_name(param1: str, param2: int = 0) -> dict:
    """工具实现"""
    return {"key": "value"}

# 3. 在 registry.py 注册
# TOOLS 列表添加 Schema
# TOOL_FUNCTIONS 添加执行函数
```

## 命名规范

### 文件命名
- 工具模块: `snake_case.py` (如 `mesh_fbx.py`, `texture.py`)
- 测试文件: `test_xxx.py`

### 代码命名
- 函数/变量: `snake_case`
- 类名: `PascalCase`
- 常量: `UPPER_SNAKE_CASE`

## TA 领域规范

### 资产命名前缀
- `SM_` - StaticMesh 静态网格体
- `SK_` - SkeletalMesh 骨骼网格体
- `M_` - Material 材质
- `MI_` - MaterialInstance 材质实例
- `T_` - Texture 贴图
- `BP_` - Blueprint 蓝图

### 面数预算
- 角色: < 30K
- 武器: < 10K
- 道具: < 5K
- 建筑: < 20K

### 贴图规范
- 最大分辨率: 2048x2048
- 必须是 2 的幂次
- 推荐正方形

## 文档管理规范

### 核心原则（Agent 必须遵守）
1. **写文档前先读 `docs/README.md`**，了解当前文档结构，不要重复创建或写到错误的地方
2. **参考 vs 实验严格分离**：稳定的设计写入 `docs/reference/`，试错内容写入 `docs/experiments/日期-主题.md`
3. **一个模块一个文件**：前端内容 → `reference/frontend.md`；后端内容 → `reference/backend.md`；流水线 → `reference/pipeline.md`。**不要在一个文档里混写前后端内容**
4. **新需求先行实验**：遇到不确定的新功能，先在 `experiments/` 对应目录下新建带日期的 `.md` 记录过程。实验成功后再把稳定部分写入 `reference/`
5. **禁止把实验内容直接写进 reference 文档**：reference 里只放已经验证过的、稳定的设计

### 文档位置速查表

| 你想写什么 | 写在哪个文件 |
|-----------|-------------|
| 后端架构/数据流/工具系统 | `docs/reference/backend.md` |
| 前端组件/协议/设计规范 | `docs/reference/frontend.md` |
| 资产流水线系统 | `docs/reference/pipeline.md` |
| 架构决策（为什么这么做） | `docs/decisions/主题.md` |
| 试错/调研/实验记录 | `docs/experiments/{backend\|frontend}/日期-主题.md` |
| 工作流程/使用指南 | `docs/guides/` |
| 美术操作指南 | `docs/guides/artist-guide.md` |
| 项目介绍/全貌 | 根目录 `README.md` |
| 进度追踪/待办 | 根目录 `progress.md` |

### 何时新建文件 vs 追加到现有文件
- **新增功能模块**（如"新增 UV 检查工具"）→ 改 `reference/backend.md`，在对应章节加内容
- **新增前端页面**（如"新增 UV 检查视图"）→ 改 `reference/frontend.md`
- **尝试新技术/不确定的方案** → 新建 `experiments/` 文件
- **以上都不匹配** → 先读 `docs/README.md` 找到最合适的位置，不确定则请教用户
