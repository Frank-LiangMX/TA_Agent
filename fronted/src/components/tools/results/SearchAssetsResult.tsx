/**
 * 搜索结果
 */

import React from 'react'

interface Props {
  data: {
    count: number
    results: Array<{
      asset_id: string
      asset_name: string
      category: string
      subcategory: string
      tri_count: number
      texture_count: number
      style: string
      condition: string
      status: string
    }>
  }
}

export function SearchAssetsResult({ data }: Props) {
  if (data.count === 0) {
    return (
      <div className="rounded-lg shadow-sm p-4 text-center text-sm text-muted-foreground">
        未找到匹配的资产
      </div>
    )
  }

  return (
    <div className="rounded-lg shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-primary/10">
        <span className="text-sm font-medium">🔍 搜索结果</span>
        <span className="text-xs text-muted-foreground ml-auto">找到 {data.count} 个</span>
      </div>
      <div className="divide-y divide-border">
        {data.results.map((r) => (
          <div key={r.asset_id} className="px-3 py-2 hover:bg-accent/50 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{r.asset_name}</span>
              <span className="text-xs text-muted-foreground">{r.tri_count.toLocaleString()} 面</span>
            </div>
            <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
              <span>{r.category}/{r.subcategory}</span>
              {r.style && <span>风格: {r.style}</span>}
              {r.condition && <span>状态: {r.condition}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
