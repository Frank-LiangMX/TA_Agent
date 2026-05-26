/**
 * 服务器 API 调用服务
 * 联机模式下与中心服务器通信
 */

import { getConfig } from './config'
import { API_BASE } from '@/lib/api'

const API_TIMEOUT = 10000

/**
 * 获取服务器基础 URL
 */
async function getBaseUrl(): Promise<string> {
  const config = await getConfig()
  if (config.mode === 'online' && config.online.server_host) {
    const { server_host, server_port } = config.online
    return `http://${server_host}:${server_port}`
  }
  // 本地模式或未配置联机模式，使用本地后端
  return API_BASE
}

/**
 * 通用请求方法
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = await getBaseUrl()
  const url = `${baseUrl}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    signal: AbortSignal.timeout(API_TIMEOUT),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail || `请求失败: ${response.status}`)
  }

  return response.json()
}

// ========== 资产 API ==========

export interface AssetData {
  asset_id: string
  asset_name: string
  asset_type?: string
  file_path?: string
  tri_count?: number
  vertex_count?: number
  material_count?: number
  category?: string
  subcategory?: string
  style?: string
  condition?: string
  confidence?: number
  preview_thumbnail?: string
  preview_front?: string
  preview_side?: string
  created_by?: string
  metadata?: Record<string, unknown>
}

export async function syncAsset(asset: AssetData): Promise<{ success: boolean; asset_id: string }> {
  return request('/api/assets/sync', {
    method: 'POST',
    body: JSON.stringify(asset),
  })
}

export async function listAssets(params?: {
  status?: string
  limit?: number
  offset?: number
}): Promise<{ assets: AssetData[]; total: number }> {
  const query = new URLSearchParams()
  if (params?.status) query.set('status', params.status)
  if (params?.limit) query.set('limit', String(params.limit))
  if (params?.offset) query.set('offset', String(params.offset))

  const qs = query.toString()
  return request(`/api/assets${qs ? `?${qs}` : ''}`)
}

export async function getAsset(assetId: string): Promise<AssetData> {
  return request(`/api/assets/${assetId}`)
}

export async function deleteAsset(assetId: string): Promise<{ success: boolean }> {
  return request(`/api/assets/${assetId}`, { method: 'DELETE' })
}

// ========== 审核 API ==========

export interface ReviewData {
  review_id: string
  asset_id: string
  reviewer_id: string
  action: string
  comment?: string
  created_at?: string
}

export async function submitReview(review: {
  asset_id: string
  action: 'approve' | 'reject' | 'modify'
  comment?: string
  reviewer_id?: string
}): Promise<{ success: boolean; review_id: string }> {
  return request('/api/reviews', {
    method: 'POST',
    body: JSON.stringify(review),
  })
}

export async function listReviews(params?: {
  asset_id?: string
  limit?: number
}): Promise<{ reviews: ReviewData[]; count: number }> {
  const query = new URLSearchParams()
  if (params?.asset_id) query.set('asset_id', params.asset_id)
  if (params?.limit) query.set('limit', String(params.limit))

  const qs = query.toString()
  return request(`/api/reviews${qs ? `?${qs}` : ''}`)
}

export async function getPendingReviews(limit?: number): Promise<{ assets: AssetData[]; count: number }> {
  const query = limit ? `?limit=${limit}` : ''
  return request(`/api/reviews/pending${query}`)
}

// ========== 项目配置 API ==========

export interface ProjectConfigData {
  project_id: string
  project_name?: string
  config?: Record<string, unknown>
  updated_by?: string
  updated_at?: string
}

export async function listProjects(): Promise<{ projects: ProjectConfigData[]; count: number }> {
  return request('/api/projects')
}

export async function getProjectConfig(projectId: string): Promise<ProjectConfigData> {
  return request(`/api/projects/${projectId}`)
}

export async function updateProjectConfig(
  projectId: string,
  data: { project_name?: string; config?: Record<string, unknown> }
): Promise<{ success: boolean }> {
  return request(`/api/projects/${projectId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function createProjectConfig(
  projectId: string,
  data: { project_name?: string; config?: Record<string, unknown> }
): Promise<{ success: boolean }> {
  return request(`/api/projects/${projectId}`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// ========== 记忆规则 API ==========

export interface RuleData {
  rule_id: string
  project_id: string
  pattern: string
  conclusion: string
  confidence: number
  hit_count: number
  correction_count: number
  created_at?: string
  updated_at?: string
}

export async function getRules(
  projectId: string,
  limit?: number
): Promise<{ rules: RuleData[]; count: number }> {
  const query = limit ? `?project_id=${projectId}&limit=${limit}` : `?project_id=${projectId}`
  return request(`/api/memory/rules${query}`)
}

export async function createRule(
  projectId: string,
  rule: { pattern: string; conclusion: string; confidence?: number }
): Promise<{ success: boolean; rule_id: string }> {
  return request(`/api/memory/rules?project_id=${projectId}`, {
    method: 'POST',
    body: JSON.stringify(rule),
  })
}

export async function deleteRule(ruleId: string): Promise<{ success: boolean }> {
  return request(`/api/memory/rules/${ruleId}`, { method: 'DELETE' })
}

// ========== 用量统计 API ==========

export interface UsageStats {
  user_id: string
  call_count_5h: number
  tokens_total_5h: number
  call_count_today: number
  tokens_today: number
  call_count_total: number
  tokens_total: number
  limit_5h: number
  remaining_5h: number
}

export async function logUsage(data: {
  user_id: string
  model?: string
  tokens_input?: number
  tokens_output?: number
  tokens_total?: number
}): Promise<{ success: boolean; remaining: number }> {
  return request('/api/usage/log', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function getUserStats(userId: string): Promise<UsageStats> {
  return request(`/api/usage/stats/${userId}`)
}

export async function checkUsageLimit(userId: string): Promise<{
  allowed: boolean
  call_count_5h: number
  limit_5h: number
  remaining_5h: number
}> {
  return request(`/api/usage/check/${userId}`)
}

// ========== 认证 API ==========

export interface UserInfo {
  user_id: string
  user_name: string
  role: string
  department?: string
  email?: string
}

export async function login(username: string, password: string): Promise<{
  success: boolean
  user: UserInfo
}> {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function getUserInfo(userId: string): Promise<UserInfo> {
  return request(`/api/auth/users/${userId}`)
}

// ========== 健康检查 ==========

export async function healthCheck(): Promise<{ status: string; version: string }> {
  return request('/health')
}
