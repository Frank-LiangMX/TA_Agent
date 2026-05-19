/**
 * 左侧边栏 - 会话列表 + 导航
 */

import React, { useState, useEffect } from 'react'
import { API_BASE } from '@/lib/api'
import { BlurText } from '../animations'
import {
  MessageSquare,
  Search,
  Settings,
  Package,
  BarChart3,
  FileCheck,
  GitBranch,
} from 'lucide-react'

export type ViewType = 'chat' | 'assets' | 'analysis' | 'review' | 'search' | 'workflow' | 'settings'

interface SidebarProps {
  activeView: ViewType
  onViewChange: (view: ViewType) => void
}

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const [reviewCount, setReviewCount] = useState(0)

  // 定期刷新待审核数量
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/reviews/pending`)
        const data = await res.json()
        setReviewCount(data.total_pending || 0)
      } catch {
        setReviewCount(0)
      }
    }
    fetchCount()
    const timer = setInterval(fetchCount, 30000)
    return () => clearInterval(timer)
  }, [])

  // 切换到审核页面时立即刷新
  useEffect(() => {
    if (activeView === 'review') {
      fetch(`${API_BASE}/api/reviews/pending`)
        .then((res) => res.json())
        .then((data) => setReviewCount(data.total_pending || 0))
        .catch(() => {})
    }
  }, [activeView])

  return (
    <div className="w-full h-full flex flex-col">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Package size={16} className="text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-semibold"><BlurText text="TAgent" delay={80} /></h1>
            <p className="text-xs text-muted-foreground">游戏 TA AI Agent</p>
          </div>
        </div>
      </div>

      {/* 导航 */}
      <nav className="flex-1 p-2 space-y-1">
        {[
          { id: 'chat' as ViewType, label: '对话', icon: <MessageSquare size={18} /> },
          { id: 'assets' as ViewType, label: '资产库', icon: <Package size={18} /> },
          { id: 'analysis' as ViewType, label: '分析', icon: <BarChart3 size={18} /> },
          { id: 'review' as ViewType, label: '审核', icon: <FileCheck size={18} />, badge: reviewCount },
          { id: 'search' as ViewType, label: '搜索', icon: <Search size={18} /> },
          { id: 'workflow' as ViewType, label: '流水线', icon: <GitBranch size={18} /> },
        ].map((item) => (
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
          onClick={() => onViewChange('settings')}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            activeView === 'settings'
              ? 'bg-foreground/[0.08] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
        >
          <Settings size={18} className={activeView === 'settings' ? 'rotate-90 transition-transform' : 'transition-transform'} />
          <span>{activeView === 'settings' ? '返回' : '设置'}</span>
        </button>
      </div>
    </div>
  )
}
