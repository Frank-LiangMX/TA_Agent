export {}

interface ElectronActionResult {
  ok: boolean
  error?: string
  path: string
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
      platform: string
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
      openFile?: () => Promise<unknown>
      openFolder?: () => Promise<unknown>

      // 事件监听
      onUpdateAvailable?: (callback: (...args: unknown[]) => void) => void
      onUpdateDownloaded?: (callback: (...args: unknown[]) => void) => void
    }
  }
}
