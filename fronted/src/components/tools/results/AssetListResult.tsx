/**
 * 资产列表结果
 */

import React from 'react'

interface Props {
  data: {
    count: number
    assets: Array<{
      asset_id: string
      asset_name: string
      file_path: string
      asset_type: string
      category: string
      subcategory: string
      tri_count: number
      status: string
      analyzed_at: string
    }>
  }
}

const statusStyles: Record<string, { label: string; color: string }> = {
  approved: { label: '已通过', color: 'bg-success/20 text-success' },
  rejected: { label: '已拒绝', color: 'bg-destructive/20 text-destructive' },
  pending: { label: '待审核', color: 'bg-warning/20 text-warning' },
  imported: { label: '已入库', color: 'bg-primary/20 text-primary' },
}

export function AssetListResult({ data }: Props) {
  return (
    <div className="rounded-lg shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted">
        <span className="text-sm font-medium">📦 资产列表</span>
        <span className="text-xs text-muted-foreground ml-auto">{data.count} 个资产</span>
      </div>
      <div className="divide-y divide-border">
        {data.assets.slice(0, 20).map((asset) => {
          const st = statusStyles[asset.status] || statusStyles.pending
          return (
            <div key={asset.asset_id} className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-accent/50 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{asset.asset_name}</div>
                <div className="text-muted-foreground truncate">{asset.category}/{asset.subcategory}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono">{asset.tri_count.toLocaleString()} 三角面</div>
              </div>
              <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${st.color}`}>
                {st.label}
              </span>
            </div>
          )
        })}
        {data.count > 20 && (
          <div className="px-3 py-2 text-xs text-muted-foreground text-center">
            还有 {data.count - 20} 个资产...
          </div>
        )}
      </div>
    </div>
  )
}
