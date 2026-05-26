/**
 * 资产流水线 - 看板 + 历史记录
 *
 * 上部：当前流水线看板（4 节点状态，数据自动追踪）
 * 下部：历史会话批次记录
 */
import React, { useState, useEffect, useMemo } from 'react'
import {
  GitBranch, RefreshCw, MessageSquare, Settings, Plus, X,
  FolderSearch, Brain, FileCheck, Package, Wrench,
  ChevronDown, ChevronRight, Trash2, ArrowRight, Clock, Play, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useStats, getDataSource } from '@/lib/cache'
import { API_BASE } from '@/lib/api'

interface PipelineStage {
  id: string; label: string; icon: string; description: string
  prompt?: string; order?: number; parentId?: string; isCustom?: boolean
}

interface PipelineRun {
  runId: string; stageId: string; sessionId: string; status: string
  startedAt: string; toolsUsed?: string[]; summary?: string
}

const STAGE_META: Record<string, {
  label: string; icon: React.ReactNode; desc: string
  color: { node: string; bg: string; border: string; text: string }
}> = {
  scan: {
    label: '扫描', icon: <FolderSearch size={22} />, desc: '扫描目录、检查文件信息',
    color: { node: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' },
  },
  analyze: {
    label: '分析', icon: <Brain size={22} />, desc: 'AI 分析、面数/贴图/命名检查',
    color: { node: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400' },
  },
  review: {
    label: '审核', icon: <FileCheck size={22} />, desc: '审核 AI 推断结果',
    color: { node: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400' },
  },
  intake: {
    label: '入库', icon: <Package size={22} />, desc: '资产导入引擎',
    color: { node: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400' },
  },
}

const STAGE_ORDER = ['scan', 'analyze', 'review', 'intake']

interface WorkflowViewProps {
  onNavigate?: (view: string) => void
}

export function WorkflowView({ onNavigate }: WorkflowViewProps) {
  const { stats, loading, refresh } = useStats()
  const [runs, setRuns] = useState<PipelineRun[]>([])
  const [showConfig, setShowConfig] = useState(false)
  const [coreStages, setCoreStages] = useState<PipelineStage[]>([])
  const [customStages, setCustomStages] = useState<PipelineStage[]>([])
  const [branchTarget, setBranchTarget] = useState<string | null>(null)
  const [newBranch, setNewBranch] = useState({ label: '', description: '', prompt: '' })
  const [dataSource, setDataSource] = useState(API_BASE)

  useEffect(() => {
    getDataSource().then(setDataSource)
    fetchPipeline()
    fetchRuns()
  }, [])

  const fetchPipeline = async () => {
    try {
      const res = await fetch(`${dataSource}/api/pipeline`)
      const data = await res.json()
      setCoreStages(data.core_stages || [])
      setCustomStages(data.custom_stages || [])
    } catch {}
  }

  const fetchRuns = async () => {
    try {
      const res = await fetch(`${dataSource}/api/pipeline/runs?limit=200`)
      const data = await res.json()
      setRuns(data.runs || [])
    } catch {}
  }

  const savePipeline = async (core: PipelineStage[], custom: PipelineStage[]) => {
    try {
      await fetch(`${dataSource}/api/pipeline`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 1, core_stages: core, custom_stages: custom }),
      })
    } catch {}
  }

  // 当前流水线：最新会话的进度
  const currentPipeline = useMemo(() => {
    if (runs.length === 0) return null
    // 按 sessionId 分组，取最新的一组
    const groups = new Map<string, PipelineRun[]>()
    for (const run of runs) {
      const list = groups.get(run.sessionId) || []
      list.push(run)
      groups.set(run.sessionId, list)
    }
    let latest: { sessionId: string; runs: PipelineRun[]; lastActive: number } | null = null
    for (const [sessionId, sessionRuns] of groups) {
      const lastActive = Math.max(...sessionRuns.map(r => new Date(r.startedAt).getTime()))
      if (!latest || lastActive > latest.lastActive) {
        latest = { sessionId, runs: sessionRuns, lastActive }
      }
    }
    return latest
  }, [runs])

  // 历史会话（排除当前最新）
  const historySessions = useMemo(() => {
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
      .filter(g => currentPipeline ? g.sessionId !== currentPipeline.sessionId : true)
  }, [runs, currentPipeline])

  const [executingStage, setExecutingStage] = useState<string | null>(null)

  const handleRunStage = async (stageId: string, label: string) => {
    setExecutingStage(stageId)
    try {
      const res = await fetch(`${API_BASE}/api/pipeline/run`, {
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

  const handleJumpToChat = () => onNavigate?.('chat')

  const formatTime = (ts: string) => {
    if (!ts) return ''
    const d = new Date(ts)
    const now = new Date()
    return d.toDateString() === now.toDateString()
      ? d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-4 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2">
          <GitBranch size={18} className="text-primary" />
          <h2 className="text-sm font-medium">资产流水线</h2>
          {stats && <span className="text-xs text-muted-foreground">{stats.total} 个资产</span>}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className={`p-1.5 rounded transition-colors ${showConfig ? 'bg-foreground/[0.08] text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
            title="阶段配置"
          >
            <Settings size={16} />
          </button>
          <button
            onClick={() => { refresh(); fetchRuns() }}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded hover:bg-muted"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {/* 配置面板（折叠） */}
      {showConfig && (
        <PipelineConfigPanel
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
            setCustomStages(updated); savePipeline(coreStages, updated)
            setBranchTarget(null); setNewBranch({ label: '', description: '', prompt: '' })
            toast.success(`已添加分支: ${stage.label}`)
          }}
          onDelete={(id) => {
            const updated = customStages.filter(s => s.id !== id)
            setCustomStages(updated); savePipeline(coreStages, updated)
            toast.success('已删除分支')
          }}
          onClose={() => setShowConfig(false)}
        />
      )}

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-4">
        <div className="max-w-3xl mx-auto space-y-6">
          {runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <GitBranch size={40} className="text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground/60">暂无流水线记录</p>
              <p className="text-xs text-muted-foreground/40 mt-1">在对话中让 Agent 分析资产后，这里会自动显示进度</p>
            </div>
          ) : (
            <>
              {/* ===== 当前流水线看板 ===== */}
              {currentPipeline && (
                <section>
                  <h3 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
                    <Clock size={12} />
                    当前流水线
                    <span className="text-[10px] text-muted-foreground/60">
                      {formatTime(new Date(currentPipeline.lastActive).toISOString())}
                    </span>
                  </h3>

                  {/* 4 节点看板 */}
                  <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
                    <div className="p-5">
                      <div className="flex items-stretch justify-between gap-2">
                        {STAGE_ORDER.map((id, i) => {
                          const meta = STAGE_META[id]
                          const done = currentPipeline.runs.some(r => r.stageId === id)
                          const stageRuns = currentPipeline.runs.filter(r => r.stageId === id)
                          const c = meta.color
                          return (
                            <React.Fragment key={id}>
                              <div className="flex-1 min-w-0 flex flex-col">
                                <div className={`flex flex-col items-center text-center flex-1 ${done ? '' : 'opacity-45'}`}>
                                  {/* 节点图标 */}
                                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border-2 transition-all ${
                                    done
                                      ? `${c.bg} ${c.border} ${c.node} shadow-sm`
                                      : 'bg-muted/50 border-border/30 text-muted-foreground/40'
                                  }`}>
                                    {meta.icon}
                                  </div>
                                  {/* 标签 */}
                                  <div className="mt-2 flex items-center gap-1 justify-center">
                                    <span className={`text-sm font-semibold ${done ? 'text-foreground' : 'text-muted-foreground/60'}`}>
                                      {meta.label}
                                    </span>
                                    {done && <span className="text-success">✓</span>}
                                  </div>
                                  <p className="text-[11px] text-muted-foreground/60 mt-0.5 leading-tight">{meta.desc}</p>
                                  {/* 摘要 */}
                                  {stageRuns.length > 0 && (
                                    <div className="mt-1.5 space-y-0.5">
                                      {stageRuns.slice(0, 2).map(r => (
                                        <p key={r.runId} className="text-[10px] text-muted-foreground/50 truncate max-w-[120px]">
                                          {String(r.summary || '')}
                                        </p>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                {/* 执行按钮 */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleRunStage(id, meta.label) }}
                                  disabled={executingStage === id}
                                  className={`mt-auto inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
                                    done
                                      ? 'bg-foreground/[0.06] text-muted-foreground hover:bg-foreground/[0.12] hover:text-foreground'
                                      : 'bg-muted text-muted-foreground/60 hover:bg-muted/80'
                                  } disabled:opacity-50`}
                                >
                                  {executingStage === id
                                    ? <Loader2 size={10} className="animate-spin" />
                                    : <Play size={10} />
                                  }
                                  执行
                                </button>
                              </div>
                            {/* 箭头 */}
                            {i < STAGE_ORDER.length - 1 && (
                                <div className="flex items-center pt-7 shrink-0 px-1">
                                  <ChevronRight size={18} className={
                                    currentPipeline.runs.some(r => r.stageId === STAGE_ORDER[i + 1])
                                      ? 'text-muted-foreground/60' : 'text-muted-foreground/20'
                                  } />
                                </div>
                              )}
                            </React.Fragment>
                          )
                        })}
                      </div>
                    </div>
                    {/* 底部操作 */}
                    <div className="border-t border-border/30 px-5 py-2.5 flex items-center justify-between bg-muted/20">
                      <span className="text-xs text-muted-foreground">
                        {currentPipeline.runs.length} 次工具调用 · 来自当前对话
                      </span>
                      <button
                        onClick={handleJumpToChat}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                      >
                        查看详情
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {/* ===== 历史记录 ===== */}
              {historySessions.length > 0 && (
                <section>
                  <h3 className="text-xs font-medium text-muted-foreground mb-3">历史记录</h3>
                  <div className="space-y-2">
                    {historySessions.map((group) => (
                      <SessionCard
                        key={group.sessionId}
                        runs={group.runs}
                        lastActive={group.lastActive}
                        formatTime={formatTime}
                        onJumpToChat={handleJumpToChat}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** 历史会话卡片 */
function SessionCard({
  runs, lastActive, formatTime, onJumpToChat,
}: {
  runs: PipelineRun[]
  lastActive: number
  formatTime: (ts: string) => string
  onJumpToChat: () => void
}) {
  const hasStage = (id: string) => runs.some(r => r.stageId === id)

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden hover:border-border/60 transition-colors">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{formatTime(new Date(lastActive).toISOString())}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{runs.length} 次操作</span>
        </div>
        <button onClick={onJumpToChat} className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
          查看对话 <ArrowRight size={12} />
        </button>
      </div>
      <div className="px-4 py-3">
        <div className="flex items-center gap-1">
          {STAGE_ORDER.map((id, i) => {
            const meta = STAGE_META[id]
            const done = hasStage(id)
            const stageRuns = runs.filter(r => r.stageId === id)
            return (
              <React.Fragment key={id}>
                <div className="flex-1 min-w-0">
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${done ? 'bg-foreground/[0.04]' : ''}`}>
                    <div className={`shrink-0 ${done ? meta.color.node : 'text-muted-foreground/40'}`}>{meta.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-medium ${done ? 'text-foreground' : 'text-muted-foreground/40'}`}>{meta.label}</span>
                        {done && <span className="text-[10px] text-success">✓</span>}
                      </div>
                      {stageRuns.length > 0 && (
                        <div className="text-[10px] text-muted-foreground/60 truncate mt-0.5">
                          {stageRuns.map(r => String(r.summary || '')).filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {i < STAGE_ORDER.length - 1 && (
                  <ChevronRight size={14} className={`shrink-0 ${done && hasStage(STAGE_ORDER[i + 1]) ? 'text-muted-foreground/60' : 'text-muted-foreground/20'}`} />
                )}
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** 阶段配置面板 */
function PipelineConfigPanel({
  coreStages, customStages, branchTarget, newBranch,
  onSetBranchTarget, onNewBranchChange, onAddBranch, onDelete, onClose,
}: {
  coreStages: PipelineStage[]; customStages: PipelineStage[]
  branchTarget: string | null; newBranch: { label: string; description: string; prompt: string }
  onSetBranchTarget: (id: string | null) => void
  onNewBranchChange: (v: { label: string; description: string; prompt: string }) => void
  onAddBranch: (parentId: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [expandedStage, setExpandedStage] = useState<string | null>(null)

  return (
    <div className="border-b border-border/50 bg-muted/30">
      <div className="max-w-3xl mx-auto p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-muted-foreground">阶段配置</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground transition-colors">
            <X size={14} />
          </button>
        </div>
        {coreStages.map((stage) => {
          const isExpanded = expandedStage === stage.id
          const branches = customStages.filter(s => s.parentId === stage.id)
          return (
            <div key={stage.id} className="rounded-lg border border-border/30 bg-card overflow-hidden">
              <button
                onClick={() => setExpandedStage(isExpanded ? null : stage.id)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-accent/30 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{stage.label}</span>
                  {branches.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{branches.length} 分支</span>
                  )}
                </div>
                {isExpanded ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
              </button>
              {isExpanded && (
                <div className="px-3 pb-3 space-y-2">
                  {branches.map((branch) => (
                    <div key={branch.id} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-muted/50">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs">{branch.label}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{branch.description || branch.prompt}</div>
                      </div>
                      <button onClick={() => onDelete(branch.id)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                  {branchTarget === stage.id ? (
                    <div className="space-y-2">
                      <input type="text" value={newBranch.label} onChange={(e) => onNewBranchChange({ ...newBranch, label: e.target.value })}
                        placeholder="分支名称" className="w-full px-2 py-1 text-xs bg-muted border border-border rounded outline-none focus:ring-1 focus:ring-ring" autoFocus />
                      <textarea value={newBranch.prompt} onChange={(e) => onNewBranchChange({ ...newBranch, prompt: e.target.value })}
                        placeholder="提示词" rows={2} className="w-full px-2 py-1 text-xs bg-muted border border-border rounded outline-none focus:ring-1 focus:ring-ring resize-none" />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => onSetBranchTarget(null)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent">取消</button>
                        <button onClick={() => onAddBranch(stage.id)} className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded hover:bg-primary/80">添加</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => onSetBranchTarget(stage.id)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      <Plus size={12} /> 添加分支
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}