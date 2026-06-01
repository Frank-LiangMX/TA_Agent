/**
 * 目录扫描结果
 */

import React from 'react'

interface Props {
  data: {
    directory: string
    total_files: number
    extension_stats: Record<string, { count: number; total_mb: number }>
    naming_issues_count: number
    files: Array<{ filename: string; path: string; extension: string; size_mb: number }>
  }
}

export function ScanDirectoryResult({ data }: Props) {
  const extEntries = Object.entries(data.extension_stats).sort((a, b) => b[1].count - a[1].count)

  return (
    <div className="rounded-lg shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted">
        <span className="text-sm font-medium">📂 目录扫描</span>
        <span className="text-xs text-muted-foreground ml-auto">{data.directory}</span>
      </div>
      <div className="p-3 space-y-3">
        {/* 概览 */}
        <div className="flex gap-4 text-xs">
          <div>
            <span className="text-muted-foreground">文件总数：</span>
            <span className="font-medium">{data.total_files}</span>
          </div>
          {data.naming_issues_count > 0 && (
            <div>
              <span className="text-muted-foreground">命名问题：</span>
              <span className="font-medium text-warning">{data.naming_issues_count}</span>
            </div>
          )}
        </div>

        {/* 按格式统计 */}
        <div className="space-y-1">
          <h5 className="text-xs text-muted-foreground">按格式统计</h5>
          {extEntries.map(([ext, stats]) => (
            <div key={ext} className="flex items-center gap-2 text-xs">
              <span className="font-mono w-12">{ext}</span>
              <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${(stats.count / data.total_files) * 100}%` }}
                />
              </div>
              <span className="w-8 text-right">{stats.count}</span>
              <span className="w-16 text-right text-muted-foreground">{stats.total_mb} MB</span>
            </div>
          ))}
        </div>

        {/* 文件列表（最多显示 10 个） */}
        {data.files.length > 0 && (
          <div className="space-y-1">
            <h5 className="text-xs text-muted-foreground">文件列表（前 10 个）</h5>
            {data.files.slice(0, 10).map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                <span className="font-mono truncate flex-1">{f.filename}</span>
                <span className="text-muted-foreground w-16 text-right">{f.size_mb} MB</span>
              </div>
            ))}
            {data.files.length > 10 && (
              <div className="text-xs text-muted-foreground">... 还有 {data.files.length - 10} 个文件</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
