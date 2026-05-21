export {}

interface ElectronActionResult {
  ok: boolean
  error?: string
  path: string
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
      minimizeWindow?: () => void
      maximizeWindow?: () => void
      closeWindow?: () => void
      openFile?: () => Promise<unknown>
      openFolder?: () => Promise<unknown>
      onUpdateAvailable?: (callback: (...args: unknown[]) => void) => void
      onUpdateDownloaded?: (callback: (...args: unknown[]) => void) => void
    }
  }
}
