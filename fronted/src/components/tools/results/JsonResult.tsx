/**
 * 通用 JSON 结果展示（兜底）
 */

import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface Props {
  data: unknown
  title?: string
}

export function JsonResult({ data, title }: Props) {
  const [expanded, setExpanded] = useState(false)
  const json = JSON.stringify(data, null, 2)
  const preview = json.length > 200 ? json.slice(0, 200) + '...' : json

  return (
    <div className="rounded-lg shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-2 bg-muted w-full text-left hover:bg-accent/50 transition-colors"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="text-sm font-medium">{title || '工具结果'}</span>
        <span className="text-xs text-muted-foreground ml-auto">{json.length} 字符</span>
      </button>
      {expanded ? (
        <pre className="p-3 text-xs overflow-x-auto max-h-[400px] overflow-y-auto font-mono">
          {json}
        </pre>
      ) : (
        <pre className="p-3 text-xs overflow-x-auto font-mono text-muted-foreground">
          {preview}
        </pre>
      )}
    </div>
  )
}
