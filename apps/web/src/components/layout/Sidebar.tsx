/**
 * 左侧边栏 - 会话导航 + 设置导航
 */

import React, { useState, useEffect } from 'react'
import { getApiBase } from '@/lib/api'
import { getConfig } from '@/services/config'
import { getThemeIconSrc } from '@/assets/theme-icons'
import { loadTheme, resolveThemeAppearance, type ThemeAppearance } from '@/atoms/theme'
import { SETTINGS_NAV_GROUPS } from '@/components/settings/navGroups'
import { useSettingsNav } from '@/contexts/SettingsNavContext'
import { BlurText } from '../animations'
import {
  MessageSquare,
  Search,
  Settings,
  Package,
  BarChart3,
  FileCheck,
  GitBranch,
  FolderOpen,
  Clock3,
  Import,
  ChevronDown,
} from 'lucide-react'

export type ViewType = 'chat' | 'workspace' | 'history' | 'assets' | 'analysis' | 'review' | 'intake' | 'search' | 'workflow' | 'settings'

interface SidebarProps {
  activeView: ViewType
  agentMode: 'ta' | 'general'
  onViewChange: (view: ViewType) => void
}

async function getDataSource(): Promise<string> {
  try {
    const config = await getConfig()
    if (config.cloud?.enabled && config.cloud.server_url) {
      return `http://${config.cloud.server_url}`
    }
  } catch {}
  return getApiBase()
}

function getCurrentThemeIcon() {
  const { mode, variant } = loadTheme()
  return getThemeIconSrc(resolveThemeAppearance(mode, variant).iconKey)
}

function SessionNav({
  activeView,
  agentMode,
  onViewChange,
  reviewCount,
  intakeCount,
}: {
  activeView: ViewType
  agentMode: 'ta' | 'general'
  onViewChange: (view: ViewType) => void
  reviewCount: number
  intakeCount: number
}) {
  const navItems = agentMode === 'general'
    ? [
        { id: 'chat' as ViewType, label: '对话', icon: <MessageSquare size={18} /> },
        { id: 'workspace' as ViewType, label: '工作区', icon: <FolderOpen size={18} /> },
        { id: 'history' as ViewType, label: '历史', icon: <Clock3 size={18} /> },
      ]
    : [
        { id: 'chat' as ViewType, label: '对话', icon: <MessageSquare size={18} /> },
        { id: 'assets' as ViewType, label: '资产库', icon: <Package size={18} /> },
        { id: 'analysis' as ViewType, label: '分析', icon: <BarChart3 size={18} /> },
        { id: 'review' as ViewType, label: '审核', icon: <FileCheck size={18} />, badge: reviewCount },
        { id: 'intake' as ViewType, label: '入库', icon: <Import size={18} />, badge: intakeCount },
        { id: 'search' as ViewType, label: '搜索', icon: <Search size={18} /> },
        { id: 'workflow' as ViewType, label: '流水线', icon: <GitBranch size={18} /> },
      ]

  return (
    <nav className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => onViewChange(item.id)}
          className={`
            w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
            ${activeView === item.id
              ? 'bg-foreground/[0.08] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }
          `}
        >
          {item.icon}
          <span>{item.label}</span>
          {item.badge != null && item.badge > 0 && (
            <span className="ml-auto bg-destructive text-destructive-foreground text-xs px-1.5 py-0.5 rounded-full">
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          )}
        </button>
      ))}
    </nav>
  )
}

