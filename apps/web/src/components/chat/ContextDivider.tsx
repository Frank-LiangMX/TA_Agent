/**
 * 上下文分割线组件
 *
 * 在消息之间插入分割线，分割线之前的消息不发送给 LLM。
 */

import React from 'react'
import { Scissors, X } from 'lucide-react'
import { Tooltip } from '@/components/ui/Tooltip'

interface ContextDividerProps {
  onDelete: () => void
}

export function ContextDivider({ onDelete }: ContextDividerProps) {
  return (
    <div className="flex items-center gap-2 py-2 group">
      <div className="flex-1 border-t border-dashed border-muted-foreground/30" />
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-background px-2 py-0.5 rounded">
        <Scissors size={12} />
        <span>清除上下文</span>
        <Tooltip content="删除分割线">
          <button
            onClick={onDelete}
            className="ml-1 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
          >
            <X size={12} />
          </button>
        </Tooltip>
      </div>
      <div className="flex-1 border-t border-dashed border-muted-foreground/30" />
    </div>
  )
}
