/**
 * TAgent Web 入口
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initTheme } from './atoms/theme'
import './styles/globals.css'

// Electron 渲染进程下，@react-refresh 的 preamble inline script 在某些时序下
// 还没注入到 window，子模块加载时会抛 "can't detect preamble"。
// 这里强制设置 noop 兜底（Vite dev 启动时 main.tsx 是第一个模块，所以一定在
// 任何 navGroups.tsx 等子模块之前执行）。
declare global {
  interface Window {
    $RefreshReg$?: () => void
    $RefreshSig$?: (type: unknown) => unknown
  }
}
if (typeof window !== 'undefined') {
  if (!window.$RefreshReg$) {
    window.$RefreshReg$ = () => {}
    window.$RefreshSig$ = () => (type: unknown) => type
  }
}

// 初始化主题（在渲染前执行，避免闪烁）
initTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
