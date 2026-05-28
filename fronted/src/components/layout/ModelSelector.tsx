/**
 * 模型选择器 - 工具栏下拉组件
 *
 * 显示当前模型名，点击弹出模型列表，支持切换。
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronDown, Check, Cpu } from 'lucide-react'
import { API_BASE } from '@/lib/api'

interface Model {
  id: string
  name: string
  model: string
}

interface ModelSelectorProps {
  className?: string
}

export function ModelSelector({ className = '' }: ModelSelectorProps) {
  const [models, setModels] = useState<Model[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const activeModel = models.find((m) => m.id === activeId)
  const displayName = activeModel?.name || activeModel?.model || '选择模型'

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/config/models`)
      const data = await res.json()
      setModels(data.models || [])
      setActiveId(data.active_id || null)
    } catch {
      // 静默失败
    }
  }, [])

  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleSwitch = async (modelId: string) => {
    if (modelId === activeId) {
      setOpen(false)
      return
    }
    setLoading(true)
    try {
      await fetch(`${API_BASE}/api/config/models/${modelId}/activate`, { method: 'POST' })
      await fetchModels()
    } catch {
      // 静默失败
    }
    setLoading(false)
    setOpen(false)
  }

  return (
    <div className={`relative ${className}`} ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors max-w-[200px]"
      >
        <Cpu size={14} className="shrink-0" />
        <span className="truncate">{displayName}</span>
        <ChevronDown size={12} className="shrink-0" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-64 bg-card border border-border/50 rounded-lg shadow-lg z-50 py-1 max-h-[300px] overflow-y-auto animate-in fade-in slide-in-from-bottom-1">
          {models.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">暂无模型，请在设置中添加</div>
          ) : (
            models.map((m) => (
              <button
                key={m.id}
                onClick={() => handleSwitch(m.id)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                  m.id === activeId
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-accent text-foreground'
                }`}
              >
                <Cpu size={12} className="shrink-0 text-muted-foreground" />
                <span className="truncate flex-1">{m.name || m.model}</span>
                {m.id === activeId && <Check size={12} className="text-primary shrink-0" />}
              </button>
            ))
          )}
          {loading && (
            <div className="px-3 py-1 text-xs text-muted-foreground flex items-center gap-1">
              <div className="w-3 h-3 border border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
              切换中...
            </div>
          )}
        </div>
      )}
    </div>
  )
}
