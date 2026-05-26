/**
 * 会话列表弹出面板
 *
 * 搜索 + 置顶 + 日期分组 + 归档折叠 + 批量管理
 */

import React, { useState, useEffect, useMemo } from 'react'
import {
  Search,
  Pin,
  Archive,
  Trash2,
  Plus,
  MessageSquare,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  CheckCircle2,
  Square,
  X,
} from 'lucide-react'
import { listSessions, createSession, updateSession, deleteSession } from '@/services/sessions'
import type { SessionMeta } from '@/types'

interface SessionPopoverProps {
  currentSessionId: string | null
  refreshKey?: number
  onSelect: (sessionId: string) => void
  onNewSession: () => void
  onClose: () => void
}

export function SessionPopover({ currentSessionId, refreshKey = 0, onSelect, onNewSession, onClose }: SessionPopoverProps) {
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const loadSessions = async () => {
    setLoading(true)
    try {
      const data = await listSessions(showArchived)
      setSessions(data)
    } catch (e) {
      console.error('加载会话列表失败:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSessions()
  }, [showArchived, refreshKey])

  // 搜索过滤
  const filtered = useMemo(() => {
    if (!search.trim()) return sessions
    const q = search.toLowerCase()
    return sessions.filter((s) => s.title.toLowerCase().includes(q))
  }, [sessions, search])

  // 分组：置顶 / 今天 / 更早
  const { pinned, today, older } = useMemo(() => {
    const pinned: SessionMeta[] = []
    const today: SessionMeta[] = []
    const older: SessionMeta[] = []
    const todayStr = new Date().toISOString().slice(0, 10)

    for (const s of filtered) {
      if (s.isPinned) {
        pinned.push(s)
      } else if (s.lastActive.slice(0, 10) === todayStr) {
        today.push(s)
      } else {
        older.push(s)
      }
    }
    return { pinned, today, older }
  }, [filtered])

  // 置顶/取消置顶
  const handleTogglePin = async (e: React.MouseEvent, session: SessionMeta) => {
    e.stopPropagation()
    await updateSession(session.sessionId, { isPinned: !session.isPinned })
    loadSessions()
  }

  // 归档
  const handleArchive = async (e: React.MouseEvent, session: SessionMeta) => {
    e.stopPropagation()
    await updateSession(session.sessionId, { isArchived: true })
    loadSessions()
  }

  // 删除单个
  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    if (!confirm('确定删除这个会话？')) return
    await deleteSession(sessionId)
    if (sessionId === currentSessionId) onNewSession()
    loadSessions()
  }

  // 切换选中
  const toggleSelect = (sessionId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((s) => s.sessionId)))
    }
  }

  // 批量删除
  const handleBatchDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`确定删除选中的 ${selected.size} 个会话？`)) return
    const ids = Array.from(selected)
    for (const id of ids) {
      await deleteSession(id)
      if (id === currentSessionId) onNewSession()
    }
    setSelected(new Set())
    setSelectMode(false)
    loadSessions()
  }

  // 退出管理模式
  const exitSelectMode = () => {
    setSelectMode(false)
    setSelected(new Set())
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  // 传给子组件的通用 props
  const groupProps = {
    currentSessionId,
    selectMode,
    selected,
    onSelect,
    onTogglePin: handleTogglePin,
    onArchive: handleArchive,
    onDelete: handleDelete,
    onToggleSelect: toggleSelect,
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16"
      onClick={handleBackdropClick}
    >
      <div className="w-96 max-h-[70vh] bg-popover rounded-lg shadow-xl border border-border/30 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* 头部 */}
        <div className="px-4 pt-4 pb-2 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">
              {selectMode ? `已选 ${selected.size} 项` : '会话列表'}
            </h3>
            <div className="flex items-center gap-1">
              {selectMode ? (
                <button
                  onClick={exitSelectMode}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent"
                >
                  <X size={14} />
                  取消
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setSelectMode(true)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent"
                    title="管理模式"
                  >
                    <CheckSquare size={14} />
                  </button>
                  <button
                    onClick={onNewSession}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent"
                  >
                    <Plus size={14} />
                    新建
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 搜索框 */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索会话..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted border border-border rounded outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
          </div>
        </div>

        {/* 会话列表 */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-2">
          {loading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">加载中...</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {search ? '没有匹配的会话' : '还没有会话'}
            </div>
          ) : (
            <>
              <SessionGroup label="置顶" sessions={pinned} {...groupProps} />
              <SessionGroup label="今天" sessions={today} {...groupProps} />
              <SessionGroup label="更早" sessions={older} {...groupProps} />
            </>
          )}
        </div>

        {/* 底部 */}
        <div className="px-4 py-2 border-t border-border/50 flex items-center justify-between">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showArchived ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <Archive size={12} />
            {showArchived ? '隐藏归档' : '显示归档'}
          </button>

          {selectMode && (
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSelectAll}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {selected.size === filtered.length ? '取消全选' : '全选'}
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={selected.size === 0}
                className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 disabled:opacity-30 transition-colors"
              >
                <Trash2 size={12} />
                删除 ({selected.size})
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ===== 会话分组 =====

function SessionGroup({
  label,
  sessions,
  ...props
}: {
  label: string
  sessions: SessionMeta[]
  currentSessionId: string | null
  selectMode: boolean
  selected: Set<string>
  onSelect: (id: string) => void
  onTogglePin: (e: React.MouseEvent, s: SessionMeta) => void
  onArchive: (e: React.MouseEvent, s: SessionMeta) => void
  onDelete: (e: React.MouseEvent, id: string) => void
  onToggleSelect: (id: string) => void
}) {
  if (sessions.length === 0) return null

  return (
    <div className="mb-2">
      <div className="px-2 py-1">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
      </div>
      {sessions.map((s) => (
        <SessionItem key={s.sessionId} session={s} isActive={s.sessionId === props.currentSessionId} {...props} />
      ))}
    </div>
  )
}

// ===== 单个会话项 =====

function SessionItem({
  session,
  isActive,
  selectMode,
  selected,
  onSelect,
  onTogglePin,
  onArchive,
  onDelete,
  onToggleSelect,
}: {
  session: SessionMeta
  isActive: boolean
  selectMode: boolean
  selected: Set<string>
  onSelect: (id: string) => void
  onTogglePin: (e: React.MouseEvent, s: SessionMeta) => void
  onArchive: (e: React.MouseEvent, s: SessionMeta) => void
  onDelete: (e: React.MouseEvent, id: string) => void
  onToggleSelect: (id: string) => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const isSelected = selected.has(session.sessionId)

  const timeStr = useMemo(() => {
    const d = new Date(session.lastActive)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    if (isToday) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }, [session.lastActive])

  const handleClick = () => {
    if (selectMode) {
      onToggleSelect(session.sessionId)
    } else {
      onSelect(session.sessionId)
    }
  }

  return (
    <div
      className={`
        group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors relative
        ${isActive && !selectMode
          ? 'bg-foreground/[0.08] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] ring-1 ring-border/50'
          : isSelected
            ? 'bg-primary/10'
            : 'hover:bg-accent'
        }
      `}
      onClick={handleClick}
    >
      {/* 管理模式：复选框 */}
      {selectMode ? (
        <div className="shrink-0 w-4 h-4 flex items-center justify-center">
          {isSelected ? (
            <CheckSquare size={16} className="text-primary" />
          ) : (
            <Square size={16} className="text-muted-foreground" />
          )}
        </div>
      ) : (
        <MessageSquare size={14} className={`${isActive ? 'text-primary' : 'text-muted-foreground'} shrink-0`} />
      )}

      {isActive && !selectMode && (
        <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="text-sm truncate">{session.title}</div>
          {isActive && !selectMode && (
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              <CheckCircle2 size={10} />
              当前
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {session.messageCount} 条消息 · {timeStr}
        </div>
      </div>

      {/* 操作按钮（非管理模式） */}
      {!selectMode && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {session.isPinned && (
            <Pin size={12} className="text-primary fill-current" />
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowMenu(!showMenu)
            }}
            className="p-1 rounded hover:bg-foreground/10 transition-colors"
          >
            <MoreHorizontal size={14} className="text-muted-foreground" />
          </button>
        </div>
      )}

      {/* 右键菜单 */}
      {showMenu && !selectMode && (
        <div className="absolute right-0 top-full z-10 w-36 bg-popover rounded-md shadow-lg border border-border/30 py-1 animate-in fade-in zoom-in-95 duration-100">
          <button
            onClick={(e) => { onTogglePin(e, session); setShowMenu(false) }}
            className="w-full px-3 py-1.5 text-xs text-left hover:bg-accent flex items-center gap-2"
          >
            <Pin size={12} />
            {session.isPinned ? '取消置顶' : '置顶'}
          </button>
          {!session.isArchived && (
            <button
              onClick={(e) => { onArchive(e, session); setShowMenu(false) }}
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-accent flex items-center gap-2"
            >
              <Archive size={12} />
              归档
            </button>
          )}
          <button
            onClick={(e) => { onDelete(e, session.sessionId); setShowMenu(false) }}
            className="w-full px-3 py-1.5 text-xs text-left hover:bg-accent text-destructive flex items-center gap-2"
          >
            <Trash2 size={12} />
            删除
          </button>
        </div>
      )}
    </div>
  )
}
