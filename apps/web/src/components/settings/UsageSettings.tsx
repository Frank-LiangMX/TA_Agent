/**
 * 用量统计 - LLM 调用历史
 *
 * 展示每次 LLM 调用的时间、模型、token、耗时、状态。
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { RefreshCw, Trash2, Brain, AlertTriangle, CheckCircle2, Clock, Zap, Loader2, Sparkles, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { localApiFetch } from '@/lib/api'
import { useConfirm } from '@/hooks/useConfirm'
import { Tooltip } from '@/components/ui/Tooltip'

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
  const { confirm, ConfirmUI } = useConfirm()
  const [logs, setLogs] = useState<UsageLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [modelFilter, setModelFilter] = useState<string>('all')
  const PAGE_SIZE = 50

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await localApiFetch(`/api/usage/logs?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`)
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
    if (!await confirm('确定清空所有用量日志？', { danger: true })) return
    await localApiFetch('/api/usage/logs', { method: 'DELETE' })
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

  // Hooks 必须在 early return 之前
  const filteredLogs = useMemo(() => {
    if (modelFilter === 'all') return logs
    return logs.filter(l => l.model === modelFilter)
  }, [logs, modelFilter])

  const totalTokens = logs.reduce((sum, l) => sum + l.input_tokens + l.output_tokens, 0)
  const totalInputTokens = logs.reduce((sum, l) => sum + l.input_tokens, 0)
  const totalOutputTokens = logs.reduce((sum, l) => sum + l.output_tokens, 0)
  const successCount = logs.filter((l) => l.success).length
  const thinkCount = logs.filter((l) => l.thinking).length
  const avgDuration = logs.length > 0 ? logs.reduce((sum, l) => sum + l.duration_ms, 0) / logs.length : 0
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const successRate = total > 0 ? Math.round((successCount / Math.max(logs.length, 1)) * 100) : 0

  // 唯一模型列表（用于过滤）
  const modelOptions = useMemo(() => {
    const set = new Set<string>()
    logs.forEach(l => set.add(l.model))
    return Array.from(set)
  }, [logs])

  // 用于绘制 token 输入/输出比例
  const inputRatio = totalTokens > 0 ? (totalInputTokens / totalTokens) * 100 : 50

  return (
    <div className="space-y-5">
      {/* ===== 4 个 metric 卡（带主题色） ===== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <SummaryCard
          icon={<Zap size={14} />}
          label="总调用"
          value={String(total)}
          color="text-blue-600 dark:text-blue-400"
          ring="ring-blue-500/30"
          bg="bg-blue-500/15 dark:bg-blue-400/20"
          sub={`本页 ${logs.length} 条`}
        />
        <SummaryCard
          icon={<CheckCircle2 size={14} />}
          label="成功率"
          value={total > 0 ? `${successRate}%` : '—'}
          color="text-emerald-600 dark:text-emerald-400"
          ring="ring-emerald-500/30"
          bg="bg-emerald-500/15 dark:bg-emerald-400/20"
          sub={`${successCount} 成功 · ${logs.length - successCount} 失败`}
        />
        <SummaryCard
          icon={<Brain size={14} />}
          label="Token 估算"
          value={totalTokens > 0 ? `~${totalTokens.toLocaleString()}` : '—'}
          color="text-purple-600 dark:text-purple-400"
          ring="ring-purple-500/30"
          bg="bg-purple-500/15 dark:bg-purple-400/20"
          sub={
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight size={9} />
                {totalInputTokens.toLocaleString()}
              </span>
              <span className="text-muted-foreground/40">/</span>
              <span className="inline-flex items-center gap-0.5 text-orange-600 dark:text-orange-400">
                <ArrowDownLeft size={9} />
                {totalOutputTokens.toLocaleString()}
              </span>
            </div>
          }
          extra={
            totalTokens > 0 ? (
              <div className="mt-1.5 flex h-1 rounded-full overflow-hidden bg-muted/40">
                <div className="bg-emerald-500/60" style={{ width: `${inputRatio}%` }} />
                <div className="bg-orange-500/60" style={{ width: `${100 - inputRatio}%` }} />
              </div>
            ) : null
          }
        />
        <SummaryCard
          icon={<Clock size={14} />}
          label="平均耗时"
          value={logs.length > 0 ? fmtDuration(avgDuration) : '—'}
          color="text-orange-600 dark:text-orange-400"
          ring="ring-orange-500/30"
          bg="bg-orange-500/15 dark:bg-orange-400/20"
          sub={thinkCount > 0 ? `${thinkCount} 次含思考` : '—'}
        />
      </div>

      {/* ===== 操作栏 + 模型过滤 ===== */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">共 {total} 条记录</span>
          {modelOptions.length > 1 && (
            <div className="flex items-center gap-1 ml-2 pl-2 border-l border-border/40">
              <button
                onClick={() => setModelFilter('all')}
                className={`px-2 py-0.5 text-[11px] rounded ${
                  modelFilter === 'all'
                    ? 'bg-foreground/10 text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                全部模型
              </button>
              {modelOptions.map(m => (
                <button
                  key={m}
                  onClick={() => setModelFilter(m)}
                  className={`px-2 py-0.5 text-[11px] rounded font-mono ${
                    modelFilter === m
                      ? 'bg-foreground/10 text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Tooltip content="刷新">
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </Tooltip>
          <Tooltip content="清空日志">
            <button
              onClick={handleClear}
              className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* ===== 日志表格 ===== */}
      <div className="rounded-xl border border-foreground/10 bg-background overflow-hidden shadow-[0_2px_8px_-3px_rgb(0_0%_0/0.06)]">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/30 border-b border-border/40">
                <th className="pl-4 pr-3 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">时间</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">模型</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Token (in/out)</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">耗时</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">状态</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-12 text-center text-muted-foreground">
                    <Loader2 size={18} className="animate-spin inline mr-2" />
                    加载中...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-12 text-center text-muted-foreground">
                    <Sparkles size={20} className="mx-auto mb-2 opacity-30" />
                    {modelFilter !== 'all' ? `没有「${modelFilter}」的记录` : '暂无调用记录'}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log, i) => {
                  const tokens = log.input_tokens + log.output_tokens
                  const maxTokens = Math.max(...filteredLogs.map(l => l.input_tokens + l.output_tokens), 1)
                  const widthPct = (tokens / maxTokens) * 100
                  return (
                    <tr
                      key={`${log.ts}-${i}`}
                      className="border-b border-border/10 last:border-b-0 hover:bg-accent/20 transition-colors"
                    >
                      <td className="pl-4 pr-3 py-2 font-mono text-[11px] text-muted-foreground/85 tabular-nums">
                        {fmtTime(log.ts)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono bg-foreground/5 text-foreground/85 border border-foreground/10">
                          {log.model}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {tokens > 0 ? (
                          <div className="flex items-center justify-end gap-2">
                            {/* Token mini 进度条 */}
                            <div className="hidden md:block w-16 h-1 rounded-full bg-muted/40 overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-emerald-500/60 to-orange-500/60"
                                style={{ width: `${widthPct}%` }}
                              />
                            </div>
                            <span className="font-mono text-[11px] tabular-nums text-foreground/85 whitespace-nowrap">
                              <span className="text-emerald-600 dark:text-emerald-400">{log.input_tokens.toLocaleString()}</span>
                              <span className="text-muted-foreground/40 mx-0.5">/</span>
                              <span className="text-orange-600 dark:text-orange-400">{log.output_tokens.toLocaleString()}</span>
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[11px] text-muted-foreground/85 tabular-nums">
                        {fmtDuration(log.duration_ms)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          {log.thinking && (
                            <Tooltip content="启用思考">
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400">
                                <Brain size={10} strokeWidth={2.5} />
                              </span>
                            </Tooltip>
                          )}
                          {log.success ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                              <CheckCircle2 size={10} strokeWidth={2.5} />
                              OK
                            </span>
                          ) : (
                            <Tooltip content={log.error || '调用失败'}>
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-destructive/15 text-destructive">
                                <AlertTriangle size={10} strokeWidth={2.5} />
                                失败
                              </span>
                            </Tooltip>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== 分页 ===== */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1 text-xs rounded-md border border-foreground/15 hover:bg-accent disabled:opacity-30 transition-colors"
          >
            上一页
          </button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1 text-xs rounded-md border border-foreground/15 hover:bg-accent disabled:opacity-30 transition-colors"
          >
            下一页
          </button>
        </div>
      )}
      {ConfirmUI}
    </div>
  )
}

function SummaryCard({ icon, label, value, color, ring, bg, sub, extra }: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
  ring: string
  bg: string
  sub?: React.ReactNode
  extra?: React.ReactNode
}) {
  return (
    <div className={`rounded-xl border border-foreground/10 bg-background p-3.5 transition-all hover:border-foreground/20 hover:shadow-[0_2px_8px_-3px_rgb(0_0%_0/0.08)]`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`flex items-center justify-center w-6 h-6 rounded-md ${bg} ${color}`}>
          {icon}
        </span>
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      <div className={`text-xl font-mono font-semibold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground/80 mt-0.5">{sub}</div>}
      {extra}
    </div>
  )
}
