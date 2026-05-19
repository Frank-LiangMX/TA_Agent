/**
 * TAgent Web 入口
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initTheme } from './atoms/theme'
import './styles/globals.css'

// 初始化主题（在渲染前执行，避免闪烁）
initTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
