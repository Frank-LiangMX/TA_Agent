import React from 'react'
import { X } from 'lucide-react'
import type { SubAgentState } from './SubAgentCard'

export interface SubAgentSidePanelProps {
  state: SubAgentState | null
  onClose: () => void
}

export function SubAgentSidePanel({ state, onClose }: SubAgentSidePanelProps) {
  if (!state) return null
  const elapsed = Math.round((Date.now() - state.started_at) / 1000)
  return (
    <div className="fixed right-0 top-0 z-50 h-full w-96 overflow-y-auto bg-white shadow-2xl border-l border-slate-200">
      <div className="flex items-center justify-between border-b border-slate-200 p-3">
        <h3 className="text-sm font-medium">SubAgent · {state.subagent_type}</h3>
        <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-3 p-3 text-sm">
        <div>
          <div className="text-xs text-slate-500">描述</div>
          <div>"{state.description}"</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">task_id</div>
          <div className="font-mono text-xs break-all">{state.task_id}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">状态</div>
          <div>{state.status} · {state.step_count} 步 · {elapsed}s · {state.model || '...'}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">工具调用（{state.tools.length}）</div>
          {state.tools.length === 0 ? (
            <div className="text-xs text-slate-400">（暂无）</div>
          ) : (
            <div className="space-y-1">
              {state.tools.map((t, i) => (
                <div key={i} className="rounded bg-slate-50 p-1 font-mono text-xs">
                  ↳ {t.name}({t.args_preview})
                </div>
              ))}
            </div>
          )}
        </div>
        {state.result_preview && (
          <div>
            <div className="text-xs text-slate-500">结果</div>
            <div className="whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs max-h-96 overflow-y-auto">
              {state.result_preview}
            </div>
          </div>
        )}
        {state.error && (
          <div>
            <div className="text-xs text-slate-500">错误</div>
            <div className="whitespace-pre-wrap rounded bg-red-50 p-2 text-xs text-red-700">
              {state.error}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
