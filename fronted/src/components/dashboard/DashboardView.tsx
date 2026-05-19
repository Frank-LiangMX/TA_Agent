/**
 * 项目总览仪表盘
 *
 * 多维度汇总：统计卡片 + 审核/分类/类型/风格分布 + 面数统计 + 系统状态 + 最近分析
 */

import React, { useMemo, useState } from 'react'
import {
  BarChart3, RefreshCw, Package, CheckCircle2, Clock, XCircle,
  Layers, MessageSquare, Brain, HardDrive, Triangle, Activity,
  Palette, Shapes, Download,
} from 'lucide-react'
import { useStats, useReviews, useSessionStats, useMemoryStats } from '@/lib/cache'

// 状态中文映射
const statusLabels: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  needs_fix: '需修改',
  imported: '已入库',
}

const statusColors: Record<string, string> = {
  pending: 'bg-warning',
  approved: 'bg-success',
  rejected: 'bg-destructive',
  needs_fix: 'bg-orange-500',
  imported: 'bg-primary',
}

// 类型中文映射
const typeLabels: Record<string, string> = {
  static_mesh: '静态网格',
  skeletal_mesh: '骨骼网格',
  animation: '动画',
  texture: '贴图',
  material: '材质',
}

const typeColors: Record<string, string> = {
  static_mesh: 'bg-blue-500',
  skeletal_mesh: 'bg-emerald-500',
  animation: 'bg-purple-500',
  texture: 'bg-pink-500',
  material: 'bg-orange-500',
}

// 分类颜色
const categoryColors = [
  'bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500',
  'bg-cyan-500', 'bg-pink-500', 'bg-amber-500', 'bg-indigo-500',
]

// 风格颜色（循环使用）
const styleColorList = [
  'bg-indigo-500', 'bg-violet-500', 'bg-teal-500', 'bg-rose-500',
  'bg-amber-500', 'bg-cyan-500', 'bg-lime-500', 'bg-fuchsia-500',
]

