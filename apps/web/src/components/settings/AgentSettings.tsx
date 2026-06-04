/**
 * Agent 行为设置
 */

import React, { useState, useEffect } from 'react'
import { SettingsSection, SettingsCard, SettingsSelect, SettingsToggle, SettingsSegmentedControl, SettingsRow } from './primitives'
import { tagentClient } from '@/services/websocket'
import { API_BASE } from '@/lib/api'
import { FileText, Loader2, Zap, Archive, Workflow, Sparkles, AlertTriangle } from 'lucide-react'

export function AgentSettings() {
  const [workflowMode, setWorkflowMode] = useState<'step_by_step' | 'auto'>('step_by_step')
  const [autoArchive, setAutoArchive] = useState(true)
  const [archiveDays, setArchiveDays] = useState('7')
  const [prompt, setPrompt] = useState('')
  const [promptLength, setPromptLength] = useState(0)
  const [promptLoading, setPromptLoading] = useState(true)
  const [promptExpanded, setPromptExpanded] = useState(false)

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
      {/* 系统提示词（可折叠只读） */}
      <SettingsSection
        title="系统提示词"
        description="Agent 的基础系统提示词（只读）"
      >
        <SettingsCard>
          <SettingsRow
            label="当前提示词"
            description={`${promptLength} 字符${promptLoading ? ' · 加载中' : ''}`}
            icon={<FileText size={16} />}
          >
            <button
              type="button"
              onClick={() => setPromptExpanded(!promptExpanded)}
              className="text-xs px-2.5 py-1 rounded-md border border-foreground/10 bg-background hover:bg-accent transition-colors flex items-center gap-1"
            >
              {promptExpanded ? '收起' : '查看'}
            </button>
          </SettingsRow>
        </SettingsCard>
        {promptExpanded && (
          <div className="rounded-xl border border-foreground/10 overflow-hidden shadow-[0_8px_24px_-8px_rgb(0_0%_0/0.12),inset_0_1px_0_0_rgb(255_255_255/0.4)]">
            {promptLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground bg-muted/30">
                <Loader2 size={16} className="animate-spin mr-2" />
                <span className="text-sm">加载中...</span>
              </div>
            ) : (
              <div className="bg-muted/30 max-h-[280px] overflow-y-auto scrollbar-thin">
                <pre className="text-xs text-foreground/80 whitespace-pre-wrap break-words font-mono leading-relaxed p-4">
                  {prompt || '暂无内容'}
                </pre>
              </div>
            )}
          </div>
        )}
      </SettingsSection>

      {/* 工作流模式 */}
      <SettingsSection title="工作流模式" description="控制 Agent 执行任务的方式">
        <div className="space-y-2">
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
          {/* 模式详情对比卡 */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleWorkflowChange('step_by_step')}
              className={`text-left rounded-xl border p-3 transition-colors ${
                workflowMode === 'step_by_step'
                  ? 'border-primary bg-primary/5'
                  : 'border-foreground/10 bg-background hover:bg-accent/50'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Workflow size={14} className={workflowMode === 'step_by_step' ? 'text-primary' : 'text-muted-foreground'} />
                <span className="text-xs font-medium">逐步模式</span>
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">推荐</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                每步执行前确认，可随时中断。适合复杂任务，安全性高。
              </p>
            </button>
            <button
              type="button"
              onClick={() => handleWorkflowChange('auto')}
              className={`text-left rounded-xl border p-3 transition-colors ${
                workflowMode === 'auto'
                  ? 'border-primary bg-primary/5'
                  : 'border-foreground/10 bg-background hover:bg-accent/50'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Zap size={14} className={workflowMode === 'auto' ? 'text-primary' : 'text-muted-foreground'} />
                <span className="text-xs font-medium">自动模式</span>
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-600 font-medium flex items-center gap-0.5">
                  <AlertTriangle size={8} /> 高风险
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                连续执行所有步骤，不中断。效率高但难以回滚。
              </p>
            </button>
          </div>
        </div>
      </SettingsSection>

      {/* 会话管理 */}
      <SettingsSection title="会话管理" description="控制会话的自动归档行为">
        <SettingsCard>
          <SettingsToggle
            label="自动归档"
            description="超期未活跃的会话自动归档"
            checked={autoArchive}
            onChange={setAutoArchive}
          />
          {autoArchive && (
            <>
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
              {/* 状态预览 */}
              <div className="flex items-center gap-2 px-1 pt-1 text-[11px] text-muted-foreground">
                <Archive size={12} />
                <span>超过 {archiveDays} 天未活跃的会话将被自动归档</span>
              </div>
            </>
          )}
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
