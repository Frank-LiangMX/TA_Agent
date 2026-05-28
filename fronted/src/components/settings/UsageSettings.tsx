/**
 * 用量统计 - LLM 调用历史
 *
 * 展示每次 LLM 调用的时间、模型、token、耗时、状态。
 */

import React, { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Trash2, Brain, AlertTriangle, CheckCircle2, Clock, Zap } from 'lucide-react'
import { API_BASE } from '@/lib/api'

interface UsageLog {
  ts: string
  session: string
  model: string
  input_tokens: number
  output_tokens: number
  duration_ms: number
  success: boolean
  thinking: boolean
  error?: string
}

export function UsageSettings() {
  const [logs, setLogs] = useState<UsageLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/usage/logs?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`)
      const data = await res.json()
      setLogs(data.logs || [])
      setTotal(data.total || 0)
    } catch {
      setLogs([])
    }
    setLoading(false)
  }, [page])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const handleClear = async () => {
    if (!confirm('确定清空所有用量日志？')) return
    await fetch(`${API_BASE}/api/usage/logs`, { method: 'DELETE' })
    setPage(0)
    fetchLogs()
  }

  const fmtDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`
  }

  const fmtTime = (ts: string) => {
    try {
      const d = new Date(ts)
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    } catch {
      return ts
    }
  }

  // 汇总统计
  const totalTokens = logs.reduce((sum, l) => sum + l.input_tokens + l.output_tokens, 0)
  const successCount = logs.filter((l) => l.success).length
  const avgDuration = logs.length > 0 ? logs.reduce((sum, l) => sum + l.duration_ms, 0) / logs.length : 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-4">
      {/* 汇总卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          icon={<Zap size={14} />}
          label="总调用"
          value={String(total)}
          color="text-primary"
        />
        <SummaryCard
          icon={<CheckCircle2 size={14} />}
          label="成功率"
          value={total > 0 ? `${Math.round((successCount / Math.max(logs.length, 1)) * 100)}%` : '—'}
          color="text-success"
        />
        <SummaryCard
          icon={<Brain size={14} />}
          label="Token 估算"
          value={totalTokens > 0 ? `~${totalTokens.toLocaleString()}` : '—'}
          color="text-muted-foreground"
        />
        <SummaryCard
          icon={<Clock size={14} />}
          label="平均耗时"
          value={logs.length > 0 ? fmtDuration(avgDuration) : '—'}
          color="text-muted-foreground"
        />
      </div>

      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          共 {total} 条记录
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchLogs}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="刷新"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={handleClear}
            className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="清空日志"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* 日志表格 */}
      <div className="border border-border/50 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">时间</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">模型</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">输出 Token</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">耗时</th>
                <th className="px-3 py-2 text-center font-medium text-muted-foreground">思考</th>
                <th className="px-3 py-2 text-center font-medium text-muted-foreground">状态</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    加载中...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    暂无调用记录
                  </td>
                </tr>
              ) : (
                logs.map((log, i) => (
                  <tr
                    key={`${log.ts}-${i}`}
                    className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-3 py-1.5 font-mono text-muted-foreground">
                      {fmtTime(log.ts)}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono">
                        {log.model}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">
                      {log.output_tokens > 0 ? `~${log.output_tokens.toLocaleString()}` : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">
                      {fmtDuration(log.duration_ms)}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {log.thinking && <Brain size={12} className="text-success inline" />}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {log.success ? (
                        <CheckCircle2 size={12} className="text-success inline" />
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-destructive" title={log.error || ''}>
                          <AlertTriangle size={12} />
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-2 py-1 text-xs rounded bg-muted hover:bg-accent disabled:opacity-30 transition-colors"
          >
            上一页
          </button>
          <span className="text-xs text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-2 py-1 text-xs rounded bg-muted hover:bg-accent disabled:opacity-30 transition-colors"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ icon, label, value, color }: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
}) {
  return (
    <div className="border border-border/50 rounded-lg p-3">
      <div className={`flex items-center gap-1.5 mb-1 ${color}`}>
        {icon}
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      <div className="text-lg font-mono font-medium">{value}</div>
    </div>
  )
}
