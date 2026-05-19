/**
 * 工具管理（对接后端工具/插件 API）
 */

import React, { useState, useEffect } from 'react'
import { Wrench, Puzzle, Download, Trash2, Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import { API_BASE } from '@/lib/api'

interface ToolInfo {
  name: string
  description: string
  category: string
}

interface PluginInfo {
  filename: string
  installed: boolean
}

export function ToolSettings() {
  const [tools, setTools] = useState<ToolInfo[]>([])
  const [installed, setInstalled] = useState<string[]>([])
  const [available, setAvailable] = useState<PluginInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState('')
  const [message, setMessage] = useState('')
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([fetchTools(), fetchPlugins()]).finally(() => setLoading(false))
  }, [])

  const fetchTools = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/tools`)
      const data = await res.json()
      setTools(data.tools || [])
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
    setActionLoading(filename)
    setMessage('')
    try {
      const res = await fetch(`${API_BASE}/api/plugins/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      })
      const data = await res.json()
      setMessage(data.success ? data.message : (data.error || '安装失败'))
      if (data.success) fetchPlugins()
    } catch (e: any) { setMessage(e.message || '网络错误') }
    finally { setActionLoading('') }
  }

  const handleUninstall = async (filename: string) => {
    if (!confirm(`确定卸载插件 ${filename}？`)) return
    setActionLoading(filename)
    setMessage('')
    try {
      const res = await fetch(`${API_BASE}/api/plugins/uninstall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      })
      const data = await res.json()
      setMessage(data.success ? data.message : (data.error || '卸载失败'))
      if (data.success) fetchPlugins()
    } catch (e: any) { setMessage(e.message || '网络错误') }
    finally { setActionLoading('') }
  }

  // 按分类分组
  const grouped = tools.reduce<Record<string, ToolInfo[]>>((acc, tool) => {
    const cat = tool.category || '其他'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(tool)
    return acc
  }, {})

  const categoryOrder = ['资产', '扫描', '几何', '贴图', '命名', '审核', '分析', '规范', '记忆', '配置', '入库', '渲染', '其他']
  const sortedCategories = categoryOrder.filter((c) => grouped[c])

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
          <AlertCircle size={14} />
          {message}
          <button onClick={() => setMessage('')} className="ml-auto text-xs hover:underline">关闭</button>
        </div>
      )}

      {/* 内置工具 — 折叠分组 */}
      <SettingsSection title="内置工具" description={`共 ${tools.length} 个工具，按分类折叠展示`}>
        <SettingsCard>
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
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {categoryTools.length}
                  </span>
                </button>
                {isExpanded && (
                  <div className="border-t border-border/30">
                    {categoryTools.map((tool) => (
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
      </SettingsSection>

      {/* 插件管理 */}
      <SettingsSection
        title="插件管理"
        description="安装和管理外部插件工具"
        action={
          available.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {installed.length} 已安装 · {available.filter((p) => !p.installed).length} 可安装
            </span>
          )
        }
      >
        {/* 已安装插件 */}
        {installed.length > 0 && (
          <SettingsCard>
            {installed.map((filename) => (
              <SettingsRow key={filename} label={filename} description="已安装" icon={<Puzzle size={16} />}>
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

        {/* 可安装插件 */}
        {available.filter((p) => !p.installed).length > 0 && (
          <SettingsCard>
            {available.filter((p) => !p.installed).map((plugin) => (
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
            暂无可用插件。将 .py 插件文件放入 tools/plugins_available/ 目录即可。
          </div>
        )}
      </SettingsSection>
    </div>
  )
}
