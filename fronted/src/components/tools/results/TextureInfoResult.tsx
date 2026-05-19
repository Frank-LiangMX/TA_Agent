/**
 * 贴图检查结果 — 信息卡片
 */

import React from 'react'

interface Props {
  data: {
    filename: string
    exists: boolean
    width?: number
    height?: number
    format?: string
    mode?: string
    channel_count?: number
    has_alpha?: boolean
    is_power_of_two?: boolean
    is_square?: boolean
    size_mb?: number
    resolution_tier?: string
    error?: string
  }
}

const tierLabels: Record<string, { label: string; color: string }> = {
  low: { label: '低', color: 'text-muted-foreground' },
  medium: { label: '中', color: 'text-foreground' },
  high: { label: '高', color: 'text-warning' },
  very_high: { label: '极高', color: 'text-destructive' },
  extreme: { label: '超大', color: 'text-destructive' },
}

export function TextureInfoResult({ data }: Props) {
  if (!data.exists || data.error) {
    return (
      <div className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">
        ❌ {data.error || '文件不存在'}
      </div>
    )
  }

  const tier = data.resolution_tier ? tierLabels[data.resolution_tier] : null

  return (
    <div className="rounded-lg shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted">
        <span className="text-sm font-medium">{data.filename}</span>
        {tier && <span className={`text-xs ${tier.color}`}>{tier.label}分辨率</span>}
      </div>
      <div className="p-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <Info label="分辨率" value={`${data.width}×${data.height}`} />
        <Info label="格式" value={data.format || '-'} />
        <Info label="通道" value={data.mode || '-'} highlight={data.has_alpha} />
        <Info label="大小" value={`${data.size_mb} MB`} />
        <Info label="2 的幂" value={data.is_power_of_two ? '是' : '否'} warn={!data.is_power_of_two} />
        <Info label="正方形" value={data.is_square ? '是' : '否'} warn={!data.is_square} />
      </div>
    </div>
  )
}

function Info({ label, value, highlight, warn }: { label: string; value: string; highlight?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${warn ? 'text-warning' : highlight ? 'text-primary' : ''}`}>{value}</span>
    </div>
  )
}
