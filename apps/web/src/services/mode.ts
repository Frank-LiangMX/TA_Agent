/**
 * 模式服务
 * 根据当前模式（本地/联机）决定调用哪个 API
 */

import { getConfig, type AppConfig } from './config'
import * as api from './api'

/**
 * 获取当前模式
 */
export async function getCurrentMode(): Promise<'local' | 'online'> {
  const config = await getConfig()
  return config.mode || 'local'
}

/**
 * 检查是否为联机模式
 */
export async function isOnlineMode(): Promise<boolean> {
  const mode = await getCurrentMode()
  return mode === 'online'
}

/**
 * 获取用户信息（联机模式）
 */
export async function getUser(): Promise<{ userId: string; userName: string } | null> {
  const config = await getConfig()
  if (config.mode !== 'online') return null
  return {
    userId: config.online.user_id,
    userName: config.online.user_name,
  }
}

/**
 * 同步资产到服务器（联机模式下自动调用）
 */
export async function syncAssetIfOnline(asset: api.AssetData): Promise<boolean> {
  if (!(await isOnlineMode())) return false

  try {
    const user = await getUser()
    if (user) {
      asset.created_by = user.userId
    }
    await api.syncAsset(asset)
    return true
  } catch (err) {
    console.error('同步资产失败:', err)
    return false
  }
}

/**
 * 提交审核（联机模式下自动调用）
 */
export async function submitReviewIfOnline(review: {
  asset_id: string
  action: 'approve' | 'reject' | 'modify'
  comment?: string
  reviewer_id?: string
}): Promise<boolean> {
  if (!(await isOnlineMode())) return false

  try {
    const user = await getUser()
    if (user) {
      review.reviewer_id = user.userId
    }
    await api.submitReview(review)
    return true
  } catch (err) {
    console.error('提交审核失败:', err)
    return false
  }
}

/**
 * 记录用量（联机模式下自动调用）
 */
export async function logUsageIfOnline(data: {
  model?: string
  tokens_total?: number
}): Promise<boolean> {
  if (!(await isOnlineMode())) return false

  try {
    const user = await getUser()
    if (!user) return false

    await api.logUsage({
      user_id: user.userId,
      model: data.model,
      tokens_total: data.tokens_total,
    })
    return true
  } catch (err) {
    console.error('记录用量失败:', err)
    return false
  }
}

/**
 * 检查用量限制（联机模式）
 */
export async function checkUsageLimit(): Promise<{
  allowed: boolean
  remaining: number
} | null> {
  if (!(await isOnlineMode())) return null

  try {
    const user = await getUser()
    if (!user) return null

    const result = await api.checkUsageLimit(user.userId)
    return {
      allowed: result.allowed,
      remaining: result.remaining_5h,
    }
  } catch (err) {
    console.error('检查用量限制失败:', err)
    return null
  }
}

/**
 * 获取项目配置（联机模式从服务器获取，本地模式从本地获取）
 */
export async function getProjectConfig(projectId: string): Promise<Record<string, unknown> | null> {
  if (await isOnlineMode()) {
    try {
      const result = await api.getProjectConfig(projectId)
      return result.config || null
    } catch (err) {
      console.error('获取项目配置失败:', err)
      return null
    }
  }

  // 本地模式：从本地存储获取
  const stored = localStorage.getItem(`tagent-project-${projectId}`)
  if (stored) {
    try {
      return JSON.parse(stored)
    } catch {
      return null
    }
  }
  return null
}

/**
 * 保存项目配置（联机模式保存到服务器，本地模式保存到本地）
 */
export async function saveProjectConfig(
  projectId: string,
  config: Record<string, unknown>
): Promise<boolean> {
  if (await isOnlineMode()) {
    try {
      await api.updateProjectConfig(projectId, { config })
      return true
    } catch (err) {
      console.error('保存项目配置失败:', err)
      return false
    }
  }

  // 本地模式：保存到本地存储
  localStorage.setItem(`tagent-project-${projectId}`, JSON.stringify(config))
  return true
}

/**
 * 获取记忆规则（联机模式从服务器获取）
 */
export async function getRules(projectId: string): Promise<api.RuleData[]> {
  if (await isOnlineMode()) {
    try {
      const result = await api.getRules(projectId)
      return result.rules
    } catch (err) {
      console.error('获取规则失败:', err)
      return []
    }
  }

  // 本地模式：暂不支持
  return []
}
