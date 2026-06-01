import React, { useEffect, useRef, useState } from 'react'
import { Toaster } from 'sonner'
import { tagentClient } from './services/websocket'
import { listSessions } from './services/sessions'
import { getConfig, type AppConfig } from './services/config'
import { healthCheck } from './services/api'
import { Sidebar, type ViewType } from './components/layout/Sidebar'
import { ResizeHandle } from './components/layout/ResizeHandle'
import { MainPanel } from './components/layout/MainPanel'
import { AssetLibrary, type AssetLibraryFilterHints } from './components/asset/AssetLibrary'
import { ReviewQueue } from './components/review/ReviewQueue'
import { SearchView } from './components/search/SearchView'
import { DetailPanel } from './components/layout/DetailPanel'
import { DashboardView } from './components/dashboard/DashboardView'
import { WorkflowView } from './components/workflow/WorkflowView'
import { SettingsView } from './components/settings/SettingsView'
import { GeneralWorkspaceView } from './components/general/GeneralWorkspaceView'
import { GeneralHistoryView } from './components/general/GeneralHistoryView'
import { TourGuide } from './components/onboarding/TourGuide'
import { ModeSelect, LoginView, LocalConfigView } from './components/auth'
import { ElectronChrome } from './components/layout/ElectronChrome'

type AppState = 'loading' | 'mode-select' | 'login' | 'local-config' | 'ready'

