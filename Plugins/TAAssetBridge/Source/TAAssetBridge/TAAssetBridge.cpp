// Copyright Epic Games, Inc. All Rights Reserved.

#include "TAAssetBridge.h"
#include "Framework/MultiBox/MultiBoxBuilder.h"
#include "Framework/Notifications/NotificationManager.h"
#include "Widgets/Notifications/SNotificationList.h"
#include "LevelEditor.h"
#include "Misc/Paths.h"
#include "Misc/ConfigCacheIni.h"
#include "Misc/FileHelper.h"
#include "HAL/PlatformProcess.h"
#include "Internationalization/Internationalization.h"
#include "CoreGlobals.h"
#include "Engine/World.h"
#include "Containers/Ticker.h"
#include "ToolMenus.h"
#include "Styling/AppStyle.h"
#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "Factories/Factory.h"
#include "UObject/Package.h"
#include "UObject/SavePackage.h"
#include "Modules/ModuleManager.h"
#include "Engine/StaticMesh.h"
#include "Engine/SkeletalMesh.h"
#include "Materials/MaterialInterface.h"
#include "Editor/EditorAssetLibrary.h"

#define LOCTEXT_NAMESPACE "FTAAssetBridgeModule"

void FTAAssetBridgeModule::StartupModule()
{
	// 设置默认值
	bAutoStart = true;
	StartupDelay = 5.0f;
	ServerPath = TEXT("ta_agent/ue5_server/server.py");
	bMenusRegistered = false;

	// 设置IPC文件路径（项目Saved目录下）
	FString SavedDir = FPaths::ProjectSavedDir();
	CommandsFilePath = SavedDir / TEXT("TAAssetBridge/commands.jsonl");
	ResultsFilePath = SavedDir / TEXT("TAAssetBridge/results.jsonl");
	
	// 确保目录存在
	FString IPCDir = FPaths::GetPath(CommandsFilePath);
	IPlatformFile& PlatformFile = FPlatformFileManager::Get().GetPlatformFile();
	PlatformFile.CreateDirectoryTree(*IPCDir);

	// UE5标准方式注册菜单
	UToolMenus::RegisterStartupCallback(FSimpleMulticastDelegate::FDelegate::CreateRaw(this, &FTAAssetBridgeModule::RegisterMenus));

	// 启动文件监控
	StartFileWatcher();

	UE_LOG(LogTemp, Log, TEXT("TAAssetBridge Module started. ServerPath: %s, IPC: %s"), *GetServerPath(), *CommandsFilePath);
}

void FTAAssetBridgeModule::ShutdownModule()
{
	// 停止文件监控
	StopFileWatcher();
	
	// 关闭Server进程
	StopServer();
	UE_LOG(LogTemp, Log, TEXT("TAAssetBridge Module shutdown"));
}

void FTAAssetBridgeModule::RegisterMenus()
{
	// UE5的UToolMenus方式注册菜单
	UToolMenus* ToolMenus = UToolMenus::Get();
	if (!ToolMenus) return;

	// 在Tools菜单下添加我们的插件菜单项
	UToolMenu* ToolsMenu = ToolMenus->ExtendMenu("LevelEditor.MainMenu.Tools");
	if (!ToolsMenu) return;

	// 添加我们的Section
	FToolMenuSection& Section = ToolsMenu->AddSection(
		"TAAssetBridge",
		LOCTEXT("TAAssetBridgeSection", "TA Asset Bridge")
	);

	// 启动Server按钮
	Section.AddMenuEntry(
		"StartServer",
		LOCTEXT("StartServerLabel", "Start TA Agent Server"),
		LOCTEXT("StartServerTooltip", "手动启动TA Agent Server（弹出命令行窗口）"),
		FSlateIcon(),
		FUIAction(FExecuteAction::CreateRaw(this, &FTAAssetBridgeModule::AutoStartServer))
	);

	// 停止Server按钮
	Section.AddMenuEntry(
		"StopServer",
		LOCTEXT("StopServerLabel", "Stop TA Agent Server"),
		LOCTEXT("StopServerTooltip", "停止TA Agent Server"),
		FSlateIcon(),
		FUIAction(FExecuteAction::CreateRaw(this, &FTAAssetBridgeModule::StopServer))
	);

	UE_LOG(LogTemp, Log, TEXT("TAAssetBridge: Menus registered in Tools menu"));
}

