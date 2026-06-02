/**
 * 命名检查结果
 */

import React from 'react'

interface Props {
  data: {
    filename: string
    prefix: string | null
    prefix_meaning: string | null
    is_valid: boolean
    issues: string[]
  }
}

export function NamingCheckResult({ data }: Props) {
  return (
    <div className={`rounded-lg border overflow-hidden ${data.is_valid ? 'border-success/30' : 'border-destructive/30'}`}>
      <div className={`flex items-center gap-2 px-3 py-2 ${data.is_valid ? 'bg-success/10' : 'bg-destructive/10'}`}>
        <span className="text-sm font-medium">
          {data.is_valid ? '✅ 命名合规' : '❌ 命名不合规'}
        </span>
        <span className="text-xs text-muted-foreground ml-auto">{data.filename}</span>
      </div>
      <div className="p-3 space-y-2 text-xs">
        {data.prefix && (
          <div>
            <span className="text-muted-foreground">前缀：</span>
            <span className="font-mono text-primary">{data.prefix}</span>
            <span className="text-muted-foreground ml-1">({data.prefix_meaning})</span>
          </div>
        )}
        {data.issues.length > 0 && (
          <ul className="space-y-1">
            {data.issues.map((issue, i) => (
              <li key={i} className="text-destructive">• {issue}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
