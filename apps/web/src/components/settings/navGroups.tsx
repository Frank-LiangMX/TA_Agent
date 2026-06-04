/**
 * 设置页面导航配置（共享给 Sidebar 和 SettingsView）
 */

import {
  Wifi, Server, Cpu, Bot, Shield, Brain,
  Package, BookOpen, Wrench, MessageSquare,
  Palette, Keyboard, BarChart3, HelpCircle,
} from 'lucide-react'
import { type ReactNode } from 'react'

export type TabId = string

export interface TabItem {
  id: TabId
  label: string
  icon: ReactNode
  component?: React.ComponentType
  readOnly?: boolean
}

export interface NavGroup {
  label: string
  tabs: TabItem[]
}

export const SETTINGS_NAV_GROUPS: NavGroup[] = [
  {
    label: '账户',
    tabs: [
      { id: 'mode', label: '工作模式', icon: <Wifi size={16} /> },
      { id: 'connection', label: '连接诊断', icon: <Server size={16} /> },
    ],
  },
  {
    label: 'AI 配置',
    tabs: [
      { id: 'model', label: '模型设置', icon: <Cpu size={16} /> },
      { id: 'agent', label: 'Agent 行为', icon: <Bot size={16} /> },
      { id: 'permissions', label: '权限管理', icon: <Shield size={16} /> },
      { id: 'memory', label: '记忆系统', icon: <Brain size={16} /> },
    ],
  },
  {
    label: '项目',
    tabs: [
      { id: 'project', label: '项目配置', icon: <Package size={16} /> },
      { id: 'conventions', label: '规范管理', icon: <BookOpen size={16} /> },
    ],
  },
  {
    label: '工具',
    tabs: [
      { id: 'tools', label: '工具管理', icon: <Wrench size={16} /> },
      { id: 'mcp', label: 'MCP 服务器', icon: <Server size={16} /> },
      { id: 'bridge', label: '消息桥接', icon: <MessageSquare size={16} /> },
    ],
  },
  {
    label: '系统',
    tabs: [
      { id: 'appearance', label: '主题外观', icon: <Palette size={16} /> },
      { id: 'shortcuts', label: '快捷键', icon: <Keyboard size={16} />, readOnly: true },
      { id: 'usage', label: '用量统计', icon: <BarChart3 size={16} /> },
      { id: 'about', label: '关于与帮助', icon: <HelpCircle size={16} /> },
    ],
  },
]

export const ALL_TABS = SETTINGS_NAV_GROUPS.flatMap(g => g.tabs)

export function findGroupOfTab(tabId: string): string {
  for (const group of SETTINGS_NAV_GROUPS) {
    if (group.tabs.some(t => t.id === tabId)) return group.label
  }
  return SETTINGS_NAV_GROUPS[0].label
}
