/**
 * 工具管理（四层级：核心工具 / 引擎扩展 / MCP 工具 / 可选插件）
 */
import React, { useState, useEffect } from 'react'
import {
  Wrench, Puzzle, Download, Trash2, Loader2, CheckCircle2,
  AlertCircle, ChevronDown, ChevronRight, Cpu, Box, Plug, Archive,
} from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import { API_BASE } from '@/lib/api'

interface ToolInfo {
  name: string
  description: string
  category: string
  tier: 'core' | 'extension' | 'mcp' | 'plugin'
}

interface PluginInfo {
  filename: string
  installed: boolean
}

const TIER_LABELS: Record<string, { label: string; icon: React.ReactNode; desc: string }> = {
  core:      { label: '核心工具', icon: <Cpu size={16} />, desc: '内置，启动即注册' },
  extension: { label: '引擎扩展', icon: <Box size={16} />, desc: 'Python 桥接，需要外部引擎配合' },
  mcp:       { label: 'MCP 工具', icon: <Plug size={16} />, desc: '通过 MCP 协议连接的动态工具' },
  plugin:    { label: '可选插件', icon: <Archive size={16} />, desc: '按需安装的 Python 插件' },
}

const TIER_ORDER = ['core', 'extension', 'mcp', 'plugin']

export function ToolSettings() {
  const [tools, setTools] = useState<ToolInfo[]>([])
  const [tierSummary, setTierSummary] = useState<Record<string, number>>({})
  const [installed, setInstalled] = useState<string[]>([])
  const [available, setAvailable] = useState<PluginInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState('')
  const [message, setMessage] = useState('')
  const [activeTier, setActiveTier] = useState('core')
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([fetchTools(), fetchPlugins()]).finally(() => setLoading(false))
  }, [])

  const fetchTools = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/tools`)
      const data = await res.json()
      setTools(data.tools || [])
      setTierSummary(data.tier_summary || {})
    } catch {}
  }

  const fetchPlugins = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/plugins`)
      const data = await res.json()
      setInstalled(data.installed || [])
      setAvailable(data.available || [])
    } catch {}
  }

  const toggleCategory = (cat: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const handleInstall = async (filename: string) => {
    setActionLoading(filename); setMessage('')
    try {
      const res = await fetch(`${API_BASE}/api/plugins/install`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      })
      const data = await res.json()
      setMessage(data.success ? data.message : (data.error || '安装失败'))
      if (data.success) { fetchPlugins(); fetchTools() }
    } catch (e: any) { setMessage(e.message || '网络错误') }
    finally { setActionLoading('') }
  }

  const handleUninstall = async (filename: string) => {
    if (!confirm(`确定卸载 ${filename}？`)) return
    setActionLoading(filename); setMessage('')
    try {
      const res = await fetch(`${API_BASE}/api/plugins/uninstall`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      })
      const data = await res.json()
      setMessage(data.success ? data.message : (data.error || '卸载失败'))
      if (data.success) { fetchPlugins(); fetchTools() }
    } catch (e: any) { setMessage(e.message || '网络错误') }
    finally { setActionLoading('') }
  }

  // 按层级过滤
  const filteredTools = tools.filter(t => t.tier === activeTier)

  // 按功能分类分组
  const grouped = filteredTools.reduce<Record<string, ToolInfo[]>>((acc, tool) => {
    const cat = tool.category || '其他'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(tool)
    return acc
  }, {})

  const categoryOrder = ['资产', '扫描', '几何', '贴图', '命名', '审核', '分析', '规范', '记忆', '配置', '入库', '渲染', '其他']
  const sortedCategories = categoryOrder.filter(c => grouped[c])

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
      {/* 消息提示 */}
      {message && (
        <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground flex items-center gap-2">
          <AlertCircle size={14} /> {message}
          <button onClick={() => setMessage('')} className="ml-auto text-xs hover:underline">关闭</button>
        </div>
      )}

      {/* 层级 Tabs */}
      <div className="flex gap-2 p-1 rounded-lg bg-muted/50">
        {TIER_ORDER.map(tierId => {
          const meta = TIER_LABELS[tierId]
          const count = tierSummary[tierId] || 0
          return (
            <button
              key={tierId}
              onClick={() => setActiveTier(tierId)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTier === tierId
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {meta.icon}
              <span>{meta.label}</span>
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{count}</span>
            </button>
          )
        })}
      </div>

      {/* 当前层级说明 */}
      <p className="text-xs text-muted-foreground/70 -mt-4">
        {TIER_LABELS[activeTier]?.desc || ''}
      </p>

      {/* 核心工具 / 引擎扩展 / MCP 工具：按分类折叠显示 */}
      {activeTier !== 'plugin' && (
        <SettingsCard>
          {sortedCategories.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground/60">当前层级无工具</div>
          )}
          {sortedCategories.map((category) => {
            const isExpanded = expandedCats.has(category)
            const categoryTools = grouped[category] || []
            return (
              <React.Fragment key={category}>
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="text-sm font-medium">{category}</span>
                  </div>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{categoryTools.length}</span>
                </button>
                {isExpanded && (
                  <div className="border-t border-border/30">
                    {categoryTools.map(tool => (
                      <div key={tool.name} className="flex items-center justify-between px-4 py-2 pl-10 hover:bg-accent/20 transition-colors">
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-mono">{tool.name}</span>
                          {tool.description && (
                            <span className="text-xs text-muted-foreground ml-2">{tool.description}</span>
                          )}
                        </div>
                        <CheckCircle2 size={12} className="text-success shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </React.Fragment>
            )
          })}
        </SettingsCard>
      )}

      {/* 可选插件 —— 单独显示 */}
      {activeTier === 'plugin' && (
        <SettingsSection
          title="插件管理"
          description="安装和管理外部插件工具"
          action={
            available.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {installed.length} 已安装 · {available.filter(p => !p.installed).length} 可安装
              </span>
            )
          }
        >
          {installed.length > 0 && (
            <SettingsCard>
              {installed.map(filename => (
                <SettingsRow key={filename} label={filename} description="已安装" icon={<Archive size={16} />}>
                  <button
                    onClick={() => handleUninstall(filename)}
                    disabled={actionLoading === filename}
                    className="flex items-center gap-1 text-xs text-destructive hover:underline disabled:opacity-50"
                  >
                    {actionLoading === filename ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    卸载
                  </button>
                </SettingsRow>
              ))}
            </SettingsCard>
          )}
          {available.filter(p => !p.installed).length > 0 && (
            <SettingsCard>
              {available.filter(p => !p.installed).map(plugin => (
                <SettingsRow key={plugin.filename} label={plugin.filename} description="可安装" icon={<Download size={16} />}>
                  <button
                    onClick={() => handleInstall(plugin.filename)}
                    disabled={actionLoading === plugin.filename}
                    className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                  >
                    {actionLoading === plugin.filename ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                    安装
                  </button>
                </SettingsRow>
              ))}
            </SettingsCard>
          )}
          {installed.length === 0 && available.length === 0 && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
              暂无可用插件。将 .py 文件放入 tools/plugins_available/ 目录即可。
            </div>
          )}
        </SettingsSection>
      )}
    </div>
  )
}
