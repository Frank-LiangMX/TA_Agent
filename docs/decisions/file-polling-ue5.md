# 决策：文件轮询式 UE5 桥接

> 日期：2026-05-10 | 状态：已采纳

## 背景

Agent 需要与 UE5 引擎通信以执行资产导入、状态检查等操作。

## 决策

采用**文件轮询**方式通信，而非 HTTP Server 或 Socket 直连。

## 理由

1. **线程安全**：UE5 的 `AssetToolsHelpers` 等 API 必须在主线程调用。HTTP Server 运行在子线程，直接调用 UE5 API 会报线程安全错误。文件通信天然在主线程执行。
2. **兼容性**：无需 UE5 插件或 C++ 开发，跨版本兼容（UE4/UE5/Unity 均可适配）
3. **崩溃安全**：命令持久化到文件，重启后可恢复

## 实现

```
Agent 写入 commands.jsonl → UE5 轮询读取 → 主线程执行 → 写入 results.jsonl → Agent 轮询读取
```
