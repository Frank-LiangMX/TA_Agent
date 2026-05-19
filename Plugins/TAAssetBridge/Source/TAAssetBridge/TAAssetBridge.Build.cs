// Copyright Epic Games, Inc. All Rights Reserved.

using UnrealBuildTool;

public class TAAssetBridge : ModuleRules
{
	public TAAssetBridge(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		
		// 公共依赖
		PublicDependencyModuleNames.AddRange(new string[] {
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"PythonScriptPlugin",
			"EditorScriptingUtilities",
			"ToolMenus",			// UE5菜单系统
		});
		
		// 私有依赖
		PrivateDependencyModuleNames.AddRange(new string[] {
			"Slate",
			"SlateCore",
			"EditorStyle",
			"UnrealEd",
			"MainFrame",			// 编辑器主窗口
			"AssetTools",			// IAssetTools::ImportAssetTasks
			"AssetRegistry",		// 资产注册表
			"Json",					// FJsonObject序列化
			"JsonUtilities",		// FJsonObjectConverter
		});
	}
}