/** 格式化大数字 */
function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function DashboardView() {
  const { stats, loading, refresh } = useStats()
  const { data: reviewData } = useReviews()
  const { stats: sessionStats } = useSessionStats()
  const { stats: memoryStats } = useMemoryStats()
  const [exporting, setExporting] = useState(false)

  // 导出分析报告
  const handleExport = async () => {
    if (!stats) return
    setExporting(true)
    try {
      const now = new Date().toLocaleString('zh-CN')
      const lines: string[] = []

      lines.push(`# TAgent 资产分析报告`)
      lines.push(`> 生成时间：${now}`)
      lines.push('')

      // 概览
      lines.push(`## 概览`)
      lines.push(`| 指标 | 数值 |`)
      lines.push(`|------|------|`)
      lines.push(`| 资产总数 | ${stats.total || 0} |`)
      if (stats.by_status) {
        Object.entries(stats.by_status).forEach(([s, c]) => {
          lines.push(`| ${statusLabels[s] || s} | ${c} |`)
        })
      }
      lines.push('')

      // 类型分布
      if (stats.by_type && Object.keys(stats.by_type).length > 0) {
        lines.push(`## 资产类型分布`)
        lines.push(`| 类型 | 数量 |`)
        lines.push(`|------|------|`)
        Object.entries(stats.by_type).sort((a, b) => (b[1] as number) - (a[1] as number)).forEach(([t, c]) => {
          lines.push(`| ${typeLabels[t] || t} | ${c} |`)
        })
        lines.push('')
      }

      // 分类分布
      if (stats.by_category && Object.keys(stats.by_category).length > 0) {
        lines.push(`## 分类分布`)
        lines.push(`| 分类 | 数量 |`)
        lines.push(`|------|------|`)
        Object.entries(stats.by_category).sort((a, b) => (b[1] as number) - (a[1] as number)).forEach(([cat, c]) => {
          lines.push(`| ${cat} | ${c} |`)
        })
        lines.push('')
      }

      // 面数统计
      if (stats.mesh && stats.mesh.count > 0) {
        lines.push(`## 面数统计`)
        lines.push(`| 指标 | 数值 |`)
        lines.push(`|------|------|`)
        lines.push(`| 含网格资产 | ${stats.mesh.count} 个 |`)
        lines.push(`| 总面数 | ${fmtNum(stats.mesh.total_tris)} |`)
        lines.push(`| 平均面数 | ${fmtNum(stats.mesh.avg_tris)} |`)
        lines.push(`| 最大面数 | ${fmtNum(stats.mesh.max_tris)} |`)
        lines.push(`| 最小面数 | ${fmtNum(stats.mesh.min_tris)} |`)
        lines.push('')
      }

      // 待审核
      if (reviewData && reviewData.total_pending > 0) {
        lines.push(`## 待审核资产`)
        lines.push(`- 高置信度：${reviewData.high_confidence_count} 个`)
        lines.push(`- 低置信度：${reviewData.low_confidence_count} 个`)
        lines.push('')

        if (reviewData.low_confidence?.length > 0) {
          lines.push(`### 低置信度资产详情`)
          lines.push(`| 资产名 | 类型 | 置信度 |`)
          lines.push(`|--------|------|--------|`)
          reviewData.low_confidence.forEach((a: any) => {
            lines.push(`| ${a.asset_name} | ${a.review_type || a.asset_type} | ${(a.avg_confidence * 100).toFixed(0)}% |`)
          })
          lines.push('')
        }
      }

      // 记忆系统
      if (memoryStats && !memoryStats.error) {
        lines.push(`## 记忆系统`)
        lines.push(`| 指标 | 数值 |`)
        lines.push(`|------|------|`)
        lines.push(`| 项目画像 | ${memoryStats.profile_chars || 0} 字符 |`)
        lines.push(`| 推断规则 | ${memoryStats.rule_count || 0} 条 |`)
        lines.push(`| 修正记录 | ${memoryStats.correction_count || 0} 条 |`)
        lines.push('')
      }

      lines.push('---')
      lines.push('*由 TAgent 自动生成*')

      // 下载
      const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `TAgent_报告_${new Date().toISOString().slice(0, 10)}.md`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  // 统计卡片
  const cards = useMemo(() => {
    if (!stats) return []
    const total = stats.total || 0
    const pending = stats.by_status?.pending || 0
    const approved = stats.by_status?.approved || 0
    const rejected = stats.by_status?.rejected || 0
    return [
      { label: '资产总数', value: total, icon: <Package size={20} />, color: 'text-primary', bg: 'bg-primary/10' },
      { label: '待审核', value: pending, icon: <Clock size={20} />, color: 'text-warning', bg: 'bg-warning/10' },
      { label: '已通过', value: approved, icon: <CheckCircle2 size={20} />, color: 'text-success', bg: 'bg-success/10' },
      { label: '已拒绝', value: rejected, icon: <XCircle size={20} />, color: 'text-destructive', bg: 'bg-destructive/10' },
    ]
  }, [stats])

  // 条形图数据
  const statusEntries = useMemo(() => {
    if (!stats?.by_status) return []
    return Object.entries(stats.by_status).filter(([, c]) => (c as number) > 0).sort((a, b) => (b[1] as number) - (a[1] as number))
  }, [stats])

  const categoryEntries = useMemo(() => {
    if (!stats?.by_category) return []
    return Object.entries(stats.by_category).filter(([, c]) => (c as number) > 0).sort((a, b) => (b[1] as number) - (a[1] as number))
  }, [stats])

  const typeEntries = useMemo(() => {
    if (!stats?.by_type) return []
    return Object.entries(stats.by_type).filter(([, c]) => (c as number) > 0).sort((a, b) => (b[1] as number) - (a[1] as number))
  }, [stats])

  const styleEntries = useMemo(() => {
    if (!stats?.by_style) return []
    return Object.entries(stats.by_style).filter(([, c]) => (c as number) > 0).sort((a, b) => (b[1] as number) - (a[1] as number))
  }, [stats])

  const maxOf = (entries: [string, unknown][]) => entries.length > 0 ? Math.max(...entries.map(([, v]) => v as number)) : 1

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
      {/* 头部 */}
      <header className="h-14 flex items-center justify-between px-4 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} className="text-primary" />
          <h2 className="text-sm font-medium">项目总览</h2>
          {stats && <span className="text-xs text-muted-foreground">{stats.total} 个资产</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={!stats || exporting}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded hover:bg-muted disabled:opacity-50"
          >
            <Download size={14} />
            {exporting ? '导出中...' : '导出报告'}
          </button>
          <button
            onClick={() => refresh()}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded hover:bg-muted"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {/* 内容 */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-4 space-y-4">
        {loading && !stats && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <RefreshCw size={24} className="animate-spin mr-2" />
            <span className="text-sm">加载中...</span>
          </div>
        )}

        {stats && (
          <>
            {/* 统计卡片 */}
            <div className="grid grid-cols-4 gap-3">
              {cards.map((card, i) => (
                <div key={card.label} className="rounded-lg shadow-sm p-4 animate-fade-in-up" style={{ animationDelay: `${i * 80}ms` }}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${card.bg}`}>
                      <span className={card.color}>{card.icon}</span>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{card.label}</p>
                      <p className="text-xl font-semibold">{card.value}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 第一行条形图：审核状态 + 资产类型 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="animate-fade-in-up" style={{ animationDelay: '200ms' }}>
                <ChartCard title="审核状态分布" icon={<Layers size={14} />}>
                  {statusEntries.length > 0 ? statusEntries.map(([s, c], i) => (
                    <BarRow key={s} label={statusLabels[s] || s} count={c as number} max={maxOf(statusEntries)} color={statusColors[s] || 'bg-muted'} delay={i * 50} />
                  )) : <EmptyText />}
                </ChartCard>
              </div>
              <div className="animate-fade-in-up" style={{ animationDelay: '280ms' }}>
                <ChartCard title="资产类型分布" icon={<Shapes size={14} />}>
                  {typeEntries.length > 0 ? typeEntries.map(([t, c], i) => (
                    <BarRow key={t} label={typeLabels[t] || t} count={c as number} max={maxOf(typeEntries)} color={typeColors[t] || 'bg-muted'} delay={i * 50} />
                  )) : <EmptyText />}
                </ChartCard>
              </div>
            </div>

            {/* 第二行条形图：分类 + 风格 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="animate-fade-in-up" style={{ animationDelay: '360ms' }}>
                <ChartCard title="资产分类分布" icon={<Package size={14} />}>
                  {categoryEntries.length > 0 ? categoryEntries.map(([cat, c], i) => (
                    <BarRow key={cat} label={cat} count={c as number} max={maxOf(categoryEntries)} color={categoryColors[i % categoryColors.length]} delay={i * 50} />
                  )) : <EmptyText />}
                </ChartCard>
              </div>
              <div className="animate-fade-in-up" style={{ animationDelay: '440ms' }}>
                <ChartCard title="风格分布" icon={<Palette size={14} />}>
                  {styleEntries.length > 0 ? styleEntries.map(([s, c], i) => (
                    <BarRow key={s} label={s} count={c as number} max={maxOf(styleEntries)} color={styleColorList[i % styleColorList.length]} delay={i * 50} />
                  )) : <EmptyText />}
                </ChartCard>
              </div>
            </div>

            {/* 第三行：面数统计 + 系统状态 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="animate-fade-in-up" style={{ animationDelay: '520ms' }}>
                <ChartCard title="面数统计" icon={<Triangle size={14} />}>
                {stats.mesh && stats.mesh.count > 0 ? (
                  <div className="space-y-2">
                    <InfoRow label="含网格资产" value={`${stats.mesh.count} 个`} />
                    <InfoRow label="总面数" value={fmtNum(stats.mesh.total_tris)} />
                    <InfoRow label="平均面数" value={fmtNum(stats.mesh.avg_tris)} />
                    <InfoRow label="最大面数" value={fmtNum(stats.mesh.max_tris)} highlight={stats.mesh.max_tris > 50000} />
                    <InfoRow label="最小面数" value={fmtNum(stats.mesh.min_tris)} />
                  </div>
                ) : (
                  <EmptyText />
                )}
              </ChartCard>
              </div>

              {/* 系统状态 */}
              <div className="animate-fade-in-up" style={{ animationDelay: '600ms' }}>
                <ChartCard title="系统状态" icon={<Activity size={14} />}>
                <div className="space-y-2">
                  {sessionStats ? (
                    <>
                      <InfoRow label="活跃会话" value={`${sessionStats.active_sessions} 个`} />
                      <InfoRow label="已归档" value={`${sessionStats.archived_sessions} 个`} />
                      <InfoRow label="总消息数" value={`${sessionStats.total_messages} 条`} />
                    </>
                  ) : (
                    <InfoRow label="会话" value="加载中..." />
                  )}
                  {memoryStats && !memoryStats.error ? (
                    <>
                      <InfoRow label="推断规则" value={`${memoryStats.rule_count || 0} 条`} />
                      <InfoRow label="修正记录" value={`${memoryStats.correction_count || 0} 条`} />
                    </>
                  ) : (
                    <InfoRow label="记忆系统" value={memoryStats?.error || '未初始化'} />
                  )}
                </div>
              </ChartCard>
              </div>
            </div>

            {/* 最近分析 */}
            {stats.recent && stats.recent.length > 0 && (
              <div className="rounded-lg shadow-sm p-4 animate-fade-in-up" style={{ animationDelay: '680ms' }}>
                <div className="flex items-center gap-1.5 mb-3">
                  <Clock size={14} className="text-muted-foreground" />
                  <h3 className="text-xs font-medium">最近分析</h3>
                </div>
                <div className="space-y-1.5">
                  {stats.recent.map((item: Record<string, string>, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground w-4 text-right">{i + 1}</span>
                      <span className="font-medium truncate flex-1">{item.asset_name}</span>
                      <span className="text-muted-foreground shrink-0">{typeLabels[item.asset_type] || item.asset_type || '-'}</span>
                      <span className="text-muted-foreground shrink-0">{item.category || '-'}</span>
                      <span className="text-muted-foreground/60 shrink-0 text-[11px]">
                        {item.analyzed_at ? new Date(item.analyzed_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ===== 子组件 =====

function ChartCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg shadow-sm p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-muted-foreground">{icon}</span>
        <h3 className="text-xs font-medium">{title}</h3>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function BarRow({ label, count, max, color, delay = 0 }: { label: string; count: number; max: number; color: string; delay?: number }) {
  const percent = max > 0 ? Math.round((count / max) * 100) : 0
  return (
    <div className="flex items-center gap-2 animate-fade-in-up" style={{ animationDelay: `${delay}ms` }}>
      <span className="text-xs text-muted-foreground w-16 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs font-mono w-10 text-right">{count}</span>
    </div>
  )
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-medium ${highlight ? 'text-destructive' : ''}`}>{value}</span>
    </div>
  )
}

function EmptyText() {
  return <p className="text-xs text-muted-foreground py-2">暂无数据</p>
}
