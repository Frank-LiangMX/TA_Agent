/**
 * 面数检查结果 — 进度条 + 状态
 */

import React from 'react'

interface Props {
  data: {
    face_count: number
    budget: number
    ratio: number
    status: 'pass' | 'warning' | 'fail'
    detail: string
  }
}

export function MeshBudgetResult({ data }: Props) {
  const percent = Math.min(data.ratio * 100, 120)
  const barColor = data.status === 'pass'
    ? 'bg-success'
    : data.status === 'warning'
      ? 'bg-warning'
      : 'bg-destructive'
  const textColor = data.status === 'pass'
    ? 'text-success'
    : data.status === 'warning'
      ? 'text-warning'
      : 'text-destructive'

  return (
    <div className="rounded-lg shadow-sm overflow-hidden">
      <div className={`flex items-center gap-2 px-3 py-2 ${data.status === 'pass' ? 'bg-success/10' : data.status === 'warning' ? 'bg-warning/10' : 'bg-destructive/10'}`}>
        <span className="text-sm font-medium">
          {data.status === 'pass' ? '✅' : data.status === 'warning' ? '⚠️' : '❌'} 面数检查
        </span>
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">面数</span>
          <span className={`font-mono font-medium ${textColor}`}>
            {data.face_count.toLocaleString()} / {data.budget.toLocaleString()}
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">{data.detail}</p>
      </div>
    </div>
  )
}