void FTAAssetBridgeModule::AutoStartServer()
{
	// 检查是否已在运行
	if (IsServerRunning())
	{
		ShowNotification(
			LOCTEXT("ServerAlreadyRunning", "TA Agent Server").ToString(),
			LOCTEXT("AlreadyRunning", "Server已在运行，无需重复启动").ToString(),
			true
		);
		return;
	}

	// 获取完整的Server路径（相对于项目目录）
	FString FullServerPath = FPaths::ProjectDir() / GetServerPath();
	FPaths::NormalizeFilename(FullServerPath);

	// 检查Server文件是否存在
	if (!FPlatformFileManager::Get().GetPlatformFile().FileExists(*FullServerPath))
	{
		ShowNotification(
			LOCTEXT("ServerError", "TA Agent Server").ToString(),
			FString::Printf(TEXT("Server文件不存在: %s"), *FullServerPath),
			false
		);
		UE_LOG(LogTemp, Error, TEXT("TAAssetBridge: Server file not found: %s"), *FullServerPath);
		return;
	}

	// 检查Python是否可用
	FString PythonExe = TEXT("python");
	FString ExecutablePath = FPlatformProcess::ExecutablePath();
	
	// 使用cmd /c start在新窗口中启动Python
	// 这将打开一个独立的命令行窗口运行server.py
	FString Params = FString::Printf(
		TEXT("/c start \"TA Agent Server\" \"%s\" \"%s\""),
		*PythonExe,
		*FullServerPath
	);

	// 或者直接创建进程（可以看到窗口）
	// 启动Python进程，显示窗口
	uint32 ProcessID = 0;
	ServerProcessHandle = FPlatformProcess::CreateProc(
		TEXT("cmd.exe"),			// 通过cmd启动
		*Params,					// /c start 打开新窗口
		false,						// 不屏蔽
		false,						// 不后台
		false,						// 不创建新窗口（我们想要窗口，所以这里传false）
		&ProcessID,					// 输出进程ID
		0,							// 优先级
		nullptr,					// 工作目录（使用当前）
		nullptr						// 环境变量
	);

	if (ServerProcessHandle.IsValid())
	{
		ShowNotification(
			LOCTEXT("ServerStarted", "TA Agent Server").ToString(),
			LOCTEXT("StartedSuccess", "Server启动成功！命令行窗口已打开").ToString(),
			true
		);
		UE_LOG(LogTemp, Log, TEXT("TAAssetBridge: Server process started, PID: %u"), ProcessID);
	}
	else
	{
		ShowNotification(
			LOCTEXT("ServerError", "TA Agent Server").ToString(),
			LOCTEXT("StartFailed", "Server启动失败，请检查Python环境").ToString(),
			false
		);
		UE_LOG(LogTemp, Error, TEXT("TAAssetBridge: Failed to start server process"));
	}
}

void FTAAssetBridgeModule::StopServer()
{
	if (!ServerProcessHandle.IsValid())
	{
		ShowNotification(
			LOCTEXT("ServerNotRunning", "TA Agent Server").ToString(),
			LOCTEXT("NotRunning", "Server未在运行").ToString(),
			true
		);
		return;
	}

	// 终止进程
	FPlatformProcess::TerminateProc(ServerProcessHandle, true);
	FPlatformProcess::CloseProc(ServerProcessHandle);
	ServerProcessHandle.Reset();

	ShowNotification(
		LOCTEXT("ServerStopped", "TA Agent Server").ToString(),
		LOCTEXT("StoppedSuccess", "Server已停止").ToString(),
		true
	);
	UE_LOG(LogTemp, Log, TEXT("TAAssetBridge: Server process stopped"));
}

FString FTAAssetBridgeModule::GetServerPath() const
{
	return ServerPath;
}

bool FTAAssetBridgeModule::IsServerRunning()
{
	// 检查进程句柄是否有效
	return ServerProcessHandle.IsValid() && 
		   FPlatformProcess::IsProcRunning(ServerProcessHandle);
}

