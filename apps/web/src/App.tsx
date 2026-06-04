import React, { useEffect, useRef, useState } from 'react'
import { loadLayoutMode, type LayoutMode } from './atoms/theme'
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
import { SettingsNavProvider } from './contexts/SettingsNavContext'

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
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('classic')
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

        if (!appConfig.runtime?.llm_api_key && !appConfig.cloud?.enabled) {
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
          console.warn('[App] 后端工作台与 UI 不一致，尝试对齐:', ready.actualAgentMode, '→', agentMode)
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
        } catch {}
      }

      if (!cancelled && connectGen === wsConnectGenRef.current) {
        try {
          const sessions = await listSessions(false)
          if (sessions.length > 0) {
            await tagentClient.connect(sessions[0].sessionId)
            return
          }
        } catch {}
        await tagentClient.connect()
      }
    }

    connectInitialSession().catch(err => {
      console.error('[App] WebSocket 连接失败:', err)
    })

    // 订阅 SubAgent 事件
    import('./services/subagent-events').then(({ subscribeSubAgentEvents }) => {
      const unsub = subscribeSubAgentEvents(tagentClient)
      // 不需要 unsub — 全局只订阅一次；卸载时由 tagentClient 自然失效
      void unsub
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

  useEffect(() => {
    setLayoutMode(loadLayoutMode())
    const handleLayoutChange = (e: Event) => {
      setLayoutMode((e as CustomEvent<{ layoutMode: LayoutMode }>).detail.layoutMode)
    }
    window.addEventListener('tagent-layout-change', handleLayoutChange)
    return () => window.removeEventListener('tagent-layout-change', handleLayoutChange)
  }, [])

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

  const isMacOS26 = layoutMode === 'macos26'

  // macOS 26 布局：统一结构，背景卡片 + 面板 Sidebar + 内容区
  const macOS26Layout = (
    <div className="relative h-full overflow-hidden p-2">
      {/* 背景卡片 - macOS 26 浮岛主内容（elevation-4 投影 + 主题感知边缘高光） */}
      <div
        data-macos26-content
        data-macos26-root
        className="absolute inset-0 m-2 rounded-2xl border border-foreground/10 overflow-hidden bg-card shadow-[0_20px_40px_-8px_rgb(0_0%_0/0.18)]"
        style={{
          boxShadow: 'var(--elevation-4), inset 0 1px 0 0 hsl(0 0% 100% / 0.5)',
        }}
      >
        {/* 主内容区 */}
        <div className={`flex flex-col h-full${isMacOS26 ? ' pl-[272px]' : ''}`}>
          <div className="flex-1 flex min-w-0 overflow-hidden">
            {/* 会话视图 */}
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
            {/* 设置视图 */}
            <div className={`flex-1 flex flex-col min-w-0 h-full ${activeView === 'settings' ? '' : 'hidden'}`}>
              <SettingsView onBack={() => handleViewChange('chat')} onModeChange={handleModeChange} />
            </div>
          </div>
        </div>
      </div>

      {/* 侧边栏面板 - macOS 26 玻璃渐变（hover 缩放 + 阴影，用 transform-gpu 防止子元素 hover 闪烁） */}
      <div className="absolute z-10" style={{ top: 14, bottom: 14, left: 14 }}>
        <div
          ref={sidebarRef}
          className="flex flex-col h-full rounded-2xl overflow-hidden border border-foreground/10 transition-[transform,box-shadow] duration-300 ease-out will-change-transform shadow-[0_20px_40px_-8px_rgb(0_0%_0/0.18)] hover:scale-[1.008] hover:shadow-[0_25px_50px_-8px_rgb(0_0%_0/0.25)]"
          style={{
            width: 256,
            background: 'radial-gradient(ellipse 140% 80% at 70% 100%, var(--sidebar-glow) 0%, transparent 50%), linear-gradient(135deg, hsl(243 75% 70% / 0.16) 0%, hsl(243 75% 70% / 0.13) 15%, hsl(243 75% 70% / 0.10) 35%, hsl(243 75% 70% / 0.06) 55%, hsl(243 75% 70% / 0.03) 70%, hsl(var(--floating-panel)) 85%, hsl(var(--floating-panel)) 100%)',
            boxShadow: 'var(--elevation-4), inset 0 1px 0 0 hsl(0 0% 100% / 0.5)',
          }}
        >
          <Sidebar
            activeView={activeView}
            agentMode={agentMode}
            onViewChange={handleSidebarViewChange}
          />
        </div>
      </div>
    </div>
  )

  // 经典布局：Sidebar 悬浮卡 + 主内容（单一圆角背景卡片）
  const classicLayout = (
    <div className="relative h-full flex overflow-hidden p-2 gap-2">
      {/* 侧边栏卡片 */}
      <div className="shrink-0">
        <div ref={sidebarRef} className="flex flex-col h-full rounded-2xl shadow-xl border border-black/5 overflow-hidden bg-background" style={{ width: 256 }}>
          <Sidebar
            activeView={activeView}
            agentMode={agentMode}
            onViewChange={handleSidebarViewChange}
          />
        </div>
      </div>
      {/* 主内容：单一圆角背景卡片包住所有视图 */}
      <div className="flex-1 min-w-0 flex flex-col rounded-2xl shadow-xl border border-black/5 overflow-hidden bg-content-area">
        <div className="flex-1 flex min-w-0 overflow-hidden">
          {/* 会话视图 */}
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
          {/* 设置视图 */}
          <div className={`flex-1 flex flex-col min-w-0 h-full ${activeView === 'settings' ? '' : 'hidden'}`}>
            <SettingsView onBack={() => handleViewChange('chat')} onModeChange={handleModeChange} />
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <SettingsNavProvider>
      <div className="h-screen w-screen overflow-hidden relative" style={{ background: 'linear-gradient(135deg, hsl(var(--shell-start)) 0%, hsl(var(--shell-end)) 100%)' }}>
        <ElectronChrome mode="shell" />
        {isMacOS26 ? macOS26Layout : classicLayout}
        <Toaster position="top-right" theme="dark" />
        <TourGuide />
        <UpdateDialog />
      </div>
    </SettingsNavProvider>
  )
}
