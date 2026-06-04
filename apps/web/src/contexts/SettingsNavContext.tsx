/**
 * 设置导航 Context — 共享设置页的 tab 状态
 * 由 App 级别提供，Sidebar（设置模式）和 SettingsContent 共同消费
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { SETTINGS_NAV_GROUPS, findGroupOfTab, type TabId } from '@/components/settings/navGroups'

interface SettingsNavContextValue {
  activeTab: TabId
  setActiveTab: (tab: TabId) => void
  searchQuery: string
  setSearchQuery: (q: string) => void
  collapsedGroups: Set<string>
  toggleGroup: (label: string) => void
}

const SettingsNavContext = createContext<SettingsNavContextValue | null>(null)

export function SettingsNavProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTabState] = useState<TabId>('mode')
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    const activeGroup = findGroupOfTab('mode')
    return new Set(
      SETTINGS_NAV_GROUPS
        .filter(g => g.label !== activeGroup)
        .map(g => g.label)
    )
  })

  const setActiveTab = useCallback((tab: TabId) => {
    setActiveTabState(tab)
    // 切换 tab 时确保目标分组展开
    const groupLabel = findGroupOfTab(tab)
    setCollapsedGroups(prev => {
      if (!prev.has(groupLabel)) return prev
      const next = new Set(prev)
      next.delete(groupLabel)
      return next
    })
  }, [])

  const toggleGroup = useCallback((groupLabel: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupLabel)) next.delete(groupLabel)
      else next.add(groupLabel)
      return next
    })
  }, [])

  return (
    <SettingsNavContext.Provider value={{
      activeTab, setActiveTab,
      searchQuery, setSearchQuery,
      collapsedGroups, toggleGroup,
    }}>
      {children}
    </SettingsNavContext.Provider>
  )
}

export function useSettingsNav(): SettingsNavContextValue {
  const ctx = useContext(SettingsNavContext)
  if (!ctx) throw new Error('useSettingsNav must be used within SettingsNavProvider')
  return ctx
}