export default function App() {
  const isViewAllowed = (view: ViewType, mode: 'ta' | 'general') => {
    if (mode === 'general') {
      return view === 'chat' || view === 'workspace' || view === 'history' || view === 'settings'
    }
    return true
  }

  const [appState, setAppState] = useState<AppState>('loading')
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [agentMode, setAgentMode] = useState<'ta' | 'general'>('ta')
  const [activeView, setActiveView] = useState<ViewType>('chat')
  const [previousView, setPreviousView] = useState<ViewType>('chat')
  const [detailWidth, setDetailWidth] = useState(320)
  const [selectedAsset, setSelectedAsset] = useState<Record<string, unknown> | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [assetFilterHints, setAssetFilterHints] = useState<AssetLibraryFilterHints | undefined>()
  const [assetLibraryNavKey, setAssetLibraryNavKey] = useState(0)
  const [reviewInitialTab, setReviewInitialTab] = useState<'high' | 'low' | undefined>()
  const [reviewNavKey, setReviewNavKey] = useState(0)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const detailRef = useRef<HTMLDivElement>(null)
  const wsConnectGenRef = useRef(0)

  useEffect(() => {
    const initApp = async () => {
      try {
        const appConfig = await getConfig()
        setConfig(appConfig)
        const runtimeAgentMode = appConfig.agent_mode === 'general' ? 'general' : 'ta'
        setAgentMode(runtimeAgentMode)

        if (!appConfig.mode || (appConfig.mode === 'local' && !appConfig.local.llm_api_key)) {
          setAppState('mode-select')
        } else if (appConfig.mode === 'online' && !appConfig.online.server_host) {
          setAppState('login')
        } else {
          if (appConfig.mode === 'online') {
            try {
              await healthCheck()
              console.log('[App] server connected')
            } catch (err) {
              console.error('[App] server connection failed', err)
            }
          }
          setAppState('ready')
        }
      } catch (err) {
        console.error('[App] init failed', err)
        setAppState('mode-select')
      }
    }

    initApp()
  }, [])

  useEffect(() => {
    if (appState !== 'ready') return

    const connectGen = ++wsConnectGenRef.current
    let cancelled = false

    const connectInitialSession = async () => {
      const storedActiveId = localStorage.getItem('tagent-active-tab')
      if (storedActiveId) {
        try {
          await tagentClient.connect(storedActiveId)
          if (cancelled || connectGen !== wsConnectGenRef.current) return
          return
        } catch {
          // 存储的会话可能已删除，继续尝试列表恢复
        }
      }

      try {
        const sessions = await listSessions(false)
        if (!cancelled && connectGen === wsConnectGenRef.current && sessions.length > 0) {
          await tagentClient.connect(sessions[0].sessionId)
          return
        }
      } catch {}

      if (!cancelled && connectGen === wsConnectGenRef.current) {
        await tagentClient.connect()
      }
    }

    connectInitialSession().catch(err => {
      console.error('[App] WebSocket 连接失败:', err)
    })
    return () => {
      cancelled = true
      if (connectGen === wsConnectGenRef.current) {
        tagentClient.disconnect()
      }
    }
  }, [appState])

  useEffect(() => {
    if (activeView !== 'assets' && activeView !== 'search') {
      setDetailOpen(false)
    }
  }, [activeView])

  const handleViewChange = (view: ViewType) => {
    if (!isViewAllowed(view, agentMode)) {
      setActiveView('chat')
      return
    }
    if (view === 'settings' && activeView === 'settings') {
      setActiveView(previousView)
    } else {
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

  const handleDashboardNavigate = (
    view: ViewType,
    options?: { reviewTab?: 'high' | 'low'; assetStatus?: string; assetSortBy?: 'name' | 'type' | 'tri_count' },
  ) => {
    if (view === 'review') {
      setReviewInitialTab(options?.reviewTab)
      setReviewNavKey((k) => k + 1)
    }
    if (view === 'assets') {
      setAssetFilterHints(
        options?.assetStatus || options?.assetSortBy
          ? { status: options.assetStatus, sortBy: options.assetSortBy }
          : undefined,
      )
      setAssetLibraryNavKey((k) => k + 1)
    }
    handleViewChange(view)
  }

  const handleSidebarViewChange = (view: ViewType) => {
    if (view === 'assets') setAssetFilterHints(undefined)
    if (view === 'review') setReviewInitialTab(undefined)
    handleViewChange(view)
  }

  const handleModeSelected = async (mode: 'local' | 'online') => {
    if (mode === 'local') {
      setAppState('local-config')
    } else {
      setAppState('login')
    }
  }

  const handleLoginSuccess = () => {
    setAppState('ready')
  }

  const handleLocalConfigComplete = () => {
    setAppState('ready')
  }

  const handleBackToModeSelect = () => {
    setAppState('mode-select')
  }

  const handleModeChange = () => {
    getConfig()
      .then(async (cfg) => {
        const nextMode = cfg.agent_mode === 'general' ? 'general' : 'ta'
        setAgentMode(nextMode)
        if (!isViewAllowed(activeView, nextMode)) {
          setActiveView('chat')
        }
        const storedActiveId = localStorage.getItem('tagent-active-tab')
        tagentClient.disconnect()
        try {
          if (storedActiveId) {
            await tagentClient.connect(storedActiveId)
          } else {
            await tagentClient.connect()
          }
        } catch (err) {
          console.error('[App] 模式切换后重连失败:', err)
        }
      })
      .catch(() => {})
  }

  useEffect(() => {
    if (!isViewAllowed(activeView, agentMode)) {
      setActiveView('chat')
    }
  }, [activeView, agentMode])

  if (appState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-600">加载中...</p>
        </div>
      </div>
    )
  }

  if (appState === 'mode-select') {
    return (
      <>
        <ElectronChrome mode="floating" />
        <ModeSelect onModeSelected={handleModeSelected} />
      </>
    )
  }

  if (appState === 'login') {
    return (
      <>
        <ElectronChrome mode="floating" />
        <LoginView onLoginSuccess={handleLoginSuccess} onBack={handleBackToModeSelect} />
      </>
    )
  }

  if (appState === 'local-config') {
    return (
      <>
        <ElectronChrome mode="floating" />
        <LocalConfigView onConfigComplete={handleLocalConfigComplete} onBack={handleBackToModeSelect} />
      </>
    )
  }

  return (
    <div className="h-screen w-screen overflow-hidden relative" style={{ background: 'linear-gradient(135deg, hsl(var(--shell-start)) 0%, hsl(var(--shell-end)) 100%)' }}>
      <ElectronChrome mode="shell" />

      <div className="relative h-full flex overflow-hidden p-2 gap-2">
        {/* 侧边栏卡片（设置页面隐藏） */}
        {activeView !== 'settings' && (
        <div className="shrink-0">
          <div ref={sidebarRef} className="flex flex-col h-full rounded-2xl shadow-xl border border-black/5 overflow-hidden bg-background" style={{ width: 256 }}>
            <Sidebar
              activeView={activeView}
              agentMode={agentMode}
              onViewChange={handleSidebarViewChange}
            />
          </div>
        </div>
        )}

        {/* 主内容：设置为双卡，其余为单卡 */}
        {activeView === 'settings' ? (
          <div className="flex-1 min-w-0 min-h-0">
            <SettingsView onBack={() => handleViewChange('chat')} onModeChange={handleModeChange} />
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <div className="flex flex-col h-full rounded-2xl shadow-xl border border-black/5 overflow-hidden bg-content-area">
            <div className="flex-1 flex min-w-0 overflow-hidden">
              <div className={`flex-1 flex flex-col min-w-0 h-full ${activeView === 'chat' ? '' : 'hidden'}`}>
                <MainPanel onAssetSelect={handleAssetSelect} agentMode={agentMode} />
              </div>
              <div className={`flex-1 flex flex-col min-w-0 h-full ${agentMode === 'general' && activeView === 'workspace' ? '' : 'hidden'}`}>
                <GeneralWorkspaceView sessionId={tagentClient.sessionId} />
              </div>
              <div className={`flex-1 flex flex-col min-w-0 h-full ${agentMode === 'general' && activeView === 'history' ? '' : 'hidden'}`}>
                <GeneralHistoryView
                  onOpenSession={async (sid) => {
                    await tagentClient.reconnectWithSession(sid)
                    setActiveView('chat')
                  }}
                />
              </div>
              <div className={`flex-1 flex flex-col min-w-0 h-full ${agentMode === 'ta' && activeView === 'assets' ? '' : 'hidden'}`}>
                <AssetLibrary
                  key={`assets-${assetLibraryNavKey}`}
                  filterHints={assetFilterHints}
                  onAssetSelect={handleAssetSelect}
                />
              </div>
              <div className={`flex-1 flex flex-col min-w-0 h-full ${agentMode === 'ta' && activeView === 'analysis' ? '' : 'hidden'}`}>
                <DashboardView
                  onNavigate={handleDashboardNavigate}
                  onAssetSelect={(asset) => {
                    handleAssetSelect(asset)
                    handleViewChange('assets')
                  }}
                />
              </div>
              <div className={`flex-1 flex flex-col min-w-0 h-full ${agentMode === 'ta' && activeView === 'review' ? '' : 'hidden'}`}>
                <ReviewQueue key={`review-${reviewNavKey}`} initialTab={reviewInitialTab} />
              </div>
              <div className={`flex-1 flex flex-col min-w-0 h-full ${agentMode === 'ta' && activeView === 'search' ? '' : 'hidden'}`}>
                <SearchView onAssetSelect={handleAssetSelect} />
              </div>
              <div className={`flex-1 flex flex-col min-w-0 h-full ${agentMode === 'ta' && activeView === 'workflow' ? '' : 'hidden'}`}>
                <WorkflowView onNavigate={(view) => handleViewChange(view as ViewType)} />
              </div>

              {detailOpen && (
                <>
                  <ResizeHandle targetRef={detailRef} side="right" minWidth={250} maxWidth={500} />
                  <div ref={detailRef} className="border-l border-border/40 bg-card flex flex-col shrink-0 overflow-hidden" style={{ width: detailWidth }}>
                    <DetailPanel asset={selectedAsset} onClose={() => setDetailOpen(false)} />
                  </div>
                </>
              )}
            </div>
            </div>
          </div>
        )}
      </div>

      <Toaster position="top-right" theme="dark" />
      <div className="pointer-events-none absolute right-4 bottom-4 z-40">
        <span className="rounded-full border border-border/70 bg-card/85 px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm">
          工作台: {agentMode === 'general' ? '通用' : 'TA'}
        </span>
      </div>
      <TourGuide />
    </div>
  )
}

function StatusBar() {
  const [mode, setMode] = useState<'local' | 'online'>('local')
  const [userName, setUserName] = useState<string>()
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected')

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await getConfig()
        setMode(config.mode || 'local')
        if (config.mode === 'online') {
          setUserName(config.online.user_name)
        }
      } catch {}
    }
    loadConfig()

    // 订阅 WebSocket 连接状态
    const unsubStatus = tagentClient.onStatusChange((status) => {
      setConnectionStatus(status)
    })

    // 初始化状态
    setConnectionStatus(tagentClient.status)

    // 每秒检查配置变化
    const timer = setInterval(loadConfig, 1000)
    return () => {
      clearInterval(timer)
      unsubStatus()
    }
  }, [])

  const getStatusColor = () => {
    if (connectionStatus === 'connected') return 'bg-green-500'
    if (connectionStatus === 'connecting') return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const getStatusText = () => {
    if (mode === 'online') {
      if (connectionStatus === 'connected') return '联机模式'
      if (connectionStatus === 'connecting') return '连接中...'
      return '未连接'
    }
    // 本地模式
    if (connectionStatus === 'connected') return '本地模式'
    if (connectionStatus === 'connecting') return '连接中...'
    return '未连接'
  }

  return (
    <div className="h-6 flex items-center justify-between px-3 bg-card border-t border-border/50 text-xs text-muted-foreground shrink-0">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${getStatusColor()}`}></span>
          {getStatusText()}
          {mode === 'online' && userName && connectionStatus === 'connected' && (
            <span>· {userName}</span>
          )}
        </span>
      </div>
      <span>TAgent v0.27</span>
    </div>
  )
}
