import React, { useEffect, useRef, useState } from 'react'
import { Toaster } from 'sonner'
import { tagentClient } from './services/websocket'
import { getSession, listSessions } from './services/sessions'
import { getConfig, type AppConfig } from './services/config'
import { healthCheck } from './services/api'
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
import { ModeSelect, LoginView, LocalConfigView } from './components/auth'

type AppState = 'loading' | 'mode-select' | 'login' | 'local-config' | 'ready'

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading')
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [activeView, setActiveView] = useState<ViewType>('chat')
  const [previousView, setPreviousView] = useState<ViewType>('chat')
  const [detailWidth, setDetailWidth] = useState(320)
  const [selectedAsset, setSelectedAsset] = useState<Record<string, unknown> | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const detailRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const initApp = async () => {
      try {
        const appConfig = await getConfig()
        setConfig(appConfig)

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

    let cancelled = false

    const connectInitialSession = async () => {
      const storedActiveId = localStorage.getItem('tagent-active-tab')
      if (storedActiveId) {
        try {
          const existing = await getSession(storedActiveId)
          if (!cancelled && existing) {
            await tagentClient.connect(storedActiveId)
            return
          }
        } catch {}
      }

      try {
        const sessions = await listSessions(false)
        if (!cancelled && sessions.length > 0) {
          await tagentClient.connect(sessions[0].sessionId)
          return
        }
      } catch {}

      if (!cancelled) await tagentClient.connect()
    }

    connectInitialSession().catch(err => {
      console.error('[App] WebSocket 连接失败:', err)
    })
    return () => {
      cancelled = true
      tagentClient.disconnect()
    }
  }, [appState])

  useEffect(() => {
    if (activeView !== 'assets' && activeView !== 'search') {
      setDetailOpen(false)
    }
  }, [activeView])

  const handleViewChange = (view: ViewType) => {
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
    // 模式切换后刷新数据
    // 通过更新 key 强制重新渲染组件
    setSessionRefreshKey(prev => prev + 1)
  }

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
    return <ModeSelect onModeSelected={handleModeSelected} />
  }

  if (appState === 'login') {
    return <LoginView onLoginSuccess={handleLoginSuccess} onBack={handleBackToModeSelect} />
  }

  if (appState === 'local-config') {
    return <LocalConfigView onConfigComplete={handleLocalConfigComplete} onBack={handleBackToModeSelect} />
  }

  return (
    <div className="h-screen w-screen overflow-hidden relative" style={{ background: 'linear-gradient(135deg, hsl(var(--shell-start)) 0%, hsl(var(--shell-end)) 100%)' }}>

      {/* 内容区域 */}
      <div className="h-full flex overflow-hidden p-2 gap-2">
        {/* 侧边栏卡片（设置页面隐藏） */}
        {activeView !== 'settings' && (
        <div className="shrink-0">
          <div ref={sidebarRef} className="relative flex flex-col h-full rounded-2xl shadow-xl border border-black/5 overflow-hidden bg-background" style={{ width: 256 }}>
            {/* 透明拖拽区域 */}
            <div className="absolute top-0 left-0 right-0 h-9 z-10 titlebar-drag-region" />
            <Sidebar activeView={activeView} onViewChange={handleViewChange} />
          </div>
        </div>
        )}

        {/* 主内容卡片 */}
        {activeView !== 'settings' ? (
          <div className="flex-1 min-w-0">
            <div className="flex flex-col h-full rounded-2xl shadow-xl border border-black/5 overflow-hidden bg-content-area">
            {/* 非聊天页面：窗口栏（拖拽 + 控制按钮） */}
            {activeView !== 'chat' && (
            <div className="flex items-center h-9 shrink-0 bg-background">
              <div className="flex-1 h-full titlebar-drag-region" />
              {typeof window !== 'undefined' && (window as any).electronAPI?.isElectron && (
                <div className="flex items-center shrink-0 h-9 titlebar-no-drag pr-2">
                  <button onClick={() => (window as any).electronAPI.minimizeWindow()} className="h-8 w-9 flex items-center justify-center hover:bg-black/10 rounded transition-colors">
                    <svg width="10" height="1" viewBox="0 0 10 1" fill="none"><rect width="10" height="1" fill="#888"/></svg>
                  </button>
                  <button onClick={() => (window as any).electronAPI.maximizeWindow()} className="h-8 w-9 flex items-center justify-center hover:bg-black/10 rounded transition-colors">
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><rect x="0.5" y="0.5" width="7" height="7" stroke="#888"/></svg>
                  </button>
                  <button onClick={() => (window as any).electronAPI.closeWindow()} className="h-8 w-9 flex items-center justify-center hover:bg-red-500 hover:text-white rounded transition-colors">
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 1l6 6M7 1l-6 6" stroke="#888" strokeWidth="1.2"/></svg>
                  </button>
                </div>
              )}
            </div>
            )}
            <div className="flex-1 flex min-w-0 overflow-hidden">
              <div className={`flex-1 flex flex-col min-w-0 h-full ${activeView === 'chat' ? '' : 'hidden'}`}>
                <MainPanel onAssetSelect={handleAssetSelect} />
              </div>
              <div className={`flex-1 flex flex-col min-w-0 h-full ${activeView === 'assets' ? '' : 'hidden'}`}>
                <AssetLibrary key={`assets-${activeView}`} onAssetSelect={handleAssetSelect} />
              </div>
              <div className={`flex-1 flex flex-col min-w-0 h-full ${activeView === 'analysis' ? '' : 'hidden'}`}>
                <DashboardView />
              </div>
              <div className={`flex-1 flex flex-col min-w-0 h-full ${activeView === 'review' ? '' : 'hidden'}`}>
                <ReviewQueue key={`review-${activeView}`} />
              </div>
              <div className={`flex-1 flex flex-col min-w-0 h-full ${activeView === 'search' ? '' : 'hidden'}`}>
                <SearchView onAssetSelect={handleAssetSelect} />
              </div>
              <div className={`flex-1 flex flex-col min-w-0 h-full ${activeView === 'workflow' ? '' : 'hidden'}`}>
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
        ) : (
          <div className="flex-1 min-w-0">
            <div className="relative flex flex-col h-full overflow-hidden">
              {/* 设置页窗口栏（透明覆盖层） */}
              <div className="absolute top-0 left-0 right-0 h-9 z-10 flex items-center titlebar-drag-region">
                <div className="flex-1 h-full" />
                {typeof window !== 'undefined' && (window as any).electronAPI?.isElectron && (
                  <div className="flex items-center shrink-0 h-9 titlebar-no-drag pr-2">
                    <button onClick={() => (window as any).electronAPI.minimizeWindow()} className="h-8 w-9 flex items-center justify-center hover:bg-black/10 rounded transition-colors">
                      <svg width="10" height="1" viewBox="0 0 10 1" fill="none"><rect width="10" height="1" fill="#888"/></svg>
                    </button>
                    <button onClick={() => (window as any).electronAPI.maximizeWindow()} className="h-8 w-9 flex items-center justify-center hover:bg-black/10 rounded transition-colors">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><rect x="0.5" y="0.5" width="7" height="7" stroke="#888"/></svg>
                    </button>
                    <button onClick={() => (window as any).electronAPI.closeWindow()} className="h-8 w-9 flex items-center justify-center hover:bg-red-500 hover:text-white rounded transition-colors">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 1l6 6M7 1l-6 6" stroke="#888" strokeWidth="1.2"/></svg>
                    </button>
                  </div>
                )}
              </div>
              <SettingsView onBack={() => handleViewChange('chat')} onModeChange={handleModeChange} />
            </div>
          </div>
        )}
      </div>

      <Toaster position="top-right" theme="dark" />
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
