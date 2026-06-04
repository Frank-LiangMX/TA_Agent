/**
 * 工具管理（四层级：核心工具 / 引擎扩展 / MCP 工具 / 可选插件）
 */
import React, { useState, useEffect, useMemo } from 'react'
import {
  Wrench, Puzzle, Download, Trash2, Loader2, CheckCircle2,
  AlertCircle, ChevronDown, ChevronRight, Cpu, Box, Plug, Archive,
  Search, Info, Sparkles, Plug2, Layers,
} from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import { localApiFetch } from '@/lib/api'
import { useConfirm } from '@/hooks/useConfirm'

interface ToolInfo {
  name: string
  description: string
  category: string
  tier: 'core' | 'extension' | 'mcp' | 'plugin'
  enabled?: boolean
}

interface PluginInfo {
  filename: string
  installed: boolean
}

const TIER_LABELS: Record<string, { label: string; icon: React.ReactNode; desc: string; color: string; bg: string; bgActive: string; ring: string; chip: string }> = {
  core: {
    label: '核心工具', icon: <Cpu size={16} />, desc: '内置，启动即注册',
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-500/8 dark:bg-blue-400/10',
    bgActive: 'bg-blue-500/15 dark:bg-blue-400/20',
    ring: 'ring-blue-500/30',
    chip: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  },
  extension: {
    label: '引擎扩展', icon: <Box size={16} />, desc: 'Python 桥接，需要外部引擎配合',
    color: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-500/8 dark:bg-purple-400/10',
    bgActive: 'bg-purple-500/15 dark:bg-purple-400/20',
    ring: 'ring-purple-500/30',
    chip: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
  },
  mcp: {
    label: 'MCP 管理', icon: <Plug size={16} />, desc: '内置：列出 MCP 注册工具。外部服务器请到 MCP 服务器页',
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-500/8 dark:bg-emerald-400/10',
    bgActive: 'bg-emerald-500/15 dark:bg-emerald-400/20',
    ring: 'ring-emerald-500/30',
    chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
  plugin: {
    label: '可选插件', icon: <Archive size={16} />, desc: '按需安装的 Python 插件',
    color: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-500/8 dark:bg-orange-400/10',
    bgActive: 'bg-orange-500/15 dark:bg-orange-400/20',
    ring: 'ring-orange-500/30',
    chip: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  },
}

const TIER_ORDER = ['core', 'extension', 'mcp', 'plugin']

interface ToolSettingsProps {
  /** 工作台模式切换后递增，触发重新拉取工具列表 */
  refreshKey?: number
}

export function ToolSettings({ refreshKey = 0 }: ToolSettingsProps) {
  const { confirm, ConfirmUI } = useConfirm()
  const [tools, setTools] = useState<ToolInfo[]>([])
  const [tierSummary, setTierSummary] = useState<Record<string, number>>({})
  const [agentMode, setAgentMode] = useState<'ta' | 'general'>('ta')
  const [installed, setInstalled] = useState<string[]>([])
  const [available, setAvailable] = useState<PluginInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState('')
  const [message, setMessage] = useState('')
  const [activeTier, setActiveTier] = useState('core')
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [toolSearch, setToolSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchTools(), fetchPlugins()]).finally(() => setLoading(false))
  }, [refreshKey])

  const fetchTools = async () => {
    try {
      const res = await localApiFetch('/api/tools')
      const data = await res.json()
      const list: ToolInfo[] = data.tools || []
      setTools(list)
      setAgentMode(data.agentMode === 'general' ? 'general' : 'ta')
      const summary: Record<string, number> = data.tier_summary || {}
      if (!Object.keys(summary).length && list.length) {
        for (const t of list) {
          summary[t.tier] = (summary[t.tier] || 0) + 1
        }
      }
      setTierSummary(summary)
      setActiveTier((prev) => (summary[prev] ? prev : TIER_ORDER.find((id) => summary[id]) || 'core'))
    } catch {}
  }

  const fetchPlugins = async () => {
    try {
      const res = await localApiFetch('/api/plugins')
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
      const res = await localApiFetch('/api/plugins/install', {
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
    if (!await confirm(`确定卸载 ${filename}？`, { danger: true })) return
    setActionLoading(filename); setMessage('')
    try {
      const res = await localApiFetch('/api/plugins/uninstall', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      })
      const data = await res.json()
      setMessage(data.success ? data.message : (data.error || '卸载失败'))
      if (data.success) { fetchPlugins(); fetchTools() }
    } catch (e: any) { setMessage(e.message || '网络错误') }
    finally { setActionLoading('') }
  }

  // Hooks 必须在 early return 之前
  const filteredTools = useMemo(() => {
    return tools.filter(t => t.tier === activeTier).filter(t => {
      if (!toolSearch) return true
      const q = toolSearch.toLowerCase()
      return t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)
    })
  }, [tools, activeTier, toolSearch])

  const grouped = useMemo(() => {
    return filteredTools.reduce<Record<string, ToolInfo[]>>((acc, tool) => {
      const cat = tool.category || '其他'
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(tool)
      return acc
    }, {})
  }, [filteredTools])

  const categoryOrder = ['工作区', '资产', '扫描', '几何', '贴图', '命名', '审核', '分析', '规范', '记忆', '配置', '入库', '渲染', 'MCP', '其他']
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
        <div className="rounded-lg border border-foreground/10 bg-background p-3 text-sm flex items-center gap-2 shadow-[0_4px_12px_-4px_rgb(0_0%_0/0.08)]">
          <AlertCircle size={14} className="text-primary shrink-0" />
          <span className="text-foreground/80">{message}</span>
          <button onClick={() => setMessage('')} className="ml-auto text-xs text-muted-foreground hover:text-foreground">关闭</button>
        </div>
      )}

      {/* 顶部信息条 */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="text-xs text-muted-foreground">
          当前工作台：<span className="font-medium text-foreground">{agentMode === 'general' ? '通用模式' : 'TA 模式'}</span>
          ，共 {tools.length} 个工具
        </div>
      </div>

      {/* 层级 Tabs（4 个 metric 卡风格） */}
      <div className="grid grid-cols-4 gap-2">
        {TIER_ORDER.map(tierId => {
          const meta = TIER_LABELS[tierId]
          const count = tierSummary[tierId] || 0
          const isActive = activeTier === tierId
          return (
            <button
              key={tierId}
              onClick={() => setActiveTier(tierId)}
              className={`relative rounded-xl border p-3 text-left transition-all ${
                isActive
                  ? `${meta.bgActive} border-transparent ring-1 ${meta.ring} shadow-[0_2px_8px_-2px_rgb(0_0%_0/0.08)]`
                  : `border-foreground/10 bg-background hover:${meta.bg} hover:border-foreground/20`
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={meta.color}>{meta.icon}</span>
                <span className={`text-xs font-medium ${isActive ? 'text-foreground' : 'text-foreground/85'}`}>{meta.label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-sm font-semibold tabular-nums ${isActive ? meta.color : 'text-foreground/70'}`}>{count}</span>
                <span className="text-[10px] text-muted-foreground">个</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* 当前层级说明 */}
      <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground/80">
        <Info size={12} />
        <span>{TIER_LABELS[activeTier]?.desc || ''}</span>
      </div>

      {/* 工具级（核心/扩展/MCP） */}
      {activeTier !== 'plugin' && (
        <div className="rounded-xl border border-foreground/10 bg-background overflow-hidden shadow-[0_4px_12px_-4px_rgb(0_0%_0/0.08),inset_0_1px_0_0_rgb(255_255_255/0.4)]">
          {/* 搜索框 + 全部展开/折叠 */}
          <div className="px-3 py-2.5 border-b border-border/40 flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={toolSearch}
                onChange={(e) => setToolSearch(e.target.value)}
                placeholder="搜索工具名或描述..."
                className="w-full pl-7 pr-3 py-1.5 text-xs bg-muted/40 border border-border/40 rounded outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex items-center gap-1 ml-auto pl-2 border-l border-border/40">
              <button
                onClick={() => setExpandedCats(new Set(sortedCategories))}
                className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                全部展开
              </button>
              <span className="text-muted-foreground/40">/</span>
              <button
                onClick={() => setExpandedCats(new Set())}
                className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                全部折叠
              </button>
            </div>
          </div>

          {activeTier === 'mcp' && (
            <div className="px-4 py-2.5 text-xs text-muted-foreground border-b border-border/30 bg-muted/20">
              Playwright 等服务器注册的 <code className="font-mono">mcp__*</code> 工具不在此列表，请在设置 → <strong>MCP 服务器</strong> 中查看与管理。
            </div>
          )}

          {sortedCategories.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground/60">
              {toolSearch ? '没有匹配的工具' : '当前层级无工具'}
            </div>
          ) : (
            <div className="space-y-3">
              {sortedCategories.map((category) => {
                const isExpanded = expandedCats.has(category)
                const categoryTools = grouped[category] || []
                const tierMeta = TIER_LABELS[activeTier]
                return (
                  <div
                    key={category}
                    className="group/card relative rounded-xl border border-foreground/10 bg-background overflow-hidden shadow-[0_2px_8px_-3px_rgb(0_0%_0/0.06)] hover:shadow-[0_4px_12px_-4px_rgb(0_0%_0/0.1)] hover:border-foreground/20 transition-all"
                  >
                    {/* 左侧主题色条 */}
                    <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${tierMeta.bgActive.replace('/15', '/40').replace('/20', '/40')}`} />

                    <button
                      onClick={() => toggleCategory(category)}
                      className="w-full flex items-center justify-between pl-4 pr-3.5 py-2.5 hover:bg-accent/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded
                          ? <ChevronDown size={14} className={`${tierMeta.color} opacity-70`} />
                          : <ChevronRight size={14} className="text-muted-foreground" />}
                        <span className="text-sm font-medium text-foreground/90">{category}</span>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded tabular-nums font-medium ${tierMeta.chip}`}>
                        {categoryTools.length}
                      </span>
                    </button>

                    {isExpanded && categoryTools.length > 0 && (
                      <div className="border-t border-border/30">
                        {categoryTools.map((tool, i) => (
                          <div
                            key={tool.name}
                            className={`flex items-center gap-3 pl-6 pr-4 py-2.5 ${
                              i < categoryTools.length - 1 ? 'border-b border-border/10' : ''
                            }`}
                          >
                            <span className="relative flex items-center justify-center w-[18px] h-[18px] rounded-full bg-gradient-to-br from-emerald-400/20 to-emerald-500/10 dark:from-emerald-400/25 dark:to-emerald-500/10 ring-1 ring-emerald-500/20 dark:ring-emerald-400/30 shrink-0">
                              <CheckCircle2 size={10} className="text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
                            </span>

                            <span className="text-[13px] font-mono text-foreground/90 font-medium tracking-tight shrink-0">
                              {tool.name}
                            </span>

                            {tool.description && (
                              <span className="hidden sm:inline-block flex-shrink-0 w-6 border-t border-dashed border-foreground/15" />
                            )}

                            {tool.description && (
                              <span className="text-[12px] text-muted-foreground/75 truncate min-w-0 flex-1 leading-relaxed">
                                {tool.description}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 插件管理 */}
      {activeTier === 'plugin' && (
        <SettingsSection
          title="插件管理"
          description="安装和管理外部插件工具"
          action={
            available.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                {installed.length} 已安装 · {available.filter(p => !p.installed).length} 可安装
              </span>
            ) : null
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
            <div className="rounded-lg border border-foreground/10 bg-background p-3 text-sm text-muted-foreground">
              暂无可用插件。将 .py 文件放入 tools/plugins_available/ 目录即可。
            </div>
          )}
        </SettingsSection>
      )}
      {ConfirmUI}
    </div>
  )
}
