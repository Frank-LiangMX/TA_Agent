/**
 * 多会话标签栏（对齐 Proma Agent 风格）
 *
 * - 活跃标签底部蓝色 accent
 * - 悬停显示会话消息预览列表（最近 N 条，每条角色图标 + 200 字预览）
 * - 左侧下拉按钮打开会话列表弹窗
 * - 弹窗中选择会话 → 开新标签页
 */
import React, { useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Plus, X, MessageSquare, ChevronDown, User, Bot, AlertCircle } from 'lucide-react'
import { getSession, getSessionMessages } from '@/services/sessions'
import { SessionPopover } from './SessionPopover'

interface SessionTabBarProps {
  openTabs: string[]
  activeTabId: string | null
  tabTitles: Record<string, string>
  streamingTabs?: Set<string>
  sessionRefreshKey?: number
  onTabSelect: (id: string) => void
  onTabClose: (id: string) => void
  onNewTab: () => void
}

interface PreviewItem {
  id: string
  role: string
  preview: string
}

interface HoverState {
  x: number
  y: number
  width: number
  maxHeight: number
  tabId: string
  title: string
  items: PreviewItem[]
  messageCount?: number
}

const MAX_TABS = 8
const PREVIEW_LIMIT = 40
const PREVIEW_WIDTH = 360
const PREVIEW_MARGIN = 8
const PREVIEW_MIN_HEIGHT = 140
const PREVIEW_MAX_HEIGHT = 320
const PREVIEW_OPEN_DELAY = 450

