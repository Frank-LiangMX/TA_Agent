import React from 'react'
import {
  ChevronRight,
  Loader2,
  XCircle,
  Compass,
  BookOpen,
  ClipboardCheck,
  MessageSquare,
  Wrench,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { SubAgentType, SubAgentStatus } from '@/types'
import { getSubAgentPhrase } from '@/lib/subagent-phrase'

export type SubAgentState = {
  task_id: string
  subagent_type: SubAgentType
  description: string
  run_in_background: boolean
  status: SubAgentStatus
  started_at: number
  model?: string
  step_count: number
  tools: { name: string; args_preview: string }[]
  result_preview?: string
  total_steps?: number
  total_tokens?: number
  error?: string
  duration_ms?: number
}

export interface SubAgentCardProps {
  state: SubAgentState
  onStop?: (taskId: string) => void
  onViewDetails?: (taskId: string) => void
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  explorer: Compass,
  researcher: BookOpen,
  'code-reviewer': ClipboardCheck,
}

function PromptRow({ prompt }: { prompt: string }) {
  const [expanded, setExpanded] = React.useState(false)
  const preview = prompt.length > 60 ? prompt.slice(0, 60) + '…' : prompt
  return (
    <button
      type="button"
      onClick={() => setExpanded(!expanded)}
      className="flex items-center gap-2 py-0.5 text-left hover:opacity-70 transition-opacity"
    >
      <MessageSquare className="size-3.5 text-muted-foreground shrink-0" />
      <span className="text-[14px] text-muted-foreground">提示词</span>
      <span className="truncate text-[14px] text-muted-foreground/60">{preview}</span>
    </button>
  )
}

function SubToolRow({ name, args_preview }: { name: string; args_preview: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5 text-[14px] text-muted-foreground">
      <Wrench className="size-3.5 shrink-0" />
      <span className="font-mono">{name}</span>
      {args_preview && <span className="text-muted-foreground/60 truncate">({args_preview})</span>}
    </div>
  )
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function SubAgentCard({ state, onStop, onViewDetails }: SubAgentCardProps) {
  const [expanded, setExpanded] = React.useState(false)
  const [, setTick] = React.useState(0)
  React.useEffect(() => {
    if (state.status !== 'running') return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [state.status])

  const phrase = getSubAgentPhrase(state.subagent_type)
  const isCompleted =
    state.status === 'completed' ||
    state.status === 'error' ||
    state.status === 'stopped'
  const displayLabel = isCompleted ? phrase.label : phrase.loadingLabel
  const Icon = ICON_MAP[state.subagent_type] || Compass

  const toolCount = state.tools.length
  const elapsed =
    state.status === 'running'
      ? Math.round((Date.now() - state.started_at) / 1000)
      : 0

  return (
    <div className="my-1">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 py-1 text-left hover:opacity-70 transition-opacity"
      >
        <ChevronRight
          className={`size-3 text-muted-foreground/50 transition-transform shrink-0 ${
            expanded ? 'rotate-90' : ''
          }`}
        />
        {state.status === 'running' && (
          <Loader2 className="size-3.5 animate-spin text-primary/50 shrink-0" />
        )}
        {state.status === 'error' && (
          <XCircle className="size-3.5 text-destructive/70 shrink-0" />
        )}
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-[14px] text-muted-foreground">
          {displayLabel}
        </span>
        {toolCount > 0 && !expanded && (
          <span className="shrink-0 text-[11px] text-muted-foreground/50 tabular-nums">
            {toolCount} 项工具调用
          </span>
        )}
        {state.run_in_background && (
          <span className="shrink-0 text-[11px] text-muted-foreground/50 px-1.5 py-0.5 rounded bg-muted/40">
            后台
          </span>
        )}
      </button>

      {expanded && (
        <div className="pl-5 mt-1 space-y-1.5 border-l-2 border-primary/20 ml-[5px]">
          {state.description && <PromptRow prompt={state.description} />}
          {state.tools.map((t, i) => (
            <SubToolRow key={i} name={t.name} args_preview={t.args_preview} />
          ))}
          {state.status === 'completed' && state.result_preview && (
            <div className="text-[13px] text-foreground/85 leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-pre:my-2 prose-code:text-primary max-h-96 overflow-y-auto rounded-md bg-muted/30 p-3">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {state.result_preview.slice(0, 4000) + (state.result_preview.length > 4000 ? '\n\n_... 内容已截断 ..._' : '')}
              </ReactMarkdown>
            </div>
          )}
          {state.status === 'error' && state.error && (
            <div className="text-[13px] text-destructive">{state.error}</div>
          )}
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground/60 tabular-nums">
            {state.status === 'running' && (
              <span>已用 {state.step_count} 步 · {elapsed}s</span>
            )}
            {state.status === 'completed' && (state.total_steps ?? 0) > 0 && (
              <span>共 {state.total_steps} 步</span>
            )}
            {(state.total_tokens ?? 0) > 0 && (
              <span>{state.total_tokens!.toLocaleString()} tokens</span>
            )}
            {state.duration_ms != null && state.duration_ms > 0 && state.status === 'completed' && (
              <span>{formatDuration(state.duration_ms)}</span>
            )}
          </div>
          <div className="flex items-center gap-2 pt-1">
            {state.status === 'running' && !state.run_in_background && onStop && (
              <button
                onClick={() => onStop(state.task_id)}
                className="text-[11px] text-red-600 hover:bg-red-50 rounded px-2 py-0.5"
              >
                停止
              </button>
            )}
            {state.run_in_background && onViewDetails && (
              <button
                onClick={() => onViewDetails(state.task_id)}
                className="text-[11px] text-blue-600 hover:bg-blue-50 rounded px-2 py-0.5"
              >
                查看进度
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
