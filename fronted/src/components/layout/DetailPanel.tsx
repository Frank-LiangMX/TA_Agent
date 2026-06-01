/**
 * 右侧资产详情面板（配置驱动）
 *
 * 字段通过 detailFields.ts 配置，新增字段只改配置不改组件。
 * 特殊区块（材质详情、关联资产、色板）保留自定义渲染。
 */

import React from 'react'
import { X, Package, Loader2, Camera, CheckCircle2, AlertTriangle, Box } from 'lucide-react'
import { getDataSource } from '@/lib/cache'
import { API_BASE } from '@/lib/api'
import { FbxViewerModal, FbxViewerInline } from '@/components/viewer'
import type { FieldConfig } from './detailFields'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  MESH_FIELDS, TEXTURE_FIELDS, ANIMATION_FIELDS,
  META_FIELDS, CATEGORY_FIELDS, VISUAL_FIELDS,
} from './detailFields'

interface DetailPanelProps {
  asset: Record<string, unknown> | null
  onClose: () => void
}

export function DetailPanel({ asset, onClose }: DetailPanelProps) {
  if (!asset) {
    return (
      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
        选择一个资产查看详情
      </div>
    )
  }

  const name = String(asset.asset_name || asset.filename || '未知')
  const filePath = String(asset.file_path || '')
  const assetType = String(asset.asset_type || '')
  const status = String(asset.meta?.status || asset.status || 'pending')

  // 根据资产类型选择字段配置
  const getMeshFields = () => {
    if (assetType === 'animation') return ANIMATION_FIELDS
    if (assetType === 'texture') return []
    return MESH_FIELDS
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <PageHeader
        showWindowControls={false}
        actions={
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded hover:bg-muted"
            aria-label="关闭详情"
          >
            <X size={16} />
          </button>
        }
      >
        <h3 className="text-sm font-medium truncate">{name}</h3>
      </PageHeader>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        {/* 预览区 */}
        <PreviewImage
          assetId={String(asset.asset_id || '')}
          assetName={name}
          assetType={assetType}
          filePath={filePath}
          triCount={asset.mesh?.tri_count}
        />

        {/* 基本信息 */}
        <Section title="基本信息">
          <InfoRow label="资产名" value={name} />
          <InfoRow label="类型" value={assetType} />
          <InfoRow label="状态" value={status} />
          {filePath && <InfoRow label="路径" value={filePath} />}
        </Section>

        {/* 几何/动画信息（配置驱动） */}
        {asset.mesh && (
          <FieldSection title="几何信息" fields={getMeshFields()} data={asset.mesh} />
        )}

        {/* 贴图信息（配置驱动） */}
        {asset.textures && asset.textures.count > 0 && (
          <FieldSection title="贴图信息" fields={TEXTURE_FIELDS} data={asset.textures} />
        )}

        {/* 材质详情（自定义渲染） */}
        {asset.mesh?.material_names?.length > 0 && (
          <Section title="材质详情">
            {asset.mesh.material_names.map((matName: string, i: number) => {
              const textures = asset.mesh.material_textures?.[matName] || []
              return (
                <div key={i} className="mb-2">
                  <div className="text-xs font-medium text-foreground">{matName || `(空槽位 ${i + 1})`}</div>
                  {textures.length > 0 ? (
                    <div className="ml-2 mt-0.5 space-y-0.5">
                      {textures.map((tex: string, j: number) => (
                        <div key={j} className="text-xs text-muted-foreground">└ {tex}</div>
                      ))}
                    </div>
                  ) : (
                    <div className="ml-2 mt-0.5 text-xs text-muted-foreground/50">└ 无贴图</div>
                  )}
                </div>
              )
            })}
          </Section>
        )}

        {/* 关联资产 */}
        {asset.spatial?.related_assets?.length > 0 && (
          <Section title={`关联资产 (${asset.spatial.related_assets.length})`}>
            <div className="space-y-1">
              {asset.spatial.related_assets.slice(0, 10).map((relatedId: string, i: number) => (
                <div key={i} className="text-xs text-muted-foreground truncate">{relatedId}</div>
              ))}
              {asset.spatial.related_assets.length > 10 && (
                <div className="text-xs text-muted-foreground/50">... 还有 {asset.spatial.related_assets.length - 10} 个</div>
              )}
            </div>
          </Section>
        )}

        {/* AI 分类（配置驱动） */}
        {asset.category && (
          <FieldSection title="AI 分类" fields={CATEGORY_FIELDS} data={asset.category} />
        )}

        {/* 视觉属性（配置驱动 + 色板自定义） */}
        {asset.visual && (
          <>
            <FieldSection title="视觉属性" fields={VISUAL_FIELDS} data={asset.visual} />
            {asset.visual.color_palette?.length > 0 && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground w-16">色板</span>
                <div className="flex gap-1">
                  {asset.visual.color_palette.slice(0, 6).map((color: string, i: number) => (
                    <div
                      key={i}
                      className="w-5 h-5 rounded border border-border/50"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* 材质结构 */}
        {asset.material_structure && (
          <Section title="材质">
            <InfoRow label="主材质" value={(asset.material_structure.primary || []).join(', ') || '-'} />
            <InfoRow label="辅材质" value={(asset.material_structure.secondary || []).join(', ') || '-'} />
          </Section>
        )}

        {/* 元信息（配置驱动 + 命名合规自定义） */}
        {asset.meta && (
          <Section title="元信息">
            {asset.meta.naming_compliant != null && (
              <div className={`flex items-center gap-1.5 text-xs ${asset.meta.naming_compliant ? 'text-success' : 'text-warning'}`}>
                {asset.meta.naming_compliant ? (
                  <><CheckCircle2 size={12} /> 命名合规</>
                ) : (
                  <><AlertTriangle size={12} /> 命名不合规</>
                )}
              </div>
            )}
            {!asset.meta.naming_compliant && asset.meta.naming_suggestion && (
              <p className="text-xs text-muted-foreground">
                建议: <span className="font-mono">{asset.meta.naming_suggestion}</span>
              </p>
            )}
            {asset.meta.naming_issues?.length > 0 && (
              <ul className="text-xs text-destructive space-y-0.5">
                {asset.meta.naming_issues.map((issue: string, i: number) => (
                  <li key={i}>• {issue}</li>
                ))}
              </ul>
            )}
            {asset.meta.engine_path && (
              <InfoRow label="引擎路径" value={asset.meta.engine_path} />
            )}
          </Section>
        )}
      </div>
    </div>
  )
}

// ===== 配置驱动的字段区块 =====

function FieldSection({ title, fields, data }: { title: string; fields: FieldConfig[]; data: Record<string, unknown> }) {
  if (!data || fields.length === 0) return null
  return (
    <Section title={title}>
      {fields.map(field => {
        if (field.condition && !field.condition(data)) return null
        return (
          <InfoRow
            key={field.key}
            label={field.label}
            value={formatFieldValue(data[field.key], field.format)}
          />
        )
      })}
    </Section>
  )
}

function formatFieldValue(value: unknown, format: string): string {
  if (value === null || value === undefined) return '-'
  switch (format) {
    case 'number': {
      const n = Number(value)
      return isNaN(n) ? '-' : n.toLocaleString()
    }
    case 'boolean':
      return value ? '✓' : '✗'
    case 'list':
      return Array.isArray(value) ? (value.join(', ') || '-') : String(value)
    case 'filesize': {
      const mb = Number(value)
      return isNaN(mb) ? '-' : `${mb.toFixed(1)} MB`
    }
    default:
      return String(value) || '-'
  }
}

// ===== 通用组件 =====

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{title}</h4>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between text-xs gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right break-all">{value}</span>
    </div>
  )
}

// ===== 预览图组件 =====

function PreviewImage({ assetId, assetName, assetType, filePath, triCount }: { assetId: string; assetName: string; assetType?: string; filePath?: string; triCount?: number }) {
  const [src, setSrc] = React.useState<string | null>(null)
  const [error, setError] = React.useState(false)
  const [rendering, setRendering] = React.useState(false)
  const [renderMsg, setRenderMsg] = React.useState<string | null>(null)
  const [viewerOpen, setViewerOpen] = React.useState(false)
  const [dataSource, setDataSource] = React.useState(API_BASE)

  React.useEffect(() => {
    getDataSource().then(setDataSource)
  }, [])

  React.useEffect(() => {
    if (!assetId) return
    setError(false)
    setRenderMsg(null)
    setSrc(`${dataSource}/api/preview/${assetId}`)
  }, [assetId, dataSource])

  const canRender = assetId && assetType && !['animation', 'texture', 'material'].includes(assetType) && (triCount || 0) > 0
  const can3DPreview = filePath?.toLowerCase().endsWith('.fbx') && (assetType === 'mesh' || assetType === 'skeletal_mesh' || assetType === 'static_mesh')

  const handleRender = async () => {
    setRendering(true)
    setRenderMsg(null)
    try {
      const res = await fetch(`${dataSource}/api/preview/${assetId}/render`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setSrc(`${dataSource}/api/preview/${assetId}?t=${Date.now()}`)
        setError(false)
        setRenderMsg('预览图已生成')
      } else {
        setRenderMsg(data.error || '渲染失败')
      }
    } catch (e: any) {
      setRenderMsg(e.message || '请求失败')
    } finally {
      setRendering(false)
    }
  }

  if (!assetId) {
    return (
      <div className="aspect-square bg-muted rounded-lg flex items-center justify-center">
        <Package size={48} className="text-muted-foreground/30" />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {can3DPreview ? (
        <FbxViewerInline assetId={assetId} filePath={filePath} onExpand={() => setViewerOpen(true)} />
      ) : (
        <div className="aspect-square bg-muted rounded-lg overflow-hidden flex items-center justify-center relative">
          {src && !error ? (
            <img
              src={src}
              alt={assetName}
              className="w-full h-full object-contain"
              onError={() => setError(true)}
            />
          ) : (
            <Package size={48} className="text-muted-foreground/30" />
          )}
          {rendering && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          )}
        </div>
      )}
      {canRender && (!src || error) && (
        <button
          onClick={handleRender}
          disabled={rendering}
          className="w-full flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground bg-muted hover:bg-accent py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          {rendering ? (
            <><Loader2 size={14} className="animate-spin" /> 渲染中...</>
          ) : (
            <><Camera size={14} /> {error ? '重新生成预览图' : '生成预览图'}</>
          )}
        </button>
      )}
      {renderMsg && !rendering && (
        <p className={`text-xs ${renderMsg.includes('已生成') ? 'text-success' : 'text-warning'}`}>
          {renderMsg}
        </p>
      )}
      <FbxViewerModal open={viewerOpen} onClose={() => setViewerOpen(false)} assetId={assetId} assetName={assetName} filePath={filePath} />
    </div>
  )
}