export function SessionTabBar({
  openTabs, activeTabId, tabTitles, streamingTabs, sessionRefreshKey = 0,
  onTabSelect, onTabClose, onNewTab,
}: SessionTabBarProps) {
  const [showPopover, setShowPopover] = useState(false)
  const [hoverState, setHoverState] = useState<HoverState | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverRequestId = useRef(0)
  const fetchCache = useRef<Map<string, PreviewItem[]>>(new Map())

  const visibleTabs = openTabs.slice(0, MAX_TABS)

  const getPreviewRect = (tabRect: DOMRect) => {
    const width = Math.min(PREVIEW_WIDTH, window.innerWidth - PREVIEW_MARGIN * 2)
    const x = Math.min(
      Math.max(PREVIEW_MARGIN, tabRect.left),
      Math.max(PREVIEW_MARGIN, window.innerWidth - width - PREVIEW_MARGIN),
    )
    const availableBelow = window.innerHeight - tabRect.bottom - PREVIEW_MARGIN
    const availableAbove = tabRect.top - PREVIEW_MARGIN
    const placeAbove = availableBelow < PREVIEW_MIN_HEIGHT && availableAbove > availableBelow
    const availableHeight = placeAbove ? availableAbove : availableBelow
    const maxHeight = Math.max(
      PREVIEW_MIN_HEIGHT,
      Math.min(PREVIEW_MAX_HEIGHT, availableHeight - 4),
    )
    const y = placeAbove
      ? Math.max(PREVIEW_MARGIN, tabRect.top - maxHeight - 4)
      : Math.min(tabRect.bottom + 4, window.innerHeight - maxHeight - PREVIEW_MARGIN)

    return { x, y, width, maxHeight }
  }

  // 预加载最近消息并构建预览列表（同 Proma: content.slice(0, 200)）
  const fetchPreview = async (tabId: string): Promise<PreviewItem[]> => {
    const cached = fetchCache.current.get(tabId)
    if (cached) return cached

    try {
      const msgs = await getSessionMessages(tabId, PREVIEW_LIMIT)
      const items: PreviewItem[] = msgs
        .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content)
        .slice(-PREVIEW_LIMIT)
        .map(m => ({
          id: String(m.id || Math.random()),
          role: String(m.role || ''),
          preview: String(m.content || '').slice(0, 200),
        }))
      fetchCache.current.set(tabId, items)
      return items
    } catch {
      return []
    }
  }

  const handleTabMouseEnter = (e: React.MouseEvent, tabId: string) => {
    // 当前活跃标签不触发预览浮窗
    if (tabId === activeTabId) return
    
    if (hideTimer.current) clearTimeout(hideTimer.current)
    if (showTimer.current) clearTimeout(showTimer.current)

    const target = e.currentTarget as HTMLElement
    const requestId = ++hoverRequestId.current

    showTimer.current = setTimeout(async () => {
      if (hoverRequestId.current !== requestId || !target.matches(':hover')) return

      const previewRect = getPreviewRect(target.getBoundingClientRect())
      const cached = fetchCache.current.get(tabId)
      setHoverState({
        ...previewRect,
        tabId,
        title: tabTitles[tabId] || '新会话',
        items: cached || [],
      })

      try {
        const [meta, items] = await Promise.all([
          getSession(tabId),
          fetchPreview(tabId),
        ])
        if (hoverRequestId.current !== requestId) return
        setHoverState(prev => prev && prev.tabId === tabId ? {
          ...prev,
          title: tabTitles[tabId] || meta?.title || '新会话',
          messageCount: meta?.messageCount,
          items,
        } : null)
      } catch {
        if (hoverRequestId.current !== requestId) return
        setHoverState(prev => prev && prev.tabId === tabId ? { ...prev, items: cached || [] } : null)
      }
    }, PREVIEW_OPEN_DELAY)
  }

  const handleMouseLeave = () => {
    if (showTimer.current) clearTimeout(showTimer.current)
    hideTimer.current = setTimeout(() => setHoverState(null), 200)
  }

  const handlePreviewEnter = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }
  const handlePreviewLeave = () => setHoverState(null)

  // 角色图标
  const RoleIcon = ({ role }: { role: string }) => {
    if (role === 'user') return <User size={14} className="shrink-0 text-foreground/60" />
    if (role === 'assistant') return <Bot size={14} className="shrink-0 text-foreground/60" />
    return <AlertCircle size={14} className="shrink-0 text-destructive/60" />
  }

  return (
    <>
      <div className="flex items-center gap-0 min-w-0 max-w-full overflow-x-auto scrollbar-none border-b border-border/40 h-9 select-none">
        {/* 会话列表按钮 */}
        <button
          onClick={() => setShowPopover(!showPopover)}
          className="flex items-center justify-center px-1.5 h-full text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors shrink-0"
          title="所有会话"
        >
          <ChevronDown size={12} />
        </button>

        {/* 标签页 */}
        {visibleTabs.map((tabId) => {
          const isActive = tabId === activeTabId
          const isStreaming = streamingTabs?.has(tabId)
          return (
            <div
              key={tabId}
              className={`group relative flex items-center gap-1.5 px-3 h-full cursor-pointer shrink-0 max-w-[160px]
                transition-colors border-r border-border/30 last:border-r-0
                ${isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]'}`}
              onClick={() => onTabSelect(tabId)}
              onMouseEnter={(e) => handleTabMouseEnter(e, tabId)}
              onMouseLeave={handleMouseLeave}
            >
              <MessageSquare size={12} className="shrink-0 opacity-50" />
              <span className="truncate text-xs py-0.5">{tabTitles[tabId] || '新会话'}</span>
              <span
                onClick={(e) => { e.stopPropagation(); onTabClose(tabId) }}
                className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-foreground/[0.1] transition-opacity"
              >
                <X size={10} />
              </span>
              {/* 运行状态指示条：呼吸动画 */}
              {isStreaming && (
                <div className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-primary animate-pulse" />
              )}
              {/* 活跃标签的静态指示条（非运行时） */}
              {isActive && !isStreaming && <div className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-primary/60" />}
            </div>
          )
        })}
      </div>

      {/* 悬停预览浮窗 — Proma Agent 风格：消息列表 */}
      {hoverState && (
        <div
          className="fixed z-[100] rounded-lg border bg-popover text-popover-foreground shadow-xl origin-top
                     animate-in fade-in-0 zoom-in-95 duration-150 grid overflow-hidden max-w-[calc(100vw-16px)]"
          style={{
            left: hoverState.x,
            top: hoverState.y,
            width: hoverState.width,
            maxHeight: hoverState.maxHeight,
            gridTemplateRows: 'auto minmax(0,1fr)',
          }}
          onMouseEnter={handlePreviewEnter}
          onMouseLeave={handlePreviewLeave}
        >
          {/* Header: 标题 + 消息数 */}
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b min-w-0">
            <span className="text-xs font-medium truncate">{hoverState.title}</span>
            {hoverState.messageCount !== undefined && (
              <span className="text-[10px] text-muted-foreground/60 shrink-0 ml-2">{hoverState.messageCount}</span>
            )}
          </div>

          {/* 消息列表 */}
          <div className="session-preview-scroll overflow-y-scroll overflow-x-hidden overscroll-contain p-1.5 min-h-0 max-w-full"
               onWheel={(e) => e.stopPropagation()}>
            {hoverState.items.length === 0 ? (
              <div className="flex items-center justify-center h-16 text-xs text-muted-foreground/40">暂无消息</div>
            ) : (
              hoverState.items.map((item) => (
                <div key={item.id} className="flex items-start gap-1.5 px-2 py-1 rounded hover:bg-muted/30 transition-colors overflow-hidden max-w-full">
                  <RoleIcon role={item.role} />
                  <div className="text-[11px] text-muted-foreground/75 leading-snug min-w-0 max-w-full break-words [overflow-wrap:anywhere]">
                    {item.preview ? (
                      <div className="prose prose-xs dark:prose-invert max-w-none text-[11px] leading-snug
                                      prose-p:my-0 prose-headings:my-0.5 prose-headings:text-[11px]
                                      prose-ul:my-0.5 prose-ol:my-0.5 prose-li:my-0 prose-li:pl-0
                                      prose-blockquote:my-0.5 prose-blockquote:pl-2
                                      prose-pre:my-0.5 prose-pre:p-1.5 prose-pre:text-[10px] prose-pre:leading-tight prose-pre:max-w-full prose-pre:overflow-x-auto
                                      prose-code:text-[10px] prose-code:break-words prose-code:before:content-none prose-code:after:content-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {item.preview}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <span className="text-muted-foreground/30">(空消息)</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 会话列表弹窗 */}
      {showPopover && (
        <SessionPopover
          currentSessionId={activeTabId}
          refreshKey={sessionRefreshKey}
          onSelect={(sid) => { setShowPopover(false); onTabSelect(sid) }}
          onNewSession={() => { setShowPopover(false); onNewTab() }}
          onClose={() => setShowPopover(false)}
        />
      )}
    </>
  )
}
