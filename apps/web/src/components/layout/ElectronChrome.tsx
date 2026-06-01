/**
 * Electron 壳层
 * - floating：登录/向导等全屏页，窗口按钮浮在右上角
 * - shell：主界面仅标记 html class，窗口按钮由各 AppTitleBar 内嵌
 */

import React, { useEffect, useMemo } from 'react'
import { detectIsWindows } from '@/lib/platform'
import { WindowControls } from './WindowControls'

type ElectronChromeProps = {
  mode?: 'shell' | 'floating'
}

export function ElectronChrome({ mode = 'shell' }: ElectronChromeProps): React.ReactElement | null {
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron
  const isWindows = useMemo(() => detectIsWindows(), [])

  useEffect(() => {
    if (!isElectron) return
    const root = document.documentElement
    root.classList.add('is-electron')
    if (isWindows) root.classList.add('is-electron-win')
    return () => {
      root.classList.remove('is-electron', 'is-electron-win')
    }
  }, [isElectron, isWindows])

  if (!isElectron) return null

  if (mode === 'shell') return null

  return (
    <>
      <div
        className="titlebar-drag-region fixed top-0 left-0 right-0 z-50 h-10"
        aria-hidden
      />
      <WindowControls placement="fixed" />
    </>
  )
}
