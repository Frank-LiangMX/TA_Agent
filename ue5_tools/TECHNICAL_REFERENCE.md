# TA Asset Bridge - 技术参考

> UE5插件 + Agent桥接 完整技术文档

---

## 📁 文件结构

```
F:\ta_agent\
│
├── Plugins\TAAssetBridge\              # UE5 C++ 插件
│   ├── TAAssetBridge.uplugin           # 插件描述文件
│   ├── Resources\                      # 插件资源
│   │   └── Icon128.png
│   └── Source\TAAssetBridge\
│       ├── TAAssetBridge.Build.cs      # 构建配置
│       ├── TAAssetBridge.h             # 头文件
│       └── TAAssetBridge.cpp           # 实现文件（516行）
│
├── ue5_tools\                          # Agent端工具
│   ├── ue5_bridge.py                   # Python桥接模块
│   ├── AGENT_GUIDE.md                  # Agent使用指南
│   ├── TECHNICAL_REFERENCE.md          # 本文档
│   └── README.md                       # 快速开始
│
└── Saved\TAAssetBridge\                # IPC通信目录（运行时生成）
    ├── commands.jsonl                  # 命令队列
    └── results.jsonl                   # 结果队列
```

---

## 🔧 UE5 C++ 插件

### 插件信息

| 属性 | 值 |
|-----|---|
| 名称 | TA Asset Bridge |
| 版本 | 1.0.0 |
| 类型 | Editor |
| 平台 | Win64 |
| 依赖 | PythonScriptPlugin, EditorScriptingUtilities |

### 核心类

```cpp
class FTAAssetBridgeModule : public IModuleInterface
{
public:
    virtual void StartupModule() override;
    virtual void ShutdownModule() override;
    
private:
    // Server管理（可选）
    void AutoStartServer();
    void StopServer();
    bool IsServerRunning();
    
    // 文件IPC
    void StartFileWatcher();           // 启动Ticker轮询
    void StopFileWatcher();
    bool TickFileWatcher(float DeltaTime);  // 0.1秒轮询
    
    void ProcessCommand(const FString& Json);  // 处理命令
    void HandleImportAsset(const TSharedPtr<FJsonObject>& Cmd);
    void WriteResult(const FString& RequestId, const TSharedPtr<FJsonObject>& Result);
    
    // 成员变量
    FString CommandsFilePath;          // commands.jsonl路径
    FString ResultsFilePath;           // results.jsonl路径
    FTSTicker::FDelegateHandle FileWatcherHandle;
};
```

### 依赖模块

```csharp
// TAAssetBridge.Build.cs
PublicDependencyModuleNames.AddRange(new string[] {
    "Core", "CoreUObject", "Engine", "InputCore",
    "PythonScriptPlugin",      // Python执行
    "EditorScriptingUtilities", // 编辑器脚本
    "ToolMenus"                // UE5菜单
});

PrivateDependencyModuleNames.AddRange(new string[] {
    "Slate", "SlateCore", "EditorStyle", "UnrealEd",
    "MainFrame",               // 编辑器窗口
    "AssetTools",              // 资产导入API
    "AssetRegistry",           // 资产验证
    "Json", "JsonUtilities"    // JSON处理
});
```

### 关键实现

#### 1. 文件监控（Ticker轮询）

```cpp
void FTAAssetBridgeModule::StartFileWatcher()
{
    FileWatcherHandle = FTSTicker::GetCoreTicker().AddTicker(
        FTickerDelegate::CreateRaw(this, &FTAAssetBridgeModule::TickFileWatcher),
        0.1f  // 每0.1秒检查一次
    );
}

bool FTAAssetBridgeModule::TickFileWatcher(float DeltaTime)
{
    if (FPlatformFileManager::Get().GetPlatformFile().FileExists(*CommandsFilePath))
    {
        FString FileContent;
        FFileHelper::LoadFileToString(FileContent, *CommandsFilePath);
        IFileManager::Get().Delete(*CommandsFilePath);  // 处理后删除
        
        TArray<FString> Lines;
        FileContent.ParseIntoArrayLines(Lines);
        for (const FString& Line : Lines)
        {
            ProcessCommand(Line);
        }
    }
    return true;  // 继续Ticker
}
```

#### 2. 资产导入（Python API）

