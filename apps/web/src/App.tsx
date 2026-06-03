import React, { useEffect, useRef, useState } from 'react'
import { Toaster } from 'sonner'
import { tagentClient } from './services/websocket'
import { listSessions } from './services/sessions'
import { getConfig, ensureRuntimeConfigSync, ensureRuntimeAgentModeAligned, type AppConfig } from './services/config'
import { healthCheck } from './services/api'
import { resetRuntimeEndpointCache } from './lib/api'
import { waitForLocalRuntime } from './lib/runtime-ready'
import { Sidebar, type ViewType } from './components/layout/Sidebar'
import { MainPanel } from './components/layout/MainPanel'
import { AssetLibrary, type AssetLibraryFilterHints } from './components/asset/AssetLibrary'
import { ReviewQueue } from './components/review/ReviewQueue'
import { SearchView } from './components/search/SearchView'
import { DashboardView } from './components/dashboard/DashboardView'
import { WorkflowView } from './components/workflow/WorkflowView'
import { SettingsView } from './components/settings/SettingsView'
import { GeneralWorkspaceView } from './components/general/GeneralWorkspaceView'
import { GeneralHistoryView } from './components/general/GeneralHistoryView'
import { IntakeWizard } from './components/intake/IntakeWizard'
import { TourGuide } from './components/onboarding/TourGuide'
import { UpdateDialog } from './components/ui/UpdateDialog'
import { LoginView, LocalConfigView } from './components/auth'
import { ElectronChrome } from './components/layout/ElectronChrome'
import { loadStoredActiveTab } from './lib/session-storage'

