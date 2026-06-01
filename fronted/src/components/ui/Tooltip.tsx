/**
 * 自定义 Tooltip 组件（跟随主题）
 *
 * 替代原生 title 属性，样式跟随主题变化。
 */

import React, { useState, useRef, useCallback } from 'react'

interface TooltipProps {
  children: React.ReactElement
  content: string
  side?: 'top' | 'bottom'
  className?: string
}

const TOOLTIP_GAP = 8

export function Tooltip({ children, content, side = 'top', className = '' }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const triggerRef = useRef<HTMLDivElement>(null)

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        const width = Math.max(80, content.length * 8 + 16)
        const x = Math.min(
          Math.max(TOOLTIP_GAP, rect.left + rect.width / 2 - width / 2),
          window.innerWidth - width - TOOLTIP_GAP,
        )
        if (side === 'top') {
          // 整块浮在触发区上方，避免盖住按钮
          setPos({ top: rect.top - TOOLTIP_GAP, left: x })
        } else {
          setPos({ top: rect.bottom + TOOLTIP_GAP, left: x })
        }
      }
      setVisible(true)
    }, 400)
  }, [content, side])

  const hide = useCallback(() => {
    clearTimeout(timerRef.current)
    setVisible(false)
  }, [])

  return (
    <div ref={triggerRef} className={`inline-flex items-center justify-center ${className}`} onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && (
        <div
          className={`fixed z-[9999] px-2.5 py-1 text-xs rounded-md whitespace-nowrap pointer-events-none shadow-md tooltip-pop ${
            side === 'top' ? '-translate-y-full' : ''
          }`}
          style={{ top: pos.top, left: pos.left }}
        >
          {content}
        </div>
      )}
    </div>
  )
}