void FTAAssetBridgeModule::ShowNotification(const FString& Title, const FString& Message, bool bIsSuccess)
{
	FNotificationInfo Info(FText::FromString(Message));
	Info.bUseLargeFont = false;
	Info.bUseThrobber = false;
	Info.FadeOutDuration = 3.0f;
	Info.ExpireDuration = 5.0f;

	// 设置图标颜色
	const FSlateBrush* Icon = bIsSuccess
		? FAppStyle::GetBrush(TEXT("MessageLog.Success"))
		: FAppStyle::GetBrush(TEXT("MessageLog.Error"));

	Info.Image = Icon;

	// 显示通知
	TSharedPtr<SNotificationItem> Notification = FSlateNotificationManager::Get().AddNotification(Info);
	if (Notification.IsValid())
	{
		Notification->SetCompletionState(bIsSuccess ? SNotificationItem::CS_Success : SNotificationItem::CS_Fail);
	}
}

#undef LOCTEXT_NAMESPACE

// ======== 文件IPC实现 ========

void FTAAssetBridgeModule::StartFileWatcher()
{
	if (FileWatcherHandle.IsValid())
	{
		return; // 已经在运行
	}

	// 注册Ticker回调，每0.1秒检查一次
	FileWatcherHandle = FTSTicker::GetCoreTicker().AddTicker(
		FTickerDelegate::CreateRaw(this, &FTAAssetBridgeModule::TickFileWatcher),
		0.1f
	);

	UE_LOG(LogTemp, Log, TEXT("TAAssetBridge: File watcher started, monitoring: %s"), *CommandsFilePath);
}

void FTAAssetBridgeModule::StopFileWatcher()
{
	if (FileWatcherHandle.IsValid())
	{
		FTSTicker::GetCoreTicker().RemoveTicker(FileWatcherHandle);
		FileWatcherHandle.Reset();
		UE_LOG(LogTemp, Log, TEXT("TAAssetBridge: File watcher stopped"));
	}
}

bool FTAAssetBridgeModule::TickFileWatcher(float DeltaTime)
{
	// 检查命令文件是否存在
	IPlatformFile& PlatformFile = FPlatformFileManager::Get().GetPlatformFile();
	if (!PlatformFile.FileExists(*CommandsFilePath))
	{
		return true; // 继续Ticker
	}

	// 读取文件内容
	FString FileContent;
	if (!FFileHelper::LoadFileToString(FileContent, *CommandsFilePath))
	{
		return true;
	}

	// 清空命令文件（处理后就删除）
	IFileManager::Get().Delete(*CommandsFilePath);

	// 按行处理JSON命令
	TArray<FString> Lines;
	FileContent.ParseIntoArrayLines(Lines);
	
	for (const FString& Line : Lines)
	{
		FString TrimmedLine = Line.TrimStartAndEnd();
		if (TrimmedLine.IsEmpty() || TrimmedLine.StartsWith(TEXT("//")))
		{
			continue;
		}
		ProcessCommand(TrimmedLine);
	}

	return true; // 继续Ticker
}

