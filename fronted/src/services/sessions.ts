/**
 * 会话管理 API 客户端
 *
 * 封装后端 REST API 调用
 */

import { API_BASE } from '@/lib/api'
import { loadUserConfig } from '@/lib/user-config'
import type { SessionMeta } from '@/types'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** 获取会话列表（按当前用户过滤） */
export async function listSessions(includeArchived = false): Promise<SessionMeta[]> {
  const { name } = loadUserConfig()
  const userParam = name ? `&user=${encodeURIComponent(name)}` : ''
  const data = await request<{ sessions: SessionMeta[] }>(
    `/api/sessions?include_archived=${includeArchived}${userParam}`
  )
  return data.sessions
}

/** 获取单个会话 */
export async function getSession(sessionId: string): Promise<SessionMeta | null> {
  const data = await request<SessionMeta & { error?: string }>(
    `/api/sessions/${sessionId}`
  )
  if ((data as any).error) return null
  return data as SessionMeta
}

/** 创建新会话 */
export async function createSession(title = '新会话'): Promise<SessionMeta> {
  return request<SessionMeta>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ title }),
  })
}

/** 更新会话 */
export async function updateSession(
  sessionId: string,
  patch: Partial<Pick<SessionMeta, 'title' | 'isPinned' | 'isArchived' | 'workflowMode'>>
): Promise<SessionMeta | null> {
  const data = await request<SessionMeta & { error?: string }>(`/api/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  if ((data as any).error) return null
  return data as SessionMeta
}

/** 删除会话 */
export async function deleteSession(sessionId: string): Promise<boolean> {
  const data = await request<{ ok?: boolean; error?: string }>(
    `/api/sessions/${sessionId}`,
    { method: 'DELETE' }
  )
  return !!data.ok
}

/** 获取会话消息 */
export async function getSessionMessages(
  sessionId: string,
  limit = 0
): Promise<Record<string, unknown>[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000) // 10 秒超时
  try {
    const data = await request<{ messages: Record<string, unknown>[] }>(
      `/api/sessions/${sessionId}/messages?limit=${limit}`,
      { signal: controller.signal }
    )
    return data.messages
  } finally {
    clearTimeout(timer)
  }
}

/** 搜索会话 */
export async function searchSessions(query: string): Promise<Record<string, unknown>[]> {
  const data = await request<{ results: Record<string, unknown>[] }>(
    '/api/sessions/search',
    { method: 'POST', body: JSON.stringify({ query }) }
  )
  return data.results
}
