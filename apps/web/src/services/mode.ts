/**
 * 模式服务
 * 根据当前配置决定调用本地 Runtime 还是中心服务器 API
 */

import { getConfig, isCloudEnabled, type AppConfig } from './config'
import * as api from './api'

/**
 * 检查是否启用了中心服务器
 */
export async function checkCloudEnabled(): Promise<boolean> {
  const config = await getConfig()
  return isCloudEnabled(config)
}

// 兼容旧导出（过渡期）
export const isOnlineMode = checkCloudEnabled

/**
 * 获取用户信息（中心服务器模式）
 */
export async function getUser(): Promise<{ userId: string; userName: string } | null> {
  const config = await getConfig()
  if (!isCloudEnabled(config)) return null
  return {
    userId: config.cloud.user_id,
    userName: config.cloud.user_name,
  }
}

/**
 * 同步资产到服务器（中心服务器模式下自动调用）
 */
export async function syncAssetIfOnline(asset: api.AssetData): Promise<boolean> {
  if (!(await checkCloudEnabled())) return false

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
 * 提交审核（中心服务器模式下自动调用）
 */
export async function submitReviewIfOnline(review: {
  asset_id: string
  action: 'approve' | 'reject' | 'modify'
  comment?: string
  reviewer_id?: string
}): Promise<boolean> {
  if (!(await checkCloudEnabled())) return false

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
 * 记录用量（中心服务器模式下自动调用）
 */
export async function logUsageIfOnline(data: {
  model?: string
  tokens_total?: number
}): Promise<boolean> {
  if (!(await checkCloudEnabled())) return false

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
 * 检查用量限制（中心服务器模式）
 */
export async function checkUsageLimit(): Promise<{
  allowed: boolean
  remaining: number
} | null> {
  if (!(await checkCloudEnabled())) return null

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
 * 获取项目配置（中心服务器模式从服务器获取，本地模式从本地获取）
 */
export async function getProjectConfig(projectId: string): Promise<Record<string, unknown> | null> {
  if (await checkCloudEnabled()) {
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
 * 保存项目配置（中心服务器模式保存到服务器，本地模式保存到本地）
 */
export async function saveProjectConfig(
  projectId: string,
  config: Record<string, unknown>
): Promise<boolean> {
  if (await checkCloudEnabled()) {
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
 * 获取记忆规则（中心服务器模式从服务器获取）
 */
export async function getRules(projectId: string): Promise<api.RuleData[]> {
  if (await checkCloudEnabled()) {
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
