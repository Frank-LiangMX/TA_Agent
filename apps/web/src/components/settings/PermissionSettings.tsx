/**
 * 权限管理（对接后端 permissions API）
 */

import React, { useState, useEffect, useMemo } from 'react'
import { Shield, Lock, Unlock, Loader2, Search, Filter, AlertCircle, CheckCircle2, X, FileText, FolderOpen, Network, Terminal, Database, Cog, Wrench } from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsSegmentedControl } from './primitives'
import { localApiFetch } from '@/lib/api'

interface PermissionData {
  global_mode: string
  tools: Record<string, string>
  agentMode?: string
}

const MODE_LABELS: Record<string, string> = {
  safe: '需确认',
  ask: '询问',
  'allow-all': '自动',
}

const MODE_DESC: Record<string, string> = {
  safe: '每次使用前都需要用户确认',
  ask: '敏感操作询问，普通操作自动',
  'allow-all': '完全自动，无需确认',
}

const MODE_ICON: Record<string, React.ReactNode> = {
  safe: <Lock size={12} />,
  ask: <Shield size={12} />,
  'allow-all': <Unlock size={12} />,
}

const MODE_COLOR: Record<string, string> = {
  safe: 'text-yellow-600 bg-yellow-500/10 border-yellow-500/30',
  ask: 'text-blue-600 bg-blue-500/10 border-blue-500/30',
  'allow-all': 'text-green-600 bg-green-500/10 border-green-500/30',
}

// 工具分类（按工具名前缀推断，可根据后端 tool 分类字段调整）
function categorizeTool(name: string): { category: string; icon: React.ReactNode } {
  const lower = name.toLowerCase()
  if (/(read|write|file|fs|directory|scan|upload|download|asset)/.test(lower)) return { category: '文件操作', icon: <FileText size={14} /> }
  if (/(http|web|api|fetch|request|curl|network)/.test(lower)) return { category: '网络请求', icon: <Network size={14} /> }
  if (/(shell|exec|run|command|terminal|process)/.test(lower)) return { category: '系统命令', icon: <Terminal size={14} /> }
  if (/(db|sql|query|store|data|tag|convention)/.test(lower)) return { category: '数据存储', icon: <Database size={14} /> }
  if (/(git|commit|branch|merge|workflow|pipeline|analyze|review)/.test(lower)) return { category: '项目工作流', icon: <Cog size={14} /> }
  return { category: '其他', icon: <Wrench size={14} /> }
}

interface PermissionSettingsProps {
  refreshKey?: number
}

