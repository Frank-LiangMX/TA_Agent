/**
 * 提示词设置（对接后端 prompt API）
 */

import React, { useState, useEffect } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import { localApiFetch } from '@/lib/api'

export function PromptSettings() {
  const [prompt, setPrompt] = useState('')
  const [length, setLength] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    localApiFetch('/api/config/prompt')
      .then((res) => res.json())
      .then((data) => {
        setPrompt(data.prompt || '')
        setLength(data.length || 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <SettingsSection title="系统提示词" description="Agent 的基础系统提示词（只读）">
        <SettingsCard>
          <SettingsRow label="当前提示词" description={`${length} 字符`} icon={<FileText size={16} />}>
            <span className="text-sm text-muted-foreground">见下方</span>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 size={20} className="animate-spin mr-2" />
          <span className="text-sm">加载中...</span>
        </div>
      ) : (
        <SettingsSection title="提示词内容">
          <div className="rounded-lg bg-muted/50 p-4 max-h-[400px] overflow-y-auto scrollbar-thin">
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words font-mono leading-relaxed">
              {prompt || '暂无内容'}
            </pre>
          </div>
        </SettingsSection>
      )}
    </div>
  )
}
