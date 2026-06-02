/**
 * 应用顶栏：左侧内容 + 可选操作区 + 右侧窗口按钮槽（与内容卡片同宽，不整页左移）
 */

import React, { useMemo } from 'react'
import { detectIsWindows } from '@/lib/platform'
import { WindowControls } from './WindowControls'

export interface AppTitleBarProps {
  /** sm = 36px（对话标签行），md = 56px（页面标题行） */
  size?: 'sm' | 'md'
  leading: React.ReactNode
  trailing?: React.ReactNode
  /** 默认：Electron + Windows 时显示内嵌窗口按钮 */
  showWindowControls?: boolean
  className?: string
  style?: React.CSSProperties
}

export function AppTitleBar({
  size = 'md',
  leading,
  trailing,
  showWindowControls,
  className = '',
  style,
}: AppTitleBarProps) {
  const heightClass = size === 'sm' ? 'h-9' : 'h-14'
  const showControls = useMemo(() => {
    if (showWindowControls === false) return false
    if (showWindowControls === true) return true
    return typeof window !== 'undefined' && !!window.electronAPI?.isElectron && detectIsWindows()
  }, [showWindowControls])

  return (
    <div
      className={`relative flex shrink-0 overflow-hidden titlebar-drag-region ${heightClass} ${className}`.trim()}
      style={style}
    >
      <div className="relative flex min-w-0 flex-1 items-stretch">
        <div className="relative z-[1] flex min-w-0 flex-1 items-center overflow-hidden">
          {leading}
        </div>
        {trailing ? (
          <div className="relative z-[1] flex shrink-0 items-center gap-1 px-2 titlebar-no-drag">
            {trailing}
          </div>
        ) : null}
      </div>
      {showControls ? <WindowControls placement="inline" /> : null}
    </div>
  )
}
