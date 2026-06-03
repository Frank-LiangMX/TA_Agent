/**
 * 左侧边栏 - 会话列表 + 导航
 */

import React, { useState, useEffect, useRef } from 'react'
import { getApiBase } from '@/lib/api'
import { getConfig } from '@/services/config'
import agentIcon from '@/assets/icon.png'
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
} from 'lucide-react'

export type ViewType = 'chat' | 'workspace' | 'history' | 'assets' | 'analysis' | 'review' | 'intake' | 'search' | 'workflow' | 'settings'

interface SidebarProps {
  activeView: ViewType
  agentMode: 'ta' | 'general'
  onViewChange: (view: ViewType) => void
}

/** 获取数据源 API 地址 */
async function getDataSource(): Promise<string> {
  try {
    const config = await getConfig()
    if (config.cloud?.enabled && config.cloud.server_url) {
      return `http://${config.cloud.server_url}`
    }
  } catch {}
  return getApiBase()
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

  // 定期刷新待审核数量
  useEffect(() => {
    if (agentMode !== 'ta') {
      setReviewCount(0)
      return
    }
    const fetchCount = async () => {
      try {
        const dataSource = await getDataSource()
        const reviewRes = await fetch(`${dataSource}/api/reviews/pending`)
        const reviewData = await reviewRes.json()
        setReviewCount(reviewData.total_pending || 0)

        // 入库角标：始终读本地 TagStore 统计（与入库向导一致）
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

  // 切换到审核页面时立即刷新
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
    <div className="w-full h-full flex flex-col">
      {/* Logo */}
      <div className="titlebar-drag-region flex h-14 items-center border-b border-border/50 px-4">
        <div className="titlebar-no-drag flex min-w-0 items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-background border border-border/60 flex items-center justify-center overflow-hidden">
            <img src={agentIcon} alt="TAgent" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-sm font-semibold"><BlurText text="TAgent" delay={80} /></h1>
            <p className="text-xs text-muted-foreground">
              {agentMode === 'general' ? '通用工作台' : '游戏 TA AI Agent'}
            </p>
          </div>
        </div>
      </div>

      {/* 导航 */}
      <nav className="flex-1 p-2 space-y-1">
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

      {/* 底部设置 */}
      <div className="p-2 border-t border-border/50">
        <button
          onClick={() => {
            setGearReverse(activeView === 'settings') // 进入顺时针，离开逆时针
            setGearSpinKey(k => k + 1)
            onViewChange('settings')
          }}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            activeView === 'settings'
              ? 'bg-foreground/[0.08] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
        >
          <Settings key={gearSpinKey} size={18} className={gearReverse ? 'animate-gear-spin-reverse' : 'animate-gear-spin'} />
          <span>{activeView === 'settings' ? '返回' : '设置'}</span>
        </button>
      </div>
    </div>
  )
}
