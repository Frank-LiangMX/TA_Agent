/**
 * 设置页面主布局（对齐 Proma Agent SettingsPanel）
 *
 * flex flex-col h-full
 *   h-12 header
 *   flex flex-1 min-h-0
 *     w-[160px] nav sidebar
 *     flex-1 scrollable content
 */

import React, { useState } from 'react'
import {
  Package, Cpu, Bot, Wrench, FileText, BookOpen,
  Brain, Palette, Keyboard, Shield, BarChart3, ArrowLeft, HelpCircle,
} from 'lucide-react'
import { ProjectSettings } from './ProjectSettings'
import { ModelSettings } from './ModelSettings'
import { AgentSettings } from './AgentSettings'
import { ToolSettings } from './ToolSettings'
import { PromptSettings } from './PromptSettings'
import { ConventionSettings } from './ConventionSettings'
import { MemorySettings } from './MemorySettings'
import { AppearanceSettings } from './AppearanceSettings'
import { ShortcutSettings } from './ShortcutSettings'
import { PermissionSettings } from './PermissionSettings'
import { UsageSettings } from './UsageSettings'
import { HelpGuide } from './HelpGuide'

type TabId = 'project' | 'model' | 'agent' | 'tools' | 'prompt' | 'conventions' | 'memory' | 'appearance' | 'shortcuts' | 'permissions' | 'usage' | 'help'

interface TabItem {
  id: TabId
  label: string
  icon: React.ReactNode
}

const TABS: TabItem[] = [
  { id: 'project', label: '项目配置', icon: <Package size={16} /> },
  { id: 'model', label: '模型设置', icon: <Cpu size={16} /> },
  { id: 'agent', label: 'Agent 配置', icon: <Bot size={16} /> },
  { id: 'tools', label: '工具管理', icon: <Wrench size={16} /> },
  { id: 'prompt', label: '提示词', icon: <FileText size={16} /> },
  { id: 'conventions', label: '规范管理', icon: <BookOpen size={16} /> },
  { id: 'memory', label: '记忆系统', icon: <Brain size={16} /> },
  { id: 'appearance', label: '主题外观', icon: <Palette size={16} /> },
  { id: 'shortcuts', label: '快捷键', icon: <Keyboard size={16} /> },
  { id: 'permissions', label: '权限管理', icon: <Shield size={16} /> },
  { id: 'usage', label: '用量统计', icon: <BarChart3 size={16} /> },
  { id: 'help', label: '使用指南', icon: <HelpCircle size={16} /> },
]

const TAB_COMPONENTS: Record<TabId, React.ComponentType> = {
  project: ProjectSettings,
  model: ModelSettings,
  agent: AgentSettings,
  tools: ToolSettings,
  prompt: PromptSettings,
  conventions: ConventionSettings,
  memory: MemorySettings,
  appearance: AppearanceSettings,
  shortcuts: ShortcutSettings,
  permissions: PermissionSettings,
  usage: UsageSettings,
  help: HelpGuide,
}

interface SettingsViewProps {
  onBack: () => void
}

export function SettingsView({ onBack }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>('agent')
  const ActiveComponent = TAB_COMPONENTS[activeTab]

  return (
    <div className="flex flex-col h-full w-full flex-1 min-w-0">
      {/* Header */}
      <div className="h-12 flex items-center px-5 border-b border-border/50 flex-shrink-0">
        <button
          onClick={onBack}
          className="rounded-md p-1.5 text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors mr-3"
        >
          <ArrowLeft size={16} />
        </button>
        <span className="text-sm font-medium text-foreground">设置</span>
      </div>

      {/* Body: nav + content */}
      <div className="flex flex-1 min-h-0">
        {/* Left nav — 与主侧边栏同宽 */}
        <div className="w-[256px] border-r border-border/40 pt-3 px-3 flex-shrink-0 bg-card">
          <div className="flex flex-col gap-0.5">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'bg-foreground/[0.08] text-foreground font-medium shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {tab.icon}
                <span className="truncate">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right content — 自适应宽度 */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          <div className="w-full max-w-5xl px-8 py-6">
            <ActiveComponent />
          </div>
        </div>
      </div>
    </div>
  )
}
