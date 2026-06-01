/**
 * 资产分析结果
 */

import React from 'react'

interface Props {
  data: {
    total_assets: number
    summary: {
      total_triangles: number
      total_textures: number
      with_skeleton: number
      animations: number
      naming_issues: number
      categories: Record<string, number>
    }
    report_markdown?: string
    need_inference_confirm?: boolean
    message?: string
  }
}

export function AnalyzeAssetsResult({ data }: Props) {
  const { summary } = data
  const categoryEntries = Object.entries(summary.categories).sort((a, b) => b[1] - a[1])

  return (
    <div className="rounded-lg shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-primary/10">
        <span className="text-sm font-medium">🔍 资产分析完成</span>
        <span className="text-xs text-muted-foreground ml-auto">{data.total_assets} 个资产</span>
      </div>
      <div className="p-3 space-y-3">
        {/* 统计卡片 */}
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="三角面总数" value={summary.total_triangles.toLocaleString()} />
          <StatCard label="贴图总数" value={summary.total_textures.toString()} />
          <StatCard label="带骨骼" value={summary.with_skeleton.toString()} />
          <StatCard label="动画" value={summary.animations.toString()} />
          <StatCard label="命名问题" value={summary.naming_issues.toString()} warn={summary.naming_issues > 0} />
        </div>

        {/* 分类分布 */}
        {categoryEntries.length > 0 && (
          <div className="space-y-1">
            <h5 className="text-xs text-muted-foreground">分类分布</h5>
            {categoryEntries.map(([cat, count]) => (
              <div key={cat} className="flex items-center gap-2 text-xs">
                <span className="w-20 truncate">{cat}</span>
                <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${(count / data.total_assets) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right">{count}</span>
              </div>
            ))}
          </div>
        )}

        {/* AI 推断提示 */}
        {data.need_inference_confirm && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-2 text-xs text-warning">
            ⚠️ {data.message || '资产数量较多，是否继续 AI 推断？'}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="bg-muted rounded-lg p-2 text-center">
      <div className={`text-sm font-bold ${warn ? 'text-warning' : ''}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
