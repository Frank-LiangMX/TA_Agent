/**
 * 联机模式同步服务
 * 在联机模式下自动同步数据到服务器
 */

import { isOnlineMode, getUser, logUsageIfOnline, syncAssetIfOnline } from './mode'
import * as api from './api'

/**
 * 同步工具执行结果到服务器
 */
export async function syncToolResult(toolName: string, result: unknown): Promise<void> {
  if (!(await isOnlineMode())) return

  try {
    // 解析结果
    const data = typeof result === 'string' ? JSON.parse(result) : result

    // 根据工具类型同步
    switch (toolName) {
      case 'analyze_assets':
        await syncAnalysisResult(data)
        break
      case 'submit_review':
      case 'batch_approve':
        await syncReviewResult(data)
        break
      // 其他工具暂不同步
    }
  } catch (err) {
    console.error('[Sync] 同步失败:', err)
  }
}

/**
 * 同步分析结果
 */
async function syncAnalysisResult(data: Record<string, unknown>): Promise<void> {
  const assets = data.assets as Array<Record<string, unknown>> | undefined
  if (!assets || !Array.isArray(assets)) return

  const user = await getUser()

  // 批量同步资产
  for (const asset of assets) {
    try {
      await api.syncAsset({
        asset_id: asset.asset_id as string || '',
        asset_name: asset.asset_name as string || '',
        asset_type: asset.asset_type as string || '',
        file_path: asset.file_path as string || '',
        tri_count: asset.tri_count as number || 0,
        vertex_count: asset.vertex_count as number || 0,
        material_count: asset.material_count as number || 0,
        category: asset.category as string || '',
        subcategory: asset.subcategory as string || '',
        style: asset.style as string || '',
        condition: asset.condition as string || '',
        confidence: asset.confidence as number || 0,
        created_by: user?.userId || '',
        metadata: asset.metadata as Record<string, unknown> || {},
      })
    } catch (err) {
      console.error('[Sync] 同步资产失败:', asset.asset_id, err)
    }
  }

  console.log(`[Sync] 已同步 ${assets.length} 个资产`)
}

/**
 * 同步审核结果
 */
async function syncReviewResult(data: Record<string, unknown>): Promise<void> {
  // 审核结果已经在 submit_review 工具中同步
  console.log('[Sync] 审核结果已同步')
}

/**
 * 记录 LLM 用量
 */
export async function logLlmUsage(model: string, tokensEstimate: number): Promise<void> {
  if (!(await isOnlineMode())) return
  await logUsageIfOnline({
    model,
    tokens_total: tokensEstimate,
  })
}

/**
 * 检查用量限制
 */
export async function checkLimit(): Promise<{ allowed: boolean; remaining: number } | null> {
  const { checkUsageLimit } = await import('./mode')
  return checkUsageLimit()
}
