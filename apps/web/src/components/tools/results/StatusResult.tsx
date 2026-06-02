/**
 * 通用状态结果（简单文本/错误）
 */

import React from 'react'

interface Props {
  text: string
  status?: 'success' | 'warning' | 'error' | 'info'
}

export function StatusResult({ text, status = 'info' }: Props) {
  const styles = {
    success: 'bg-success/10 border-success/30',
    warning: 'bg-warning/10 border-warning/30',
    error: 'bg-destructive/10 border-destructive/30',
    info: 'bg-muted border-border/30',
  }

  return (
    <div className={`rounded-lg border p-3 text-sm ${styles[status]}`}>
      {text}
    </div>
  )
}
