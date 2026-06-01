/**
 * 权限管理（对接后端 permissions API）
 */

import React, { useState, useEffect } from 'react'
import { Shield, Lock, Unlock, Loader2 } from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsRow, SettingsSegmentedControl } from './primitives'
import { API_BASE } from '@/lib/api'

interface PermissionData {
  global_mode: string
  tools: Record<string, string>
  agentMode?: string
}

const MODE_LABELS: Record<string, string> = {
  safe: '安全（全部需确认）',
  ask: '询问（敏感操作需确认）',
  'allow-all': '自动（全部自动执行）',
}

interface PermissionSettingsProps {
  refreshKey?: number
}

export function PermissionSettings({ refreshKey = 0 }: PermissionSettingsProps) {
  const [data, setData] = useState<PermissionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`${API_BASE}/api/permissions`)
      .then((res) => res.json())
      .then((json) => {
        setData({
          global_mode: json.global_mode || json.mode || 'ask',
          tools: json.tools || json.tool_permissions || {},
          agentMode: json.agentMode,
        })
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [refreshKey])

  const handleGlobalModeChange = async (mode: string) => {
    if (!data) return
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ global_mode: mode }),
      })
      const json = await res.json()
      if (json.success) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                global_mode: json.global_mode || mode,
                tools: json.tools || prev.tools,
              }
            : prev
        )
      }
    } catch {} finally { setSaving(false) }
  }

  const handleToolModeChange = async (toolName: string, mode: string) => {
    if (!data) return
    setSaving(true)
    try {
      const newTools = { ...data.tools, [toolName]: mode }
      const res = await fetch(`${API_BASE}/api/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tools: newTools }),
      })
      const json = await res.json()
      if (json.success) {
        setData((prev) => (prev ? { ...prev, tools: json.tools || newTools } : prev))
      }
    } catch {} finally { setSaving(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 size={20} className="animate-spin mr-2" />
        <span className="text-sm">加载中...</span>
      </div>
    )
  }

  const toolEntries = Object.entries(data?.tools || {})
  const safeTools = toolEntries.filter(([, m]) => m === 'safe')
  const askTools = toolEntries.filter(([, m]) => m === 'ask')
  const allowTools = toolEntries.filter(([, m]) => m === 'allow-all')
  const isGeneral = data?.agentMode === 'general'

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        当前工作台：<span className="font-medium text-foreground">{isGeneral ? '通用模式' : 'TA 模式'}</span>
        ，仅显示该模式下可用的 {toolEntries.length} 个工具
      </p>

      <SettingsSection title="全局权限模式" description="控制 Agent 使用工具时的默认权限策略">
        <SettingsCard>
          <SettingsSegmentedControl
            label="权限模式"
            description={MODE_LABELS[data?.global_mode || 'ask']}
            value={data?.global_mode || 'ask'}
            onChange={handleGlobalModeChange}
            options={[
              { value: 'safe', label: '安全' },
              { value: 'ask', label: '询问' },
              { value: 'allow-all', label: '自动' },
            ]}
            disabled={saving}
          />
        </SettingsCard>
      </SettingsSection>

      {toolEntries.length > 0 ? (
        <SettingsSection title="工具级权限" description="为每个工具单独设置权限（覆盖全局设置）">
          {safeTools.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-medium text-muted-foreground mb-2 px-1">需确认</div>
              <SettingsCard>
                {safeTools.map(([name]) => (
                  <SettingsRow key={name} label={name} icon={<Lock size={16} />}>
                    <select
                      value="safe"
                      onChange={(e) => handleToolModeChange(name, e.target.value)}
                      className="text-xs bg-muted border border-border rounded px-2 py-1 outline-none"
                    >
                      <option value="safe">需确认</option>
                      <option value="ask">询问</option>
                      <option value="allow-all">自动</option>
                    </select>
                  </SettingsRow>
                ))}
              </SettingsCard>
            </div>
          )}

          {askTools.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-medium text-muted-foreground mb-2 px-1">询问模式</div>
              <SettingsCard>
                {askTools.map(([name]) => (
                  <SettingsRow key={name} label={name} icon={<Shield size={16} />}>
                    <select
                      value="ask"
                      onChange={(e) => handleToolModeChange(name, e.target.value)}
                      className="text-xs bg-muted border border-border rounded px-2 py-1 outline-none"
                    >
                      <option value="safe">需确认</option>
                      <option value="ask">询问</option>
                      <option value="allow-all">自动</option>
                    </select>
                  </SettingsRow>
                ))}
              </SettingsCard>
            </div>
          )}

          {allowTools.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-medium text-muted-foreground mb-2 px-1">自动执行</div>
              <SettingsCard>
                {allowTools.map(([name]) => (
                  <SettingsRow key={name} label={name} icon={<Unlock size={16} />}>
                    <select
                      value="allow-all"
                      onChange={(e) => handleToolModeChange(name, e.target.value)}
                      className="text-xs bg-muted border border-border rounded px-2 py-1 outline-none"
                    >
                      <option value="safe">需确认</option>
                      <option value="ask">询问</option>
                      <option value="allow-all">自动</option>
                    </select>
                  </SettingsRow>
                ))}
              </SettingsCard>
            </div>
          )}
        </SettingsSection>
      ) : (
        <p className="text-sm text-muted-foreground">当前模式下暂无已配置的工具权限项。</p>
      )}
    </div>
  )
}
