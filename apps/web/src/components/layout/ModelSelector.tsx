/**
 * 模型选择器 - 工具栏下拉组件
 *
 * 显示当前启用的模型，点击展开 Provider > 模型 两级列表。
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check, Cpu, ChevronRight } from 'lucide-react'
import { localApiFetch } from '@/lib/api'

interface ProviderModel {
  id: string
  name: string
  enabled: boolean
}

interface LLMProvider {
  id: string
  name: string
  base_url: string
  models: ProviderModel[]
  enabled: boolean
}

interface ModelSelectorProps {
  className?: string
}

export function ModelSelector({ className = '' }: ModelSelectorProps) {
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null)
  const [activeModelId, setActiveModelId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const fetchProviders = useCallback(async () => {
    try {
      const res = await localApiFetch('/api/config/providers')
      const data = await res.json()
      setProviders(data.providers || [])
      setActiveProviderId(data.active_provider_id || null)
      setActiveModelId(data.active_model_id || null)
    } catch {}
  }, [])

  useEffect(() => {
    fetchProviders()
  }, [fetchProviders])

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)
          && dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleToggleModel = async (providerId: string, modelId: string) => {
    setLoading(true)
    try {
      await localApiFetch(
        `/api/config/providers/${providerId}/models/${modelId}/enabled`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true }) }
      )
      await fetchProviders()
      setOpen(false)
    } catch {
      // API 失败时不关闭，让用户重试
    } finally {
      setLoading(false)
    }
  }

  const buttonRef = useRef<HTMLButtonElement>(null)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })

  const handleOpen = async () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      await fetchProviders()
      // 先设为按钮下方（最常见情况），再渲染
      setDropdownPos({ top: rect.bottom + 4, left: rect.left })
      setOpen(true)
      // 拿到实际高度后判断是否需要翻转到上方
      requestAnimationFrame(() => {
        if (!dropdownRef.current || !buttonRef.current) return
        const ddRect = dropdownRef.current.getBoundingClientRect()
        const btnRect = buttonRef.current.getBoundingClientRect()
        const spaceBelow = window.innerHeight - btnRect.bottom
        if (spaceBelow < ddRect.height + 8) {
          setDropdownPos({ top: btnRect.top - ddRect.height - 4, left: btnRect.left })
        }
      })
    } else {
      setOpen(false)
    }
  }

  // 当前显示名称
  let displayName = '选择模型'
  if (activeProviderId && activeModelId) {
    const p = providers.find(p => p.id === activeProviderId)
    const m = p?.models.find(m => m.id === activeModelId)
    if (p && m) displayName = `${p.name} / ${m.name || m.id}`
    else if (p) displayName = p.name
  }

  return (
    <div className={`relative ${className}`} ref={panelRef}>
      <button
        ref={buttonRef}
        onClick={handleOpen}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors max-w-[220px]"
      >
        <Cpu size={14} className="shrink-0" />
        <span className="truncate">{displayName}</span>
        <ChevronDown size={12} className="shrink-0" />
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          className="fixed w-72 bg-card border border-border/50 rounded-lg shadow-lg z-50 py-1 max-h-[360px] overflow-y-auto animate-in fade-in"
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
        >
          {providers.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              暂无模型配置<br />请在设置中添加
            </div>
          ) : (
            providers.filter(p => p.enabled).map(p => {
              const isExpanded = expandedProvider === p.id
              const enabledModels = p.models.filter(m => m.enabled)
              const disabledModels = p.models.filter(m => !m.enabled)
              return (
                <div key={p.id}>
                  {/* Provider 行 */}
                  <div
                    className="flex items-center gap-1.5 px-3 py-2 hover:bg-accent/50 cursor-pointer"
                    onClick={() => setExpandedProvider(isExpanded ? null : p.id)}
                  >
                    <ChevronRight size={12} className={`text-muted-foreground shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    <span className="text-xs font-medium flex-1 truncate">{p.name}</span>
                    <span className="text-[10px] text-muted-foreground">{p.models.length} 个模型</span>
                  </div>

                  {/* 模型列表 */}
                  {isExpanded && (
                    <div className="pl-6 pr-2 pb-1 space-y-0.5">
                      {enabledModels.length === 0 && disabledModels.length === 0 && (
                        <div className="px-2 py-2 text-xs text-muted-foreground">无模型</div>
                      )}
                      {enabledModels.map(m => (
                        <button
                          key={m.id}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left bg-primary/5 hover:bg-accent/50"
                          onClick={() => handleToggleModel(p.id, m.id)}
                        >
                          <Check size={11} className="text-emerald-500 shrink-0" />
                          <span className="truncate flex-1">{m.name || m.id}</span>
                        </button>
                      ))}
                      {disabledModels.map(m => (
                        <button
                          key={m.id}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-muted-foreground text-left hover:bg-accent/50"
                          onClick={() => handleToggleModel(p.id, m.id)}
                        >
                          <span className="w-3 shrink-0" />
                          <span className="truncate flex-1">{m.name || m.id}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
          {loading && (
            <div className="px-3 py-1 text-xs text-muted-foreground flex items-center gap-1">
              <div className="w-3 h-3 border border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
              切换中...
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
