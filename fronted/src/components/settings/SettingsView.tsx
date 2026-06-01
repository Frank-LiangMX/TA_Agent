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
  Brain, Palette, Keyboard, Shield, BarChart3, HelpCircle, Server, Wifi, User, MessageSquare, Settings,
} from 'lucide-react'
import { ProjectSettings } from './ProjectSettings'
import { ModelSettings } from './ModelSettings'
import { AgentSettings } from './AgentSettings'
import { ToolSettings } from './ToolSettings'
import { MemorySettings } from './MemorySettings'
import { PermissionSettings } from './PermissionSettings'
import { PromptSettings } from './PromptSettings'
import { ConventionSettings } from './ConventionSettings'
import { AppearanceSettings } from './AppearanceSettings'
import { ShortcutSettings } from './ShortcutSettings'
import { UsageSettings } from './UsageSettings'
import { HelpGuide } from './HelpGuide'
import { McpSettings } from './McpSettings'
import { ModeSettings } from './ModeSettings'
import { WeChatSettings } from './WeChatSettings'
import { AboutSettings } from './AboutSettings'
import { PageHeader } from '@/components/layout/PageHeader'

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
      { id: 'wechat', label: '微信 Bridge', icon: <MessageSquare size={16} />, component: WeChatSettings },
    ],
  },
  {
    label: '系统',
    tabs: [
      { id: 'appearance', label: '主题外观', icon: <Palette size={16} />, component: AppearanceSettings },
      { id: 'shortcuts', label: '快捷键', icon: <Keyboard size={16} />, component: ShortcutSettings },
      { id: 'permissions', label: '权限管理', icon: <Shield size={16} />, component: PermissionSettings },
      { id: 'usage', label: '用量统计', icon: <BarChart3 size={16} />, component: UsageSettings },
      { id: 'about', label: '关于', icon: <HelpCircle size={16} />, component: AboutSettings },
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
  const [settingsRevision, setSettingsRevision] = useState(0)
  const ActiveComponent = TAB_COMPONENTS[activeTab]

  const handleAgentModeChange = () => {
    onModeChange?.()
    setSettingsRevision((k) => k + 1)
  }

  return (
    <div className="flex h-full min-h-0 w-full gap-2">
      {/* 左侧卡片：导航 + 返回 */}
      <div className="flex w-[256px] shrink-0 flex-col overflow-hidden rounded-2xl border border-black/5 bg-background shadow-xl">
          <div className="flex-1 overflow-y-auto scrollbar-thin px-3 pt-3">
            {NAV_GROUPS.map((group, groupIndex) => (
              <div key={group.label} className={groupIndex > 0 ? 'mt-3' : ''}>
                <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
                  {group.label}
                </div>
                <div className="mt-1 flex flex-col gap-0.5">
                  {group.tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                        activeTab === tab.id
                          ? 'bg-foreground/[0.08] font-medium text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]'
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
          <div className="border-t border-border/50 p-2">
            <button
              onClick={onBack}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Settings size={18} className="rotate-90 transition-transform duration-300" />
              <span>返回</span>
            </button>
          </div>
      </div>

      {/* 右侧卡片：顶栏 + 内容 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-black/5 bg-content-area shadow-xl">
        <PageHeader>
          <Settings size={16} className="text-primary shrink-0" />
          <h2 className="text-sm font-medium">设置</h2>
        </PageHeader>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-8 py-6">
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
    </div>
  )
}
