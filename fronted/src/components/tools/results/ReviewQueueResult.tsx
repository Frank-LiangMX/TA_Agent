/**
 * 审核队列结果
 */

import React from 'react'

interface Props {
  data: {
    total_pending: number
    high_confidence_count: number
    low_confidence_count: number
    high_confidence: Array<{
      asset_id: string
      asset_name: string
      category: string
      subcategory: string
      style: string
      tri_count: number
      avg_confidence: number
    }>
    low_confidence: Array<{
      asset_id: string
      asset_name: string
      category: string
      subcategory: string
      style: string
      tri_count: number
      avg_confidence: number
    }>
    summary: string
  }
}

export function ReviewQueueResult({ data }: Props) {
  if (data.total_pending === 0) {
    return (
      <div className="rounded-lg shadow-sm p-4 text-center text-sm text-muted-foreground">
        ✅ 没有待审核的资产
      </div>
    )
  }

  return (
    <div className="rounded-lg shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-warning/10">
        <span className="text-sm font-medium">📋 待审核队列</span>
        <span className="text-xs text-muted-foreground ml-auto">{data.total_pending} 个待审</span>
      </div>
      <div className="p-3 space-y-3">
        {/* 统计 */}
        <div className="flex gap-4 text-xs">
          <span>
            <span className="text-muted-foreground">高置信度：</span>
            <span className="text-success font-medium">{data.high_confidence_count}</span>
          </span>
          <span>
            <span className="text-muted-foreground">低置信度：</span>
            <span className="text-warning font-medium">{data.low_confidence_count}</span>
          </span>
        </div>

        {/* 低置信度列表 */}
        {data.low_confidence.length > 0 && (
          <div className="space-y-1">
            <h5 className="text-xs text-warning">⚠️ 需要人工确认</h5>
            {data.low_confidence.slice(0, 5).map((a) => (
              <ReviewItem key={a.asset_id} item={a} />
            ))}
          </div>
        )}

        {/* 高置信度列表 */}
        {data.high_confidence.length > 0 && (
          <div className="space-y-1">
            <h5 className="text-xs text-success">✅ 高置信度（可批量通过）</h5>
            {data.high_confidence.slice(0, 5).map((a) => (
              <ReviewItem key={a.asset_id} item={a} />
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">{data.summary}</p>
      </div>
    </div>
  )
}

function ReviewItem({ item }: { item: { asset_name: string; category: string; subcategory: string; tri_count: number; avg_confidence: number } }) {
  return (
    <div className="flex items-center gap-2 text-xs py-1">
      <span className="font-medium flex-1 truncate">{item.asset_name}</span>
      <span className="text-muted-foreground">{item.category}/{item.subcategory}</span>
      <span className="font-mono">{item.tri_count.toLocaleString()} 面</span>
      <span className={`font-mono ${item.avg_confidence >= 0.9 ? 'text-success' : 'text-warning'}`}>
        {(item.avg_confidence * 100).toFixed(0)}%
      </span>
    </div>
  )
}
