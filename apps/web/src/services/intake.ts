/**
 * 入库向导 API
 */

import { getApiBase } from '@/lib/api'

const TARGET_DIR_KEY = 'tagent-intake-target-dir'

/** 入库始终走本地 Agent（TagStore + intake 工具在本机） */
async function getIntakeBaseUrl(): Promise<string> {
  return getApiBase()
}

export interface IntakeStatusCounts {
  pending: number
  approved: number
}

function mapApprovedAsset(row: Record<string, unknown>): ApprovedAsset {
  const filePath = String(row.file_path || '')
  const assetName = String(row.asset_name || '')
  let assetType = String(row.asset_type || '')
  if (!assetType) {
    assetType = inferAssetTypeFromPath(filePath || assetName)
  }
  return {
    asset_id: String(row.asset_id || ''),
    asset_name: assetName,
    file_path: filePath,
    asset_type: assetType,
    category: String(row.category || ''),
    tri_count: Number(row.tri_count || 0),
    target_engine_path: String(row.target_engine_path || ''),
  }
}

const TEXTURE_EXTS = new Set(['tga', 'png', 'jpg', 'jpeg', 'tiff', 'tif', 'bmp', 'exr', 'hdr', 'dds'])

function inferAssetTypeFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  if (TEXTURE_EXTS.has(ext)) return 'texture'
  const base = path.split(/[/\\]/).pop()?.toUpperCase() || ''
  if (base.startsWith('T_')) return 'texture'
  if (base.startsWith('SM_')) return 'static_mesh'
  if (base.startsWith('SK_')) return 'skeletal_mesh'
  if (base.startsWith('M_') || base.startsWith('MI_')) return 'material'
  if (base.startsWith('AN_')) return 'animation'
  return ''
}

export const ASSET_TYPE_LABELS: Record<string, string> = {
  animation: '动画',
  texture: '贴图',
  mesh: '模型',
  static_mesh: '静态模型',
  skeletal_mesh: '骨骼模型',
  material: '材质',
  blueprint: '蓝图',
  sound: '音效',
  effect: '特效',
  prop: '道具',
  unknown: '未知',
}

export function formatAssetTypeLabel(assetType: string, category = ''): string {
  if (assetType && ASSET_TYPE_LABELS[assetType]) return ASSET_TYPE_LABELS[assetType]
  if (assetType) return assetType
  if (category) return category
  return '—'
}

export async function fetchIntakeStatusCounts(): Promise<IntakeStatusCounts> {
  const base = await getIntakeBaseUrl()
  const res = await fetch(`${base}/api/stats`)
  if (!res.ok) return { pending: 0, approved: 0 }
  const data = await res.json()
  const by = data.by_status || {}
  return {
    pending: Number(by.pending || 0),
    approved: Number(by.approved || 0),
  }
}

export interface ApprovedAsset {
  asset_id: string
  asset_name: string
  file_path: string
  asset_type: string
  category: string
  tri_count: number
  target_engine_path?: string
}

export interface ProjectConfigOption {
  name: string
  path: string
  project_name: string
  engine: string
}

export interface IntakeStepResult {
  step: string
  status: string
  detail: string
}

export interface IntakeAssetResult {
  success: boolean
  dry_run?: boolean
  asset_id?: string
  original_name?: string
  canonical_name?: string
  source_path?: string
  target_engine_dir?: string
  target_engine_path?: string
  related_textures?: number
  steps?: IntakeStepResult[]
  message?: string
  error?: string
}

export interface IntakeBatchResult {
  total: number
  success: number
  failed: number
  dry_run?: boolean
  results?: IntakeAssetResult[]
  results_truncated?: boolean
  manifest_path?: string | null
  script_path?: string | null
  message?: string
  error?: string
}

export function getSavedTargetDir(): string {
  return localStorage.getItem(TARGET_DIR_KEY) || ''
}

export function saveTargetDir(dir: string): void {
  if (dir.trim()) {
    localStorage.setItem(TARGET_DIR_KEY, dir.trim())
  }
}

export async function fetchApprovedAssets(): Promise<ApprovedAsset[]> {
  const base = await getIntakeBaseUrl()
  const res = await fetch(`${base}/api/intake/approved`)
  if (res.ok) {
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    return (data.assets || []) as ApprovedAsset[]
  }

  // 后端未重启、尚无 /api/intake/approved 时，从资产列表筛选
  const assetsRes = await fetch(`${base}/api/assets`)
  if (!assetsRes.ok) {
    throw new Error('无法加载可入库资产，请重启后端服务后重试')
  }
  const assetsData = await assetsRes.json()
  if (assetsData.error) throw new Error(assetsData.error)
  return (assetsData.assets || [])
    .filter((a: { status?: string }) => a.status === 'approved')
    .map((a: Record<string, unknown>) => mapApprovedAsset(a))
}

export async function fetchProjectConfigs(): Promise<ProjectConfigOption[]> {
  const base = await getIntakeBaseUrl()
  const res = await fetch(`${base}/api/intake/project-configs`)
  if (res.ok) {
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    return data.configs || []
  }
  return []
}

export async function previewIntake(params: {
  asset_ids: string[]
  target_engine_dir: string
  project_config_name?: string
}): Promise<IntakeBatchResult> {
  const base = await getIntakeBaseUrl()
  const res = await fetch(`${base}/api/intake/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || `预览失败 (${res.status})`)
  return data
}

export async function runIntake(params: {
  asset_ids: string[]
  target_engine_dir: string
  project_config_name?: string
}): Promise<IntakeBatchResult> {
  const base = await getIntakeBaseUrl()
  const res = await fetch(`${base}/api/intake/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || `入库失败 (${res.status})`)
  return data
}
