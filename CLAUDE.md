# TA Agent 开发规范

## 代码组织

### 模块解耦原则
- 单文件上限 **300-400 行**，超过则拆分
- 每个工具独立文件，统一注册到 `tools/registry.py`
- 接口定义与实现分离（如 `provider.py` + `file_provider.py`）

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
