/**
 * 分析页 — 可行动总览 + 分段 Tab + 合并分布区
 */

import React, { useMemo, useState, useEffect } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import type { ViewType } from '@/components/layout/Sidebar'
import {
  BarChart3, RefreshCw, Package, CheckCircle2, Clock, XCircle,
  Layers, FileCheck, Triangle, Activity,
  Palette, Shapes, Download, ChevronRight, GitBranch, AlertTriangle,
  LayoutDashboard, ChartPie,
} from 'lucide-react'
import { useStats, useReviews, useSessionStats, useMemoryStats, useAssets, getDataSource } from '@/lib/cache'

export interface DashboardNavigateOptions {
  reviewTab?: 'high' | 'low'
  assetStatus?: string
  assetSortBy?: 'name' | 'type' | 'tri_count'
}

interface DashboardViewProps {
  onNavigate?: (view: ViewType, options?: DashboardNavigateOptions) => void
  onAssetSelect?: (asset: Record<string, unknown>) => void
}

type AnalysisTab = 'overview' | 'distribution' | 'quality'

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

const categoryColors = [
  'bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500',
  'bg-cyan-500', 'bg-pink-500', 'bg-amber-500', 'bg-indigo-500',
]

const styleColorList = [
  'bg-indigo-500', 'bg-violet-500', 'bg-teal-500', 'bg-rose-500',
  'bg-amber-500', 'bg-cyan-500', 'bg-lime-500', 'bg-fuchsia-500',
]

const STAGE_ORDER = ['scan', 'analyze', 'review', 'intake']
const STAGE_LABELS: Record<string, string> = {
  scan: '扫描', analyze: '分析', review: '审核', intake: '入库',
}

const HIGH_POLY_THRESHOLD = 50_000
const RECENT_PREVIEW = 5

const ANALYSIS_TABS: { id: AnalysisTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: '概览', icon: <LayoutDashboard size={15} /> },
  { id: 'distribution', label: '分布', icon: <ChartPie size={15} /> },
  { id: 'quality', label: '质量', icon: <Activity size={15} /> },
]

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const handler = () => setReduced(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduced
}