type AppState = 'loading' | 'login' | 'local-config' | 'ready'

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
  const [selectedAsset, setSelectedAsset] = useState<Record<string, unknown> | null>(null)
  const [assetFilterHints, setAssetFilterHints] = useState<AssetLibraryFilterHints | undefined>()
  const [assetLibraryNavKey, setAssetLibraryNavKey] = useState(0)
  const [detailNavKey, setDetailNavKey] = useState(0)
  const [reviewInitialTab, setReviewInitialTab] = useState<'high' | 'low' | undefined>()
  const [reviewNavKey, setReviewNavKey] = useState(0)
  const [intakeInitialAssetIds, setIntakeInitialAssetIds] = useState<string[] | undefined>()
  const [intakeNavKey, setIntakeNavKey] = useState(0)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const wsConnectGenRef = useRef(0)

  useEffect(() => {
    const initApp = async () => {
      try {
        const appConfig = await getConfig()
        setConfig(appConfig)
        const runtimeAgentMode = appConfig.agent_mode === 'general' ? 'general' : 'ta'
        setAgentMode(runtimeAgentMode)

        if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
          await ensureRuntimeConfigSync(appConfig)
          resetRuntimeEndpointCache()
          await ensureRuntimeAgentModeAligned(runtimeAgentMode)
          resetRuntimeEndpointCache()
        }

        // 检查是否已有 LLM 配置或中心服务器
        if (!appConfig.runtime?.llm_api_key && !appConfig.cloud?.enabled) {
          // 未配置：检查是否已有 Provider
          try {
            const baseUrl = await getApiBase()
            const res = await fetch(`${baseUrl}/api/config/providers`)
            if (res.ok) {
              const data = await res.json()
              if (!data.providers || data.providers.length === 0) {
                setAppState('local-config')
                return
              }
            }
          } catch {}
        }

        if (appConfig.cloud?.enabled) {
          try {
            await healthCheck()
            console.log('[App] cloud server connected')
          } catch (err) {
            console.error('[App] cloud server connection failed', err)
          }
        }
        setAppState('ready')
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
      if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
        const ready = await waitForLocalRuntime({ expectedAgentMode: agentMode })
        if (!ready.ok) {
          console.error('[App] 本地 Runtime 未就绪')
          return
        }
        if (ready.agentModeMismatch) {
          console.warn(
            '[App] 后端工作台与 UI 不一致，尝试对齐:',
            ready.actualAgentMode,
            '→',
            agentMode,
          )
          await ensureRuntimeAgentModeAligned(agentMode)
        }
        resetRuntimeEndpointCache()
      }

      const storedActiveId = loadStoredActiveTab(agentMode)
      if (storedActiveId) {
        try {
          await tagentClient.connect(storedActiveId)
          if (cancelled || connectGen !== wsConnectGenRef.current) return
          return
        } catch {
          // 存储的会话可能已删除，继续尝试列表恢复
        }
      }

      if (!cancelled && connectGen === wsConnectGenRef.current) {
        try {
          const sessions = await listSessions(false)
          if (sessions.length > 0) {
            await tagentClient.connect(sessions[0].sessionId)
            return
          }
        } catch {}
        // 真正无历史会话时才新建
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
  }, [appState, agentMode])

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

  const handleStartIntake = (assetIds?: string[]) => {
    setIntakeInitialAssetIds(assetIds)
    setIntakeNavKey((k) => k + 1)
    handleViewChange('intake')
  }

  const handleSidebarViewChange = (view: ViewType) => {
    if (view === 'assets') setAssetFilterHints(undefined)
    if (view === 'review') setReviewInitialTab(undefined)
    if (view === 'intake') setIntakeInitialAssetIds(undefined)
    handleViewChange(view)
  }

  const handleLoginSuccess = () => {
    setAppState('ready')
  }

  const handleLocalConfigComplete = () => {
    window.location.reload()
  }

  const handleBackToModeSelect = () => {
    setAppState('local-config')
  }

  const handleModeChange = () => {
    getConfig()
      .then(async (cfg) => {
        const nextMode = cfg.agent_mode === 'general' ? 'general' : 'ta'
        const agentModeChanged = nextMode !== agentMode
        tagentClient.disconnect(true)
        setAgentMode(nextMode)
        if (!isViewAllowed(activeView, nextMode)) {
          setActiveView('chat')
        }
        resetRuntimeEndpointCache()
        if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
          await ensureRuntimeConfigSync(cfg)
          if (agentModeChanged) {
            await ensureRuntimeAgentModeAligned(nextMode)
            const ready = await waitForLocalRuntime({ expectedAgentMode: nextMode, timeoutMs: 30000 })
            if (!ready.ok) {
              console.error('[App] 切换工作台后 Runtime 未就绪:', nextMode)
              return
            }
          }
        }
        resetRuntimeEndpointCache()

        const storedActiveId = loadStoredActiveTab(nextMode)
        try {
          if (storedActiveId) {
            await tagentClient.reconnectWithSession(storedActiveId)
          } else {
            const sessions = await listSessions(false)
            if (sessions.length > 0) {
              await tagentClient.connect(sessions[0].sessionId)
            } else {
              await tagentClient.connect()
            }
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
        {/* 侧边栏卡片 - 始终挂载，设置页时隐藏 */}
        <div className={`shrink-0 ${activeView === 'settings' ? 'hidden' : ''}`}>
          <div ref={sidebarRef} className="flex flex-col h-full rounded-2xl shadow-xl border border-black/5 overflow-hidden bg-background" style={{ width: 256 }}>
            <Sidebar
              activeView={activeView}
              agentMode={agentMode}
              onViewChange={handleSidebarViewChange}
            />
          </div>
        </div>

        {/* 设置页 - 始终挂载，非设置时隐藏，保留状态 */}
        <div className={`flex-1 min-w-0 min-h-0 ${activeView !== 'settings' ? 'hidden' : ''}`}>
          <SettingsView onBack={() => handleViewChange('chat')} onModeChange={handleModeChange} />
        </div>

        {/* 主内容 */}
        <div className={`flex-1 min-w-0 ${activeView === 'settings' ? 'hidden' : ''}`}>
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
                  initialDetailAsset={selectedAsset}
                  detailNavKey={detailNavKey}
                />
              </div>
              <div className={`flex-1 flex flex-col min-w-0 h-full ${agentMode === 'ta' && activeView === 'analysis' ? '' : 'hidden'}`}>
                <DashboardView
                  onNavigate={handleDashboardNavigate}
                  onAssetSelect={(asset) => {
                    handleAssetSelect(asset)
                    setDetailNavKey((k) => k + 1)
                    handleViewChange('assets')
                  }}
                />
              </div>
              <div className={`flex-1 flex flex-col min-w-0 h-full ${agentMode === 'ta' && activeView === 'review' ? '' : 'hidden'}`}>
                <ReviewQueue
                  key={`review-${reviewNavKey}`}
                  initialTab={reviewInitialTab}
                  onStartIntake={() => handleStartIntake()}
                />
              </div>
              <div className={`flex-1 flex flex-col min-w-0 h-full ${agentMode === 'ta' && activeView === 'intake' ? '' : 'hidden'}`}>
                <IntakeWizard
                  key={`intake-${intakeNavKey}`}
                  initialAssetIds={intakeInitialAssetIds}
                  onGoReview={() => handleViewChange('review')}
                />
              </div>
              <div className={`flex-1 flex flex-col min-w-0 h-full ${agentMode === 'ta' && activeView === 'search' ? '' : 'hidden'}`}>
                <SearchView onAssetSelect={handleAssetSelect} />
              </div>
              <div className={`flex-1 flex flex-col min-w-0 h-full ${agentMode === 'ta' && activeView === 'workflow' ? '' : 'hidden'}`}>
                <WorkflowView
                  onNavigate={(view) => {
                    if (view === 'intake') handleStartIntake()
                    else handleViewChange(view as ViewType)
                  }}
                />
              </div>


            </div>
            </div>
          </div>
      </div>

      <Toaster position="top-right" theme="dark" />
      <TourGuide />
      <UpdateDialog />
    </div>
  )
}

function StatusBar() {
  const [cloudEnabled, setCloudEnabled] = useState(false)
  const [userName, setUserName] = useState<string>()
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected')

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await getConfig()
        setCloudEnabled(config.cloud?.enabled === true)
        if (config.cloud?.enabled) {
          setUserName(config.cloud.user_name)
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
    if (cloudEnabled) {
      if (connectionStatus === 'connected') return '已连接中心服'
      if (connectionStatus === 'connecting') return '连接中...'
      return '中心服未连接'
    }
    if (connectionStatus === 'connected') return '本地运行时'
    if (connectionStatus === 'connecting') return '连接中...'
    return '未连接'
  }

  return (
    <div className="h-6 flex items-center justify-between px-3 bg-card border-t border-border/50 text-xs text-muted-foreground shrink-0">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${getStatusColor()}`}></span>
          {getStatusText()}
          {cloudEnabled && userName && connectionStatus === 'connected' && (
            <span>· {userName}</span>
          )}
        </span>
      </div>
      <span>TAgent v0.29</span>
    </div>
  )
}
