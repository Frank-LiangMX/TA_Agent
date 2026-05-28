/**
 * 设置页面主布局
 *
 * flex flex-col h-full
 *   h-12 header
 *   flex flex-1 min-h-0
 *     w-[256px] nav sidebar (分组)
 *     flex-1 scrollable content
 */

import React, { useState } from 'react'
import {
  Package, Cpu, Bot, Wrench, FileText, BookOpen,
  Brain, Palette, Keyboard, Shield, BarChart3, ArrowLeft, HelpCircle, Server, Wifi, User,
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
import { McpSettings } from './McpSettings'
import { ModeSettings } from './ModeSettings'

type TabId = string

interface TabItem {
  id: TabId
  label: string
  icon: React.ReactNode
  component: React.ComponentType
}

interface NavGroup {
  label: string
  tabs: TabItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: '账户与连接',
    tabs: [
      { id: 'mode', label: '工作模式', icon: <Wifi size={16} />, component: ModeSettings },
    ],
  },
  {
    label: 'AI 配置',
    tabs: [
      { id: 'model', label: '模型设置', icon: <Cpu size={16} />, component: ModelSettings },
      { id: 'agent', label: 'Agent 行为', icon: <Bot size={16} />, component: AgentSettings },
      { id: 'prompt', label: '提示词', icon: <FileText size={16} />, component: PromptSettings },
      { id: 'memory', label: '记忆系统', icon: <Brain size={16} />, component: MemorySettings },
    ],
  },
  {
    label: '项目',
    tabs: [
      { id: 'project', label: '项目配置', icon: <Package size={16} />, component: ProjectSettings },
      { id: 'conventions', label: '规范管理', icon: <BookOpen size={16} />, component: ConventionSettings },
    ],
  },
  {
    label: '工具',
    tabs: [
      { id: 'tools', label: '工具管理', icon: <Wrench size={16} />, component: ToolSettings },
      { id: 'mcp', label: 'MCP 服务器', icon: <Server size={16} />, component: McpSettings },
    ],
  },
  {
    label: '系统',
    tabs: [
      { id: 'appearance', label: '主题外观', icon: <Palette size={16} />, component: AppearanceSettings },
      { id: 'shortcuts', label: '快捷键', icon: <Keyboard size={16} />, component: ShortcutSettings },
      { id: 'permissions', label: '权限管理', icon: <Shield size={16} />, component: PermissionSettings },
      { id: 'usage', label: '用量统计', icon: <BarChart3 size={16} />, component: UsageSettings },
      { id: 'help', label: '使用指南', icon: <HelpCircle size={16} />, component: HelpGuide },
    ],
  },
]

// 构建 tab 映射
const ALL_TABS = NAV_GROUPS.flatMap(g => g.tabs)
const TAB_COMPONENTS: Record<string, React.ComponentType> = {}
ALL_TABS.forEach(tab => { TAB_COMPONENTS[tab.id] = tab.component })

interface SettingsViewProps {
  onBack: () => void
  onModeChange?: () => void
}

export function SettingsView({ onBack, onModeChange }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<string>('mode')
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
        {/* Left nav — 分组菜单 */}
        <div className="w-[256px] border-r border-border/40 pt-3 px-3 flex-shrink-0 bg-card overflow-y-auto scrollbar-thin">
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.label} className={groupIndex > 0 ? 'mt-3' : ''}>
              {/* 分组标题 */}
              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
                {group.label}
              </div>
              {/* 分组内的 tab */}
              <div className="flex flex-col gap-0.5 mt-1">
                {group.tabs.map((tab) => (
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
          ))}
        </div>

        {/* Right content — 自适应宽度 */}
        <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin">
          <div className="w-full max-w-5xl px-8 py-6">
            {activeTab === 'mode' ? (
              <ModeSettings onModeChange={onModeChange} />
            ) : (
              <ActiveComponent />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
