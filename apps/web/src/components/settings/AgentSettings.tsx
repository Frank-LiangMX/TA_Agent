/**
 * Agent 配置设置
 */

import React, { useState, useEffect } from 'react'
import { SettingsSection, SettingsCard, SettingsSelect, SettingsToggle, SettingsSegmentedControl, SettingsRow } from './primitives'
import { tagentClient } from '@/services/websocket'
import { API_BASE } from '@/lib/api'
import { FileText, Loader2 } from 'lucide-react'

export function AgentSettings() {
  const [workflowMode, setWorkflowMode] = useState<'step_by_step' | 'auto'>('step_by_step')
  const [autoArchive, setAutoArchive] = useState(true)
  const [archiveDays, setArchiveDays] = useState('7')
  const [prompt, setPrompt] = useState('')
  const [promptLength, setPromptLength] = useState(0)
  const [promptLoading, setPromptLoading] = useState(true)

  useEffect(() => {
    tagentClient.getStatus().then((status: Record<string, unknown>) => {
      if (status.workflowMode) {
        setWorkflowMode(status.workflowMode as 'step_by_step' | 'auto')
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    fetch(`${API_BASE}/api/config/prompt`)
      .then((res) => res.json())
      .then((data) => {
        setPrompt(data.prompt || '')
        setPromptLength(data.length || 0)
      })
      .catch(() => {})
      .finally(() => setPromptLoading(false))
  }, [])

  const handleWorkflowChange = (mode: string) => {
    const m = mode as 'step_by_step' | 'auto'
    setWorkflowMode(m)
    tagentClient.setMode(m).catch(() => {})
  }

  return (
    <div className="space-y-6">
      <SettingsSection title="系统提示词" description="Agent 的基础系统提示词（只读）">
        <SettingsCard>
          <SettingsRow label="当前提示词" description={`${promptLength} 字符`} icon={<FileText size={16} />}>
            <span className="text-sm text-muted-foreground">见下方</span>
          </SettingsRow>
        </SettingsCard>
        {promptLoading ? (
          <div className="flex items-center justify-center py-4 text-muted-foreground">
            <Loader2 size={16} className="animate-spin mr-2" />
            <span className="text-sm">加载中...</span>
          </div>
        ) : (
          <div className="rounded-lg bg-muted/50 p-4 max-h-[200px] overflow-y-auto scrollbar-thin">
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words font-mono leading-relaxed">
              {prompt || '暂无内容'}
            </pre>
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="工作流模式" description="控制 Agent 执行任务的方式">
        <SettingsCard>
          <SettingsSegmentedControl
            label="执行模式"
            description="逐步模式每步确认，自动模式连续执行"
            value={workflowMode}
            onChange={handleWorkflowChange}
            options={[
              { value: 'step_by_step', label: '逐步模式' },
              { value: 'auto', label: '自动模式' },
            ]}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="会话管理" description="控制会话的自动归档行为">
        <SettingsCard>
          <SettingsToggle
            label="自动归档"
            description="超期未活跃的会话自动归档"
            checked={autoArchive}
            onChange={setAutoArchive}
          />
          {autoArchive && (
            <SettingsSelect
              label="归档天数"
              description="超过指定天数未活跃则归档"
              value={archiveDays}
              onChange={setArchiveDays}
              options={[
                { value: '3', label: '3 天' },
                { value: '7', label: '7 天' },
                { value: '14', label: '14 天' },
                { value: '30', label: '30 天' },
              ]}
            />
          )}
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