void FTAAssetBridgeModule::ProcessCommand(const FString& CommandJson)
{
	// 解析JSON
	TSharedPtr<FJsonObject> JsonObject;
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(CommandJson);
	
	if (!FJsonSerializer::Deserialize(Reader, JsonObject) || !JsonObject.IsValid())
	{
		UE_LOG(LogTemp, Warning, TEXT("TAAssetBridge: Failed to parse command JSON: %s"), *CommandJson);
		return;
	}

	// 获取命令类型
	FString CmdType = JsonObject->GetStringField(TEXT("cmd"));
	FString RequestId = JsonObject->GetStringField(TEXT("request_id"));

	UE_LOG(LogTemp, Log, TEXT("TAAssetBridge: Processing command: %s, request_id: %s"), *CmdType, *RequestId);

	if (CmdType == TEXT("import_asset"))
	{
		HandleImportAsset(JsonObject);
	}
	else if (CmdType == TEXT("ping"))
	{
		TSharedPtr<FJsonObject> Result = MakeShareable(new FJsonObject);
		Result->SetStringField(TEXT("status"), FString(TEXT("pong")));
		Result->SetStringField(TEXT("engine_version"), FString(FApp::GetBuildVersion()));
		WriteResult(RequestId, Result);
	}
	else if (CmdType == TEXT("set_material"))
	{
		HandleSetMaterial(JsonObject);
	}
	else if (CmdType == TEXT("set_nanite"))
	{
		HandleSetNanite(JsonObject);
	}
	else if (CmdType == TEXT("set_lod_group"))
	{
		HandleSetLodGroup(JsonObject);
	}
	else if (CmdType == TEXT("set_metadata"))
	{
		HandleSetMetadata(JsonObject);
	}
	else if (CmdType == TEXT("create_collision"))
	{
		HandleCreateCollision(JsonObject);
	}
	else if (CmdType == TEXT("get_asset_info"))
	{
		HandleGetAssetInfo(JsonObject);
	}
	else
	{
		// 未知命令
		TSharedPtr<FJsonObject> Result = MakeShareable(new FJsonObject);
		Result->SetStringField(TEXT("status"), FString(TEXT("error")));
		Result->SetStringField(TEXT("message"), FString::Printf(TEXT("Unknown command: %s"), *CmdType));
		WriteResult(RequestId, Result);
	}
}

