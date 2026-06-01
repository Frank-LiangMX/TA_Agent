import React, { useEffect, useState } from 'react'
import { Clock3 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { listSessions } from '@/services/sessions'
import type { SessionMeta } from '@/types'

interface GeneralHistoryViewProps {
  onOpenSession: (sessionId: string) => void
}

export function GeneralHistoryView({ onOpenSession }: GeneralHistoryViewProps) {
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    setLoading(true)
    listSessions(false)
      .then((rows) => setSessions(rows))
      .finally(() => setLoading(false))
  }, [])

  const filtered = sessions.filter((s) => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      s.title.toLowerCase().includes(q) ||
      (s.workspaceName || '').toLowerCase().includes(q)
    )
  })

  const groups = filtered.reduce<Record<string, SessionMeta[]>>((acc, s) => {
    const key = s.workspaceName || '未命名工作区'
    if (!acc[key]) acc[key] = []
    acc[key].push(s)
    return acc
  }, {})

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
      <PageHeader>
        <Clock3 size={18} className="text-primary shrink-0" />
        <h2 className="text-sm font-medium">会话历史</h2>
      </PageHeader>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-6">
        <p className="text-xs text-muted-foreground mb-4">
          按工作区浏览历史会话；点击条目将在对话页打开该会话（标签栏用于切换已打开的会话）。
        </p>
        <div className="rounded-xl border border-border/60 bg-card p-2 w-full">
          <div className="px-2 py-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索会话或工作区..."
              className="w-full text-sm px-2 py-1 rounded border border-border/60 bg-background outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">加载中...</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">暂无会话</div>
          ) : (
            <div className="space-y-2">
              {Object.entries(groups).map(([workspace, rows]) => (
                <div key={workspace}>
                  <div className="px-2 py-1 text-xs text-muted-foreground">{workspace}</div>
                  <div className="divide-y divide-border/50">
                    {rows.slice(0, 20).map((s) => (
                      <button
                        key={s.sessionId}
                        type="button"
                        onClick={() => onOpenSession(s.sessionId)}
                        className="w-full text-left px-3 py-2 hover:bg-accent rounded-md transition-colors"
                      >
                        <div className="text-sm truncate">{s.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.messageCount} 条消息 · {s.lastActive}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
