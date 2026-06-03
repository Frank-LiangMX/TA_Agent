/**
 * 规范管理（对接后端 conventions API）
 */

import React, { useState, useEffect } from 'react'
import { BookOpen, FileCheck, Loader2, Trash2, Eye, EyeOff } from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import { localApiFetch } from '@/lib/api'
import { useConfirm } from '@/hooks/useConfirm'

interface ConventionData {
  loaded: boolean
  content_preview: string
  default_rules: {
    naming: Record<string, string>
    mesh_budgets: Record<string, number>
    texture_budgets: Record<string, Record<string, number>>
  }
}

export function ConventionSettings() {
  const { confirm, ConfirmUI } = useConfirm()
  const [data, setData] = useState<ConventionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showContent, setShowContent] = useState(false)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    fetchConventions()
  }, [])

  const fetchConventions = async () => {
    try {
      const res = await localApiFetch('/api/conventions')
      const json = await res.json()
      setData(json)
    } catch {} finally { setLoading(false) }
  }

  const handleClear = async () => {
    if (!await confirm('确定卸载已加载的规范文档？', { danger: true })) return
    setClearing(true)
    try {
      await localApiFetch('/api/conventions/clear', { method: 'POST' })
      fetchConventions()
    } catch {} finally { setClearing(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 size={20} className="animate-spin mr-2" />
        <span className="text-sm">加载中...</span>
      </div>
    )
  }

  const naming = data?.default_rules?.naming || {}
  const meshBudgets = data?.default_rules?.mesh_budgets || {}
  const texBudgets = data?.default_rules?.texture_budgets || {}

  return (
    <>
    <div className="space-y-6">
      {/* 自定义规范 */}
      <SettingsSection
        title="自定义规范"
        description="通过 Agent 的 load_conventions 工具加载的项目规范文档"
        action={data?.loaded && (
          <button
            onClick={handleClear}
            disabled={clearing}
            className="flex items-center gap-1 text-xs text-destructive hover:underline disabled:opacity-50"
          >
            <Trash2 size={12} />
            {clearing ? '卸载中...' : '卸载'}
          </button>
        )}
      >
        <SettingsCard>
          <SettingsRow label="加载状态" icon={<BookOpen size={16} />}>
            <span className={`text-sm ${data?.loaded ? 'text-success' : 'text-muted-foreground'}`}>
              {data?.loaded ? '已加载' : '未加载'}
            </span>
          </SettingsRow>
          {data?.loaded && data.content_preview && (
            <div className="px-4 py-3">
              <button
                onClick={() => setShowContent(!showContent)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
              >
                {showContent ? <EyeOff size={12} /> : <Eye size={12} />}
                {showContent ? '隐藏内容' : '查看预览'}
              </button>
              {showContent && (
                <pre className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto scrollbar-thin">
                  {data.content_preview}
                </pre>
              )}
            </div>
          )}
        </SettingsCard>
      </SettingsSection>

      {/* 命名规范 */}
      <SettingsSection title="命名规范" description="资产命名前缀规则">
        <SettingsCard>
          {Object.entries(naming).map(([prefix, desc]) => (
            <SettingsRow key={prefix} label={prefix} description={desc as string}>
              <span className="text-xs font-mono text-muted-foreground">{prefix}</span>
            </SettingsRow>
          ))}
        </SettingsCard>
      </SettingsSection>

      {/* 面数预算 */}
      <SettingsSection title="面数预算" description="各类型资产的面数上限">
        <SettingsCard>
          {Object.entries(meshBudgets).map(([type, budget]) => (
            <SettingsRow key={type} label={type} icon={<FileCheck size={16} />}>
              <span className="text-sm font-mono">{(budget as number).toLocaleString()} 面</span>
            </SettingsRow>
          ))}
        </SettingsCard>
      </SettingsSection>

      {/* 贴图预算 */}
      {Object.keys(texBudgets).length > 0 && (
        <SettingsSection title="贴图预算" description="各类型贴图的分辨率和格式要求">
          <SettingsCard>
            {Object.entries(texBudgets).map(([type, config]) => (
              <SettingsRow key={type} label={type}>
                <span className="text-xs text-muted-foreground">
                  {Object.entries(config as Record<string, number>).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                </span>
              </SettingsRow>
            ))}
          </SettingsCard>
        </SettingsSection>
      )}
    </div>
    {ConfirmUI}
    </>
  )
}
