import { getApiBase, resetRuntimeEndpointCache } from '@/lib/api'

export interface RuntimeConfig {
  llm_provider: string
  llm_api_key: string
  llm_base_url: string
  llm_model: string
  llm_extra_headers?: Record<string, string>
  blender_path: string
}

export interface CloudConfig {
  enabled: boolean
  server_url: string
  user_id: string
  user_name: string
  token?: string
}

export interface AppConfig {
  runtime: RuntimeConfig
  cloud: CloudConfig
  agent_mode?: 'ta' | 'general'
  models?: unknown[]
}

// 兼容旧类型（过渡期，内部使用）
interface LegacyAppConfig {
  mode?: 'local' | 'online'
  local?: RuntimeConfig
  online?: { server_host: string; server_port: number; user_id: string; user_name: string }
  runtime?: RuntimeConfig
  cloud?: CloudConfig
  agent_mode?: 'ta' | 'general'
  models?: unknown[]
}

const DEFAULT_CONFIG: AppConfig = {
  runtime: {
    llm_provider: 'custom',
    llm_api_key: '',
    llm_base_url: '',
    llm_model: '',
    llm_extra_headers: {},
    blender_path: '',
  },
  cloud: {
    enabled: false,
    server_url: '',
    user_id: '',
    user_name: '',
  },
  agent_mode: 'ta',
}

function _migrateLegacyMode(raw: LegacyAppConfig): AppConfig {
  if (!raw.mode) return raw as AppConfig

  const oldMode = raw.mode
  const result: LegacyAppConfig = { ...raw }
  delete result.mode

  if (!result.runtime) {
    const local = result.local || {}
    result.runtime = { ...local } as RuntimeConfig
  }
  delete result.local

  if (!result.cloud) {
    const online = result.online || {}
    result.cloud = {
      enabled: oldMode === 'online',
      server_url: oldMode === 'online' ? `${online.server_host || ''}:${online.server_port || 8081}` : '',
      user_id: online.user_id || '',
      user_name: online.user_name || '',
    }
  }
  delete result.online

  return result as AppConfig
}

const getElectronAPI = () => {
  if (typeof window === 'undefined') return undefined
  return window.electronAPI?.isElectron ? window.electronAPI : undefined
}

export async function getConfig(): Promise<AppConfig> {
  const electronAPI = getElectronAPI()
  if (electronAPI?.getConfig) {
    const raw = await electronAPI.getConfig()
    return _migrateLegacyMode(raw)
  }

  // dev-web 模式：从后端 API 获取
  try {
    const baseUrl = await getApiBase()
    const res = await fetch(`${baseUrl}/api/config/app`)
    if (res.ok) {
      const data = await res.json()
      if (data && Object.keys(data).length > 0) {
        return _migrateLegacyMode({ ...DEFAULT_CONFIG, ...data })
      }
    }
  } catch {
    // API 失败，尝试 localStorage
  }

  const stored = localStorage.getItem('tagent-config')
  if (stored) {
    try {
      return _migrateLegacyMode({ ...DEFAULT_CONFIG, ...JSON.parse(stored) })
    } catch {
      return DEFAULT_CONFIG
    }
  }
  return DEFAULT_CONFIG
}

/** 将 Electron 侧配置同步到本地 Runtime（打包版启动/切换模式时调用） */
export async function ensureRuntimeConfigSync(config?: AppConfig): Promise<void> {
  const electronAPI = getElectronAPI()
  if (!electronAPI?.getConfig) return
  const cfg = config ?? (await getConfig())
  await syncConfigToLocalRuntime(cfg)
}

/**
 * 对齐后端工作台模式（UI 与 /health.agentMode 一致）
 * 打包版：不一致时重启嵌入后端（刷新 TAGENT_AGENT_MODE 环境变量）
 */
export async function ensureRuntimeAgentModeAligned(
  expected: 'ta' | 'general',
): Promise<{ aligned: boolean; restarted: boolean }> {
  const electronAPI = getElectronAPI()
  try {
    const baseUrl = await getApiBase()
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return { aligned: false, restarted: false }
    const health = await res.json()
    if (health.agentMode === expected) {
      return { aligned: true, restarted: false }
    }

    const cfg = await getConfig()
    cfg.agent_mode = expected
    await syncConfigToLocalRuntime(cfg)

    if (electronAPI?.restartRuntime) {
      const result = await electronAPI.restartRuntime()
      resetRuntimeEndpointCache()
      if (result?.ok) {
        return { aligned: true, restarted: true }
      }
    }
    return { aligned: false, restarted: false }
  } catch {
    return { aligned: false, restarted: false }
  }
}

/** 将配置写入本地 Runtime（与 Electron 文件路径解耦，打包版必需） */
async function syncConfigToLocalRuntime(config: AppConfig): Promise<void> {
  try {
    const baseUrl = await getApiBase()
    const res = await fetch(`${baseUrl}/api/config/app`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    if (!res.ok) {
      console.warn('[Config] 同步到本地 Runtime 失败: HTTP', res.status)
    }
  } catch (err) {
    console.warn('[Config] 同步到本地 Runtime 失败:', err)
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const electronAPI = getElectronAPI()
  if (electronAPI?.saveConfig) {
    await electronAPI.saveConfig(config)
    await syncConfigToLocalRuntime(config)
    return
  }

  // dev-web 模式：保存到后端 API
  try {
    const baseUrl = await getApiBase()
    const res = await fetch(`${baseUrl}/api/config/app`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    if (res.ok) {
      return
    }
  } catch {
    // API 失败，继续用 localStorage
  }

  localStorage.setItem('tagent-config', JSON.stringify(config))
}

export function isCloudEnabled(config: AppConfig): boolean {
  return config.cloud?.enabled === true
}

export async function getAgentMode(): Promise<'ta' | 'general'> {
  const config = await getConfig()
  return config.agent_mode === 'general' ? 'general' : 'ta'
}

export async function setAgentMode(agentMode: 'ta' | 'general'): Promise<void> {
  const config = await getConfig()
  config.agent_mode = agentMode
  resetRuntimeEndpointCache()
  await saveConfig(config)
  resetRuntimeEndpointCache()
}

export async function updateRuntimeConfig(updates: Partial<RuntimeConfig>): Promise<void> {
  const config = await getConfig()
  config.runtime = { ...config.runtime, ...updates }
  await saveConfig(config)
}

export async function updateCloudConfig(updates: Partial<CloudConfig>): Promise<void> {
  const config = await getConfig()
  config.cloud = { ...config.cloud, ...updates }
  await saveConfig(config)
}

// 兼容旧导出（过渡期）
export const updateLocalConfig = updateRuntimeConfig
export const updateOnlineConfig = updateCloudConfig

export async function isFirstLaunch(): Promise<boolean> {
  // 新逻辑：检查 providers 是否存在
  try {
    const baseUrl = await getApiBase()
    const res = await fetch(`${baseUrl}/api/config/providers`)
    if (res.ok) {
      const data = await res.json()
      return !data.providers || data.providers.length === 0
    }
  } catch {}
  return true
}