void FTAAssetBridgeModule::HandleImportAsset(const TSharedPtr<FJsonObject>& CmdObj)
{
	FString RequestId = CmdObj->GetStringField(TEXT("request_id"));
	
	// 获取参数
	FString AssetType = CmdObj->GetStringField(TEXT("asset_type"));
	FString SourcePath = CmdObj->GetStringField(TEXT("source_path"));
	FString DestPath = CmdObj->GetStringField(TEXT("dest_path")); // 如: /Game/Textures/MyTexture

	UE_LOG(LogTemp, Log, TEXT("TAAssetBridge: Importing asset via Python: %s -> %s"), *SourcePath, *DestPath);

	TSharedPtr<FJsonObject> Result = MakeShareable(new FJsonObject);

	// 检查源文件是否存在
	IPlatformFile& PlatformFile = FPlatformFileManager::Get().GetPlatformFile();
	if (!PlatformFile.FileExists(*SourcePath))
	{
		Result->SetStringField(TEXT("status"), FString(TEXT("error")));
		Result->SetStringField(TEXT("message"), FString::Printf(TEXT("Source file not found: %s"), *SourcePath));
		WriteResult(RequestId, Result);
		return;
	}

	// 检查Python插件是否可用
	IModuleInterface* PythonModule = FModuleManager::Get().GetModule(TEXT("PythonScriptPlugin"));
	if (!PythonModule)
	{
		Result->SetStringField(TEXT("status"), FString(TEXT("error")));
		Result->SetStringField(TEXT("message"), FString(TEXT("Python Script Plugin is not loaded")));
		WriteResult(RequestId, Result);
		return;
	}

	// 构建Python导入命令 - 使用AssetTools正确API
	FString PythonCommand;
	
	// 将路径中的反斜杠转义
	FString EscapedSourcePath = SourcePath.Replace(TEXT("\\"), TEXT("/"));
	FString EscapedDestPath = DestPath.Replace(TEXT("\\"), TEXT("/"));
	
	// 提取目标包名和资产名
	FString DestPackageName = EscapedDestPath;
	FString AssetName = FPaths::GetBaseFilename(SourcePath);
	
	// 使用正确的UE5 Python API：AssetTools.get().import_asset_tasks()
	PythonCommand = FString::Printf(
		TEXT("import unreal; "
		"asset_tools = unreal.AssetToolsHelpers.get_asset_tools(); "
		"import_task = unreal.AssetImportTask(); "
		"import_task.set_editor_property('filename', r\"%s\"); "
		"import_task.set_editor_property('destination_path', r\"%s\"); "
		"import_task.set_editor_property('automated', True); "
		"import_task.set_editor_property('save', True); "
		"asset_tools.import_asset_tasks([import_task]); "
		"print(f\"Import completed: {import_task.get_editor_property('imported_object_paths')}\")"),
		*EscapedSourcePath,
		*EscapedDestPath
	);

	UE_LOG(LogTemp, Log, TEXT("TAAssetBridge: Executing Python: %s"), *PythonCommand);

	// 通过控制台命令执行Python
	FString ConsoleCommand = FString::Printf(TEXT("py %s"), *PythonCommand);
	GEngine->Exec(NULL, *ConsoleCommand);

	// 检查资产是否导入成功
	FString ImportedAssetPath = DestPath + TEXT(".") + FPaths::GetBaseFilename(SourcePath);
	UObject* ImportedAsset = nullptr;
	
	// 等待导入完成（骨骼网格等复杂资产需要更长时间）
	FPlatformProcess::Sleep(3.0f);
	
	// 刷新资产注册表
	IAssetRegistry* AssetRegistry = IAssetRegistry::Get();
	if (AssetRegistry)
	{
		AssetRegistry->SearchAllAssets(true);
	}
	
	// 尝试多种验证方式
	bool bImportSuccess = false;
	FString FoundAssetPath;
	
	// 方式1：直接加载
	ImportedAsset = LoadObject<UObject>(nullptr, *ImportedAssetPath);
	if (ImportedAsset)
	{
		bImportSuccess = true;
		FoundAssetPath = ImportedAssetPath;
	}
	
	// 方式2：搜索目标路径下的所有资产
	if (!bImportSuccess && AssetRegistry)
	{
		// 搜索目标包路径
		FName PackagePath = FName(*EscapedDestPath);
		TArray<FAssetData> AssetDataList;
		AssetRegistry->GetAssetsByPath(PackagePath, AssetDataList, true);
		
		if (AssetDataList.Num() > 0)
		{
			bImportSuccess = true;
			FoundAssetPath = AssetDataList[0].GetObjectPathString();
		}
	}
	
	// 方式3：搜索包含资产名的所有资产
	if (!bImportSuccess && AssetRegistry)
	{
		FARFilter Filter;
		Filter.PackagePaths.Add(FName(*EscapedDestPath));
		Filter.bRecursivePaths = true;
		TArray<FAssetData> AssetDataList;
		AssetRegistry->GetAssets(Filter, AssetDataList);
		
		if (AssetDataList.Num() > 0)
		{
			bImportSuccess = true;
			FoundAssetPath = AssetDataList[0].GetObjectPathString();
		}
	}
	
	if (bImportSuccess)
	{
		Result->SetStringField(TEXT("status"), FString(TEXT("success")));
		Result->SetStringField(TEXT("asset_path"), FoundAssetPath);
		Result->SetStringField(TEXT("asset_type"), AssetType);
		Result->SetStringField(TEXT("message"), FString::Printf(TEXT("Asset imported successfully: %s"), *FoundAssetPath));
		UE_LOG(LogTemp, Log, TEXT("TAAssetBridge: Asset imported: %s"), *FoundAssetPath);
	}
	else
	{
		Result->SetStringField(TEXT("status"), FString(TEXT("partial")));
		Result->SetStringField(TEXT("message"), FString(TEXT("Import task executed. Check UE5 Content Browser for imported assets.")));
		Result->SetStringField(TEXT("expected_path"), ImportedAssetPath);
		Result->SetStringField(TEXT("destination_folder"), EscapedDestPath);
	}

	WriteResult(RequestId, Result);
}

