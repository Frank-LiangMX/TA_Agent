/**
 * 资产流水线 — 单卡内嵌侧栏（会话记录）+ 总览统计 + 编排轨 + 详情
 */
import React, { useState, useEffect, useMemo } from 'react'
import {
  GitBranch, RefreshCw, MessageSquare, Settings, Plus, X,
  FolderSearch, Brain, FileCheck, Package,
  ChevronDown, ChevronRight, Trash2, ArrowRight, Play, Loader2, Check,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { useStats, getDataSource } from '@/lib/cache'
import { localApiFetch } from '@/lib/api'

interface PipelineStage {
  id: string; label: string; icon: string; description: string
  prompt?: string; order?: number; parentId?: string; isCustom?: boolean
}

interface PipelineRun {
  runId: string; stageId: string; sessionId: string; status: string
  startedAt: string; toolsUsed?: string[]; summary?: string
}

interface SessionGroup {
  sessionId: string
  runs: PipelineRun[]
  lastActive: number
}

const STAGE_ORDER = ['scan', 'analyze', 'review', 'intake'] as const
type StageId = (typeof STAGE_ORDER)[number]

const STAGE_META: Record<StageId, {
  label: string
  Icon: LucideIcon
  desc: string
  color: { node: string; bg: string; border: string; text: string }
}> = {
  scan: {
    label: '扫描', Icon: FolderSearch, desc: '扫描目录、检查文件信息',
    color: { node: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' },
  },
  analyze: {
    label: '分析', Icon: Brain, desc: 'AI 分析、面数/贴图/命名检查',
    color: { node: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400' },
  },
  review: {
    label: '审核', Icon: FileCheck, desc: '审核 AI 推断结果',
    color: { node: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400' },
  },
  intake: {
    label: '入库', Icon: Package, desc: '资产导入引擎',
    color: { node: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400' },
  },
}

interface WorkflowViewProps {
  onNavigate?: (view: string) => void
}

function groupSessions(runs: PipelineRun[]): SessionGroup[] {
  const groups = new Map<string, PipelineRun[]>()
  for (const run of runs) {
    const list = groups.get(run.sessionId) || []
    list.push(run)
    groups.set(run.sessionId, list)
  }
  return Array.from(groups.entries())
    .map(([sessionId, sessionRuns]) => ({
      sessionId,
      runs: sessionRuns,
      lastActive: Math.max(...sessionRuns.map(r => new Date(r.startedAt).getTime())),
    }))
    .sort((a, b) => b.lastActive - a.lastActive)
}

function hasStage(runs: PipelineRun[], stageId: string) {
  return runs.some(r => r.stageId === stageId)
}

function getNextStageId(runs: PipelineRun[]): StageId | null {
  for (const id of STAGE_ORDER) {
    if (!hasStage(runs, id)) return id
  }
  return null
}

function getDefaultFocusStage(runs: PipelineRun[]): StageId {
  const next = getNextStageId(runs)
  if (next) return next
  for (let i = STAGE_ORDER.length - 1; i >= 0; i--) {
    if (hasStage(runs, STAGE_ORDER[i])) return STAGE_ORDER[i]
  }
  return 'scan'
}

function formatTime(ts: string) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatSessionLabel(lastActive: number) {
  return formatTime(new Date(lastActive).toISOString())
}

export function WorkflowView({ onNavigate }: WorkflowViewProps) {
  const { stats, loading, refresh } = useStats()
  const [runs, setRuns] = useState<PipelineRun[]>([])
  const [showConfig, setShowConfig] = useState(false)
  const [coreStages, setCoreStages] = useState<PipelineStage[]>([])
  const [customStages, setCustomStages] = useState<PipelineStage[]>([])
  const [branchTarget, setBranchTarget] = useState<string | null>(null)
  const [newBranch, setNewBranch] = useState({ label: '', description: '', prompt: '' })
  const [dataSource, setDataSource] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [focusedStageId, setFocusedStageId] = useState<StageId>('scan')
  const [executingStage, setExecutingStage] = useState<string | null>(null)

  const sessions = useMemo(() => groupSessions(runs), [runs])
  const latestSessionId = sessions[0]?.sessionId ?? null

  const selectedSession = useMemo(
    () => sessions.find(s => s.sessionId === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  )

  useEffect(() => {
    getDataSource().then(setDataSource)
    fetchPipeline()
    fetchRuns()
  }, [])

  useEffect(() => {
    if (sessions.length === 0) {
      setSelectedSessionId(null)
      return
    }
    if (!selectedSessionId || !sessions.some(s => s.sessionId === selectedSessionId)) {
      setSelectedSessionId(sessions[0].sessionId)
    }
  }, [sessions, selectedSessionId])

  useEffect(() => {
    if (selectedSession) {
      setFocusedStageId(getDefaultFocusStage(selectedSession.runs))
    }
  }, [selectedSession?.sessionId])

  const fetchPipeline = async () => {
    try {
      const res = await fetch(`${dataSource}/api/pipeline`)
      const data = await res.json()
      setCoreStages(data.core_stages || [])
      setCustomStages(data.custom_stages || [])
    } catch { /* ignore */ }
  }

  const fetchRuns = async () => {
    try {
      const res = await fetch(`${dataSource}/api/pipeline/runs?limit=200`)
      const data = await res.json()
      setRuns(data.runs || [])
    } catch { /* ignore */ }
  }

  const savePipeline = async (core: PipelineStage[], custom: PipelineStage[]) => {
    try {
      await fetch(`${dataSource}/api/pipeline`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 1, core_stages: core, custom_stages: custom }),
      })
    } catch { /* ignore */ }
  }

  const handleRefresh = () => {
    refresh()
    fetchRuns()
  }

  const handleRunStage = async (stageId: string, label: string) => {
    setExecutingStage(stageId)
    try {
      const res = await localApiFetch('/api/pipeline/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`已触发：${label}`)
        onNavigate?.('chat')
      } else {
        toast.error(data.error || '执行失败')
      }
    } catch {
      toast.error('执行失败')
    } finally {
      setExecutingStage(null)
    }
  }

  const nextStageId = selectedSession ? getNextStageId(selectedSession.runs) : null
  const completedCount = selectedSession
    ? STAGE_ORDER.filter(id => hasStage(selectedSession.runs, id)).length
    : 0

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <PageHeader
        actions={
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowConfig(true)}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="阶段配置"
            >
              <Settings size={16} />
            </button>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              title="刷新"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        }
      >
        <GitBranch size={18} className="text-primary shrink-0" />
        <h2 className="text-sm font-medium">资产流水线</h2>
        {stats && (
          <span className="text-xs text-muted-foreground">{stats.total} 个资产</span>
        )}
      </PageHeader>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* 内嵌侧栏：会话 / 历史 */}
        <aside className="flex w-[220px] shrink-0 flex-col border-r border-border/50 bg-foreground/[0.02]">
          <div className="border-b border-border/40 px-3 py-2.5">
            <span className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
              会话记录
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-2 py-2">
            {sessions.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground/50">暂无记录</p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {sessions.map((session) => (
                  <SessionListItem
                    key={session.sessionId}
                    session={session}
                    isActive={session.sessionId === selectedSessionId}
                    isLatest={session.sessionId === latestSessionId}
                    onSelect={() => setSelectedSessionId(session.sessionId)}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* 主内容区 */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {!selectedSession ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <GitBranch size={40} className="mb-3 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground/60">暂无流水线记录</p>
              <p className="mt-1 text-xs text-muted-foreground/40">
                在对话中让 Agent 分析资产后，这里会自动显示进度
              </p>
            </div>
          ) : (
            <>
              <div
                key={selectedSession.sessionId}
                className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-4 animate-tab-fade"
              >
                <div className="space-y-5">
                  <StageStatRow runs={selectedSession.runs} />
                  <div className="overflow-hidden rounded-xl border border-border/30">
                    <PipelineRail
                      runs={selectedSession.runs}
                      focusedStageId={focusedStageId}
                      onFocusStage={setFocusedStageId}
                    />
                    <StageDetailCard
                      stageId={focusedStageId}
                      runs={selectedSession.runs.filter(r => r.stageId === focusedStageId)}
                    />
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-between border-t border-border/50 bg-muted/20 px-4 py-3">
                <span className="text-xs text-muted-foreground">
                  {selectedSession.runs.length} 次工具调用
                  {completedCount > 0 && ` · 已完成 ${completedCount}/${STAGE_ORDER.length} 阶段`}
                </span>
                <div className="flex items-center gap-2">
                  {focusedStageId === 'intake' && onNavigate && (
                    <button
                      onClick={() => onNavigate('intake')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-foreground/[0.04] px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
                    >
                      <Package size={12} />
                      打开入库向导
                    </button>
                  )}
                  {nextStageId && (
                    <button
                      onClick={() => handleRunStage(nextStageId, STAGE_META[nextStageId].label)}
                      disabled={executingStage === nextStageId}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-foreground/[0.04] px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                    >
                      {executingStage === nextStageId ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Play size={12} />
                      )}
                      执行下一阶段
                    </button>
                  )}
                  <button
                    onClick={() => onNavigate?.('chat')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <MessageSquare size={12} />
                    在对话中继续
                    <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <PipelineConfigDialog
        open={showConfig}
        onClose={() => setShowConfig(false)}
        coreStages={coreStages}
        customStages={customStages}
        branchTarget={branchTarget}
        newBranch={newBranch}
        onSetBranchTarget={setBranchTarget}
        onNewBranchChange={setNewBranch}
        onAddBranch={(parentId) => {
          if (!newBranch.label.trim() || !newBranch.prompt.trim()) return
          const stage: PipelineStage = {
            id: `custom_${Date.now()}`, label: newBranch.label.trim(),
            icon: 'Wrench', description: newBranch.description.trim(),
            prompt: newBranch.prompt.trim(), parentId, isCustom: true,
          }
          const updated = [...customStages, stage]
          setCustomStages(updated)
          savePipeline(coreStages, updated)
          setBranchTarget(null)
          setNewBranch({ label: '', description: '', prompt: '' })
          toast.success(`已添加分支: ${stage.label}`)
        }}
        onDelete={(id) => {
          const updated = customStages.filter(s => s.id !== id)
          setCustomStages(updated)
          savePipeline(coreStages, updated)
          toast.success('已删除分支')
        }}
      />
    </div>
  )
}

function SessionListItem({
  session, isActive, isLatest, onSelect,
}: {
  session: SessionGroup
  isActive: boolean
  isLatest: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
        isActive
          ? 'bg-background font-medium text-foreground shadow-sm ring-1 ring-border/40'
          : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs">{formatSessionLabel(session.lastActive)}</span>
        {isLatest && (
          <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
            当前
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1">
        {STAGE_ORDER.map((id) => {
          const done = hasStage(session.runs, id)
          const c = STAGE_META[id].color
          return (
            <span
              key={id}
              className={`h-1.5 w-1.5 rounded-full ${done ? c.bg.replace('/10', '') : 'bg-muted'}`}
              title={STAGE_META[id].label}
            />
          )
        })}
        <span className="ml-auto text-[10px] text-muted-foreground/60">{session.runs.length} 次</span>
      </div>
    </button>
  )
}

function StageStatRow({ runs }: { runs: PipelineRun[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {STAGE_ORDER.map((id, i) => {
        const meta = STAGE_META[id]
        const done = hasStage(runs, id)
        const count = runs.filter(r => r.stageId === id).length
        const { Icon } = meta
        return (
          <div
            key={id}
            className="rounded-lg p-3 shadow-sm animate-fade-in-up"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-center gap-2">
              <div className={`rounded-lg p-1.5 ${meta.color.bg}`}>
                <Icon size={16} className={meta.color.node} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{meta.label}</p>
                <p className="text-lg font-semibold leading-tight">
                  {done ? (count > 1 ? `${count} 次` : '已完成') : '—'}
                </p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PipelineRail({
  runs, focusedStageId, onFocusStage,
}: {
  runs: PipelineRun[]
  focusedStageId: StageId
  onFocusStage: (id: StageId) => void
}) {
  return (
    <div className="bg-foreground/[0.02] px-4 py-4">
      <p className="mb-3 text-xs font-medium text-muted-foreground">编排进度</p>
      <div className="flex items-start">
        {STAGE_ORDER.map((id, i) => {
          const meta = STAGE_META[id]
          const done = hasStage(runs, id)
          const isFocus = focusedStageId === id
          const nextDone = i < STAGE_ORDER.length - 1 && hasStage(runs, STAGE_ORDER[i + 1])
          const { Icon } = meta
          const c = meta.color

          return (
            <React.Fragment key={id}>
              <button
                type="button"
                onClick={() => onFocusStage(id)}
                className="group flex min-w-0 flex-1 flex-col items-center gap-2"
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-all ${
                    isFocus ? 'ring-2 ring-primary/40 ring-offset-2 ring-offset-background' : ''
                  } ${
                    done
                      ? `${c.bg} ${c.border} ${c.node}`
                      : 'border-border/30 bg-muted/40 text-muted-foreground/40'
                  } group-hover:scale-105`}
                >
                  {done ? <Check size={18} strokeWidth={2.5} /> : <Icon size={18} />}
                </div>
                <span className={`text-xs font-medium ${done ? 'text-foreground' : 'text-muted-foreground/50'}`}>
                  {meta.label}
                </span>
              </button>
              {i < STAGE_ORDER.length - 1 && (
                <div className="flex shrink-0 items-center px-1 pt-5">
                  <div
                    className={`h-0.5 w-6 sm:w-10 rounded-full transition-colors ${
                      done && nextDone ? 'bg-muted-foreground/40' : 'bg-border/40'
                    }`}
                  />
                </div>
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

function StageDetailCard({ stageId, runs }: { stageId: StageId; runs: PipelineRun[] }) {
  const meta = STAGE_META[stageId]
  const { Icon } = meta
  const c = meta.color

  return (
    <div className="border-t border-border/30 px-4 py-4">
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${c.bg} ${c.border}`}>
          <Icon size={20} className={c.node} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-foreground">{meta.label}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{meta.desc}</p>
          {runs.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground/50">该阶段尚未执行</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {runs.map((r) => (
                <li
                  key={r.runId}
                  className="rounded-lg bg-foreground/[0.04] px-3 py-2"
                >
                  {r.summary ? (
                    <p className="text-xs text-foreground/90">{String(r.summary)}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground/60">无摘要</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground/60">
                    <span>{formatTime(r.startedAt)}</span>
                    {r.toolsUsed && r.toolsUsed.length > 0 && (
                      <span>工具: {r.toolsUsed.join(', ')}</span>
                    )}
                    {r.status && <span className="capitalize">{r.status}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function PipelineConfigDialog({
  open, onClose, coreStages, customStages, branchTarget, newBranch,
  onSetBranchTarget, onNewBranchChange, onAddBranch, onDelete,
}: {
  open: boolean
  onClose: () => void
  coreStages: PipelineStage[]
  customStages: PipelineStage[]
  branchTarget: string | null
  newBranch: { label: string; description: string; prompt: string }
  onSetBranchTarget: (id: string | null) => void
  onNewBranchChange: (v: { label: string; description: string; prompt: string }) => void
  onAddBranch: (parentId: string) => void
  onDelete: (id: string) => void
}) {
  const [expandedStage, setExpandedStage] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border/50 bg-card shadow-2xl animate-in fade-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">阶段配置</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-4 space-y-2">
          {coreStages.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">加载中…</p>
          ) : (
            coreStages.map((stage) => {
              const isExpanded = expandedStage === stage.id
              const branches = customStages.filter(s => s.parentId === stage.id)
              return (
                <div key={stage.id} className="overflow-hidden rounded-lg border border-border/30 bg-muted/20">
                  <button
                    type="button"
                    onClick={() => setExpandedStage(isExpanded ? null : stage.id)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-accent/30"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{stage.label}</span>
                      {branches.length > 0 && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {branches.length} 分支
                        </span>
                      )}
                    </div>
                    {isExpanded ? (
                      <ChevronDown size={14} className="text-muted-foreground" />
                    ) : (
                      <ChevronRight size={14} className="text-muted-foreground" />
                    )}
                  </button>
                  {isExpanded && (
                    <div className="space-y-2 px-3 pb-3">
                      {branches.map((branch) => (
                        <div key={branch.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-1.5">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs">{branch.label}</div>
                            <div className="truncate text-[10px] text-muted-foreground">
                              {branch.description || branch.prompt}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onDelete(branch.id)}
                            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                      {branchTarget === stage.id ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={newBranch.label}
                            onChange={(e) => onNewBranchChange({ ...newBranch, label: e.target.value })}
                            placeholder="分支名称"
                            className="w-full rounded border border-border bg-muted px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                            autoFocus
                          />
                          <textarea
                            value={newBranch.prompt}
                            onChange={(e) => onNewBranchChange({ ...newBranch, prompt: e.target.value })}
                            placeholder="提示词"
                            rows={2}
                            className="w-full resize-none rounded border border-border bg-muted px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => onSetBranchTarget(null)}
                              className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              onClick={() => onAddBranch(stage.id)}
                              className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/80"
                            >
                              添加
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSetBranchTarget(stage.id)}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <Plus size={12} /> 添加分支
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
