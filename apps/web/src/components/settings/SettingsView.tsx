/**
 * 设置页面主布局
 *
 * flex flex-col h-full
 *   h-12 header
 *   flex flex-1 min-h-0
 *     w-[256px] nav sidebar (分组)
 *     flex-1 scrollable content
 */

import React, { useState, useEffect } from 'react'
import {
  Package, Cpu, Bot, Wrench, BookOpen,
  Brain, Palette, Keyboard, Shield, BarChart3, HelpCircle, Server, Wifi, MessageSquare, Settings, Eye, Search, ChevronDown,
} from 'lucide-react'
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
import { PageHeader } from '@/components/layout/PageHeader'

type TabId = string

interface TabItem {
  id: TabId
  label: string
  icon: React.ReactNode
  component: React.ComponentType
  readOnly?: boolean
}

interface NavGroup {
  label: string
  tabs: TabItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: '账户',
    tabs: [
      { id: 'mode', label: '工作模式', icon: <Wifi size={16} />, component: ModeSettings },
      { id: 'connection', label: '连接诊断', icon: <Server size={16} />, component: ConnectionDiagnostics },
    ],
  },
  {
    label: 'AI 配置',
    tabs: [
      { id: 'model', label: '模型设置', icon: <Cpu size={16} />, component: ModelSettings },
      { id: 'agent', label: 'Agent 行为', icon: <Bot size={16} />, component: AgentSettings },
      { id: 'permissions', label: '权限管理', icon: <Shield size={16} />, component: PermissionSettings },
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
      { id: 'bridge', label: '消息桥接', icon: <MessageSquare size={16} />, component: WeChatSettings },
    ],
  },
  {
    label: '系统',
    tabs: [
      { id: 'appearance', label: '主题外观', icon: <Palette size={16} />, component: AppearanceSettings },
      { id: 'shortcuts', label: '快捷键', icon: <Keyboard size={16} />, component: ShortcutSettings, readOnly: true },
      { id: 'usage', label: '用量统计', icon: <BarChart3 size={16} />, component: UsageSettings },
      { id: 'about', label: '关于与帮助', icon: <HelpCircle size={16} />, component: AboutSettings },
    ],
  },
]

// 构建 tab 映射
const ALL_TABS = NAV_GROUPS.flatMap(g => g.tabs)
const TAB_COMPONENTS: Record<string, React.ComponentType> = {}
const TAB_READ_ONLY: Record<string, boolean> = {}
ALL_TABS.forEach(tab => {
  TAB_COMPONENTS[tab.id] = tab.component
  if (tab.readOnly) TAB_READ_ONLY[tab.id] = true
})

// 找到 tab 所属分组
function findGroupOfTab(tabId: string): string {
  for (const group of NAV_GROUPS) {
    if (group.tabs.some(t => t.id === tabId)) return group.label
  }
  return NAV_GROUPS[0].label
}

interface SettingsViewProps {
  onBack: () => void
  onModeChange?: () => void
}

export function SettingsView({ onBack, onModeChange }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<string>('mode')
  const [settingsRevision, setSettingsRevision] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    const activeGroup = findGroupOfTab('mode')
    return new Set(NAV_GROUPS.filter(g => g.label !== activeGroup).map(g => g.label))
  })
  const [backGearKey, setBackGearKey] = useState(0)
  const [hasEntered, setHasEntered] = useState(false)
  const ActiveComponent = TAB_COMPONENTS[activeTab]
  const isReadOnly = TAB_READ_ONLY[activeTab]

  // 进入设置页面时触发返回齿轮旋转
  useEffect(() => {
    setBackGearKey(k => k + 1)
  }, [])

  const handleAgentModeChange = () => {
    onModeChange?.()
    setSettingsRevision((k) => k + 1)
  }

  const toggleGroup = (groupLabel: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupLabel)) next.delete(groupLabel)
      else next.add(groupLabel)
      return next
    })
  }

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId)
    // 切换 tab 时确保目标分组展开
    const groupLabel = findGroupOfTab(tabId)
    setCollapsedGroups(prev => {
      if (!prev.has(groupLabel)) return prev
      const next = new Set(prev)
      next.delete(groupLabel)
      return next
    })
  }

  // 搜索过滤
  const query = searchQuery.trim().toLowerCase()
  const filteredGroups = query
    ? NAV_GROUPS.map(group => ({
        ...group,
        tabs: group.tabs.filter(tab => tab.label.toLowerCase().includes(query)),
      })).filter(group => group.tabs.length > 0)
    : NAV_GROUPS

  return (
    <div className="flex h-full min-h-0 w-full gap-2">
      {/* 左侧卡片：导航 + 返回 */}
      <div className={`flex w-[256px] shrink-0 flex-col overflow-hidden rounded-2xl border border-black/5 bg-background shadow-xl ${hasEntered ? '' : 'animate-settings-enter'}`} onAnimationEnd={() => setHasEntered(true)}>
          {/* 搜索框 */}
          <div className="px-3 pt-3 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索设置..."
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted rounded-lg border border-border outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin px-3">
            {(() => {
              let tabIndex = 0
              return filteredGroups.map((group, groupIndex) => {
              const isCollapsed = !query && collapsedGroups.has(group.label)
              return (
                <div key={group.label} className={groupIndex > 0 ? 'mt-2' : ''}>
                  <button
                    onClick={() => toggleGroup(group.label)}
                    className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-medium text-muted-foreground/70 uppercase tracking-wider hover:text-muted-foreground transition-colors"
                  >
                    <span>{group.label}</span>
                    <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                  </button>
                  <div className={`settings-group-body ${isCollapsed ? 'settings-group-body-collapsed' : ''}`}>
                    <div className="mt-0.5 flex flex-col gap-0.5">
                      {group.tabs.map((tab) => {
                        const delay = query ? tabIndex++ * 30 : 0
                        return (
                          <button
                            key={tab.id}
                            onClick={() => handleTabClick(tab.id)}
                            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                              activeTab === tab.id
                                ? 'bg-foreground/[0.08] font-medium text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]'
                                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                            } ${query ? 'animate-settings-tab-in' : ''}`}
                            style={query ? { animationDelay: `${delay}ms` } : undefined}
                          >
                            {tab.icon}
                            <span className="truncate">{tab.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })
            })()}
            {query && filteredGroups.length === 0 && (
              <div className="px-3 py-6 text-sm text-muted-foreground text-center">
                未找到匹配的设置
              </div>
            )}
          </div>
          <div className="border-t border-border/50 p-2">
            <button
              onClick={onBack}
              className="gear-wobble flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Settings key={backGearKey} size={18} className="animate-gear-spin-reverse" />
              <span>返回</span>
            </button>
          </div>
      </div>

      {/* 右侧卡片：顶栏 + 内容 */}
      <div className={`flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-black/5 bg-content-area shadow-xl ${hasEntered ? '' : 'animate-settings-enter'}`} style={hasEntered ? undefined : { animationDelay: '50ms' }}>
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
    </div>
  )
}