void FTAAssetBridgeModule::HandleSetMaterial(const TSharedPtr<FJsonObject>& CmdObj)
{
	FString RequestId = CmdObj->GetStringField(TEXT("request_id"));
	FString AssetPath = CmdObj->GetStringField(TEXT("asset_path"));
	int32 SlotIndex = CmdObj->GetIntegerField(TEXT("slot_index"));
	FString MaterialPath = CmdObj->GetStringField(TEXT("material_path"));

	TSharedPtr<FJsonObject> Result = MakeShareable(new FJsonObject);

	// 加载资产
	UObject* Asset = LoadObject<UObject>(nullptr, *AssetPath);
	if (!Asset)
	{
		Result->SetStringField(TEXT("status"), FString(TEXT("error")));
		Result->SetStringField(TEXT("message"), FString::Printf(TEXT("Asset not found: %s"), *AssetPath));
		WriteResult(RequestId, Result);
		return;
	}

	// 加载材质
	UMaterialInterface* Material = LoadObject<UMaterialInterface>(nullptr, *MaterialPath);
	if (!Material)
	{
		Result->SetStringField(TEXT("status"), FString(TEXT("error")));
		Result->SetStringField(TEXT("message"), FString::Printf(TEXT("Material not found: %s"), *MaterialPath));
		WriteResult(RequestId, Result);
		return;
	}

	// 设置材质
	UStaticMesh* StaticMesh = Cast<UStaticMesh>(Asset);
	if (StaticMesh)
	{
		if (SlotIndex >= 0 && SlotIndex < StaticMesh->GetStaticMaterials().Num())
		{
			StaticMesh->SetMaterial(SlotIndex, Material);
			StaticMesh->PostEditChange();
			Result->SetStringField(TEXT("status"), FString(TEXT("success")));
			Result->SetStringField(TEXT("message"), FString::Printf(TEXT("Material set: slot %d"), SlotIndex));
		}
		else
		{
			Result->SetStringField(TEXT("status"), FString(TEXT("error")));
			Result->SetStringField(TEXT("message"), FString::Printf(TEXT("Invalid slot index: %d (max: %d)"), SlotIndex, StaticMesh->GetStaticMaterials().Num() - 1));
		}
	}
	else
	{
		Result->SetStringField(TEXT("status"), FString(TEXT("error")));
		Result->SetStringField(TEXT("message"), FString(TEXT("Asset is not a StaticMesh")));
	}

	WriteResult(RequestId, Result);
}

void FTAAssetBridgeModule::HandleSetNanite(const TSharedPtr<FJsonObject>& CmdObj)
{
	FString RequestId = CmdObj->GetStringField(TEXT("request_id"));
	FString AssetPath = CmdObj->GetStringField(TEXT("asset_path"));
	bool bEnabled = CmdObj->GetBoolField(TEXT("enabled"));

	TSharedPtr<FJsonObject> Result = MakeShareable(new FJsonObject);

	UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *AssetPath);
	if (!Mesh)
	{
		Result->SetStringField(TEXT("status"), FString(TEXT("error")));
		Result->SetStringField(TEXT("message"), FString::Printf(TEXT("Mesh not found: %s"), *AssetPath));
		WriteResult(RequestId, Result);
		return;
	}

	// 设置 Nanite
	Mesh->NaniteSettings.bEnabled = bEnabled;
	if (CmdObj->HasField(TEXT("fallback_percent")))
	{
		Mesh->NaniteSettings.FallbackPercent = CmdObj->GetNumberField(TEXT("fallback_percent"));
	}
	if (CmdObj->HasField(TEXT("position_precision")))
	{
		Mesh->NaniteSettings.PositionPrecision = CmdObj->GetIntegerField(TEXT("position_precision"));
	}
	Mesh->PostEditChange();
	Mesh->Build();

	Result->SetStringField(TEXT("status"), FString(TEXT("success")));
	Result->SetStringField(TEXT("message"), FString::Printf(TEXT("Nanite %s for %s"), bEnabled ? TEXT("enabled") : TEXT("disabled"), *AssetPath));
	WriteResult(RequestId, Result);
}

void FTAAssetBridgeModule::HandleSetLodGroup(const TSharedPtr<FJsonObject>& CmdObj)
{
	FString RequestId = CmdObj->GetStringField(TEXT("request_id"));
	FString AssetPath = CmdObj->GetStringField(TEXT("asset_path"));
	FString LodGroup = CmdObj->GetStringField(TEXT("lod_group"));

	TSharedPtr<FJsonObject> Result = MakeShareable(new FJsonObject);

	UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *AssetPath);
	if (!Mesh)
	{
		Result->SetStringField(TEXT("status"), FString(TEXT("error")));
		Result->SetStringField(TEXT("message"), FString::Printf(TEXT("Mesh not found: %s"), *AssetPath));
		WriteResult(RequestId, Result);
		return;
	}

	Mesh->LODGroup = FName(*LodGroup);
	Mesh->PostEditChange();

	Result->SetStringField(TEXT("status"), FString(TEXT("success")));
	Result->SetStringField(TEXT("message"), FString::Printf(TEXT("LOD group set to: %s"), *LodGroup));
	WriteResult(RequestId, Result);
}

