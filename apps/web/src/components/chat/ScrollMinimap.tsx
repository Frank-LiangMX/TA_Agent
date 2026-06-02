/**
 * 消息导航 — 右侧迷你条（内缩不挡滚动条）+ 点击展开完整面板
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Search, MessageSquare, User, Bot, Wrench, X, ListTree } from 'lucide-react'
import { Tooltip } from '@/components/ui/Tooltip'
import type { ChatMessage } from '@/types'

interface ScrollMinimapProps {
  messages: ChatMessage[]
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  onJumpTo: (index: number) => void
}

const MAX_BARS = 20

export function ScrollMinimap({ messages, scrollContainerRef, onJumpTo }: ScrollMinimapProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [visibleRange, setVisibleRange] = useState<[number, number]>([0, 0])
  const panelRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const updateVisibleRange = () => {
      const items = container.querySelectorAll('[data-msg-index]')
      if (items.length === 0) return

      const containerRect = container.getBoundingClientRect()
      let first = -1
      let last = -1

      items.forEach((item) => {
        const rect = item.getBoundingClientRect()
        if (rect.top < containerRect.bottom && rect.bottom > containerRect.top) {
          const idx = parseInt(item.getAttribute('data-msg-index') || '0', 10)
          if (first === -1) first = idx
          last = idx
        }
      })

      if (first >= 0) {
        setVisibleRange([first, last])
      }
    }

    container.addEventListener('scroll', updateVisibleRange, { passive: true })
    updateVisibleRange()

    return () => container.removeEventListener('scroll', updateVisibleRange)
  }, [scrollContainerRef, messages.length])

  const close = useCallback(() => {
    setIsExpanded(false)
    setSearchQuery('')
  }, [])

  useEffect(() => {
    if (!isExpanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isExpanded, close])

  useEffect(() => {
    if (!isExpanded) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target) || stripRef.current?.contains(target)) return
      close()
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [isExpanded, close])

  const handleJump = useCallback((index: number) => {
    onJumpTo(index)
    close()
  }, [onJumpTo, close])

  /** 导航条：用户消息 + 助手完整轮次；过滤历史里独立的工具行 */
  const nonToolMessages = messages.filter((m) => {
    if (m.role === 'user') return true
    if (m.role === 'assistant') {
      if (
        m.toolCalls?.length &&
        !(m as any)._thinking &&
        !m.content?.trim() &&
        !(m as any)._turnOpen
      ) {
        return false
      }
      return true
    }
    return false
  })

  const filteredMessages = searchQuery
    ? nonToolMessages.filter((m) => m.content?.toLowerCase().includes(searchQuery.toLowerCase()))
    : nonToolMessages

  const barCount = Math.min(nonToolMessages.length, MAX_BARS)
  const groupSize = nonToolMessages.length > MAX_BARS ? Math.ceil(nonToolMessages.length / MAX_BARS) : 1

  const getIcon = (msg: ChatMessage) => {
    if (msg.toolCalls?.length) return <Wrench size={10} />
    if (msg.role === 'user') return <User size={10} />
    if (msg.role === 'assistant') return <Bot size={10} />
    return <MessageSquare size={10} />
  }

  const getBarColor = (msg: ChatMessage) => {
    if (msg.toolCalls?.length) return 'bg-warning'
    if (msg.role === 'user') return 'bg-primary'
    if (msg.role === 'assistant') return 'bg-muted-foreground/40'
    return 'bg-muted-foreground/20'
  }

  const isVisible = (index: number) => index >= visibleRange[0] && index <= visibleRange[1]

  if (nonToolMessages.length === 0) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className="pointer-events-none absolute right-3 top-2 flex flex-row-reverse items-start gap-1">
        {/* 迷你条 + 展开按钮 */}
        <div
          ref={stripRef}
          className="pointer-events-auto flex w-3 shrink-0 flex-col items-center gap-1.5"
        >
          <Tooltip content="展开消息导航" side="top">
            <button
              type="button"
              onClick={() => setIsExpanded((v) => !v)}
              className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${
                isExpanded
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground/60 hover:bg-foreground/[0.06] hover:text-muted-foreground'
              }`}
              aria-label="展开消息导航"
              aria-expanded={isExpanded}
            >
              <ListTree size={11} />
            </button>
          </Tooltip>

          <div className="flex flex-col items-center gap-px">
            {Array.from({ length: barCount }).map((_, i) => {
              const msgIndex = i * groupSize
              const msg = nonToolMessages[msgIndex]
              if (!msg) return null
              const originalIndex = messages.indexOf(msg)
              const inView = isVisible(originalIndex)

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleJump(originalIndex)}
                  className={`w-1.5 shrink-0 rounded-full transition-all duration-200 ${getBarColor(msg)} ${
                    inView ? 'scale-x-150 opacity-100' : 'opacity-40 hover:opacity-70'
                  }`}
                  style={{ height: `${Math.max(3, 100 / barCount)}px`, maxHeight: '12px' }}
                  aria-label={`跳转到第 ${originalIndex + 1} 条消息`}
                />
              )
            })}
          </div>
        </div>

        {isExpanded && (
          <div
            ref={panelRef}
            className="pointer-events-auto flex max-h-[min(420px,calc(100vh-12rem))] w-56 flex-col overflow-hidden rounded-lg border border-border/50 bg-card/95 shadow-xl backdrop-blur-sm animate-slide-in-right"
          >
          <div className="shrink-0 border-b border-border/50 px-3 py-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-medium">消息导航</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">
                  {visibleRange[0] + 1}-{visibleRange[1] + 1}/{nonToolMessages.length}
                </span>
                <button
                  type="button"
                  onClick={close}
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="关闭"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索消息..."
                className="w-full rounded bg-muted py-1 pl-7 pr-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-1 scrollbar-thin">
            {(searchQuery ? filteredMessages : nonToolMessages).map((msg) => {
              const originalIndex = messages.indexOf(msg)
              const inView = isVisible(originalIndex)

              return (
                <button
                  key={msg.id}
                  type="button"
                  onClick={() => handleJump(originalIndex)}
                  className={`flex w-full items-start gap-2 px-3 py-1.5 text-left text-xs transition-colors ${inView ? 'bg-primary/10' : 'hover:bg-accent/50'}`}
                >
                  <span className={`mt-0.5 shrink-0 ${msg.role === 'user' ? 'text-primary' : msg.toolCalls?.length ? 'text-warning' : 'text-muted-foreground'}`}>
                    {getIcon(msg)}
                  </span>
                  <span className="flex-1 truncate text-muted-foreground">
                    {msg.content?.slice(0, 60) || (msg.toolCalls?.length ? `[${msg.toolCalls[0]?.name}]` : '...')}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        )}
      </div>
    </div>
  )
}
