import { API_BASE as LOCAL_API_BASE } from '@/lib/api'

export interface LocalConfig {
  llm_provider: string
  llm_api_key: string
  llm_base_url: string
  llm_model: string
  llm_extra_headers?: Record<string, string>
  blender_path: string
}

export interface OnlineConfig {
  server_host: string
  server_port: number
  user_id: string
  user_name: string
}

export interface AppConfig {
  mode: 'local' | 'online'
  agent_mode?: 'ta' | 'general'
  local: LocalConfig
  online: OnlineConfig
}

const DEFAULT_CONFIG: AppConfig = {
  mode: 'local',
  agent_mode: 'ta',
  local: {
    llm_provider: 'custom',
    llm_api_key: '',
    llm_base_url: '',
    llm_model: '',
    llm_extra_headers: {},
    blender_path: '',
  },
  online: {
    server_host: '',
    server_port: 8081,
    user_id: '',
    user_name: '',
  },
}

const getElectronAPI = () => {
  if (typeof window === 'undefined') return undefined
  return window.electronAPI?.isElectron ? window.electronAPI : undefined
}

export async function getConfig(): Promise<AppConfig> {
  const electronAPI = getElectronAPI()
  if (electronAPI?.getConfig) {
    return await electronAPI.getConfig()
  }

  // dev-web 模式：从后端 API 获取
  try {
    const res = await fetch(`${LOCAL_API_BASE}/api/config/app`)
    if (res.ok) {
      const data = await res.json()
      if (data && Object.keys(data).length > 0) {
        return { ...DEFAULT_CONFIG, ...data }
      }
    }
  } catch {
    // API 失败，尝试 localStorage
  }

  const stored = localStorage.getItem('tagent-config')
  if (stored) {
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(stored) }
    } catch {
      return DEFAULT_CONFIG
    }
  }
  return DEFAULT_CONFIG
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const electronAPI = getElectronAPI()
  if (electronAPI?.saveConfig) {
    await electronAPI.saveConfig(config)
    return
  }

  // dev-web 模式：保存到后端 API
  try {
    const res = await fetch(`${LOCAL_API_BASE}/api/config/app`, {
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

export async function getMode(): Promise<'local' | 'online'> {
  const config = await getConfig()
  return config.mode || 'local'
}

export async function setMode(mode: 'local' | 'online'): Promise<void> {
  const config = await getConfig()
  config.mode = mode
  await saveConfig(config)
}

export async function getAgentMode(): Promise<'ta' | 'general'> {
  const config = await getConfig()
  return config.agent_mode === 'general' ? 'general' : 'ta'
}

export async function setAgentMode(agentMode: 'ta' | 'general'): Promise<void> {
  const config = await getConfig()
  config.agent_mode = agentMode
  await saveConfig(config)
}

export async function updateLocalConfig(updates: Partial<LocalConfig>): Promise<void> {
  const config = await getConfig()
  config.local = { ...config.local, ...updates }
  await saveConfig(config)
}

export async function updateOnlineConfig(updates: Partial<OnlineConfig>): Promise<void> {
  const config = await getConfig()
  config.online = { ...config.online, ...updates }
  await saveConfig(config)
}

export async function isFirstLaunch(): Promise<boolean> {
  const config = await getConfig()
  if (config.mode === 'local') {
    return !config.local.llm_api_key
  }
  return !config.online.server_host
}
