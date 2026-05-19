/**
 * 语义搜索页面
 *
 * 自然语言搜索资产，展示搜索结果。
 */

import React, { useState, useEffect, useRef } from 'react'
import { Search, Package, RefreshCw, X } from 'lucide-react'
import { tagentClient } from '@/services/websocket'
import { API_BASE } from '@/lib/api'

interface SearchResult {
  asset_id: string
  asset_name: string
  file_path: string
  asset_type: string
  category: string
  subcategory: string
  tri_count: number
  status: string
}

interface SearchViewProps {
  onAssetSelect: (asset: Record<string, unknown>) => void
}

const typeLabels: Record<string, string> = {
  animation: '动画', texture: '贴图', mesh: '模型',
  skeletal_mesh: '骨骼模型', material: '材质',
}

const typeColors: Record<string, string> = {
  animation: 'bg-blue-500/20 text-blue-400',
  texture: 'bg-purple-500/20 text-purple-400',
  mesh: 'bg-green-500/20 text-green-400',
  skeletal_mesh: 'bg-emerald-500/20 text-emerald-400',
  material: 'bg-orange-500/20 text-orange-400',
}

export function SearchView({ onAssetSelect }: SearchViewProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // 通过 Agent 搜索
  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setSearched(true)
    setResults([])

    try {
      // 发送搜索请求给 Agent
      await tagentClient.sendMessage(
        `搜索资产：${query.trim()}，使用 search_assets 工具，返回所有匹配结果`
      )
      // 结果会通过 WebSocket 事件返回
    } catch (e: any) {
      setError(e.message || '搜索失败')
    } finally {
      setLoading(false)
    }
  }

  // 监听工具结果获取搜索结果
  useEffect(() => {
    const unsub = tagentClient.on('tool_result', (payload: any) => {
      if (payload.name === 'search_assets' && payload.result) {
        try {
          const data = typeof payload.result === 'string'
            ? JSON.parse(payload.result)
            : payload.result
          if (data.results) {
            setResults(data.results)
            setLoading(false)
          }
        } catch {}
      }
    })
    return unsub
  }, [])

  // 获取资产详情
  const handleAssetClick = async (assetId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/assets/${assetId}`)
      const data = await res.json()
      if (!data.error) {
        onAssetSelect(data)
      }
    } catch {}
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
      {/* 头部 */}
      <header className="h-14 flex items-center px-4 border-b border-border/50 shrink-0">
        <Search size={18} className="text-primary mr-2" />
        <h2 className="text-sm font-medium">语义搜索</h2>
      </header>

      {/* 搜索框 */}
      <div className="p-4 border-b border-border/50">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="用自然语言描述你要找的资产，如：金属材质的武器、高面数的角色模型..."
              className="w-full pl-9 pr-8 py-2 text-sm bg-muted rounded-lg outline-none focus:ring-1 focus:ring-primary"
            />
            {query && (
              <button
                onClick={() => { setQuery(''); setResults([]); setSearched(false); inputRef.current?.focus() }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            disabled={!query.trim() || loading}
            className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/80 disabled:opacity-50 transition-colors"
          >
            {loading ? '搜索中...' : '搜索'}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          语义搜索通过 AI 理解你的意图，匹配资产的分类、材质、风格等属性
        </p>
      </div>

      {/* 搜索结果 */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {error && (
          <div className="m-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <RefreshCw size={20} className="animate-spin mr-2" />
            <span className="text-sm">AI 正在搜索...</span>
          </div>
        )}

        {searched && !loading && results.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <Search size={32} className="mb-2 opacity-30" />
            <p className="text-sm">未找到匹配的资产</p>
            <p className="text-xs mt-1">试试换个关键词</p>
          </div>
        )}

        {results.length > 0 && (
          <div>
            <div className="px-4 py-2 text-xs text-muted-foreground">
              找到 {results.length} 个匹配资产
            </div>
            <div className="divide-y divide-border">
              {results.map((asset) => (
                <button
                  key={asset.asset_id}
                  onClick={() => handleAssetClick(asset.asset_id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Package size={18} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{asset.asset_name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${typeColors[asset.asset_type] || 'bg-muted text-muted-foreground'}`}>
                        {typeLabels[asset.asset_type] || asset.asset_type}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {asset.category || '未分类'}{asset.subcategory ? `/${asset.subcategory}` : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono">{asset.tri_count.toLocaleString()} 面</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {!searched && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Search size={48} className="mb-4 opacity-20" />
            <p className="text-sm">输入自然语言描述搜索资产</p>
            <div className="flex flex-wrap gap-2 mt-4 justify-center">
              {['金属材质的武器', '高面数角色', '待审核的贴图', '动画资源'].map((example) => (
                <button
                  key={example}
                  onClick={() => { setQuery(example); inputRef.current?.focus() }}
                  className="text-xs px-3 py-1.5 bg-muted rounded-full hover:bg-accent transition-colors"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