void FTAAssetBridgeModule::HandleSetMetadata(const TSharedPtr<FJsonObject>& CmdObj)
{
	FString RequestId = CmdObj->GetStringField(TEXT("request_id"));
	FString AssetPath = CmdObj->GetStringField(TEXT("asset_path"));
	const TSharedPtr<FJsonObject>* TagsObj;
	FString PackagePath = AssetPath;

	// 提取包路径
	if (AssetPath.Contains(TEXT(".")))
	{
		PackagePath = AssetPath.Left(AssetPath.Find(TEXT(".")));
	}

	TSharedPtr<FJsonObject> Result = MakeShareable(new FJsonObject);

	if (!CmdObj->TryGetObjectField(TEXT("tags"), TagsObj))
	{
		Result->SetStringField(TEXT("status"), FString(TEXT("error")));
		Result->SetStringField(TEXT("message"), FString(TEXT("Missing 'tags' field")));
		WriteResult(RequestId, Result);
		return;
	}

	// 设置元数据
	for (const auto& Pair : (*TagsObj)->Values)
	{
		FString Key = Pair.Key;
		FString Value;
		if (Pair.Value->TryGetString(Value))
		{
			FEditorAssetLibrary::SetMetadataTag(PackagePath, Key, Value);
		}
	}

	FEditorAssetLibrary::SaveAsset(PackagePath, false);

	Result->SetStringField(TEXT("status"), FString(TEXT("success")));
	Result->SetStringField(TEXT("message"), FString::Printf(TEXT("Metadata set for %s"), *PackagePath));
	WriteResult(RequestId, Result);
}

void FTAAssetBridgeModule::HandleCreateCollision(const TSharedPtr<FJsonObject>& CmdObj)
{
	FString RequestId = CmdObj->GetStringField(TEXT("request_id"));
	FString AssetPath = CmdObj->GetStringField(TEXT("asset_path"));
	FString CollisionType = CmdObj->GetStringField(TEXT("collision_type"));

	TSharedPtr<FJsonObject> Result = MakeShareable(new FJsonObject);

	UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *AssetPath);
	if (!Mesh)
	{
		Result->SetStringField(TEXT("status"), FString(TEXT("error")));
		Result->SetStringField(TEXT("message"), FString::Printf(TEXT("Mesh not found: %s"), *AssetPath));
		WriteResult(RequestId, Result);
		return;
	}

	// 通过 Python 命令生成碰撞体
	FString PythonCmd;
	if (CollisionType == TEXT("box"))
	{
		PythonCmd = FString::Printf(
			TEXT("import unreal; mesh = unreal.load_object(None, '%s'); "
			"editor_mesh = unreal.EditorStaticMeshLibrary; "
			"editor_mesh.add_box_collision(mesh); "
			"print('Box collision created')"),
			*AssetPath);
	}
	else if (CollisionType == TEXT("sphere"))
	{
		PythonCmd = FString::Printf(
			TEXT("import unreal; mesh = unreal.load_object(None, '%s'); "
			"editor_mesh = unreal.EditorStaticMeshLibrary; "
			"editor_mesh.add_sphere_collision(mesh); "
			"print('Sphere collision created')"),
			*AssetPath);
	}
	else if (CollisionType == TEXT("convex"))
	{
		PythonCmd = FString::Printf(
			TEXT("import unreal; mesh = unreal.load_object(None, '%s'); "
			"editor_mesh = unreal.EditorStaticMeshLibrary; "
			"editor_mesh.add_convex_collision(mesh); "
			"print('Convex collision created')"),
			*AssetPath);
	}
	else
	{
		Result->SetStringField(TEXT("status"), FString(TEXT("error")));
		Result->SetStringField(TEXT("message"), FString::Printf(TEXT("Unknown collision type: %s"), *CollisionType));
		WriteResult(RequestId, Result);
		return;
	}

	GEngine->Exec(NULL, *FString::Printf(TEXT("py %s"), *PythonCmd));

	Result->SetStringField(TEXT("status"), FString(TEXT("success")));
	Result->SetStringField(TEXT("message"), FString::Printf(TEXT("Collision (%s) created for %s"), *CollisionType, *AssetPath));
	WriteResult(RequestId, Result);
}