```cpp
void FTAAssetBridgeModule::HandleImportAsset(const TSharedPtr<FJsonObject>& CmdObj)
{
    FString SourcePath = CmdObj->GetStringField(TEXT("source_path"));
    FString DestPath = CmdObj->GetStringField(TEXT("dest_path"));
    
    // 构建Python命令
    FString PythonCommand = FString::Printf(
        TEXT("import unreal; "
        "asset_tools = unreal.AssetToolsHelpers.get_asset_tools(); "
        "import_task = unreal.AssetImportTask(); "
        "import_task.set_editor_property('filename', r\"%s\"); "
        "import_task.set_editor_property('destination_path', r\"%s\"); "
        "import_task.set_editor_property('automated', True); "  // 跳过确认对话框
        "import_task.set_editor_property('save', True); "
        "asset_tools.import_asset_tasks([import_task]);"),
        *SourcePath, *DestPath
    );
    
    // 执行Python
    GEngine->Exec(NULL, *FString::Printf(TEXT("py %s"), *PythonCommand));
    
    // 三重验证...
}
```

#### 3. 三重验证机制

```cpp
// 方式1：直接加载
ImportedAsset = LoadObject<UObject>(nullptr, *ImportedAssetPath);

// 方式2：按路径搜索
IAssetRegistry* AssetRegistry = IAssetRegistry::Get();
TArray<FAssetData> AssetDataList;
AssetRegistry->GetAssetsByPath(FName(*DestPath), AssetDataList, true);

// 方式3：按过滤器搜索
FARFilter Filter;
Filter.PackagePaths.Add(FName(*DestPath));
Filter.bRecursivePaths = true;
AssetRegistry->GetAssets(Filter, AssetDataList);
```

---

## 🐍 Agent Python桥接

### UE5Bridge类

```python
class UE5Bridge:
    """
    UE5资产导入桥接
    
    通过文件IPC与UE5插件通信：
    - 写入命令到 commands.jsonl
    - 从 results.jsonl 读取结果
    """
    
    def __init__(self, project_path: str, timeout: float = 30.0):
        """
        Args:
            project_path: UE5项目根目录
            timeout: 等待响应超时（秒）
        """
        
    def ping(self) -> dict:
        """测试连接，返回pong"""
        
    def import_asset(
        self,
        source_path: str,
        dest_path: str,
        asset_type: str = "",
        request_id: str = None
    ) -> dict:
        """
        导入资产到UE5
        
        Args:
            source_path: 源文件绝对路径
            dest_path: UE5目标路径（如 /Game/Characters/Hero）
            asset_type: 资产类型标识（可选）
            request_id: 请求ID（可选）
            
        Returns:
            {
                "status": "success" | "partial" | "error",
                "asset_path": "...",  # 成功时
                "message": "...",     # 错误信息
                "request_id": "...",
                "timestamp": "..."
            }
        """
        
    def send_command(self, command: dict) -> dict:
        """发送自定义命令"""
```

### IPC协议

#### 命令格式 (commands.jsonl)

```json
{
    "cmd": "import_asset",
    "source_path": "D:/Assets/model.fbx",
    "dest_path": "/Game/Models/Model",
    "asset_type": "static_mesh",
    "request_id": "import_001"
}
```

#### 响应格式 (results.jsonl)

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

### 实现细节

```python
def import_asset(self, source_path, dest_path, asset_type="", request_id=None):
    # 1. 生成请求ID
    request_id = request_id or f"import_{int(time.time() * 1000)}"
    
    # 2. 构建命令
    command = {
        "cmd": "import_asset",
        "source_path": source_path.replace("\\", "/"),  # 统一使用正斜杠
        "dest_path": dest_path,
        "asset_type": asset_type,
        "request_id": request_id
    }
    
    # 3. 写入commands.jsonl
    with open(self.commands_file, 'w', encoding='utf-8') as f:
        f.write(json.dumps(command, ensure_ascii=False) + '\n')
    
    # 4. 轮询results.jsonl等待响应
    start_time = time.time()
    while time.time() - start_time < self.timeout:
        if os.path.exists(self.results_file):
            with open(self.results_file, 'r', encoding='utf-8') as f:
                for line in f:
                    result = json.loads(line)
                    if result.get("request_id") == request_id:
                        return result
        time.sleep(0.1)
    
    raise TimeoutError(f"Timeout waiting for response: {request_id}")
```

---

