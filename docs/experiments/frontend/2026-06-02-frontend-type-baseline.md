# 前端类型基线整理

> 日期：2026-06-02  
> 范围：Web 前端 TypeScript 基线、Electron preload API 声明

## 背景

`npm run typecheck` 当前存在多类错误，其中一大类来自 Electron preload 暴露的 `window.electronAPI` 类型声明不完整。部分设置组件又在本地重复声明 `Window.electronAPI`，导致 TypeScript 只识别到局部的 `wechat` 子对象，进而把 `isElectron`、窗口控制、配置、目录选择等真实存在的 API 判断为不存在。

## 本轮目标

- 先消除 Electron API 声明噪音，让后续 typecheck 结果更接近真实前端问题。
- 保留现有运行时行为，不改 preload、不改 IPC 通道、不重构 UI。
- 避免用 `as any` 掩盖问题；优先让声明与 `apps/desktop/preload.js` 对齐。

## 处理记录

- 将 `src/types/electron-api.d.ts` 作为唯一 Electron preload API 声明入口。
- 补齐 `platform`、配置读写、窗口控制、文件/目录对话框、更新器、微信 Bridge 等 API 类型。
- 删除 `WeChatSettings.tsx` 内部的重复 `declare global`，避免局部声明覆盖完整 API 形状。

## 后续分层

Electron 声明收敛后，剩余 typecheck 错误按以下优先级处理：

1. `DetailPanel.tsx`：资产详情数据从 `unknown` / `{}` 收口为宽松但明确的展示类型。
2. `services/websocket.ts`：统一 RPC reject 错误类型和事件回调类型。
3. 其他组件：清理隐式 `any`、`null`/`undefined` 传参、少量 prop 类型不匹配。

## 验证方式

```bash
cd apps/web
npm run typecheck
```

## 验证结果

2026-06-02 本轮整理后，`npm run typecheck` 已通过。

