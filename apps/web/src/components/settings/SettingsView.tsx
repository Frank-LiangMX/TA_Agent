/**
 * 设置页面内容区 — 不再自带导航，导航由 Sidebar（Layer 2）提供
 */

import React, { useState, useEffect } from 'react'
import { Settings, Eye } from 'lucide-react'
import { type TabId } from '@/components/settings/navGroups'
import { useSettingsNav } from '@/contexts/SettingsNavContext'
import { PageHeader } from '@/components/layout/PageHeader'
import { ProjectSettings } from './ProjectSettings'
import { ConnectionDiagnostics } from './ConnectionDiagnostics'
import { ModelSettings } from './ModelSettings'
import { AgentSettings } from './AgentSettings'
import { ToolSettings } from './ToolSettings'
import { MemorySettings } from './MemorySettings'
import { PermissionSettings } from './PermissionSettings'
import { ConventionSettings } from './ConventionSettings'
import { AppearanceSettings } from './AppearanceSettings'
import { ShortcutSettings } from './ShortcutSettings'
import { UsageSettings } from './UsageSettings'
import { McpSettings } from './McpSettings'
import { ModeSettings } from './ModeSettings'
import { WeChatSettings } from './WeChatSettings'
import { AboutSettings } from './AboutSettings'

// 组件映射（仅在 SettingsView 中使用）
const TAB_COMPONENTS: Record<TabId, React.ComponentType> = {
  mode: ModeSettings,
  connection: ConnectionDiagnostics,
  model: ModelSettings,
  agent: AgentSettings,
  permissions: PermissionSettings,
  memory: MemorySettings,
  project: ProjectSettings,
  conventions: ConventionSettings,
  tools: ToolSettings,
  mcp: McpSettings,
  bridge: WeChatSettings,
  appearance: AppearanceSettings,
  shortcuts: ShortcutSettings,
  usage: UsageSettings,
  about: AboutSettings,
}

const TAB_READ_ONLY: Record<string, boolean> = {
  shortcuts: true,
}

interface SettingsViewProps {
  onBack: () => void
  onModeChange?: () => void
}

export function SettingsView({ onBack, onModeChange }: SettingsViewProps) {
  const { activeTab, setActiveTab } = useSettingsNav()
  const [settingsRevision, setSettingsRevision] = useState(0)

  useEffect(() => {
    // 重置到第一个 tab
    setActiveTab('mode')
  }, [])

  const ActiveComponent = TAB_COMPONENTS[activeTab] ?? ModeSettings
  const isReadOnly = TAB_READ_ONLY[activeTab]

  const handleAgentModeChange = () => {
    onModeChange?.()
    setSettingsRevision((k) => k + 1)
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      {/* 顶栏 */}
      <PageHeader>
        <Settings size={16} className="text-primary shrink-0" />
        <h2 className="text-sm font-medium">设置</h2>
      </PageHeader>

      {/* 只读提示 */}
      {isReadOnly && (
        <div className="flex items-center gap-2 px-8 py-2 bg-muted/50 border-b border-border/30 text-xs text-muted-foreground animate-settings-banner-in">
          <Eye className="w-3.5 h-3.5" />
          <span>此页面为只读展示，内容由系统自动管理</span>
        </div>
      )}

      {/* 内容区 */}
      <div key={activeTab} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-8 py-6 animate-settings-content-in">
        {activeTab === 'mode' ? (
          <ModeSettings onModeChange={handleAgentModeChange} />
        ) : activeTab === 'tools' ? (
          <ToolSettings key={settingsRevision} refreshKey={settingsRevision} />
        ) : activeTab === 'memory' ? (
          <MemorySettings key={settingsRevision} refreshKey={settingsRevision} />
        ) : activeTab === 'permissions' ? (
          <PermissionSettings key={settingsRevision} refreshKey={settingsRevision} />
        ) : (
          <ActiveComponent />
        )}
      </div>
    </div>
  )
}
