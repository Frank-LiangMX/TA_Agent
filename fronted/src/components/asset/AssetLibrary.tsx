/**
 * 资产库页面
 *
 * 通过 REST API 直接查询 SQLite 数据库获取资产列表。
 * 分页模式，每页 20 条，数字分页按钮。
 */

import React, { useState, useEffect, useMemo } from 'react'
import { Search, Package, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { tagentClient } from '@/services/websocket'
import { useAssets, getDataSource } from '@/lib/cache'
import { API_BASE } from '@/lib/api'

interface AssetItem {
  asset_id: string
  asset_name: string
  file_path: string
  asset_type: string
  category: string
  subcategory: string
  tri_count: number
  status: string
  analyzed_at: string
}

interface AssetLibraryProps {
  onAssetSelect: (asset: Record<string, unknown>) => void
}

const PAGE_SIZE = 20

const statusStyles: Record<string, { label: string; color: string; bg: string }> = {
  approved: { label: '已通过', color: 'text-success', bg: 'bg-success/20' },
  rejected: { label: '已拒绝', color: 'text-destructive', bg: 'bg-destructive/20' },
  pending: { label: '待审核', color: 'text-warning', bg: 'bg-warning/20' },
  imported: { label: '已入库', color: 'text-primary', bg: 'bg-primary/20' },
}

const typeLabels: Record<string, string> = {
  animation: '动画',
  texture: '贴图',
  mesh: '模型',
  skeletal_mesh: '骨骼模型',
  material: '材质',
  blueprint: '蓝图',
  sound: '音效',
  effect: '特效',
}

const typeColors: Record<string, string> = {
  animation: 'bg-blue-500/20 text-blue-400',
  texture: 'bg-purple-500/20 text-purple-400',
  mesh: 'bg-green-500/20 text-green-400',
  skeletal_mesh: 'bg-emerald-500/20 text-emerald-400',
  material: 'bg-orange-500/20 text-orange-400',
  blueprint: 'bg-cyan-500/20 text-cyan-400',
  sound: 'bg-pink-500/20 text-pink-400',
  effect: 'bg-yellow-500/20 text-yellow-400',
}

export function AssetLibrary({ onAssetSelect }: AssetLibraryProps) {
  const { assets, loading, error, refresh } = useAssets()
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'name' | 'type' | 'tri_count'>('name')
  const [currentPage, setCurrentPage] = useState(1)
  const [dataSource, setDataSource] = useState(API_BASE)

  // 获取数据源
  useEffect(() => {
    getDataSource().then(setDataSource)
  }, [])

  // 获取资产详情
  const handleAssetClick = async (assetId: string) => {
    try {
      const res = await fetch(`${dataSource}/api/assets/${assetId}`)
      const data = await res.json()
      if (!data.error) onAssetSelect(data)
    } catch {}
  }

  // 筛选和搜索
  const filteredAssets = useMemo(() => {
    return assets.filter((a) => {
      if (searchQuery && !a.asset_name.toLowerCase().includes(searchQuery.toLowerCase())) return false
      if (filterCategory !== 'all' && a.category !== filterCategory) return false
      if (filterType !== 'all' && a.asset_type !== filterType) return false
      if (filterStatus !== 'all' && a.status !== filterStatus) return false
      return true
    }).sort((a, b) => {
      if (sortBy === 'name') return a.asset_name.localeCompare(b.asset_name)
      if (sortBy === 'type') return a.asset_type.localeCompare(b.asset_type)
      return b.tri_count - a.tri_count
    })
  }, [assets, searchQuery, filterCategory, filterType, filterStatus, sortBy])

  // 分页
  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / PAGE_SIZE))
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredAssets.slice(start, start + PAGE_SIZE)
  }, [filteredAssets, currentPage])

  // 筛选变化时重置到第一页
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, filterCategory, filterType, filterStatus, sortBy])

  // 页码按钮
  const pageNumbers = useMemo(() => {
    const pages: number[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      let start = Math.max(2, currentPage - 2)
      let end = Math.min(totalPages - 1, currentPage + 2)
      if (currentPage <= 3) end = Math.min(5, totalPages - 1)
      if (currentPage >= totalPages - 2) start = Math.max(2, totalPages - 4)
      if (start > 2) pages.push(-1)
      for (let i = start; i <= end; i++) pages.push(i)
      if (end < totalPages - 1) pages.push(-1)
      pages.push(totalPages)
    }
    return pages
  }, [totalPages, currentPage])

  const categories = [...new Set(assets.map((a) => a.category).filter(Boolean))]
  const types = [...new Set(assets.map((a) => a.asset_type).filter(Boolean))]

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
      {/* 头部 */}
      <header className="h-14 flex items-center justify-between px-4 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2">
          <Package size={18} className="text-primary" />
          <h2 className="text-sm font-medium">资产库</h2>
          <span className="text-xs text-muted-foreground">{filteredAssets.length} 个资产</span>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded hover:bg-muted"
          title="刷新"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      {/* 搜索和筛选 */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50 shrink-0">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="text-xs bg-muted border border-border rounded px-2 py-1.5 outline-none"
        >
          <option value="all">全部类型</option>
          {types.map((t) => (
            <option key={t} value={t}>{typeLabels[t] || t}</option>
          ))}
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="text-xs bg-muted border border-border rounded px-2 py-1.5 outline-none"
        >
          <option value="all">全部分类</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="text-xs bg-muted border border-border rounded px-2 py-1.5 outline-none"
        >
          <option value="all">全部状态</option>
          <option value="approved">已通过</option>
          <option value="pending">待审核</option>
          <option value="rejected">已拒绝</option>
          <option value="imported">已入库</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'name' | 'type' | 'tri_count')}
          className="text-xs bg-muted border border-border rounded px-2 py-1.5 outline-none"
        >
          <option value="name">按名称</option>
          <option value="type">按类型</option>
          <option value="tri_count">按面数</option>
        </select>
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索资产名称..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted rounded-lg outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {error && (
          <div className="m-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && assets.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Package size={48} className="mb-4 opacity-30" />
            <p className="text-sm">暂无资产数据</p>
            <p className="text-xs mt-1">请先在对话中分析一个目录</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <RefreshCw size={24} className="animate-spin mr-2" />
            <span className="text-sm">加载中...</span>
          </div>
        )}

        {pageItems.length > 0 && (
          <div className="divide-y divide-border">
            {pageItems.map((asset) => {
              const st = statusStyles[asset.status] || statusStyles.pending
              return (
                <button
                  key={asset.asset_id}
                  onClick={() => handleAssetClick(asset.asset_id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                    <img
                      src={`${dataSource}/api/preview/${asset.asset_id}`}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none'
                        const parent = (e.target as HTMLImageElement).parentElement
                        if (parent && !parent.querySelector('.fallback-icon')) {
                          const icon = document.createElement('div')
                          icon.className = 'fallback-icon flex items-center justify-center w-full h-full'
                          icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>'
                          parent.appendChild(icon)
                        }
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{asset.asset_name}</span>
                      {asset.file_path && (
                        <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0 uppercase">
                          .{asset.file_path.split('.').pop()}
                        </span>
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${typeColors[asset.asset_type] || 'bg-muted text-muted-foreground'}`}>
                        {typeLabels[asset.asset_type] || asset.asset_type}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {asset.category || '未分类'}{asset.subcategory ? `/${asset.subcategory}` : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono">
                      {asset.asset_type === 'animation' ? null :
                       (asset.asset_type === 'static_mesh' || asset.asset_type === 'skeletal_mesh') && asset.tri_count > 0
                        ? `${asset.tri_count.toLocaleString()} 面`
                        : asset.asset_type === 'texture' || asset.asset_type === 'material'
                          ? (asset.file_path?.split('.').pop()?.toUpperCase() || null)
                          : null
                      }
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${st.bg} ${st.color}`}>
                    {st.label}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* 分页 — 固定底部 */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-border/50 flex items-center justify-between shrink-0">
          <span className="text-xs text-muted-foreground">
            第 {currentPage}/{totalPages} 页 · 共 {filteredAssets.length} 个资产
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded hover:bg-accent disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            {pageNumbers.map((p, i) =>
              p === -1 ? (
                <span key={`e${i}`} className="px-1 text-xs text-muted-foreground">...</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  className={`min-w-[28px] h-7 text-xs rounded transition-colors ${
                    p === currentPage
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent text-muted-foreground'
                  }`}
                >
                  {p}
                </button>
              )
            )}
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded hover:bg-accent disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
