/**
 * 会话选择器 - MainPanel 头部的会话标题按钮
 *
 * 点击弹出 SessionPopover
 */

import React, { useState, useEffect, useMemo } from 'react'
import { ChevronDown, MessageSquare } from 'lucide-react'
import { SessionPopover } from './SessionPopover'
import { getSession } from '@/services/sessions'
import type { SessionMeta } from '@/types'

interface SessionSelectorProps {
  sessionId: string | null
  onSessionChange: (sessionId: string) => void
  onNewSession: () => void
  refreshKey?: number
}

export function SessionSelector({ sessionId, onSessionChange, onNewSession, refreshKey }: SessionSelectorProps) {
  const [open, setOpen] = useState(false)
  const [meta, setMeta] = useState<SessionMeta | null>(null)

  // 加载当前会话元数据（sessionId 或 refreshKey 变化时重新加载）
  useEffect(() => {
    if (!sessionId) {
      setMeta(null)
      return
    }
    getSession(sessionId).then(setMeta).catch(() => setMeta(null))
  }, [sessionId, refreshKey])

  const title = meta?.title || '新会话'

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-sm font-medium hover:text-foreground/80 transition-colors max-w-[300px]"
      >
        <MessageSquare size={14} className="text-muted-foreground shrink-0" />
        <span className="truncate">{title}</span>
        <ChevronDown size={14} className="text-muted-foreground shrink-0" />
      </button>

      {open && (
        <SessionPopover
          currentSessionId={sessionId}
          onSelect={(id) => {
            onSessionChange(id)
            setOpen(false)
          }}
          onNewSession={() => {
            onNewSession()
            setOpen(false)
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
