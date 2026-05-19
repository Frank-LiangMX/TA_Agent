/**
 * TAgent Web - 主应用组件
 *
 * 三面板布局：导航 | 对话/资产库/分析 | 资产详情
 */

import React, { useState, useEffect, useRef } from 'react'
import { Toaster } from 'sonner'
import { tagentClient } from './services/websocket'
import { Sidebar, type ViewType } from './components/layout/Sidebar'
import { ResizeHandle } from './components/layout/ResizeHandle'
import { MainPanel } from './components/layout/MainPanel'
import { AssetLibrary } from './components/asset/AssetLibrary'
import { ReviewQueue } from './components/review/ReviewQueue'
import { SearchView } from './components/search/SearchView'
import { DetailPanel } from './components/layout/DetailPanel'
import { DashboardView } from './components/dashboard/DashboardView'
import { WorkflowView } from './components/workflow/WorkflowView'
import { SettingsView } from './components/settings/SettingsView'
import { TourGuide } from './components/onboarding/TourGuide'

export default function App() {
  const [activeView, setActiveView] = useState<ViewType>('chat')
  const [previousView, setPreviousView] = useState<ViewType>('chat')
  const [detailWidth, setDetailWidth] = useState(320)
  const [selectedAsset, setSelectedAsset] = useState<Record<string, unknown> | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const detailRef = useRef<HTMLDivElement>(null)

  // WebSocket 连接由 App 层管理，全局只连一次（新会话）
  useEffect(() => {
    tagentClient.connect()
    return () => tagentClient.disconnect()
  }, [])

  // 切换视图时自动关闭资产详情（仅资产库和搜索页可查看详情）
  useEffect(() => {
    if (activeView !== 'assets' && activeView !== 'search') {
      setDetailOpen(false)
    }
  }, [activeView])

  const handleViewChange = (view: ViewType) => {
    if (view === 'settings' && activeView === 'settings') {
      // 再次点击设置，返回之前的页面
      setActiveView(previousView)
    } else {
      // 记录非设置页面作为"上一页"
      if (activeView !== 'settings') {
        setPreviousView(activeView)
      }
      setActiveView(view)
    }
  }

  const handleAssetSelect = (asset: Record<string, unknown>) => {
    setSelectedAsset(asset)
    setDetailOpen(true)
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* 主布局（设置时隐藏但保持挂载） */}
      <div className={`flex flex-1 min-w-0 h-full ${activeView === 'settings' ? 'hidden' : ''}`}>
        {/* 左侧：导航 */}
        <div ref={sidebarRef} className="border-r border-border/40 bg-card flex flex-col shrink-0" style={{ width: 256 }}>
          <Sidebar activeView={activeView} onViewChange={handleViewChange} />
        </div>
        <ResizeHandle targetRef={sidebarRef} side="left" />

        {/* 中间：主内容区 */}
        <div className={`flex-1 flex flex-col min-w-0 h-full ${activeView === 'chat' ? '' : 'hidden'}`}>
          <MainPanel onAssetSelect={handleAssetSelect} />
        </div>
        <div className={`flex-1 flex flex-col min-w-0 h-full ${activeView === 'assets' ? '' : 'hidden'}`}>
          <AssetLibrary onAssetSelect={handleAssetSelect} />
        </div>
        <div className={`flex-1 flex flex-col min-w-0 h-full ${activeView === 'analysis' ? '' : 'hidden'}`}>
          <DashboardView />
        </div>
        <div className={`flex-1 flex flex-col min-w-0 h-full ${activeView === 'review' ? '' : 'hidden'}`}>
          <ReviewQueue />
        </div>
        <div className={`flex-1 flex flex-col min-w-0 h-full ${activeView === 'search' ? '' : 'hidden'}`}>
          <SearchView onAssetSelect={handleAssetSelect} />
        </div>
        <div className={`flex-1 flex flex-col min-w-0 h-full ${activeView === 'workflow' ? '' : 'hidden'}`}>
          <WorkflowView onNavigate={(view) => handleViewChange(view as ViewType)} />
        </div>

        {/* 右侧：资产详情 */}
        {detailOpen && (
          <>
            <ResizeHandle targetRef={detailRef} side="right" minWidth={250} maxWidth={500} />
            <div ref={detailRef} className="border-l border-border/40 bg-card flex flex-col shrink-0 overflow-hidden" style={{ width: detailWidth }}>
              <DetailPanel asset={selectedAsset} onClose={() => setDetailOpen(false)} />
            </div>
          </>
        )}
      </div>

      {/* 设置页面（独立全屏，主布局隐藏时显示） */}
      {activeView === 'settings' && (
        <SettingsView onBack={() => handleViewChange('settings')} />
      )}

      <Toaster position="top-right" theme="dark" />

      {/* 首次使用引导 */}
      <TourGuide />
    </div>
  )
}