## 📊 数据流

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent (Python)                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ ue5_bridge.py                                         │  │
│  │                                                        │  │
│  │  import_asset(source, dest)                           │  │
│  │       ↓                                                │  │
│  │  构建JSON命令                                          │  │
│  │       ↓                                                │  │
│  │  写入 commands.jsonl                                   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓
                   commands.jsonl
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   UE5 Plugin (C++)                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ TAAssetBridge.cpp                                     │  │
│  │                                                        │  │
│  │  Ticker (0.1s) → 检测 commands.jsonl                  │  │
│  │       ↓                                                │  │
│  │  读取JSON → 解析命令                                   │  │
│  │       ↓                                                │  │
│  │  删除 commands.jsonl                                   │  │
│  │       ↓                                                │  │
│  │  执行 Python API:                                      │  │
│  │    AssetTools.import_asset_tasks()                    │  │
│  │       ↓                                                │  │
│  │  三重验证:                                             │  │
│  │    LoadObject → GetAssetsByPath → GetAssets           │  │
│  │       ↓                                                │  │
│  │  写入 results.jsonl                                    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓
                   results.jsonl
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                     Agent (Python)                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ ue5_bridge.py                                         │  │
│  │                                                        │  │
│  │  轮询 results.jsonl (匹配request_id)                   │  │
│  │       ↓                                                │  │
│  │  返回结果给调用者                                       │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## ⚙️ 配置参数

### UE5插件

| 参数 | 默认值 | 说明 |
|-----|-------|------|
| 轮询间隔 | 0.1秒 | Ticker检查频率 |
| IPC目录 | Saved/TAAssetBridge/ | 通信文件位置 |
| Server路径 | ta_agent/ue5_server/server.py | 可选Server |

### Agent桥接

| 参数 | 默认值 | 说明 |
|-----|-------|------|
| timeout | 30秒 | 等待响应超时 |
| 轮询间隔 | 0.1秒 | 检查results频率 |

---

## 🔍 调试指南

### UE5端调试

1. **Output Log**
   ```
   筛选: LogTemp
   关键字: TAAssetBridge
   ```

2. **日志级别**
   ```cpp
   UE_LOG(LogTemp, Log, TEXT("..."));     // 正常
   UE_LOG(LogTemp, Warning, TEXT("...")); // 警告
   UE_LOG(LogTemp, Error, TEXT("..."));   // 错误
   ```

3. **断点位置**
   - `TickFileWatcher()` - 文件监控
   - `ProcessCommand()` - 命令处理
   - `HandleImportAsset()` - 资产导入
   - `WriteResult()` - 结果写入

### Agent端调试

```python
import logging

# 启用调试日志
logging.basicConfig(level=logging.DEBUG)

# 手动检查IPC文件
ue5 = UE5Bridge(r"F:\ta_agent")
print(f"Commands: {ue5.commands_file}")
print(f"Results: {ue5.results_file}")

# 检查文件是否存在
import os
print(f"Commands exists: {os.path.exists(ue5.commands_file)}")
print(f"Results exists: {os.path.exists(ue5.results_file)}")
```

---

## 🚀 性能优化

### 批量导入

```python
# 推荐：顺序导入（避免并发冲突）
for source, dest in assets:
    result = ue5.import_asset(source, dest)
```

### 大文件处理

```python
# 增加超时时间
result = ue5.import_asset(
    source_path=large_fbx,
    dest_path="/Game/LargeAsset",
    timeout=120.0  # 2分钟
)
```

---

## 📝 扩展开发

### 添加新命令

1. **UE5端** (TAAssetBridge.cpp)
```cpp
void FTAAssetBridgeModule::ProcessCommand(const FString& CommandJson)
{
    // ...
    if (CmdType == TEXT("import_asset"))
    {
        HandleImportAsset(JsonObject);
    }
    else if (CmdType == TEXT("your_new_command"))  // 新增
    {
        HandleYourNewCommand(JsonObject);
    }
}
```

2. **Agent端** (ue5_bridge.py)
```python
def your_new_command(self, param1, param2):
    return self.send_command({
        "cmd": "your_new_command",
        "param1": param1,
        "param2": param2
    })
```

---

## 📚 相关文档

- [AGENT_GUIDE.md](AGENT_GUIDE.md) - Agent使用指南
- [README.md](README.md) - 快速开始
- [UE5 Python API文档](https://docs.unrealengine.com/5.0/en-US/PythonAPI/)

---

**技术支持**: 检查UE5 Output Log中的 "TAAssetBridge" 日志
