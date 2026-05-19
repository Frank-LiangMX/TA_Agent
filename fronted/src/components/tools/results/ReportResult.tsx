/**
 * 报告结果
 */

import React from 'react'

interface Props {
  data: {
    title: string
    summary: {
      total: number
      pass: number
      fail: number
      warning: number
    }
    results: Array<{
      asset: string
      check: string
      status: 'pass' | 'fail' | 'warning'
      detail: string
    }>
  }
}

export function ReportResult({ data }: Props) {
  const { summary } = data
  const hasIssues = summary.fail > 0 || summary.warning > 0

  return (
    <div className="rounded-lg shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted">
        <span className="text-sm font-medium">📋 {data.title}</span>
      </div>
      <div className="p-3 space-y-3">
        {/* 统计 */}
        <div className="flex gap-3">
          <Stat label="总计" value={summary.total} />
          <Stat label="通过" value={summary.pass} color="text-success" />
          {summary.warning > 0 && <Stat label="警告" value={summary.warning} color="text-warning" />}
          {summary.fail > 0 && <Stat label="失败" value={summary.fail} color="text-destructive" />}
        </div>

        {/* 问题列表 */}
        {hasIssues && (
          <div className="space-y-1">
            <h5 className="text-xs text-muted-foreground">问题项</h5>
            {data.results
              .filter((r) => r.status !== 'pass')
              .slice(0, 10)
              .map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className={r.status === 'fail' ? 'text-destructive' : 'text-warning'}>
                    {r.status === 'fail' ? '❌' : '⚠️'}
                  </span>
                  <div>
                    <span className="font-medium">{r.asset}</span>
                    <span className="text-muted-foreground ml-1">({r.check})</span>
                    <div className="text-muted-foreground">{r.detail}</div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-center">
      <div className={`text-lg font-bold ${color || ''}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
