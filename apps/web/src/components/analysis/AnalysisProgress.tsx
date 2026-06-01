/**
 * 分析进度条组件
 *
 * 显示 ta_agent 分析资产时的多阶段进度。
 */

import React, { useState, useEffect } from 'react'
import { tagentClient } from '@/services/websocket'
import { CheckCircle2, Loader2, Circle } from 'lucide-react'

interface ProgressEvent {
  phase: string
  current: number
  total: number
  detail: string
  elapsed: number
}

const phaseLabels: Record<string, string> = {
  textures: '贴图检查',
  assets: '资产扫描',
  inference: 'AI 推断',
  done: '完成',
}

export function AnalysisProgress() {
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const unsub = tagentClient.on('analysis_progress', (payload: ProgressEvent) => {
      setProgress(payload)
      setVisible(true)

      // 完成后 3 秒自动隐藏
      if (payload.phase === 'done') {
        setTimeout(() => setVisible(false), 3000)
      }
    })

    return unsub
  }, [])

  if (!visible || !progress) return null

  const percent = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0

  const isDone = progress.phase === 'done'

  return (
    <div className="mx-4 mb-2 rounded-lg bg-card p-3 shadow-card animate-in slide-in-from-top">
      <div className="flex items-center gap-2 mb-2">
        {isDone ? (
          <CheckCircle2 size={16} className="text-success" />
        ) : (
          <Loader2 size={16} className="text-primary animate-spin" />
        )}
        <span className="text-sm font-medium">
          {isDone ? '分析完成' : `正在分析: ${phaseLabels[progress.phase] || progress.phase}`}
        </span>
        <span className="text-xs text-muted-foreground ml-auto">
          {progress.current}/{progress.total}
        </span>
      </div>

      {/* 进度条 */}
      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${isDone ? 'bg-success' : 'bg-primary'}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* 当前文件 */}
      {progress.detail && !isDone && (
        <p className="text-xs text-muted-foreground mt-1.5 truncate">
          {progress.detail}
        </p>
      )}

      {/* 完成信息 */}
      {isDone && (
        <p className="text-xs text-success mt-1.5">
          共分析 {progress.total} 个资产
        </p>
      )}
    </div>
  )
}
