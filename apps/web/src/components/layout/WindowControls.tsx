/**
 * Windows 窗口控制按钮
 * - inline：嵌入顶栏右侧槽位（主界面）
 * - fixed：浮在窗口右上角（登录/向导等无顶栏页面）
 */

import React, { useEffect, useMemo, useState } from 'react'
import { detectIsWindows } from '@/lib/platform'

type WindowControlsProps = {
  placement?: 'inline' | 'fixed'
}

export function WindowControls({ placement = 'inline' }: WindowControlsProps): React.ReactElement | null {
  const isWindows = useMemo(() => detectIsWindows(), [])
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    const api = window.electronAPI
    if (!isWindows || !api?.isMaximized) return

    api.isMaximized().then(setIsMaximized)

    const onResize = (): void => {
      api.isMaximized?.().then((next) => {
        setIsMaximized((prev) => (prev === next ? prev : next))
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [isWindows])

  if (!isWindows || !window.electronAPI?.isElectron) return null

  const api = window.electronAPI

  const buttons = (
    <>
      <button
        type="button"
        className="window-control-btn"
        aria-label="最小化"
        onClick={() => api.minimizeWindow?.()}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <rect x="1" y="5.5" width="10" height="1" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        className="window-control-btn"
        aria-label={isMaximized ? '还原' : '最大化'}
        onClick={() => api.maximizeWindow?.()}
      >
        {isMaximized ? (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <rect x="3" y="0.5" width="8" height="8" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1" />
            <rect x="1" y="3.5" width="8" height="8" rx="0.5" fill="currentColor" stroke="currentColor" strokeWidth="1" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <rect x="1.5" y="1.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        )}
      </button>
      <button
        type="button"
        className="window-control-btn window-control-close"
        aria-label="关闭"
        onClick={() => api.closeWindow?.()}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>
    </>
  )

  if (placement === 'fixed') {
    return (
      <div className="window-controls window-controls--fixed flex select-none">
        {buttons}
      </div>
    )
  }

  return (
    <div className="window-controls window-controls--inline flex select-none titlebar-no-drag">
      {buttons}
    </div>
  )
}
