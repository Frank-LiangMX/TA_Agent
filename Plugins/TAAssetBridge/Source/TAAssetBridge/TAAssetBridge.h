// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"

class FMenuBuilder;

class FTAAssetBridgeModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;
	
private:
	void AutoStartServer();
	void StopServer();
	FString GetServerPath() const;
	bool IsServerRunning();
	void ShowNotification(const FString& Title, const FString& Message, bool bIsSuccess = true);

	/** 菜单注册 */
	void RegisterMenus();

	// ======== 文件IPC导入 ========
	/** 启动文件监控（Ticker轮询commands.jsonl） */
	void StartFileWatcher();
	void StopFileWatcher();

	/** Ticker回调：检查并处理命令 */
	bool TickFileWatcher(float DeltaTime);

	/** 处理一条JSON命令 */
	void ProcessCommand(const FString& CommandJson);

	/** 处理导入资产命令 */
	void HandleImportAsset(const TSharedPtr<FJsonObject>& CmdObj);

	/** 处理材质设置 */
	void HandleSetMaterial(const TSharedPtr<FJsonObject>& CmdObj);

	/** 处理 Nanite 设置 */
	void HandleSetNanite(const TSharedPtr<FJsonObject>& CmdObj);

	/** 处理 LOD 组设置 */
	void HandleSetLodGroup(const TSharedPtr<FJsonObject>& CmdObj);

	/** 处理元数据设置 */
	void HandleSetMetadata(const TSharedPtr<FJsonObject>& CmdObj);

	/** 处理碰撞体生成 */
	void HandleCreateCollision(const TSharedPtr<FJsonObject>& CmdObj);

	/** 处理资产信息查询 */
	void HandleGetAssetInfo(const TSharedPtr<FJsonObject>& CmdObj);

	/** 写入结果到results.jsonl */
	void WriteResult(const FString& RequestId, const TSharedPtr<FJsonObject>& ResultObj);

private:
	FString ServerPath;
	bool bAutoStart;
	float StartupDelay;
	bool bMenusRegistered;

	/** Server进程句柄 */
	FProcHandle ServerProcessHandle;

	// ======== 文件IPC ========
	/** 命令文件路径 */
	FString CommandsFilePath;
	FString ResultsFilePath;

	/** Ticker句柄 */
	FTSTicker::FDelegateHandle FileWatcherHandle;
};
