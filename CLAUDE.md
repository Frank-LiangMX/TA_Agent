# TA Agent 开发规范

## 代码组织

### 模块解耦原则
- 单文件上限 **300-400 行**，超过则拆分
- 每个工具独立文件，统一注册到 `tools/registry.py`
- 接口定义与实现分离（如 `provider.py` + `file_provider.py`）

### 文件拆分策略
```
当文件超过 400 行时：
  - Schema/接口定义 → xxx_schema.py 或 xxx_types.py
  - 核心业务逻辑 → xxx_core.py
  - 工具函数/辅助函数 → xxx_utils.py
```

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

## 目录结构
```
ta_agent/
├── agent.py           # Agent 主循环
├── analyzer.py        # 分析编排器
├── config.py          # 配置管理
├── tools/             # 工具模块（每个工具独立文件）
├── tags/              # 标签系统（schema/store/search/inferrer）
├── conventions/       # 规范发现/加载
└── .ta_agent/memory/  # 记忆系统
```
