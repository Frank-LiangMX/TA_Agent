import React from 'react'
import { Loader2, CheckCircle2, AlertCircle, Slash, ChevronRight, ChevronDown } from 'lucide-react'
import type { SubAgentType, SubAgentStatus } from '@/types'

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
}

export interface SubAgentCardProps {
  state: SubAgentState
  onStop?: (taskId: string) => void
  onViewDetails?: (taskId: string) => void
}

const TYPE_LABEL: Record<SubAgentType, string> = {
  explorer: '代码探索',
  researcher: '技术调研',
  'code-reviewer': '代码评审',
}

export function SubAgentCard({ state, onStop, onViewDetails }: SubAgentCardProps) {
  const [toolsExpanded, setToolsExpanded] = React.useState(false)
  const [tick, setTick] = React.useState(0)
  // 简易 1s 一次的 timer 用于 running 状态的实时秒数
  React.useEffect(() => {
    if (state.status !== 'running') return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [state.status])
  const elapsed = Math.round((Date.now() - state.started_at) / 1000)

  return (
    <div className="my-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 text-sm">
        {state.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
        {state.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
        {state.status === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
        {state.status === 'stopped' && <Slash className="h-4 w-4 text-slate-400" />}
        <span className="font-medium">SubAgent · {TYPE_LABEL[state.subagent_type]} ({state.subagent_type})</span>
        {state.run_in_background && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">后台</span>
        )}
      </div>

      {/* Description */}
      <div className="mt-1 text-sm text-slate-600">"{state.description}"</div>

      {/* Tools (collapsed by default) */}
      {state.tools.length > 0 && (
        <div className="mt-2 border-t border-slate-100 pt-2">
          <button
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
            onClick={() => setToolsExpanded(!toolsExpanded)}
          >
            {toolsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            嵌套工具调用 ({state.tools.length})
          </button>
          {toolsExpanded && (
            <div className="mt-1 space-y-0.5 pl-4 text-xs text-slate-600">
              {state.tools.map((t, i) => (
                <div key={i} className="font-mono">
                  ↳ {t.name}({t.args_preview})
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Result (only when completed) */}
      {state.status === 'completed' && state.result_preview && (
        <div className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs text-slate-700">
          {state.result_preview.slice(0, 500)}
          {state.result_preview.length > 500 && '...'}
        </div>
      )}

      {/* Error message */}
      {state.status === 'error' && state.error && (
        <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">
          {state.error}
        </div>
      )}

      {/* Footer */}
      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>
          {state.status === 'running' ? (
            <>已用 {state.step_count} 步 · {elapsed}s · {state.model || '...'}</>
          ) : state.status === 'completed' ? (
            <>共 {state.total_steps || 0} 步 · {state.total_tokens || 0} tokens</>
          ) : state.status === 'error' ? (
            <>出错</>
          ) : (
            <>已停止</>
          )}
        </span>
        <div className="flex gap-2">
          {state.status === 'running' && !state.run_in_background && onStop && (
            <button
              className="rounded px-2 py-0.5 text-red-600 hover:bg-red-50"
              onClick={() => onStop(state.task_id)}
            >
              停止
            </button>
          )}
          {state.run_in_background && onViewDetails && (
            <button
              className="rounded px-2 py-0.5 text-blue-600 hover:bg-blue-50"
              onClick={() => onViewDetails(state.task_id)}
            >
              查看进度
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
