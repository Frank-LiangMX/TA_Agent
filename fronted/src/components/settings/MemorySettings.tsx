/**
 * 记忆系统设置（对接后端记忆 API）
 */

import React, { useState, useEffect } from 'react'
import { Brain, BookMarked, History, Trash2, Loader2 } from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import { API_BASE } from '@/lib/api'
import { useConfirm } from '@/hooks/useConfirm'

interface MemorySettingsProps {
  refreshKey?: number
}

export function MemorySettings({ refreshKey = 0 }: MemorySettingsProps) {
  const { confirm, ConfirmUI } = useConfirm()
  const [stats, setStats] = useState<{
    namespace?: string
    profile_chars?: number
    rule_count?: number
    correction_count?: number
    total_tokens_estimate?: number
    agentMode?: string
  } | null>(null)
  const [profilePreview, setProfilePreview] = useState('')
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(false)

  const agentMode = stats?.agentMode === 'general' ? 'general' : 'ta'
  const isGeneral = agentMode === 'general'

  const load = async () => {
    setLoading(true)
    try {
      const [statsRes, profileRes] = await Promise.all([
        fetch(`${API_BASE}/api/memory/stats`),
        fetch(`${API_BASE}/api/memory/profile`),
      ])
      const statsData = await statsRes.json()
      const profileData = await profileRes.json()
      setStats(statsData)
      setProfilePreview(profileData.content || '')
    } catch {
      setStats(null)
      setProfilePreview('')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [refreshKey])

  const handleClear = async () => {
    const label = isGeneral ? '当前通用模式' : '当前 TA 模式'
    if (!await confirm(`确定清空${label}下的所有记忆？此操作不可恢复。`, { danger: true })) return
    setClearing(true)
    try {
      const res = await fetch(`${API_BASE}/api/memory/clear`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setCleared(true)
        await load()
        setTimeout(() => setCleared(false), 3000)
      }
    } catch {} finally { setClearing(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 size={20} className="animate-spin mr-2" />
        <span className="text-sm">加载中...</span>
      </div>
    )
  }

  const l0Label = isGeneral ? '用户环境 (L0)' : '项目画像 (L0)'
  const l0Desc = isGeneral
    ? '工具路径、命令习惯等跨会话事实（Agent 用 append_profile_fact 追加）'
    : '项目风格、命名约定、质量阈值等'

  return (
    <>
      <div className="space-y-6">
        <p className="text-xs text-muted-foreground">
          当前工作台：<span className="font-medium text-foreground">{isGeneral ? '通用模式' : 'TA 模式'}</span>
          {stats?.namespace ? (
            <span className="ml-2 font-mono">memory/{stats.namespace}</span>
          ) : null}
        </p>

        <SettingsSection
          title="三层记忆架构"
          description={isGeneral ? '通用模式以用户环境为主，L1/L2 在资产纠正场景使用较少' : 'L0 画像 + L1 规则 + L2 归档'}
        >
          <SettingsCard>
            <SettingsRow label={l0Label} description={l0Desc} icon={<Brain size={16} />}>
              <span className="text-sm font-mono">{stats?.profile_chars || 0} 字符</span>
            </SettingsRow>
            <SettingsRow label="推断规则 (L1)" description="从修正中提炼的压缩规则" icon={<BookMarked size={16} />}>
              <span className="text-sm font-mono">{stats?.rule_count || 0} 条</span>
            </SettingsRow>
            <SettingsRow label="修正记录 (L2)" description="用户的原始修正记录" icon={<History size={16} />}>
              <span className="text-sm font-mono">{stats?.correction_count || 0} 条</span>
            </SettingsRow>
            <SettingsRow label="Token 估算" description="记忆占用的 Token 数">
              <span className="text-sm font-mono">~{(stats?.total_tokens_estimate || 0).toLocaleString()}</span>
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>

        {profilePreview ? (
          <SettingsSection title="L0 内容预览" description="只读；在对话中让 Agent 追加或整理">
            <div className="rounded-xl border border-border/60 bg-card p-3">
              <pre className="text-xs whitespace-pre-wrap break-words text-muted-foreground max-h-48 overflow-y-auto">
                {profilePreview}
              </pre>
            </div>
          </SettingsSection>
        ) : null}

        <SettingsSection title="记忆管理" description="仅清理当前模式命名空间下的数据">
          <SettingsCard>
            <SettingsRow label="清空记忆" description="清空画像、规则和修正记录" icon={<Trash2 size={16} />}>
              <button
                onClick={handleClear}
                disabled={clearing}
                className="text-sm text-destructive hover:underline disabled:opacity-50"
              >
                {clearing ? '清理中...' : cleared ? '已清空' : '清空'}
              </button>
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>
      </div>
      {ConfirmUI}
    </>
  )
}
