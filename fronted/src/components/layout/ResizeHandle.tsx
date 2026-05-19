/**
 * 可拖动的面板分隔条（直接操作 DOM，零重渲染）
 */

import React, { useCallback, useEffect, useRef } from 'react'

interface ResizeHandleProps {
  targetRef: React.RefObject<HTMLElement>
  minWidth?: number
  maxWidth?: number
  side?: 'left' | 'right'
  onDragEnd?: (width: number) => void
}

export function ResizeHandle({ targetRef, minWidth = 200, maxWidth = 500, side = 'left', onDragEnd }: ResizeHandleProps) {
  const isDragging = useRef(false)
  const rafRef = useRef<number | null>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !targetRef.current) return

      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        if (!targetRef.current) return

        const width = side === 'left'
          ? Math.max(minWidth, Math.min(maxWidth, e.clientX))
          : Math.max(minWidth, Math.min(maxWidth, window.innerWidth - e.clientX))

        targetRef.current.style.width = `${width}px`
      })
    }

    const handleMouseUp = (e: MouseEvent) => {
      if (!isDragging.current) return
      isDragging.current = false

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }

      // 拖拽结束后同步宽度到状态
      if (targetRef.current) {
        const width = parseInt(targetRef.current.style.width, 10)
        onDragEnd?.(width)
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [targetRef, minWidth, maxWidth, side, onDragEnd])

  return (
    <div
      onMouseDown={handleMouseDown}
      className="w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/40 transition-colors shrink-0"
    />
  )
}
