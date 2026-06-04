/**
 * 工具权限审批弹窗
 *
 * 通用模式下，当 LLM 调用被分类为 dangerous 的工具时弹出。
 * 提供四种决策：拒绝 / 允许一次 / 本次会话都允许 / 永久允许。
 */

import React, { useEffect, useRef } from 'react'
import { ShieldAlert, ShieldX } from 'lucide-react'

export type PermissionDecision =
  | 'allow-once'
  | 'allow-session'
  | 'allow-permanent'
  | 'deny'

interface PermissionDialogProps {
  open: boolean
  toolName: string
  arguments: Record<string, unknown>
  classification: 'hardline' | 'dangerous'
  onRespond: (decision: PermissionDecision) => void
}

function formatArgs(args: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(args)) {
    if (k === 'error') continue
    const val = typeof v === 'string' ? v : JSON.stringify(v)
    if (val && val.length > 200) {
      parts.push(`${k}: ${val.slice(0, 200)}…`)
    } else {
      parts.push(`${k}: ${val}`)
    }
  }
  return parts.join('\n')
}

export function PermissionDialog({
  open,
  toolName,
  arguments: args,
  classification,
  onRespond,
}: PermissionDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onRespond('deny')
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onRespond])

  if (!open) return null

  const isHardline = classification === 'hardline'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={() => onRespond('deny')}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        className="relative w-full max-w-md mx-4 bg-card border border-border/50 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-5 pt-5 pb-3 flex items-start gap-3 border-b border-border/50 ${
          isHardline ? 'bg-destructive/5' : 'bg-warning/5'
        }`}>
          <div className={`shrink-0 p-2 rounded-lg ${
            isHardline ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'
          }`}>
            {isHardline ? <ShieldX size={18} /> : <ShieldAlert size={18} />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground">
              {isHardline ? '危险操作已被拦截' : '需要你的授权'}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isHardline
                ? '此操作命中了系统硬性禁止规则'
                : 'Agent 正在调用一个可能有副作用的工具'}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <div>
            <div className="text-[11px] font-medium text-muted-foreground mb-1">工具</div>
            <code className="block text-xs font-mono px-2.5 py-1.5 rounded-md bg-muted/60 text-foreground break-all">
              {toolName}
            </code>
          </div>
          <div>
            <div className="text-[11px] font-medium text-muted-foreground mb-1">参数</div>
            <pre className="text-xs font-mono px-2.5 py-2 rounded-md bg-muted/40 text-foreground max-h-32 overflow-y-auto whitespace-pre-wrap break-all">
              {formatArgs(args)}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-2 flex flex-col gap-2">
          {isHardline ? (
            <button
              onClick={() => onRespond('deny')}
              className="w-full py-2 px-3 text-xs rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
            >
              知道了
            </button>
          ) : (
            <>
              <button
                onClick={() => onRespond('allow-once')}
                className="w-full py-2 px-3 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
              >
                允许这一次
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onRespond('allow-session')}
                  className="py-2 px-3 text-xs rounded-lg bg-muted text-foreground hover:bg-accent transition-colors"
                >
                  本次会话都允许
                </button>
                <button
                  onClick={() => onRespond('allow-permanent')}
                  className="py-2 px-3 text-xs rounded-lg bg-muted text-foreground hover:bg-accent transition-colors"
                >
                  永久允许
                </button>
              </div>
              <button
                onClick={() => onRespond('deny')}
                className="w-full py-2 px-3 text-xs rounded-lg text-muted-foreground hover:bg-accent transition-colors"
              >
                拒绝
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
