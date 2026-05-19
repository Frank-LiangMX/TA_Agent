# TA Asset Bridge

> 让AI Agent自动导入资产到UE5项目

---

## 🚀 快速开始

### 1. 前置条件

- ✅ UE5项目已编译插件（`Plugins/TAAssetBridge/`）
- ✅ UE5编辑器已启动
- ✅ Python 3.8+（无需额外依赖）

### 2. 30秒上手

```python
from ue5_tools.ue5_bridge import UE5Bridge

# 创建桥接
ue5 = UE5Bridge(r"F:\ta_agent")

# 测试连接
result = ue5.ping()
print(result)  # {"status": "pong", ...}

# 导入FBX模型
result = ue5.import_asset(
    source_path=r"D:\Assets\hero.fbx",
    dest_path="/Game/Characters/Hero"
)

if result["status"] == "success":
    print(f"✅ 导入成功: {result['asset_path']}")
```

---

## 📚 文档导航

| 文档 | 用途 | 适合人群 |
|-----|------|---------|
| **[AGENT_GUIDE.md](AGENT_GUIDE.md)** | Agent使用指南 | AI Agent / 开发者 |
| **[TECHNICAL_REFERENCE.md](TECHNICAL_REFERENCE.md)** | 技术参考文档 | 开发者 |
| **README.md** (本文档) | 快速开始 | 所有人 |

---

## 📁 项目结构

```
F:\ta_agent\
│
├── Plugins\TAAssetBridge\          # UE5 C++ 插件
│   ├── TAAssetBridge.uplugin
│   └── Source\TAAssetBridge\
│       ├── TAAssetBridge.Build.cs
│       ├── TAAssetBridge.h
│       └── TAAssetBridge.cpp
│
├── ue5_tools\                       # Agent端工具
│   ├── ue5_bridge.py               # Python桥接模块 ⭐
│   ├── AGENT_GUIDE.md              # Agent使用指南
│   ├── TECHNICAL_REFERENCE.md      # 技术参考
│   └── README.md                   # 本文档
│
└── Saved\TAAssetBridge\            # IPC通信目录（运行时）
    ├── commands.jsonl              # 命令队列
    └── results.jsonl               # 结果队列
```

---

## 🔧 核心功能

| 功能 | 状态 | 说明 |
|-----|------|------|
| 文件IPC通信 | ✅ | 通过jsonl文件交换命令/结果 |
| 资产自动导入 | ✅ | 支持FBX/OBJ/PNG/TGA/WAV等 |
| 自动覆盖 | ✅ | 已存在资产自动替换 |
| 三重验证 | ✅ | LoadObject + AssetRegistry双重验证 |
| Agent桥接 | ✅ | Python模块，开箱即用 |

---

## 💡 使用示例

### 导入角色模型

```python
from ue5_tools.ue5_bridge import UE5Bridge

ue5 = UE5Bridge(r"F:\ta_agent")

result = ue5.import_asset(
    source_path=r"D:\Assets\Characters\Hero\SK_Hero.fbx",
    dest_path="/Game/Characters/Hero",
    asset_type="skeletal_mesh"
)

print(result)
# {"status": "success", "asset_path": "/Game/Characters/Hero/SK_Hero.SK_Hero", ...}
```

### 批量导入纹理

```python
import os
from pathlib import Path

textures_dir = Path(r"D:\Assets\Textures")
ue5 = UE5Bridge(r"F:\ta_agent")

for tex_file in textures_dir.glob("*.png"):
    result = ue5.import_asset(
        source_path=str(tex_file),
        dest_path=f"/Game/Textures/{tex_file.stem}",
        asset_type="texture"
    )
    if result["status"] == "success":
        print(f"✅ {tex_file.name}")
```

---

## 🔄 工作流程

```
Agent (Python)                UE5插件 (C++)
     │                              │
     │ 1. import_asset()            │
     │                              │
     ├─→ commands.jsonl ───────────→│ 2. Ticker轮询
     │                              │
     │                              ├─→ 3. 读取命令
     │                              ├─→ 4. 执行Python API
     │                              ├─→ 5. 验证资产
     │                              │
     │←──── results.jsonl ──────────┤ 6. 写入结果
     │                              │
     │ 7. 返回结果                   │
```

---

## ⚠️ 常见问题

### Q: commands.jsonl不消失？

**A**: 检查UE5是否运行，插件是否加载。查看Output Log中的"TAAssetBridge"日志。

### Q: 返回status=partial？

**A**: 资产已导入，但验证未找到。检查Content Browser确认资产存在。

### Q: JSON解析失败？

**A**: Windows路径使用原始字符串 `r"D:\path"` 或正斜杠 `"D:/path"`。

---

## 📖 详细文档

- **Agent使用**: [AGENT_GUIDE.md](AGENT_GUIDE.md)
- **技术细节**: [TECHNICAL_REFERENCE.md](TECHNICAL_REFERENCE.md)

---

## 🎯 下一步

1. ✅ 编译UE5插件
2. ✅ 启动UE5编辑器
3. ✅ 运行Python测试代码
4. 📖 阅读 [AGENT_GUIDE.md](AGENT_GUIDE.md) 了解完整API

---

**让AI Agent自动处理资产导入，专注于创作！** 🎨
