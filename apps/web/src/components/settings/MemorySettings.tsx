/**
 * 记忆系统设置（Layout v1）
 */

import React, { useState, useEffect } from 'react'
import {
  Brain,
  BookMarked,
  History,
  Trash2,
  Loader2,
  FileText,
  RefreshCw,
  FolderOpen,
  ArrowRight,
  FileCode2,
  Sparkles,
  CheckCircle2,
} from 'lucide-react'
import { SettingsSection, SettingsCard } from './primitives'
import { localApiFetch } from '@/lib/api'
import { useConfirm } from '@/hooks/useConfirm'
import { Tooltip } from '@/components/ui/Tooltip'

interface MemorySettingsProps {
  refreshKey?: number
}

type PreviewTab = 'index' | 'facts'

export function MemorySettings({ refreshKey = 0 }: MemorySettingsProps) {
  const { confirm, ConfirmUI } = useConfirm()
  const [stats, setStats] = useState<{
    namespace?: string
    index_chars?: number
    facts_chars?: number
    profile_chars?: number
    rule_count?: number
    correction_count?: number
    sop_count?: number
    sops?: string[]
    total_tokens_estimate?: number
    agentMode?: string
  } | null>(null)
  const [indexPreview, setIndexPreview] = useState('')
  const [factsPreview, setFactsPreview] = useState('')
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(false)
  const [previewTab, setPreviewTab] = useState<PreviewTab>('index')

  const agentMode = stats?.agentMode === 'general' ? 'general' : 'ta'
  const isGeneral = agentMode === 'general'

  const load = async () => {
    setLoading(true)
    try {
      const [statsRes, profileRes] = await Promise.all([
        localApiFetch('/api/memory/stats'),
        localApiFetch('/api/memory/profile'),
      ])
      const statsData = await statsRes.json()
      const profileData = await profileRes.json()
      setStats(statsData)
      setIndexPreview(profileData.index || '')
      setFactsPreview(profileData.facts || profileData.content || '')
      if (!profileData.index && (profileData.facts || profileData.content)) {
        setPreviewTab('facts')
      }
    } catch {
      setStats(null)
      setIndexPreview('')
      setFactsPreview('')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [refreshKey])

  const handleClear = async () => {
    const label = isGeneral ? '通用模式' : 'TA 模式'
    if (!await confirm(`确定清空${label}下的全部记忆？此操作不可恢复。`, { danger: true })) return
    setClearing(true)
    try {
      const res = await localApiFetch('/api/memory/clear', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setCleared(true)
        await load()
        setTimeout(() => setCleared(false), 3000)
      }
    } catch {} finally {
      setClearing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 size={20} className="animate-spin mr-2" />
        <span className="text-sm">加载记忆数据…</span>
      </div>
    )
  }

  const indexChars = stats?.index_chars ?? 0
  const factsChars = stats?.facts_chars ?? stats?.profile_chars ?? 0
  const tokenEst = stats?.total_tokens_estimate ?? 0
  const hasContent = !!(indexPreview.trim() || factsPreview.trim())
  const previewText = previewTab === 'index' ? indexPreview : factsPreview

  return (
    <>
      <div className="space-y-5">
        {/* 顶栏 */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  isGeneral
                    ? 'bg-primary/10 text-primary'
                    : 'bg-secondary text-secondary-foreground'
                }`}
              >
                <Sparkles size={12} />
                {isGeneral ? '通用模式' : 'TA 模式'}
              </span>
              {stats?.namespace ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-mono text-muted-foreground">
                  <FolderOpen size={11} />
                  memory/{stats.namespace}
                </span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground max-w-xl">
              {isGeneral
                ? '跨会话记住工具路径与工作习惯。短目录每轮注入，详细内容按需读取。'
                : '项目约定与资产纠正学习。目录注入对话，详细事实与规则分层存储。'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Tooltip content="刷新">
              <button
                type="button"
                onClick={load}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <RefreshCw size={15} />
              </button>
            </Tooltip>
            <Tooltip content="清空当前模式全部记忆">
              <button
                type="button"
                onClick={handleClear}
                disabled={clearing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
              >
                {clearing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : cleared ? (
                  <CheckCircle2 size={14} />
                ) : (
                  <Trash2 size={14} />
                )}
                {clearing ? '清空中…' : cleared ? '已清空' : '清空记忆'}
              </button>
            </Tooltip>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={<Brain size={14} />}
            label="目录 Index"
            hint="每轮注入"
            value={formatChars(indexChars)}
            accent="text-primary"
          />
          <StatCard
            icon={<FileText size={14} />}
            label="事实 Facts"
            hint="按需读取"
            value={formatChars(factsChars)}
            accent="text-foreground"
          />
          <StatCard
            icon={<BookMarked size={14} />}
            label="规则 L1"
            hint="TA 推断"
            value={`${stats?.rule_count ?? 0} 条`}
            accent="text-muted-foreground"
          />
          <StatCard
            icon={<History size={14} />}
            label="纠正 L2"
            hint="原始归档"
            value={`${stats?.correction_count ?? 0} 条`}
            accent="text-muted-foreground"
          />
        </div>

        {/* 工作方式 */}
        <SettingsCard divided={false} className="p-4 bg-muted/20 border border-border/40">
          <p className="text-xs font-medium text-muted-foreground mb-3">记忆如何工作</p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-1">
            <FlowStep
              icon={<Brain size={14} />}
              title="目录"
              desc="短、每轮可见"
            />
            <ArrowRight size={14} className="text-muted-foreground/40 hidden sm:block shrink-0" />
            <FlowStep
              icon={<FileText size={14} />}
              title="事实库"
              desc="路径与偏好"
            />
            <ArrowRight size={14} className="text-muted-foreground/40 hidden sm:block shrink-0" />
            <FlowStep
              icon={<FileCode2 size={14} />}
              title="SOP"
              desc={`${stats?.sop_count ?? 0} 份流程说明`}
            />
          </div>
          {tokenEst > 0 && (
            <p className="mt-3 text-[11px] text-muted-foreground/80">
              约占 Token 估算 ~{tokenEst.toLocaleString()}（目录 + 事实 + 规则）
            </p>
          )}
        </SettingsCard>

        {/* 内容预览 */}
        <SettingsSection
          title="存储内容"
          description="只读预览，与磁盘文件一致。在对话中让 Agent 写入或整理。"
        >
          <SettingsCard divided={false} className="overflow-hidden border border-border/50">
            <div
              role="tablist"
              aria-label="记忆内容预览"
              className="flex border-b border-border/50"
            >
              <PreviewTabButton
                active={previewTab === 'index'}
                onClick={() => setPreviewTab('index')}
                icon={<Brain size={14} />}
                label="目录"
                meta={indexChars > 0 ? formatChars(indexChars) : '暂无内容'}
              />
              <PreviewTabButton
                active={previewTab === 'facts'}
                onClick={() => setPreviewTab('facts')}
                icon={<FileText size={14} />}
                label="事实"
                meta={factsChars > 0 ? formatChars(factsChars) : '暂无内容'}
              />
            </div>

            <div className="p-4 min-h-[140px]">
              {hasContent && previewText.trim() ? (
                <pre className="text-xs leading-relaxed whitespace-pre-wrap break-words font-mono text-foreground/85 max-h-56 overflow-y-auto scrollbar-thin">
                  {previewText}
                </pre>
              ) : (
                <EmptyPreview tab={previewTab} isGeneral={isGeneral} />
              )}
            </div>
          </SettingsCard>
        </SettingsSection>

        {/* SOP 列表 */}
        {(stats?.sops?.length ?? 0) > 0 && (
          <SettingsSection title="流程说明 SOP" description="开发者维护，Agent 按需读取">
            <div className="flex flex-wrap gap-2">
              {stats!.sops!.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-card px-2.5 py-1 text-xs font-mono text-muted-foreground"
                >
                  <FileCode2 size={12} />
                  {name}
                </span>
              ))}
            </div>
          </SettingsSection>
        )}
      </div>
      {ConfirmUI}
    </>
  )
}

function formatChars(n: number): string {
  if (n <= 0) return '空'
  if (n < 1000) return `${n} 字`
  return `${(n / 1000).toFixed(1)}k 字`
}

function StatCard({
  icon,
  label,
  hint,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  hint: string
  value: string
  accent: string
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-3.5 transition-colors hover:border-border/80">
      <div className={`flex items-center gap-1.5 mb-2 ${accent}`}>
        {icon}
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <div className="text-xl font-semibold tracking-tight">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>
    </div>
  )
}

function FlowStep({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode
  title: string
  desc: string
}) {
  return (
    <div className="flex flex-1 items-center gap-2.5 rounded-lg border border-border/40 bg-background/60 px-3 py-2.5 min-w-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-[11px] text-muted-foreground truncate">{desc}</div>
      </div>
    </div>
  )
}

function PreviewTabButton({
  active,
  onClick,
  icon,
  label,
  meta,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  meta: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`group relative flex items-center gap-2 px-4 py-3 text-sm transition-colors ${
        active
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground/80'
      }`}
    >
      <span className={active ? 'text-foreground/70' : 'text-muted-foreground/50 group-hover:text-muted-foreground/70'}>
        {icon}
      </span>
      <span className="font-medium">{label}</span>
      <span className={`text-xs tabular-nums ${active ? 'text-muted-foreground' : 'text-muted-foreground/50'}`}>
        {meta}
      </span>
      {active ? (
        <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-primary/80" />
      ) : null}
    </button>
  )
}

function EmptyPreview({ tab, isGeneral }: { tab: PreviewTab; isGeneral: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
        {tab === 'index' ? <Brain size={18} /> : <FileText size={18} />}
      </div>
      <p className="text-sm text-muted-foreground">
        {tab === 'index' ? '目录尚无内容' : '事实库尚无内容'}
      </p>
      <p className="text-xs text-muted-foreground/70 mt-1 max-w-xs">
        {isGeneral
          ? '在对话中说「记住 Blender 路径」等，Agent 写入后会显示在这里。'
          : '项目约定与工具路径可通过对话写入，资产纠正会进入 L1/L2。'}
      </p>
    </div>
  )
}
