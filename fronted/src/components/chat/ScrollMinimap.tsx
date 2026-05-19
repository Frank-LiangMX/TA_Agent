/**
 * 消息导航组件（ScrollMinimap）
 *
 * 在对话区域右侧边缘显示迷你导航条，悬停展开为完整导航面板。
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Search, MessageSquare, User, Bot, Wrench, AlertCircle, X } from 'lucide-react'
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
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 监听滚动，更新可视范围
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

  // 鼠标进入展开，离开延迟收起
  const handleMouseEnter = useCallback(() => {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current)
      collapseTimer.current = null
    }
    setIsExpanded(true)
  }, [])

  const handleMouseLeave = useCallback(() => {
    collapseTimer.current = setTimeout(() => {
      setIsExpanded(false)
      setSearchQuery('')
    }, 300)
  }, [])

  // 跳转到消息
  const handleJump = useCallback((index: number) => {
    onJumpTo(index)
  }, [onJumpTo])

  // 过滤掉工具消息，只保留用户和 AI 对话
  const nonToolMessages = messages.filter((m) => !m.toolCalls && !(m as any)._toolStatus)

  // 过滤消息（搜索）
  const filteredMessages = searchQuery
    ? nonToolMessages.filter((m) => m.content?.toLowerCase().includes(searchQuery.toLowerCase()))
    : nonToolMessages

  // 计算消息条（超出 MAX_BARS 则分组）
  const barCount = Math.min(nonToolMessages.length, MAX_BARS)
  const groupSize = nonToolMessages.length > MAX_BARS ? Math.ceil(nonToolMessages.length / MAX_BARS) : 1

  // 消息类型图标
  const getIcon = (msg: ChatMessage) => {
    if (msg.toolCalls?.length) return <Wrench size={10} />
    if (msg.role === 'user') return <User size={10} />
    if (msg.role === 'assistant') return <Bot size={10} />
    return <MessageSquare size={10} />
  }

  // 消息类型颜色
  const getBarColor = (msg: ChatMessage) => {
    if (msg.toolCalls?.length) return 'bg-warning'
    if (msg.role === 'user') return 'bg-primary'
    if (msg.role === 'assistant') return 'bg-muted-foreground/40'
    return 'bg-muted-foreground/20'
  }

  // 判断是否在可视范围内
  const isVisible = (index: number) => {
    return index >= visibleRange[0] && index <= visibleRange[1]
  }

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-0 bottom-0 z-10 flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 迷你条（收起状态） */}
      <div className="flex flex-col items-end gap-px py-2 px-0.5 cursor-pointer">
        {Array.from({ length: barCount }).map((_, i) => {
          const msgIndex = i * groupSize
          const msg = messages[msgIndex]
          if (!msg) return null
          const inView = isVisible(msgIndex)

          return (
            <div
              key={i}
              className={`w-1.5 rounded-full transition-all duration-200 ${getBarColor(msg)} ${inView ? 'opacity-100 scale-x-150' : 'opacity-40'}`}
              style={{ height: `${Math.max(3, 100 / barCount)}px`, maxHeight: '12px' }}
              onClick={() => handleJump(msgIndex)}
            />
          )
        })}
      </div>

      {/* 展开面板 */}
      {isExpanded && (
        <div className="w-56 bg-card/95 backdrop-blur-sm border-l border-border/40 shadow-lg flex flex-col animate-slide-in-right">
          {/* 头部 */}
          <div className="px-3 py-2 border-b border-border/50 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium">消息导航</span>
              <span className="text-xs text-muted-foreground">
                {visibleRange[0] + 1}-{visibleRange[1] + 1}/{nonToolMessages.length}
              </span>
            </div>
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索消息..."
                className="w-full pl-7 pr-2 py-1 text-xs bg-muted rounded outline-none focus:ring-1 focus:ring-primary"
                autoFocus={isExpanded}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          </div>

          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
            {(searchQuery ? filteredMessages : nonToolMessages).map((msg) => {
              const originalIndex = messages.indexOf(msg)
              const inView = isVisible(originalIndex)

              return (
                <button
                  key={msg.id}
                  onClick={() => handleJump(originalIndex)}
                  className={`w-full flex items-start gap-2 px-3 py-1.5 text-left text-xs transition-colors ${inView ? 'bg-primary/10' : 'hover:bg-accent/50'}`}
                >
                  <span className={`shrink-0 mt-0.5 ${msg.role === 'user' ? 'text-primary' : msg.toolCalls?.length ? 'text-warning' : 'text-muted-foreground'}`}>
                    {getIcon(msg)}
                  </span>
                  <span className="truncate flex-1 text-muted-foreground">
                    {msg.content?.slice(0, 60) || (msg.toolCalls?.length ? `[${msg.toolCalls[0]?.name}]` : '...')}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
