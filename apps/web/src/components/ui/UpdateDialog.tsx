/**
 * 更新弹窗组件
 *
 * 检测到新版本时弹出，显示下载进度，下载完成后提示重启。
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Download, RefreshCw, CheckCircle2, AlertCircle, X } from 'lucide-react'

interface UpdateProgress {
  percent: number
  transferred: number
  total: number
  speed: number
}

interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error'
  version?: string
  progress?: UpdateProgress
  error?: string
}

export function UpdateDialog() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [dismissed, setDismissed] = useState(false)
  const [downloadedVersion, setDownloadedVersion] = useState<string | null>(null)

  useEffect(() => {
    const api = (window as any).electronAPI?.updater
    if (!api) return

    // 获取当前状态
    api.getStatus().then((s: UpdateStatus) => {
      if (s && s.state !== 'idle') setStatus(s)
    })

    // 订阅状态变化
    api.onStatusChanged((s: UpdateStatus) => {
      setStatus(s)
      if (s.state === 'downloaded' && s.version) {
        setDownloadedVersion(s.version)
        setDismissed(false)
      }
    })
  }, [])

  const handleRestart = useCallback(() => {
    (window as any).electronAPI?.updater?.quitAndInstall()
  }, [])

  const handleDismiss = useCallback(() => {
    setDismissed(true)
  }, [])

  // 不显示的情况
  if (dismissed) return null
  if (status.state === 'idle' || status.state === 'checking' || status.state === 'not-available') return null
  if (status.state === 'error') return null

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatSpeed = (bytesPerSecond: number) => {
    if (bytesPerSecond < 1024) return `${bytesPerSecond} B/s`
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(0)} KB/s`
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-2">
      <div className="w-80 bg-card border border-border/50 rounded-xl shadow-2xl overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <div className="flex items-center gap-2">
            {status.state === 'available' && <Download size={16} className="text-primary" />}
            {status.state === 'downloading' && <RefreshCw size={16} className="text-primary animate-spin" />}
            {status.state === 'downloaded' && <CheckCircle2 size={16} className="text-success" />}
            <span className="text-sm font-medium">
              {status.state === 'available' && '发现新版本'}
              {status.state === 'downloading' && '正在下载更新'}
              {status.state === 'downloaded' && '更新已就绪'}
            </span>
          </div>
          {status.state !== 'downloading' && (
            <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground transition-colors">
              <X size={14} />
            </button>
          )}
        </div>

        {/* 内容 */}
        <div className="px-4 py-3 space-y-3">
          {status.version && (
            <p className="text-xs text-muted-foreground">
              版本 {status.version}
            </p>
          )}

          {/* 下载进度 */}
          {status.state === 'downloading' && status.progress && (
            <div className="space-y-2">
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${status.progress.percent}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{formatBytes(status.progress.transferred)} / {formatBytes(status.progress.total)}</span>
                <span>{formatSpeed(status.progress.speed)}</span>
              </div>
            </div>
          )}

          {/* 下载完成 */}
          {status.state === 'downloaded' && (
            <div className="flex gap-2">
              <button
                onClick={handleRestart}
                className="flex-1 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/80 transition-colors"
              >
                立即重启更新
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-xs bg-muted text-muted-foreground rounded-lg hover:bg-accent transition-colors"
              >
                稍后
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
