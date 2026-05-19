/**
 * 快捷键设置（静态展示）
 */

import React from 'react'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'

const SHORTCUTS = [
  { category: '通用', items: [
    { key: 'Enter', action: '发送消息' },
    { key: 'Shift + Enter', action: '换行' },
    { key: 'Ctrl + K', action: '清除上下文' },
    { key: 'Ctrl + Enter', action: '停止运行' },
  ]},
  { category: '导航', items: [
    { key: '1', action: '切换到对话' },
    { key: '2', action: '切换到资产库' },
    { key: '3', action: '切换到分析' },
    { key: '4', action: '切换到审核' },
    { key: '5', action: '切换到搜索' },
  ]},
]

export function ShortcutSettings() {
  return (
    <div className="space-y-6">
      {SHORTCUTS.map((group) => (
        <SettingsSection key={group.category} title={group.category}>
          <SettingsCard>
            {group.items.map((item) => (
              <SettingsRow key={item.key} label={item.action}>
                <kbd className="px-2 py-0.5 text-xs font-mono bg-muted rounded border border-border/50">
                  {item.key}
                </kbd>
              </SettingsRow>
            ))}
          </SettingsCard>
        </SettingsSection>
      ))}
    </div>
  )
}
