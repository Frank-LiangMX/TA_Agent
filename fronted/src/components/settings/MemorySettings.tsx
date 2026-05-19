/**
 * 记忆系统设置（对接后端记忆 API）
 */

import React, { useState } from 'react'
import { Brain, BookMarked, History, Trash2, Loader2 } from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import { useMemoryStats } from '@/lib/cache'
import { API_BASE } from '@/lib/api'

export function MemorySettings() {
  const { stats, refresh } = useMemoryStats()
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(false)

  const handleClear = async () => {
    if (!confirm('确定清空所有记忆数据？此操作不可恢复。')) return
    setClearing(true)
    try {
      const res = await fetch(`${API_BASE}/api/memory/clear`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setCleared(true)
        refresh()
        setTimeout(() => setCleared(false), 3000)
      }
    } catch {} finally { setClearing(false) }
  }

  return (
    <div className="space-y-6">
      <SettingsSection title="三层记忆架构" description="L0 画像 + L1 规则 + L2 归档">
        <SettingsCard>
          <SettingsRow label="项目画像 (L0)" description="项目特征和风格总结" icon={<Brain size={16} />}>
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

      <SettingsSection title="记忆管理" description="清理和导出记忆数据">
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
  )
}