void FTAAssetBridgeModule::HandleGetAssetInfo(const TSharedPtr<FJsonObject>& CmdObj)
{
	FString RequestId = CmdObj->GetStringField(TEXT("request_id"));
	FString AssetPath = CmdObj->GetStringField(TEXT("asset_path"));

	TSharedPtr<FJsonObject> Result = MakeShareable(new FJsonObject);

	UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *AssetPath);
	if (Mesh)
	{
		Result->SetStringField(TEXT("status"), FString(TEXT("success")));
		Result->SetStringField(TEXT("asset_type"), FString(TEXT("static_mesh")));
		Result->SetNumberField(TEXT("tri_count"), Mesh->GetNumTriangles(0));
		Result->SetNumberField(TEXT("lod_count"), Mesh->GetNumLODs());
		Result->SetBoolField(TEXT("nanite_enabled"), Mesh->NaniteSettings.bEnabled);
		Result->SetStringField(TEXT("lod_group"), Mesh->LODGroup.ToString());

		// 材质列表
		TArray<TSharedPtr<FJsonValue>> Materials;
		for (const FStaticMaterial& Mat : Mesh->GetStaticMaterials())
		{
			if (Mat.MaterialInterface)
			{
				Materials.Add(MakeShareable(new FJsonValueString(Mat.MaterialInterface->GetName())));
			}
		}
		Result->SetArrayField(TEXT("materials"), Materials);
	}
	else
	{
		// 尝试骨骼网格
		USkeletalMesh* SkelMesh = LoadObject<USkeletalMesh>(nullptr, *AssetPath);
		if (SkelMesh)
		{
			Result->SetStringField(TEXT("status"), FString(TEXT("success")));
			Result->SetStringField(TEXT("asset_type"), FString(TEXT("skeletal_mesh")));
			Result->SetNumberField(TEXT("bone_count"), SkelMesh->GetRefSkeleton().GetNum());
		}
		else
		{
			Result->SetStringField(TEXT("status"), FString(TEXT("error")));
			Result->SetStringField(TEXT("message"), FString::Printf(TEXT("Asset not found: %s"), *AssetPath));
		}
	}

	WriteResult(RequestId, Result);
}

void FTAAssetBridgeModule::WriteResult(const FString& RequestId, const TSharedPtr<FJsonObject>& ResultObj)
{
	// 添加request_id和时间戳
	ResultObj->SetStringField(TEXT("request_id"), RequestId);
	ResultObj->SetStringField(TEXT("timestamp"), FDateTime::Now().ToString());

	// 序列化为单行JSON（使用压缩策略，避免多行导致Python端解析失败）
	FString OutputJson;
	TSharedRef<TJsonWriter<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>> Writer =
		TJsonWriterFactory<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>::Create(&OutputJson);
	FJsonSerializer::Serialize(ResultObj.ToSharedRef(), Writer);

	// 追加写入结果文件（单行JSON + 换行）
	FString Line = OutputJson + TEXT("\n");
	
	// 确保目录存在
	FString ResultDir = FPaths::GetPath(ResultsFilePath);
	IPlatformFile& PlatformFile = FPlatformFileManager::Get().GetPlatformFile();
	PlatformFile.CreateDirectoryTree(*ResultDir);

	if (FFileHelper::SaveStringToFile(Line, *ResultsFilePath, FFileHelper::EEncodingOptions::AutoDetect, &IFileManager::Get(), FILEWRITE_Append))
	{
		UE_LOG(LogTemp, Log, TEXT("TAAssetBridge: Result written: %s"), *RequestId);
	}
	else
	{
		UE_LOG(LogTemp, Error, TEXT("TAAssetBridge: Failed to write result to: %s"), *ResultsFilePath);
	}
}

IMPLEMENT_MODULE(FTAAssetBridgeModule, TAAssetBridge)
