/**
 * 用量统计（对接后端 usage API）
 */

import React, { useState, useEffect } from 'react'
import { Zap, MessageSquare, HardDrive, BarChart3, Clock, AlertTriangle } from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import { API_BASE } from '@/lib/api'

export function UsageSettings() {
  const [usage, setUsage] = useState<Record<string, number> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/api/usage`)
      .then((res) => res.json())
      .then((data) => setUsage(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const fmtDuration = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)} 秒`
    if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`
    return `${(seconds / 3600).toFixed(1)} 小时`
  }

  return (
    <div className="space-y-6">
      <SettingsSection title="Token 用量" description="本次运行的 Token 消耗统计">
        <SettingsCard>
          <SettingsRow label="Token 估算" description="消息字符数 × 2 粗略估算" icon={<Zap size={16} />}>
            <span className="text-sm font-mono">
              {loading ? '—' : `~${(usage?.token_estimate || 0).toLocaleString()}`}
            </span>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="API 调用" description="API 请求次数统计">
        <SettingsCard>
          <SettingsRow label="LLM 调用次数" icon={<MessageSquare size={16} />}>
            <span className="text-sm font-mono">{loading ? '—' : usage?.llm_calls || 0}</span>
          </SettingsRow>
          <SettingsRow label="LLM 错误次数" description="调用失败的次数" icon={<AlertTriangle size={16} />}>
            <span className="text-sm font-mono">{loading ? '—' : usage?.llm_errors || 0}</span>
          </SettingsRow>
          <SettingsRow label="工具调用次数" icon={<HardDrive size={16} />}>
            <span className="text-sm font-mono">{loading ? '—' : usage?.tool_calls || 0}</span>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="运行状态">
        <SettingsCard>
          <SettingsRow label="运行时长" icon={<Clock size={16} />}>
            <span className="text-sm font-mono">
              {loading ? '—' : fmtDuration(usage?.uptime_seconds || 0)}
            </span>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
