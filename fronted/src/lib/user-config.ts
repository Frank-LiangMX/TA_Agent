/**
 * 用户配置管理
 *
 * 用户名、token、分组。存储在 localStorage，同步到后端。
 */

import { API_BASE } from '@/lib/api'

const STORAGE_KEY = 'tagent-user-config'

export interface UserConfig {
  name: string
  token: string
  group: string
}

/** 从 localStorage 读取 */
export function loadUserConfig(): UserConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { name: '', token: '', group: '' }
}

/** 保存到 localStorage + 同步后端 */
export async function saveUserConfig(config: Partial<UserConfig>) {
  const current = loadUserConfig()
  const merged = { ...current, ...config }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))

  // 同步到后端
  try {
    await fetch(`${API_BASE}/api/user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(merged),
    })
  } catch {}

  return merged
}

/** 从后端加载（覆盖本地） */
export async function fetchUserConfig(): Promise<UserConfig> {
  try {
    const res = await fetch(`${API_BASE}/api/user`)
    const data = await res.json()
    const config: UserConfig = {
      name: data.name || '',
      token: data.token || '',
      group: data.group || '',
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    return config
  } catch {
    return loadUserConfig()
  }
}

/** 获取 WebSocket 连接参数 */
export function getUserQueryParams(): string {
  const { name, token } = loadUserConfig()
  const params: string[] = []
  if (name) params.push(`user=${encodeURIComponent(name)}`)
  if (token) params.push(`token=${encodeURIComponent(token)}`)
  return params.length > 0 ? `&${params.join('&')}` : ''
}