export function DashboardView({ onNavigate, onAssetSelect }: DashboardViewProps) {
  const { stats, loading, refresh } = useStats()
  const { data: reviewData } = useReviews()
  const { stats: sessionStats } = useSessionStats()
  const { stats: memoryStats } = useMemoryStats()
  const { assets } = useAssets()
  const [exporting, setExporting] = useState(false)
  const [activeTab, setActiveTab] = useState<AnalysisTab>('overview')
  const [pipelineHint, setPipelineHint] = useState<string | null>(null)
  const reducedMotion = usePrefersReducedMotion()

  const animDelay = (ms: number) => (reducedMotion ? undefined : { animationDelay: `${ms}ms` })

  useEffect(() => {
    let cancelled = false
    const loadPipeline = async () => {
      try {
        const dataSource = await getDataSource()
        const res = await fetch(`${dataSource}/api/pipeline/runs?limit=100`)
        const data = await res.json()
        const runs: { sessionId: string; stageId: string; startedAt: string }[] = data.runs || []
        if (cancelled || runs.length === 0) {
          setPipelineHint(null)
          return
        }
        const groups = new Map<string, typeof runs>()
        for (const run of runs) {
          const list = groups.get(run.sessionId) || []
          list.push(run)
          groups.set(run.sessionId, list)
        }
        let latest: { sessionId: string; runs: typeof runs; lastActive: number } | null = null
        for (const [sessionId, sessionRuns] of groups) {
          const lastActive = Math.max(...sessionRuns.map((r) => new Date(r.startedAt).getTime()))
          if (!latest || lastActive > latest.lastActive) {
            latest = { sessionId, runs: sessionRuns, lastActive }
          }
        }
        if (!latest) return
        const done = STAGE_ORDER.filter((id) => latest!.runs.some((r) => r.stageId === id)).length
        const next = STAGE_ORDER.find((id) => !latest!.runs.some((r) => r.stageId === id))
        setPipelineHint(
          next
            ? `当前会话 · ${done}/${STAGE_ORDER.length} 阶段 · 下一步 ${STAGE_LABELS[next] || next}`
            : `当前会话 · 四阶段已完成`,
        )
      } catch {
        if (!cancelled) setPipelineHint(null)
      }
    }
    loadPipeline()
    return () => { cancelled = true }
  }, [stats])

  const highPolyCount = useMemo(
    () => assets.filter((a) => (a.tri_count as number) > HIGH_POLY_THRESHOLD).length,
    [assets],
  )

  const handleExport = async () => {
    if (!stats) return
    setExporting(true)
    try {
      const now = new Date().toLocaleString('zh-CN')
      const lines: string[] = []
      lines.push(`# TAgent 资产分析报告`)
      lines.push(`> 生成时间：${now}`)
      lines.push('')
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
      if (stats.by_type && Object.keys(stats.by_type).length > 0) {
        lines.push(`## 资产类型分布`)
        lines.push(`| 类型 | 数量 |`)
        lines.push(`|------|------|`)
        Object.entries(stats.by_type).sort((a, b) => (b[1] as number) - (a[1] as number)).forEach(([t, c]) => {
          lines.push(`| ${typeLabels[t] || t} | ${c} |`)
        })
        lines.push('')
      }
      if (stats.mesh && stats.mesh.count > 0) {
        lines.push(`## 面数统计`)
        lines.push(`| 指标 | 数值 |`)
        lines.push(`|------|------|`)
        lines.push(`| 含网格资产 | ${stats.mesh.count} 个 |`)
        lines.push(`| 总面数 | ${fmtNum(stats.mesh.total_tris)} |`)
        lines.push(`| 平均面数 | ${fmtNum(stats.mesh.avg_tris)} |`)
        lines.push(`| 最大面数 | ${fmtNum(stats.mesh.max_tris)} |`)
        lines.push('')
      }
      lines.push('---')
      lines.push('*由 TAgent 自动生成*')
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

  const openAsset = async (assetId: string) => {
    if (!onAssetSelect) return
    try {
      const dataSource = await getDataSource()
      const res = await fetch(`${dataSource}/api/assets/${assetId}`)
      const data = await res.json()
      if (!data.error) onAssetSelect(data)
    } catch { /* ignore */ }
  }

  const cards = useMemo(() => {
    if (!stats) return []
    const total = stats.total || 0
    const pending = stats.by_status?.pending || 0
    const approved = stats.by_status?.approved || 0
    const rejected = stats.by_status?.rejected || 0
    return [
      {
        label: '资产总数', value: total, icon: Package, color: 'text-primary', bg: 'bg-primary/10',
        onClick: () => onNavigate?.('assets'),
      },
      {
        label: '待审核', value: pending, icon: Clock, color: 'text-warning', bg: 'bg-warning/10',
        onClick: () => onNavigate?.('assets', { assetStatus: 'pending' }),
      },
      {
        label: '已通过', value: approved, icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10',
        onClick: () => onNavigate?.('assets', { assetStatus: 'approved' }),
      },
      {
        label: '已拒绝', value: rejected, icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10',
        onClick: () => onNavigate?.('assets', { assetStatus: 'rejected' }),
      },
    ]
  }, [stats, onNavigate])

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

  const maxOf = (entries: [string, unknown][]) =>
    entries.length > 0 ? Math.max(...entries.map(([, v]) => v as number)) : 1

  const lowReviewCount = reviewData?.low_confidence?.length ?? 0
  const highReviewCount = reviewData?.high_confidence?.length ?? 0
  const pendingReviewTotal = reviewData?.total_pending ?? lowReviewCount + highReviewCount

  const recentItems = (stats?.recent || []).slice(0, RECENT_PREVIEW)

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <PageHeader>
        <BarChart3 size={18} className="text-primary shrink-0" />
        <h2 className="truncate text-sm font-medium">分析</h2>
      </PageHeader>

      <nav
        className="shrink-0 bg-muted/30"
        aria-label="分析视图"
      >
        <div className="flex items-stretch justify-between gap-3 pl-1 pr-3 sm:pr-4">
          <div className="flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto scrollbar-thin">
            {ANALYSIS_TABS.map((tab) => (
              <AnalysisTabButton
                key={tab.id}
                active={activeTab === tab.id}
                icon={tab.icon}
                label={tab.label}
                onClick={() => setActiveTab(tab.id)}
              />
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-0.5 self-center py-1">
            {stats && (
              <span className="mr-1.5 hidden whitespace-nowrap text-[11px] text-muted-foreground md:inline">
                {stats.total} 资产
              </span>
            )}
            <button
              type="button"
              onClick={handleExport}
              disabled={!stats || exporting}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground disabled:opacity-50"
              title={exporting ? '导出中…' : '导出报告'}
            >
              <Download size={15} />
            </button>
            <button
              type="button"
              onClick={() => refresh()}
              disabled={loading}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground disabled:opacity-50"
              title="刷新"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-4">
        {loading && !stats && (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <RefreshCw size={24} className="mr-2 animate-spin" />
            <span className="text-sm">加载中...</span>
          </div>
        )}

        {stats && activeTab === 'overview' && (
          <div key="overview" className="space-y-5 animate-tab-fade">
            <p className="text-xs text-muted-foreground/70">资产与审核概况</p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {cards.map((card, i) => {
                const Icon = card.icon
                return (
                  <button
                    key={card.label}
                    type="button"
                    onClick={card.onClick}
                    disabled={!onNavigate}
                    className={`rounded-lg p-4 text-left shadow-sm transition-colors hover:bg-foreground/[0.03] disabled:cursor-default ${!reducedMotion ? 'animate-fade-in-up' : ''}`}
                    style={animDelay(i * 60)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`rounded-lg p-2 ${card.bg}`}>
                        <Icon size={20} className={card.color} />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{card.label}</p>
                        <p className="text-xl font-semibold">{card.value}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            <ActionStrip
              reducedMotion={reducedMotion}
              pendingReviewTotal={pendingReviewTotal}
              lowReviewCount={lowReviewCount}
              highReviewCount={highReviewCount}
              highPolyCount={highPolyCount}
              pipelineHint={pipelineHint}
              onNavigate={onNavigate}
            />

            {recentItems.length > 0 && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Clock size={14} className="text-muted-foreground" />
                    <h3 className="text-xs font-medium">最近分析</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate?.('assets')}
                    className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:text-primary/80"
                  >
                    资产库 <ChevronRight size={12} />
                  </button>
                </div>
                <ul className="space-y-0.5">
                  {recentItems.map((item: Record<string, string>, i: number) => (
                    <li key={item.asset_id || `${item.asset_name}-${i}`}>
                      <button
                        type="button"
                        onClick={() => item.asset_id && openAsset(item.asset_id)}
                        disabled={!item.asset_id || !onAssetSelect}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition-colors hover:bg-foreground/[0.04] disabled:cursor-default disabled:opacity-80"
                      >
                        <span className="w-4 shrink-0 text-right text-muted-foreground">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate font-medium">{item.asset_name}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {typeLabels[item.asset_type] || item.asset_type || '-'}
                        </span>
                        <span className="hidden shrink-0 text-muted-foreground sm:inline">{item.category || '-'}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground/60">
                          {item.analyzed_at
                            ? new Date(item.analyzed_at).toLocaleString('zh-CN', {
                                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                              })
                            : '-'}
                        </span>
                        {item.asset_id && onAssetSelect && (
                          <ChevronRight size={14} className="shrink-0 text-muted-foreground/40" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {stats && activeTab === 'distribution' && (
          <div key="distribution" className="grid grid-cols-1 gap-4 animate-tab-fade lg:grid-cols-2">
            <ChartSection title="审核状态分布" icon={<Layers size={14} />}>
              {statusEntries.length > 0 ? statusEntries.map(([s, c], i) => (
                <BarRow
                  key={s}
                  label={statusLabels[s] || s}
                  count={c as number}
                  max={maxOf(statusEntries)}
                  color={statusColors[s] || 'bg-muted'}
                  delay={reducedMotion ? 0 : i * 40}
                  onClick={() => onNavigate?.('assets', { assetStatus: s })}
                />
              )) : <EmptyText />}
            </ChartSection>
            <ChartSection title="资产类型分布" icon={<Shapes size={14} />}>
              {typeEntries.length > 0 ? typeEntries.map(([t, c], i) => (
                <BarRow
                  key={t}
                  label={typeLabels[t] || t}
                  count={c as number}
                  max={maxOf(typeEntries)}
                  color={typeColors[t] || 'bg-muted'}
                  delay={reducedMotion ? 0 : i * 40}
                />
              )) : <EmptyText />}
            </ChartSection>
            <ChartSection title="资产分类分布" icon={<Package size={14} />}>
              {categoryEntries.length > 0 ? categoryEntries.map(([cat, c], i) => (
                <BarRow
                  key={cat}
                  label={cat}
                  count={c as number}
                  max={maxOf(categoryEntries)}
                  color={categoryColors[i % categoryColors.length]}
                  delay={reducedMotion ? 0 : i * 40}
                />
              )) : <EmptyText />}
            </ChartSection>
            <ChartSection title="风格分布" icon={<Palette size={14} />}>
              {styleEntries.length > 0 ? styleEntries.map(([s, c], i) => (
                <BarRow
                  key={s}
                  label={s}
                  count={c as number}
                  max={maxOf(styleEntries)}
                  color={styleColorList[i % styleColorList.length]}
                  delay={reducedMotion ? 0 : i * 40}
                />
              )) : <EmptyText />}
            </ChartSection>
          </div>
        )}

        {stats && activeTab === 'quality' && (
          <div key="quality" className="grid grid-cols-1 gap-4 animate-tab-fade lg:grid-cols-2">
            <ChartSection title="面数统计" icon={<Triangle size={14} />}>
              {stats.mesh && stats.mesh.count > 0 ? (
                <div className="space-y-2">
                  <InfoRow label="含网格资产" value={`${stats.mesh.count} 个`} />
                  <InfoRow label="总面数" value={fmtNum(stats.mesh.total_tris)} />
                  <InfoRow label="平均面数" value={fmtNum(stats.mesh.avg_tris)} />
                  <InfoRow
                    label="最大面数"
                    value={fmtNum(stats.mesh.max_tris)}
                    highlight={stats.mesh.max_tris > HIGH_POLY_THRESHOLD}
                  />
                  <InfoRow label="最小面数" value={fmtNum(stats.mesh.min_tris)} />
                  {highPolyCount > 0 && onNavigate && (
                    <button
                      type="button"
                      onClick={() => onNavigate('assets', { assetSortBy: 'tri_count' })}
                      className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                    >
                      查看 {highPolyCount} 个高面数资产
                      <ChevronRight size={12} />
                    </button>
                  )}
                </div>
              ) : (
                <EmptyText />
              )}
            </ChartSection>
            <ChartSection title="系统状态" icon={<Activity size={14} />}>
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
            </ChartSection>
          </div>
        )}
      </div>
    </div>
  )
}

function AnalysisTabButton({
  active, icon, label, onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs transition-colors sm:px-4 ${
        active
          ? 'border-primary font-semibold text-foreground'
          : 'border-transparent font-medium text-muted-foreground hover:border-border/70 hover:text-foreground'
      }`}
    >
      <span className={active ? 'text-primary' : 'text-muted-foreground/70'}>{icon}</span>
      {label}
    </button>
  )
}

function ActionStrip({
  pendingReviewTotal,
  lowReviewCount,
  highReviewCount,
  highPolyCount,
  pipelineHint,
  reducedMotion,
  onNavigate,
}: {
  pendingReviewTotal: number
  lowReviewCount: number
  highReviewCount: number
  highPolyCount: number
  pipelineHint: string | null
  reducedMotion: boolean
  onNavigate?: (view: ViewType, options?: DashboardNavigateOptions) => void
}) {
  if (!onNavigate) return null

  const items = [
    {
      key: 'review',
      icon: <FileCheck size={16} className="text-amber-400" />,
      title: '审核队列',
      desc:
        pendingReviewTotal > 0
          ? `共 ${pendingReviewTotal} 项 · 低 ${lowReviewCount} / 高 ${highReviewCount}`
          : '暂无待审核',
      muted: pendingReviewTotal === 0,
      onClick: () =>
        onNavigate('review', { reviewTab: lowReviewCount > 0 ? 'low' : 'high' }),
    },
    {
      key: 'poly',
      icon: <AlertTriangle size={16} className="text-amber-400" />,
      title: '高面数资产',
      desc: highPolyCount > 0 ? `${highPolyCount} 个超过 ${fmtNum(HIGH_POLY_THRESHOLD)} 面` : '暂无告警',
      muted: highPolyCount === 0,
      onClick: () => onNavigate('assets', { assetSortBy: 'tri_count' }),
    },
    {
      key: 'pipeline',
      icon: <GitBranch size={16} className="text-primary" />,
      title: '资产流水线',
      desc: pipelineHint || '查看各阶段进度',
      muted: false,
      onClick: () => onNavigate('workflow'),
    },
  ]

  return (
    <div
      className={`grid grid-cols-1 gap-2 sm:grid-cols-3 ${!reducedMotion ? 'animate-fade-in-up' : ''}`}
      style={reducedMotion ? undefined : { animationDelay: '120ms' }}
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={item.onClick}
          className={`flex items-start gap-3 rounded-xl bg-foreground/[0.03] px-3 py-3 text-left transition-colors hover:bg-foreground/[0.06] ${
            item.muted ? 'opacity-70' : ''
          }`}
        >
          <div className="mt-0.5 shrink-0">{item.icon}</div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">{item.title}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.desc}</p>
          </div>
          <ChevronRight size={14} className="mt-1 shrink-0 text-muted-foreground/50" />
        </button>
      ))}
    </div>
  )
}

function ChartSection({
  title, icon, children, className = '',
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-lg p-4 shadow-sm ${className}`.trim()}>
      <div className="mb-3 flex items-center gap-1.5">
        <span className="text-muted-foreground">{icon}</span>
        <h3 className="text-xs font-medium">{title}</h3>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function BarRow({
  label, count, max, color, delay = 0, onClick,
}: {
  label: string
  count: number
  max: number
  color: string
  delay?: number
  onClick?: () => void
}) {
  const percent = max > 0 ? Math.round((count / max) * 100) : 0
  const inner = (
    <>
      <span className="w-16 shrink-0 truncate text-xs text-muted-foreground">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="w-10 text-right font-mono text-xs">{count}</span>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2 rounded-md py-0.5 transition-colors hover:bg-foreground/[0.04]"
        style={{ animationDelay: `${delay}ms` }}
      >
        {inner}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 animate-fade-in-up" style={{ animationDelay: `${delay}ms` }}>
      {inner}
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
  return <p className="py-2 text-xs text-muted-foreground">暂无数据</p>
}
