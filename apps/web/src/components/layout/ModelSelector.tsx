/**
 * 模型选择器 - 居中 Dialog 模式
 *
 * 参考 Proma 设计：搜索 + 分组 + 键盘导航。
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ChevronDown, Check, Cpu, Search, X } from 'lucide-react'
import { localApiFetch } from '@/lib/api'

interface ProviderModel {
  id: string
  name: string
  enabled: boolean
  selected?: boolean
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
  const [search, setSearch] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const fetchProviders = useCallback(async () => {
    try {
      const res = await localApiFetch('/api/config/providers')
      const data = await res.json()
      setProviders(data.providers || [])
      setActiveProviderId(data.active_provider_id || null)
      setActiveModelId(data.active_model_id || null)
    } catch {}
  }, [])

  useEffect(() => { fetchProviders() }, [fetchProviders])

  // 所有可用模型（扁平化）
  const allModels = useMemo(() => {
    const result: { providerId: string; providerName: string; model: ProviderModel }[] = []
    for (const p of providers) {
      if (!p.enabled) continue
      for (const m of p.models) {
        if (m.enabled) {
          result.push({ providerId: p.id, providerName: p.name, model: m })
        }
      }
    }
    return result
  }, [providers])

  // 搜索过滤
  const filtered = useMemo(() => {
    if (!search.trim()) return allModels
    const q = search.toLowerCase()
    return allModels.filter(
      m => m.model.name.toLowerCase().includes(q) || m.providerName.toLowerCase().includes(q)
    )
  }, [allModels, search])

  // 按 provider 分组
  const grouped = useMemo(() => {
    const map = new Map<string, { providerName: string; models: typeof filtered }>()
    for (const m of filtered) {
      const existing = map.get(m.providerId)
      if (existing) {
        existing.models.push(m)
      } else {
        map.set(m.providerId, { providerName: m.providerName, models: [m] })
      }
    }
    return map
  }, [filtered])

  // 键盘导航用的扁平列表
  const flatList = useMemo(() => {
    const list: { providerId: string; modelId: string }[] = []
    for (const [providerId, group] of grouped) {
      for (const m of group.models) {
        list.push({ providerId, modelId: m.model.id })
      }
    }
    return list
  }, [grouped])

  // 打开时重置状态
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (isOpen) {
      setSearch('')
      setHighlightIndex(0)
      fetchProviders()
      setTimeout(() => searchRef.current?.focus(), 50)
    }
  }

  // 选择模型（设为当前活跃）
  const handleSelect = async (providerId: string, modelId: string) => {
    try {
      const res = await localApiFetch('/api/config/active-model', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_id: providerId, model_id: modelId }),
      })
      if (!res.ok) {
        console.error('[ModelSelector] set active model failed:', res.status, await res.text())
        return
      }
      await fetchProviders()
      setOpen(false)
    } catch (e) {
      console.error('[ModelSelector] handleSelect error:', e)
    }
  }

  // 键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex(i => Math.min(i + 1, flatList.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && flatList[highlightIndex]) {
      e.preventDefault()
      const item = flatList[highlightIndex]
      handleSelect(item.providerId, item.modelId)
    }
  }

  // 高亮项自动滚动到可见区域
  useEffect(() => {
    if (!listRef.current) return
    const items = listRef.current.querySelectorAll('[data-model-item]')
    items[highlightIndex]?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex])

  // 搜索变化时重置高亮
  useEffect(() => { setHighlightIndex(0) }, [search])

  // 当前显示名称
  let displayName = '选择模型'
  if (activeProviderId && activeModelId) {
    const p = providers.find(p => p.id === activeProviderId)
    const m = p?.models.find(m => m.id === activeModelId)
    if (p && m) displayName = m.name || m.id
    else if (p) displayName = p.name
  }

  const hasNoModels = allModels.length === 0

  // 无模型时显示静态标签
  if (hasNoModels) {
    return (
      <div className={`flex items-center gap-1.5 text-xs text-muted-foreground px-2 py-1 ${className}`}>
        <Cpu size={14} className="shrink-0" />
        <span>暂无模型</span>
      </div>
    )
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors max-w-[220px] ${className}`}
        >
          <Cpu size={14} className="shrink-0" />
          <span className="truncate">{displayName}</span>
          <ChevronDown size={12} className="shrink-0" />
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[420px] max-h-[480px] bg-card border border-foreground/10 rounded-xl shadow-[0_20px_40px_-8px_rgb(0_0%_0/0.18),0_0_0_1px_rgb(255_255_255/0.05),inset_0_1px_0_0_rgb(255_255_255/0.5)] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
          onKeyDown={handleKeyDown}
        >
          {/* 搜索框 */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
            <Search size={14} className="text-muted-foreground shrink-0" />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索模型..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            )}
          </div>

          {/* 模型列表 */}
          <div ref={listRef} className="flex-1 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">未找到模型</div>
            ) : (
              (() => {
                let flatIdx = 0
                return Array.from(grouped.entries()).map(([providerId, group]) => (
                  <div key={providerId}>
                    <div className="px-4 py-1.5 text-[11px] font-medium text-muted-foreground bg-muted/50">
                      {group.providerName}
                    </div>
                    {group.models.map(m => {
                      const idx = flatIdx++
                      const isActive = activeProviderId === providerId && activeModelId === m.model.id
                      const isHighlighted = idx === highlightIndex
                      return (
                        <button
                          key={m.model.id}
                          data-model-item
                          onClick={() => handleSelect(providerId, m.model.id)}
                          onMouseEnter={() => setHighlightIndex(idx)}
                          className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors ${
                            isHighlighted ? 'bg-accent' : ''
                          } ${isActive ? 'bg-foreground/5' : ''}`}
                        >
                          {isActive && <Check size={14} className="text-emerald-500 shrink-0" />}
                          {!isActive && <span className="w-3.5 shrink-0" />}
                          <span className={`truncate ${isActive ? 'font-medium' : ''}`}>{m.model.name}</span>
                        </button>
                      )
                    })}
                  </div>
                ))
              })()
            )}
          </div>

          {/* 底部提示 */}
          <div className="px-4 py-2 border-t border-border/50 text-[11px] text-muted-foreground flex items-center gap-3">
            <span>↑↓ 导航</span>
            <span>Enter 选择</span>
            <span>Esc 关闭</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
