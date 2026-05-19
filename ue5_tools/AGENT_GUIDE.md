# TA Asset Bridge - Agent使用指南

> 让AI Agent自动导入资产到UE5项目

---

## 📋 目录

1. [快速开始](#快速开始)
2. [完整API](#完整api)
3. [资产类型](#资产类型)
4. [工作流程](#工作流程)
5. [错误处理](#错误处理)
6. [最佳实践](#最佳实践)
7. [故障排查](#故障排查)

---

## 快速开始

### 前置条件

1. **UE5项目已编译插件**
   - 插件位置：`F:\ta_agent\Plugins\TAAssetBridge\`
   - 启动UE5编辑器后自动激活

2. **Python环境**
   - Python 3.8+
   - 无需额外依赖（仅使用标准库）

### 30秒上手

```python
from ue5_tools.ue5_bridge import UE5Bridge

# 创建桥接（指向你的UE5项目）
ue5 = UE5Bridge(r"F:\ta_agent")

# 测试连接
result = ue5.ping()
print(result)  # {"status": "pong", ...}

# 导入FBX模型
result = ue5.import_asset(
    source_path=r"D:\Assets\Characters\hero.fbx",
    dest_path="/Game/Characters/Hero"
)

if result["status"] == "success":
    print(f"✅ 导入成功: {result['asset_path']}")
```

---

## 完整API

### UE5Bridge类

```python
class UE5Bridge:
    def __init__(self, project_path: str, timeout: float = 30.0)
```

**参数**：
- `project_path`: UE5项目根目录（包含.uproject文件）
- `timeout`: 等待响应的超时时间（秒）

---

### 方法列表

#### 1. ping() - 测试连接

```python
result = ue5.ping()
```

**返回**：
```json
{
    "status": "pong",
    "engine_version": "++UE5+Release-5.7-CL-51494982",
    "request_id": "ping_001",
    "timestamp": "2026.05.18-18.00.00"
}
```

---

#### 2. import_asset() - 导入资产

```python
result = ue5.import_asset(
    source_path: str,      # 源文件绝对路径
    dest_path: str,        # UE5目标路径（如 /Game/Characters/Hero）
    asset_type: str = "",  # 资产类型（可选）
    request_id: str = None # 请求ID（可选，自动生成）
)
```

**参数说明**：
- `source_path`: 源文件绝对路径（支持FBX/OBJ/PNG/TGA/WAV等）
- `dest_path`: UE5内容浏览器路径，格式：`/Game/文件夹/资产名`
- `asset_type`: 资产类型标识（见下表），可选
- `request_id`: 自定义请求ID，用于追踪

**返回示例**：

成功：
```json
{
    "status": "success",
    "asset_path": "/Game/Characters/Hero/Hero.Hero",
    "asset_type": "skeletal_mesh",
    "message": "Asset imported successfully: /Game/Characters/Hero/Hero.Hero",
    "request_id": "import_001",
    "timestamp": "2026.05.18-18.01.00"
}
```

部分成功（导入执行但验证失败）：
```json
{
    "status": "partial",
    "message": "Import task executed. Check UE5 Content Browser for imported assets.",
    "expected_path": "/Game/Characters/Hero.Hero",
    "destination_folder": "/Game/Characters/Hero",
    "request_id": "import_002",
    "timestamp": "2026.05.18-18.02.00"
}
```

失败：
```json
{
    "status": "error",
    "message": "Source file not found: D:\\Missing\\file.fbx",
    "request_id": "import_003",
    "timestamp": "2026.05.18-18.03.00"
}
```

---

#### 3. send_command() - 发送自定义命令

```python
result = ue5.send_command({
    "cmd": "import_asset",
    "source_path": r"D:\Assets\model.fbx",
    "dest_path": "/Game/Models/Model",
    "asset_type": "static_mesh",
    "request_id": "custom_001"
})
```

---

## 资产类型

| 资产类型 | asset_type | 支持格式 | 说明 |
|---------|-----------|---------|------|
| 静态模型 | `static_mesh` | .fbx, .obj | 无骨骼模型 |
| 骨骼模型 | `skeletal_mesh` | .fbx | 带骨骼的角色/动画 |
| 纹理 | `texture` | .png, .tga, .jpg | 贴图文件 |
| 材质 | `material` | .mat | 材质定义 |
| 音频 | `sound_wave` | .wav, .ogg | 音效文件 |
| 动画 | `animation` | .fbx | 骨骼动画 |

**注意**：`asset_type`参数主要用于日志标识，UE5会根据文件扩展名自动识别。

---

## 工作流程

### 完整导入流程

```
┌─────────────────────────────────────────────────────────┐
│  Agent (Python)                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 1. 创建UE5Bridge实例                              │  │
│  │    ue5 = UE5Bridge(r"F:\ta_agent")               │  │
│  └──────────────────────────────────────────────────┘  │
│                         ↓                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 2. 调用import_asset()                            │  │
│  │    ue5.import_asset(source, dest)                │  │
│  └──────────────────────────────────────────────────┘  │
│                         ↓                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 3. 写入commands.jsonl                            │  │
│  │    {"cmd":"import_asset", "source_path":...}     │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  UE5插件 (C++)                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 4. Ticker轮询检测commands.jsonl                  │  │
│  │    每0.1秒检查一次                                │  │
│  └──────────────────────────────────────────────────┘  │
│                         ↓                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 5. 读取并解析JSON命令                             │  │
│  │    删除commands.jsonl（防止重复处理）             │  │
│  └──────────────────────────────────────────────────┘  │
│                         ↓                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 6. 执行Python API导入资产                         │  │
│  │    AssetTools.import_asset_tasks()               │  │
│  └──────────────────────────────────────────────────┘  │
│                         ↓                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 7. 三重验证导入结果                               │  │
│  │    LoadObject → GetAssetsByPath → GetAssets      │  │
│  └──────────────────────────────────────────────────┘  │
│                         ↓                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 8. 写入results.jsonl                             │  │
│  │    {"status":"success", "asset_path":...}        │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Agent (Python)                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 9. 轮询读取results.jsonl                         │  │
│  │    匹配request_id获取结果                         │  │
│  └──────────────────────────────────────────────────┘  │
│                         ↓                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 10. 返回结果给调用者                              │  │
│  │     result = {"status": "success", ...}          │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### IPC文件位置

```
F:\ta_agent\
└── Saved\
    └── TAAssetBridge\
        ├── commands.jsonl  ← Agent写入命令
        └── results.jsonl   ← UE5插件写入结果
```

---

## 错误处理

### 常见错误码

| status | 含义 | 处理建议 |
|--------|------|---------|
| `pong` | 连接正常 | - |
| `success` | 导入成功 | 使用返回的asset_path |
| `partial` | 导入执行但验证失败 | 检查Content Browser |
| `error` | 导入失败 | 查看message字段 |

### 错误处理示例

```python
result = ue5.import_asset(source_path, dest_path)

if result["status"] == "success":
    # 成功：使用资产路径
    asset_path = result["asset_path"]
    print(f"✅ 导入成功: {asset_path}")
    
elif result["status"] == "partial":
    # 部分成功：手动检查
    print(f"⚠️ 导入已执行，请检查: {result['destination_folder']}")
    
elif result["status"] == "error":
    # 失败：查看错误信息
    print(f"❌ 导入失败: {result['message']}")
    
    # 常见错误处理
    if "not found" in result["message"]:
        print("   → 检查源文件路径是否正确")
    elif "Python" in result["message"]:
        print("   → 检查UE5 Python插件是否启用")
```

### 超时处理

```python
try:
    result = ue5.import_asset(source, dest, timeout=60.0)
except TimeoutError:
    print("⚠️ 导入超时，可能文件过大")
    # 检查results.jsonl是否有延迟响应
```

---

## 最佳实践

### 1. 批量导入

```python
assets = [
    (r"D:\Assets\char1.fbx", "/Game/Characters/Char1"),
    (r"D:\Assets\char2.fbx", "/Game/Characters/Char2"),
    (r"D:\Assets\prop.obj", "/Game/Props/Prop1"),
]

for source, dest in assets:
    result = ue5.import_asset(source, dest)
    if result["status"] == "success":
        print(f"✅ {dest}: {result['asset_path']}")
    else:
        print(f"❌ {dest}: {result.get('message')}")
```

### 2. 路径规范

```python
# ✅ 正确：使用原始字符串
source_path = r"D:\Assets\Models\hero.fbx"

# ✅ 正确：使用正斜杠
source_path = "D:/Assets/Models/hero.fbx"

# ❌ 错误：反斜杠未转义
source_path = "D:\Assets\Models\hero.fbx"  # \A \M会被转义

# ✅ UE5目标路径格式
dest_path = "/Game/Characters/Hero"  # 正确
dest_path = "Game/Characters/Hero"   # 错误：缺少前导/
```

### 3. 资产命名

```python
# ✅ 推荐：目标路径包含资产名
dest_path = "/Game/Characters/Hero"  # 导入后资产名为Hero

# ✅ 源文件名会自动作为资产名
source_path = r"D:\Assets\SK_Character_01.fbx"
dest_path = "/Game/Characters"
# 结果：/Game/Characters/SK_Character_01.SK_Character_01
```

### 4. 覆盖已存在资产

插件已启用 `automated=True`，会自动覆盖已存在的资产，无需确认。

---

## 故障排查

### 问题1：commands.jsonl不消失

**现象**：写入命令后文件一直存在

**原因**：
- UE5编辑器未启动
- 插件未加载
- 文件被其他程序占用

**解决**：
```python
# 检查UE5是否运行
import psutil
ue_running = any("UE5Editor" in p.name() for p in psutil.process_iter())
print(f"UE5运行中: {ue_running}")

# 检查插件是否加载
# 在UE5 Output Log中搜索: "TAAssetBridge Module started"
```

---

### 问题2：results.jsonl无响应

**现象**：commands.jsonl消失但无results

**原因**：
- JSON格式错误
- Python插件未启用

**解决**：
```python
# 检查JSON格式
import json
command = {
    "cmd": "import_asset",
    "source_path": r"D:\Assets\model.fbx",  # 使用原始字符串
    "dest_path": "/Game/Models/Model",
    "request_id": "test_001"
}
print(json.dumps(command, ensure_ascii=False))  # 验证格式
```

---

### 问题3：导入成功但返回partial

**现象**：资产在Content Browser中可见，但status=partial

**原因**：验证逻辑未找到资产（可能路径不匹配）

**解决**：
- 检查 `expected_path` 和 `destination_folder`
- 手动在Content Browser中确认资产位置
- 资产已成功导入，可正常使用

---

### 问题4：路径中的反斜杠问题

**现象**：JSON解析失败

**原因**：Windows路径中的 `\` 被当作转义字符

**解决**：
```python
# ✅ 方法1：原始字符串
path = r"D:\Assets\model.fbx"

# ✅ 方法2：正斜杠
path = "D:/Assets/model.fbx"

# ✅ 方法3：双反斜杠
path = "D:\\Assets\\model.fbx"

# ❌ 错误
path = "D:\Assets\model.fbx"  # \A \m会被转义
```

---

## 完整示例

### 示例1：导入角色模型

```python
from ue5_tools.ue5_bridge import UE5Bridge

ue5 = UE5Bridge(r"F:\ta_agent")

# 导入骨骼模型
result = ue5.import_asset(
    source_path=r"D:\Assets\Characters\Hero\SK_Hero.fbx",
    dest_path="/Game/Characters/Hero",
    asset_type="skeletal_mesh"
)

if result["status"] == "success":
    print(f"✅ 角色导入成功: {result['asset_path']}")
    # 输出: /Game/Characters/Hero/SK_Hero.SK_Hero
```

### 示例2：批量导入纹理

```python
import os
from pathlib import Path

textures_dir = Path(r"D:\Assets\Textures")
ue5 = UE5Bridge(r"F:\ta_agent")

for tex_file in textures_dir.glob("*.png"):
    asset_name = tex_file.stem  # 文件名（无扩展名）
    
    result = ue5.import_asset(
        source_path=str(tex_file),
        dest_path=f"/Game/Textures/{asset_name}",
        asset_type="texture"
    )
    
    if result["status"] == "success":
        print(f"✅ {asset_name}: {result['asset_path']}")
```

### 示例3：集成到Agent工作流

```python
class AssetImportAgent:
    def __init__(self, ue5_project_path):
        self.ue5 = UE5Bridge(ue5_project_path)
    
    def import_character(self, fbx_path, character_name):
        """导入角色模型到UE5"""
        result = self.ue5.import_asset(
            source_path=fbx_path,
            dest_path=f"/Game/Characters/{character_name}",
            asset_type="skeletal_mesh"
        )
        
        if result["status"] == "success":
            return {
                "success": True,
                "asset_path": result["asset_path"],
                "message": f"角色 {character_name} 导入成功"
            }
        else:
            return {
                "success": False,
                "error": result.get("message", "Unknown error")
            }
    
    def import_prop(self, obj_path, prop_name):
        """导入道具模型"""
        result = self.ue5.import_asset(
            source_path=obj_path,
            dest_path=f"/Game/Props/{prop_name}",
            asset_type="static_mesh"
        )
        return result

# 使用
agent = AssetImportAgent(r"F:\ta_agent")
result = agent.import_character(r"D:\hero.fbx", "HeroCharacter")
print(result)
```

---

## 技术细节

### 文件IPC协议

**命令格式** (commands.jsonl)：
```json
{
    "cmd": "import_asset",
    "source_path": "D:/Assets/model.fbx",
    "dest_path": "/Game/Models/Model",
    "asset_type": "static_mesh",
    "request_id": "import_001"
}
```

**响应格式** (results.jsonl)：
```json
{
    "status": "success",
    "asset_path": "/Game/Models/Model.Model",
    "asset_type": "static_mesh",
    "message": "Asset imported successfully",
    "request_id": "import_001",
    "timestamp": "2026.05.18-18.00.00"
}
```

### 性能参数

| 参数 | 值 | 说明 |
|-----|---|------|
| 轮询间隔 | 0.1秒 | UE5插件检查commands.jsonl频率 |
| 默认超时 | 30秒 | Agent等待响应时间 |
| 文件编码 | UTF-8 | JSONL文件编码 |

---

## 相关文件

```
F:\ta_agent\
├── Plugins\TAAssetBridge\          # UE5 C++插件
│   ├── TAAssetBridge.uplugin
│   └── Source\TAAssetBridge\
│       ├── TAAssetBridge.Build.cs
│       ├── TAAssetBridge.h
│       └── TAAssetBridge.cpp
│
├── ue5_tools\                       # Agent端工具
│   ├── ue5_bridge.py               # Python桥接模块
│   ├── AGENT_GUIDE.md              # 本文档
│   └── README.md                   # 快速开始
│
└── Saved\TAAssetBridge\            # IPC通信目录
    ├── commands.jsonl              # 命令文件
    └── results.jsonl               # 结果文件
```

---

## 更新日志

### v1.0.0 (2026-05-18)
- ✅ 文件IPC通信
- ✅ 资产自动导入
- ✅ 自动覆盖已存在资产
- ✅ 三重验证机制
- ✅ Agent Python桥接

---

## 支持

遇到问题？检查以下内容：

1. **UE5 Output Log** - 搜索 "TAAssetBridge"
2. **IPC文件** - 检查 `Saved/TAAssetBridge/` 目录
3. **Python插件** - 确保UE5中已启用 Python Script Plugin

---

**让AI Agent自动处理资产导入，专注于创作！** 🎨
