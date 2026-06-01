/**
 * 页面顶栏（与对话 Tab 行同高 h-9、同背景）
 */

import React from 'react'
import { AppTitleBar } from './AppTitleBar'

/** 与 MainPanel 标签栏顶栏一致 */
export const PAGE_TITLE_BAR_STYLE: React.CSSProperties = {
  backgroundColor: 'hsl(var(--muted) / 0.5)',
}

interface PageHeaderProps {
  children: React.ReactNode
  actions?: React.ReactNode
  className?: string
  /** 详情面板等窄栏不设窗口按钮 */
  showWindowControls?: boolean
}

export function PageHeader({
  children,
  actions,
  className = '',
  showWindowControls,
}: PageHeaderProps) {
  return (
    <AppTitleBar
      size="sm"
      showWindowControls={showWindowControls}
      style={PAGE_TITLE_BAR_STYLE}
      className={`border-b border-border/50 ${className}`.trim()}
      leading={
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3">{children}</div>
      }
      trailing={actions}
    />
  )
}