function SettingsNav() {
  const { activeTab, setActiveTab, searchQuery, setSearchQuery, collapsedGroups, toggleGroup } = useSettingsNav()
  const query = searchQuery.trim().toLowerCase()
  const filteredGroups = query
    ? SETTINGS_NAV_GROUPS.map(group => ({
        ...group,
        tabs: group.tabs.filter(tab => tab.label.toLowerCase().includes(query)),
      })).filter(group => group.tabs.length > 0)
    : SETTINGS_NAV_GROUPS

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 搜索框 */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索设置..."
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-white/10 dark:bg-white/5 rounded-lg border border-white/20 dark:border-white/10 outline-none focus:ring-1 focus:ring-ring backdrop-blur-md placeholder:text-muted-foreground/70"
          />
        </div>
      </div>

      {/* 导航列表 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-3">
        {filteredGroups.map((group, groupIndex) => {
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
                  {group.tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`
                        w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors
                        ${activeTab === tab.id
                          ? 'bg-foreground/[0.08] font-medium text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        }
                      `}
                    >
                      {tab.icon}
                      <span className="truncate">{tab.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
        {query && filteredGroups.length === 0 && (
          <div className="px-3 py-6 text-sm text-muted-foreground text-center">
            未找到匹配的设置
          </div>
        )}
      </div>
    </div>
  )
}

export function Sidebar({
  activeView,
  agentMode,
  onViewChange,
}: SidebarProps) {
  const [reviewCount, setReviewCount] = useState(0)
  const [intakeCount, setIntakeCount] = useState(0)
  const [gearSpinKey, setGearSpinKey] = useState(0)
  const [gearReverse, setGearReverse] = useState(false)
  const [agentIconSrc, setAgentIconSrc] = useState(getCurrentThemeIcon)

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const detail = (event as CustomEvent<ThemeAppearance>).detail
      setAgentIconSrc(getThemeIconSrc(detail.iconKey))
    }
    setAgentIconSrc(getCurrentThemeIcon())
    window.addEventListener('tagent-theme-change', handleThemeChange)
    return () => window.removeEventListener('tagent-theme-change', handleThemeChange)
  }, [])

  useEffect(() => {
    if (agentMode !== 'ta') {
      setReviewCount(0)
      setIntakeCount(0)
      return
    }
    const fetchCount = async () => {
      try {
        const dataSource = await getDataSource()
        const reviewRes = await fetch(`${dataSource}/api/reviews/pending`)
        const reviewData = await reviewRes.json()
        setReviewCount(reviewData.total_pending || 0)
        const localBase = await getApiBase()
        const statsRes = await fetch(`${localBase}/api/stats`)
        const statsData = await statsRes.json()
        setIntakeCount(statsData.by_status?.approved || 0)
      } catch {
        setReviewCount(0)
        setIntakeCount(0)
      }
    }
    fetchCount()
    const timer = setInterval(fetchCount, 30000)
    return () => clearInterval(timer)
  }, [agentMode])

  useEffect(() => {
    if (agentMode === 'ta' && activeView === 'review') {
      getDataSource().then(dataSource => {
        fetch(`${dataSource}/api/reviews/pending`)
          .then((res) => res.json())
          .then((data) => setReviewCount(data.total_pending || 0))
          .catch(() => {})
      })
    }
  }, [activeView, agentMode])

  const isSettingsMode = activeView === 'settings'

  return (
    <div className="w-full h-full flex flex-col">
      {/* Logo */}
      <div className="titlebar-drag-region flex h-14 items-center border-b border-border/50 px-4">
        <div className="titlebar-no-drag flex min-w-0 items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-white/15 dark:bg-white/10 border border-white/25 dark:border-white/15 flex items-center justify-center overflow-hidden backdrop-blur-md">
            <img src={agentIconSrc} alt="TAgent" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-sm font-semibold"><BlurText text="TAgent" delay={80} /></h1>
            <p className="text-xs text-muted-foreground">
              {agentMode === 'general' ? '通用工作台' : '游戏 TA AI Agent'}
            </p>
          </div>
        </div>
      </div>

      {/* 中间导航区 */}
      {isSettingsMode ? <SettingsNav /> : (
        <SessionNav
          activeView={activeView}
          agentMode={agentMode}
          onViewChange={onViewChange}
          reviewCount={reviewCount}
          intakeCount={intakeCount}
        />
      )}

      {/* 底部按钮 */}
      <div className="p-2 border-t border-border/50">
        <button
          onClick={() => {
            setGearReverse(isSettingsMode)
            setGearSpinKey(k => k + 1)
            onViewChange(isSettingsMode ? 'chat' : 'settings')
          }}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            isSettingsMode
              ? 'bg-foreground/[0.08] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
        >
          <Settings
            key={gearSpinKey}
            size={18}
            className={gearReverse ? 'animate-gear-spin-reverse' : 'animate-gear-spin'}
          />
          <span>{isSettingsMode ? '返回' : '设置'}</span>
        </button>
      </div>
    </div>
  )
}