export function PermissionSettings({ refreshKey = 0 }: PermissionSettingsProps) {
  const [data, setData] = useState<PermissionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterMode, setFilterMode] = useState<string>('all')

  useEffect(() => {
    setLoading(true)
    localApiFetch('/api/permissions')
      .then((res) => res.json())
      .then((json) => {
        setData({
          global_mode: json.global_mode || json.mode || 'ask',
          tools: json.tools || json.tool_permissions || {},
          agentMode: json.agentMode,
        })
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [refreshKey])

  const handleGlobalModeChange = async (mode: string) => {
    if (!data) return
    setSaving(true)
    try {
      const res = await localApiFetch('/api/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ global_mode: mode }),
      })
      const json = await res.json()
      if (json.success) {
        setData((prev) => prev ? { ...prev, global_mode: json.global_mode || mode, tools: json.tools || prev.tools } : prev)
      }
    } catch {} finally { setSaving(false) }
  }

  const handleToolModeChange = async (toolName: string, mode: string) => {
    if (!data) return
    setSaving(true)
    try {
      const newTools = { ...data.tools, [toolName]: mode }
      const res = await localApiFetch('/api/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tools: newTools }),
      })
      const json = await res.json()
      if (json.success) {
        setData((prev) => prev ? { ...prev, tools: json.tools || newTools } : prev)
      }
    } catch {} finally { setSaving(false) }
  }

  const handleBulkSet = async (mode: string) => {
    if (!data) return
    if (!confirm(`将所有 ${Object.keys(data.tools).length} 个工具设为「${MODE_LABELS[mode]}」？`)) return
    setSaving(true)
    try {
      const newTools: Record<string, string> = {}
      Object.keys(data.tools).forEach((name) => { newTools[name] = mode })
      const res = await localApiFetch('/api/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tools: newTools }),
      })
      const json = await res.json()
      if (json.success) {
        setData((prev) => prev ? { ...prev, tools: json.tools || newTools } : prev)
      }
    } catch {} finally { setSaving(false) }
  }

  // Hooks 必须在 early return 之前全部调用
  const toolEntries = data ? Object.entries(data.tools) : []
  const isGeneral = data?.agentMode === 'general'

  // 按分类 + 过滤分组
  const grouped = useMemo(() => {
    const filtered = toolEntries.filter(([name, mode]) => {
      if (filterMode !== 'all' && mode !== filterMode) return false
      if (searchQuery && !name.toLowerCase().includes(searchQuery.toLowerCase())) return false
      return true
    })
    const map = new Map<string, { icon: React.ReactNode; tools: typeof filtered }>()
    for (const [name, mode] of filtered) {
      const cat = categorizeTool(name)
      if (!map.has(cat.category)) map.set(cat.category, { icon: cat.icon, tools: [] })
      map.get(cat.category)!.tools.push([name, mode])
    }
    return Array.from(map.entries())
  }, [toolEntries, searchQuery, filterMode])

  // 统计
  const stats = useMemo(() => {
    const counts = { safe: 0, ask: 0, 'allow-all': 0 }
    toolEntries.forEach(([, m]) => { if (counts[m as keyof typeof counts] !== undefined) counts[m as keyof typeof counts]++ })
    return counts
  }, [toolEntries])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 size={20} className="animate-spin mr-2" />
        <span className="text-sm">加载中...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 顶部状态栏 */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="text-xs text-muted-foreground">
          当前工作台：<span className="font-medium text-foreground">{isGeneral ? '通用模式' : 'TA 模式'}</span>
          ，共 {toolEntries.length} 个工具
        </div>
        {saving && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            保存中...
          </div>
        )}
      </div>

      {/* 全局权限模式 */}
      <SettingsSection title="全局权限模式" description="控制 Agent 使用工具时的默认权限策略">
        <SettingsCard>
          <SettingsSegmentedControl
            label="权限模式"
            description={MODE_DESC[data?.global_mode || 'ask']}
            value={data?.global_mode || 'ask'}
            onChange={handleGlobalModeChange}
            options={[
              { value: 'safe', label: '需确认' },
              { value: 'ask', label: '询问' },
              { value: 'allow-all', label: '自动' },
            ]}
            disabled={saving}
          />
        </SettingsCard>
      </SettingsSection>

      {/* 工具级权限 */}
      {toolEntries.length > 0 ? (
        <SettingsSection title="工具级权限" description="为每个工具单独设置权限（覆盖全局设置）">
          {/* 搜索 + 过滤 + 批量 */}
          <div className="rounded-xl border border-foreground/10 bg-background overflow-hidden shadow-[0_4px_12px_-4px_rgb(0_0%_0/0.08),inset_0_1px_0_0_rgb(255_255_255/0.4)]">
            {/* 工具栏 */}
            <div className="px-3 py-2.5 border-b border-border/40 flex items-center gap-2 flex-wrap">
              {/* 搜索 */}
              <div className="relative flex-1 min-w-[180px]">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索工具名..."
                  className="w-full pl-7 pr-7 py-1.5 text-xs bg-muted/40 border border-border/40 rounded outline-none focus:ring-1 focus:ring-ring"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              {/* 过滤 */}
              <div className="flex items-center gap-1 text-xs">
                <Filter size={12} className="text-muted-foreground" />
                <button
                  onClick={() => setFilterMode('all')}
                  className={`px-2 py-1 rounded ${filterMode === 'all' ? 'bg-foreground/10 text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  全部
                </button>
                {(['safe', 'ask', 'allow-all'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setFilterMode(m)}
                    className={`px-2 py-1 rounded flex items-center gap-1 ${
                      filterMode === m ? 'bg-foreground/10 text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {MODE_ICON[m]}
                    {MODE_LABELS[m]}
                    <span className="opacity-60">({stats[m]})</span>
                  </button>
                ))}
              </div>
              {/* 批量操作 */}
              <div className="flex items-center gap-1 ml-auto pl-2 border-l border-border/40">
                <span className="text-[10px] text-muted-foreground uppercase">批量</span>
                {(['safe', 'ask', 'allow-all'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => handleBulkSet(m)}
                    disabled={saving}
                    className={`px-2 py-1 text-xs rounded border transition-colors ${
                      m === 'safe'
                        ? 'border-yellow-500/30 text-yellow-600 hover:bg-yellow-500/10'
                        : m === 'ask'
                        ? 'border-blue-500/30 text-blue-600 hover:bg-blue-500/10'
                        : 'border-green-500/30 text-green-600 hover:bg-green-500/10'
                    }`}
                  >
                    全部 {MODE_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>

            {/* 工具列表（按分类） */}
            <div className="max-h-[480px] overflow-y-auto scrollbar-thin">
              {grouped.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  <Filter size={24} className="opacity-30 mx-auto mb-2" />
                  没有匹配的工具
                </div>
              ) : (
                grouped.map(([category, { icon, tools }]) => (
                  <div key={category}>
                    <div className="sticky top-0 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/60 backdrop-blur-sm border-b border-border/30 flex items-center gap-1.5">
                      {icon}
                      {category}
                      <span className="opacity-60 ml-1">({tools.length})</span>
                    </div>
                    <div>
                      {tools.map(([name, mode]) => (
                        <div
                          key={name}
                          className="px-3 py-2 flex items-center gap-3 hover:bg-muted/30 transition-colors border-b border-border/20 last:border-b-0"
                        >
                          {/* 工具名 */}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-mono truncate">{name}</div>
                          </div>
                          {/* 模式选择器（胶囊按钮组） */}
                          <div className="inline-flex gap-0.5 p-0.5 rounded-md bg-muted/60 border border-border/30">
                            {(['safe', 'ask', 'allow-all'] as const).map((m) => (
                              <button
                                key={m}
                                onClick={() => handleToolModeChange(name, m)}
                                disabled={saving}
                                className={`px-2 py-0.5 text-[11px] rounded flex items-center gap-1 transition-colors ${
                                  mode === m
                                    ? `${MODE_COLOR[m]} border`
                                    : 'text-muted-foreground hover:text-foreground'
                                }`}
                                title={MODE_DESC[m]}
                              >
                                {MODE_ICON[m]}
                                {MODE_LABELS[m]}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </SettingsSection>
      ) : (
        <p className="text-sm text-muted-foreground">当前模式下暂无已配置的工具权限项。</p>
      )}
    </div>
  )
}
