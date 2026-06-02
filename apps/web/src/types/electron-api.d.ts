export {}

interface ElectronActionResult {
  ok: boolean
  error?: string
  path: string
}

type PlatformName = 'aix' | 'darwin' | 'freebsd' | 'linux' | 'openbsd' | 'sunos' | 'win32' | string

interface DialogOpenResult {
  canceled?: boolean
  filePaths?: string[]
  path?: string
}

interface UpdaterStatus {
  state: string
  version?: string
  progress?: unknown
  error?: string
}

type WeChatBridgeState = 'idle' | 'scanning' | 'connected' | 'disconnected'

interface WeChatStatus {
  state: WeChatBridgeState
  uin?: string | null
}

interface WeChatConfig {
  enabled: boolean
  hasCredentials: boolean
}

interface AppConfig {
  mode: 'local' | 'online'
  agent_mode?: 'ta' | 'general'
  local: {
    llm_provider: string
    llm_api_key: string
    llm_base_url: string
    llm_model: string
    blender_path: string
  }
  online: {
    server_host: string
    server_port: number
    user_id: string
    user_name: string
  }
}

declare global {
  interface Window {
    electronAPI?: {
      platform: PlatformName
      isElectron: boolean
      getAppVersion?: () => Promise<string>
      getBackendLogPath?: () => Promise<string>
      openBackendLog?: () => Promise<ElectronActionResult>
      openUserDataDir?: () => Promise<ElectronActionResult>

      // 配置管理
      getConfig?: () => Promise<AppConfig>
      saveConfig?: (config: AppConfig) => Promise<{ success: boolean; error?: string }>
      getMode?: () => Promise<'local' | 'online'>
      setMode?: (mode: 'local' | 'online') => Promise<AppConfig>

      // 窗口控制
      minimizeWindow?: () => void
      maximizeWindow?: () => void
      closeWindow?: () => void
      isMaximized?: () => Promise<boolean>

      // 文件对话框
      openFile?: () => Promise<DialogOpenResult>
      openFolder?: () => Promise<DialogOpenResult>

      // 更新器
      updater?: {
        checkForUpdates: () => Promise<void>
        quitAndInstall: () => Promise<void>
        getStatus: () => Promise<UpdaterStatus>
        onStatusChanged: (callback: (status: UpdaterStatus) => void) => void
      }

      // 微信 Bridge
      wechat?: {
        getConfig: () => Promise<WeChatConfig>
        startLogin: () => Promise<{ qrDataUrl?: string }>
        logout: () => Promise<{ success: boolean }>
        startBridge: () => Promise<{ success: boolean }>
        stopBridge: () => Promise<{ success: boolean }>
        getStatus: () => Promise<WeChatStatus>
        setupListener: () => Promise<void>
        onStatusChanged: (callback: (state: WeChatStatus) => void) => void
      }

      // 事件监听（保留兼容）
      onUpdateAvailable?: (callback: (...args: unknown[]) => void) => void
      onUpdateDownloaded?: (callback: (...args: unknown[]) => void) => void
    }
  }
}
