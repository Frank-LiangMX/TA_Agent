# UE 插件 MCP 化指南

> 让你的 UE 编辑器插件支持 MCP 协议，供 Agent 调用

---

## 一、什么是 MCP

MCP（Model Context Protocol）是 AI Agent 调用外部工具的标准协议。

```
你的插件实现 MCP Server
    ↓
任何 Agent 都能调用（TA Agent、开发 Agent、其他 AI 工具）
```

## 二、实现步骤

```
步骤 1：定义工具（你的插件能做什么）
步骤 2：实现 MCP Server（处理请求）
步骤 3：注册工具（告诉 Agent 有哪些工具）
步骤 4：测试（验证能被 Agent 调用）
```

## 三、MCP 协议核心

### 3.1 工具定义格式

每个工具需要定义：

```json
{
  "name": "tool_name",
  "description": "工具描述，Agent 根据这个理解工具用途",
  "inputSchema": {
    "type": "object",
    "properties": {
      "param1": {
        "type": "string",
        "description": "参数说明"
      }
    },
    "required": ["param1"]
  }
}
```

### 3.2 请求/响应格式

```
Agent 发送请求：
{
  "method": "tools/call",
  "params": {
    "name": "tool_name",
    "arguments": { "param1": "value" }
  }
}

插件返回响应：
{
  "content": [
    { "type": "text", "text": "执行结果" }
  ]
}
```

## 四、代码实现模板

### 4.1 头文件

```cpp
// MyPluginMcpServer.h

#pragma once

#include "CoreMinimal.h"
#include "HttpServerRequest.h"

class FMyPluginMcpServer
{
public:
    void Start(int32 Port = 7777);
    void Stop();

private:
    // HTTP 请求处理
    FHttpServerResponse HandleRequest(const FHttpServerRequest& Request);

    // MCP 协议处理
    TSharedPtr<FJsonObject> HandleListTools();
    TSharedPtr<FJsonObject> HandleCallTool(const TSharedPtr<FJsonObject>& Request);

    // 你的工具实现
    TSharedPtr<FJsonObject> ToolCreateMaterialInstance(const TSharedPtr<FJsonObject>& Args);
    TSharedPtr<FJsonObject> ToolBatchCreate(const TSharedPtr<FJsonObject>& Args);

    TSharedPtr<IHttpServer> HttpServer;
};
```

### 4.2 实现文件

```cpp
// MyPluginMcpServer.cpp

#include "MyPluginMcpServer.h"
#include "HttpServerModule.h"
#include "Serialization/JsonSerializer.h"

void FMyPluginMcpServer::Start(int32 Port)
{
    HttpServer = FHttpServerModule::Get().GetHttpServer(Port);

    // MCP 标准端点
    HttpServer->BindRoute("/mcp", EHttpServerRequestVerbs::VERB_POST,
        [this](FHttpServerRequest& Req) { return HandleRequest(Req); });

    HttpServer->Start();
}

FHttpServerResponse FMyPluginMcpServer::HandleRequest(const FHttpServerRequest& Request)
{
    TSharedPtr<FJsonObject> Body;
    TJsonReaderFactory<>::Create(Request.Body);

    FString Method = Body->GetStringField("method");

    TSharedPtr<FJsonObject> Result;
    if (Method == "tools/list")
    {
        Result = HandleListTools();
    }
    else if (Method == "tools/call")
    {
        Result = HandleCallTool(Body);
    }

    return JsonResponse(Result);
}

TSharedPtr<FJsonObject> FMyPluginMcpServer::HandleListTools()
{
    TArray<TSharedPtr<FJsonValue>> Tools;

    // 工具 1：创建材质实例
    TSharedPtr<FJsonObject> Tool1 = MakeShared<FJsonObject>();
    Tool1->SetStringField("name", "create_material_instance");
    Tool1->SetStringField("description", "创建材质实例");

    TSharedPtr<FJsonObject> Schema1 = MakeShared<FJsonObject>();
    Schema1->SetStringField("type", "object");
    // ... 定义参数
    Tool1->SetObjectField("inputSchema", Schema1);

    Tools.Add(MakeShared<FJsonValueObject>(Tool1));

    // 工具 2：批量创建
    // ...

    TSharedPtr<FJsonObject> Response = MakeShared<FJsonObject>();
    Response->SetArrayField("tools", Tools);
    return Response;
}

TSharedPtr<FJsonObject> FMyPluginMcpServer::HandleCallTool(const TSharedPtr<FJsonObject>& Request)
{
    TSharedPtr<FJsonObject> Params = Request->GetObjectField("params");
    FString ToolName = Params->GetStringField("name");
    TSharedPtr<FJsonObject> Args = Params->GetObjectField("arguments");

    TSharedPtr<FJsonObject> Result;
    if (ToolName == "create_material_instance")
    {
        Result = ToolCreateMaterialInstance(Args);
    }
    else if (ToolName == "batch_create")
    {
        Result = ToolBatchCreate(Args);
    }

    return Result;
}

TSharedPtr<FJsonObject> FMyPluginMcpServer::ToolCreateMaterialInstance(const TSharedPtr<FJsonObject>& Args)
{
    FString ParentMaterial = Args->GetStringField("parent_material");
    FString InstanceName = Args->GetStringField("instance_name");
    FString OutputFolder = Args->GetStringField("output_folder");

    // 调用你现有的功能
    bool bSuccess = FMaterialInstanceFactory::CreateMaterialInstance(...);

    TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
    TArray<TSharedPtr<FJsonValue>> Content;
    Content.Add(MakeShared<FJsonValueString>(bSuccess ? "创建成功" : "创建失败"));
    Result->SetArrayField("content", Content);

    return Result;
}
```

## 五、与插件集成

```cpp
// MyPlugin.cpp

void FMyPluginModule::StartupModule()
{
    // 现有代码
    RegisterMenus();

    // 新增：启动 MCP Server
    McpServer = MakeShared<FMyPluginMcpServer>();
    McpServer->Start(7777);
}

void FMyPluginModule::ShutdownModule()
{
    McpServer->Stop();
}
```

## 六、Agent 配置

在项目根目录的 `mcp.json` 中添加：

```json
{
  "servers": {
    "ue-my-plugin": {
      "type": "stdio",
      "command": "path/to/your/mcp-server.exe",
      "args": [],
      "enabled": true
    }
  }
}
```

## 七、测试

### 7.1 手动测试

```bash
# 启动 UE 项目
# 确认 MCP Server 运行在 7777 端口

# 测试工具列表
curl -X POST http://localhost:7777/mcp \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/list"}'

# 测试调用工具
curl -X POST http://localhost:7777/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "create_material_instance",
      "arguments": {
        "parent_material": "/Game/Materials/M_Master",
        "instance_name": "M_Instance_01"
      }
    }
  }'
```

### 7.2 Agent 测试

```
1. 启动 UE 项目（MCP Server 自动启动）
2. 启动 TAgent
3. 输入"创建材质实例 M_Hero_01"
4. 观察 Agent 是否正确调用
```

## 八、注意事项

| 项目 | 说明 |
|------|------|
| 线程安全 | UE 主线程执行，避免跨线程问题 |
| 端口冲突 | 每个插件用不同端口，或统一端口管理 |
| 错误处理 | 返回清晰的错误信息，方便 Agent 理解 |
| 工具描述 | 写清楚，Agent 靠这个理解工具用途 |

## 九、参考实现

- MaterialInstanceCreator 插件（示例）
- TA Agent 的 TAAssetBridge（文件 IPC 方式，可参考但不推荐）
