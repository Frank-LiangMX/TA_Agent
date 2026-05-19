/**
 * 资产提及弹出框
 *
 * 输入 @ 时弹出，搜索资产并选择。
 */

import React, { useState, useEffect, useRef } from 'react'
import { Search, Package } from 'lucide-react'
import { API_BASE } from '@/lib/api'

interface AssetMentionPopoverProps {
  query: string
  onSelect: (asset: { id: string; name: string; type: string }) => void
  onClose: () => void
}

export function AssetMentionPopover({ query, onSelect, onClose }: AssetMentionPopoverProps) {
  const [results, setResults] = useState<Array<{ asset_id: string; asset_name: string; asset_type: string }>>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!query && query !== '') return
    setLoading(true)
    fetch(`${API_BASE}/api/assets`)
      .then((res) => res.json())
      .then((data) => {
        const assets = (data.assets || [])
          .filter((a: any) => a.asset_name.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 10)
        setResults(assets)
        setSelectedIndex(0)
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [query])

  // 键盘导航
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter' && results.length > 0) {
        e.preventDefault()
        const asset = results[selectedIndex]
        onSelect({ id: asset.asset_id, name: asset.asset_name, type: asset.asset_type })
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [results, selectedIndex, onSelect, onClose])

  // 滚动到选中项
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (results.length === 0 && !loading) return null

  const typeLabels: Record<string, string> = {
    static_mesh: '模型', skeletal_mesh: '骨骼', animation: '动画',
    texture: '贴图', material: '材质',
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-popover rounded-lg shadow-xl border border-border/30 overflow-hidden animate-in fade-in slide-in-from-bottom-1 duration-100">
      <div className="px-3 py-2 border-b border-border/30 flex items-center gap-2">
        <Search size={12} className="text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {loading ? '搜索中...' : `找到 ${results.length} 个资产`}
        </span>
      </div>
      <div ref={listRef} className="max-h-[200px] overflow-y-auto scrollbar-thin">
        {results.map((asset, i) => (
          <button
            key={asset.asset_id}
            onClick={() => onSelect({ id: asset.asset_id, name: asset.asset_name, type: asset.asset_type })}
            className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
              i === selectedIndex ? 'bg-accent' : 'hover:bg-accent/50'
            }`}
          >
            <Package size={14} className="text-muted-foreground shrink-0" />
            <span className="text-sm truncate flex-1">{asset.asset_name}</span>
            <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">
              {typeLabels[asset.asset_type] || asset.asset_type}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
