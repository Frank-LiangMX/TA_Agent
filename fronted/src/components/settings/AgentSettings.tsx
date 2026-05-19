/**
 * Agent 配置设置
 */

import React, { useState, useEffect } from 'react'
import { SettingsSection, SettingsCard, SettingsSelect, SettingsToggle, SettingsSegmentedControl } from './primitives'
import { tagentClient } from '@/services/websocket'

export function AgentSettings() {
  const [workflowMode, setWorkflowMode] = useState<'step_by_step' | 'auto'>('step_by_step')
  const [autoArchive, setAutoArchive] = useState(true)
  const [archiveDays, setArchiveDays] = useState('7')

  useEffect(() => {
    tagentClient.getStatus().then((status: Record<string, unknown>) => {
      if (status.workflowMode) {
        setWorkflowMode(status.workflowMode as 'step_by_step' | 'auto')
      }
    }).catch(() => {})
  }, [])

  const handleWorkflowChange = (mode: string) => {
    const m = mode as 'step_by_step' | 'auto'
    setWorkflowMode(m)
    tagentClient.setMode(m).catch(() => {})
  }

  return (
    <div className="space-y-6">
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

      <SettingsSection title="权限模式" description="控制 Agent 使用工具时的权限策略">
        <SettingsCard>
          <SettingsSegmentedControl
            label="工具权限"
            description="safe 需确认，ask 询问后执行，allow-all 自动执行"
            value="ask"
            onChange={() => {}}
            options={[
              { value: 'safe', label: '安全' },
              { value: 'ask', label: '询问' },
              { value: 'allow-all', label: '自动' },
            ]}
          />
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
