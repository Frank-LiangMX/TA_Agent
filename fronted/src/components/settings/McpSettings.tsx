/**
 * MCP 服务器管理
 * 支持：查看状态、添加/删除/编辑服务器、启用/禁用、重新加载
 */
import React, { useState, useEffect } from 'react'
import {
  Server, Plug, Wifi, WifiOff, Loader2, AlertCircle, Plus, Trash2,
  RefreshCw, Check, X, ChevronDown, ChevronRight,
} from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import { API_BASE } from '@/lib/api'

interface McpServerStatus {
  type: string
  command: string
  args: string[]
  enabled: boolean
  connected: boolean
  tools: number
  error?: string | null
}

interface McpServerConfig {
  type: string
  command: string
  args: string[]
  env?: Record<string, string>
  enabled: boolean
}

export function McpSettings() {
  const [statuses, setStatuses] = useState<Record<string, McpServerStatus>>({})
  const [configs, setConfigs] = useState<Record<string, McpServerConfig>>({})
  const [loading, setLoading] = useState(true)
  const [reloading, setReloading] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showAdd, setShowAdd] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 添加表单
  const [formName, setFormName] = useState('')
  const [formCommand, setFormCommand] = useState('npx')
  const [formArgs, setFormArgs] = useState('-y @package/name')
  const [formEnv, setFormEnv] = useState('')  // KEY=value, 每行一个

  // 编辑表单
  const [editForm, setEditForm] = useState<Record<string, string>>({})

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [sr, cr] = await Promise.all([
      fetch(`${API_BASE}/api/mcp`).then(r => r.json()).catch(() => ({ servers: {} })),
      fetch(`${API_BASE}/api/mcp/servers`).then(r => r.json()).catch(() => ({ servers: {} })),
    ])
    setStatuses(sr.servers || {})
    setConfigs(cr.servers || {})
    setLoading(false)
  }

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; tools_count?: number; tools?: string[]; error?: string } | null>(null)

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleAdd = async () => {
    if (!formName.trim()) return
    const args = formArgs.trim().split(/\s+/).filter(Boolean)
    const env: Record<string, string> = {}
    if (formEnv.trim()) {
      formEnv.trim().split('\n').forEach(line => {
        const eqIdx = line.indexOf('=')
        if (eqIdx > 0) env[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim()
      })
    }
    const config: Record<string, unknown> = { type: 'stdio', command: formCommand, args, enabled: true }
    if (Object.keys(env).length > 0) config.env = env
    const res = await fetch(`${API_BASE}/api/mcp/servers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: formName.trim(), config }),
    }).then(r => r.json())
    if (res.success) {
      showMsg('success', `已添加 ${formName}`)
      setFormName(''); setFormCommand('npx'); setFormArgs(''); setFormEnv('')
      setShowAdd(false)
    } else {
      showMsg('error', res.error || '添加失败')
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    const args = formArgs.trim().split(/\s+/).filter(Boolean)
    const env: Record<string, string> = {}
    if (formEnv.trim()) {
      formEnv.trim().split('\n').forEach(line => {
        const eqIdx = line.indexOf('=')
        if (eqIdx > 0) env[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim()
      })
    }
    const config: Record<string, unknown> = { type: 'stdio', command: formCommand, args }
    if (Object.keys(env).length > 0) config.env = env
    const res = await fetch(`${API_BASE}/api/mcp/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    }).then(r => r.json())
    setTestResult(res)
    setTesting(false)
    if (res.success) {
      showMsg('success', `连接成功，发现 ${res.tools_count} 个工具`)
    } else {
      showMsg('error', res.error || '连接失败')
    }
  }

  const handleToggle = async (name: string, enabled: boolean) => {
    const res = await fetch(`${API_BASE}/api/mcp/servers/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }).then(r => r.json())
    if (res.success) {
      showMsg('success', enabled ? `${name} 已启用` : `${name} 已禁用`)
      fetchAll()
    } else {
      showMsg('error', res.error || '操作失败')
    }
  }

  const handleDelete = async (name: string) => {
    if (!confirm(`确定删除 MCP 服务器 "${name}"？`)) return
    const res = await fetch(`${API_BASE}/api/mcp/servers/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }).then(r => r.json())
    if (res.success) {
      showMsg('success', `已删除 ${name}`)
      fetchAll()
    } else {
      showMsg('error', res.error || '删除失败')
    }
  }

  const handleReload = async () => {
    setReloading(true)
    const res = await fetch(`${API_BASE}/api/mcp/reload`, { method: 'POST' }).then(r => r.json())
    if (res.success) {
      showMsg('success', `重新加载完成，${res.loaded_tools} 个工具已注册`)
    } else {
      showMsg('error', res.error || '重新加载失败')
    }
    setReloading(false)
    fetchAll()
  }

  const toggleExpand = (name: string) => {
    setExpanded(prev => { const next = new Set(prev); next.has(name) ? next.delete(name) : next.add(name); return next })
  }

  const entries = Object.entries(configs)
  const enabledCount = entries.filter(([, s]) => s.enabled).length
  const connectedCount = entries.filter(([name]) => statuses[name]?.connected).length
  const totalTools = entries.reduce((sum, [name]) => sum + (statuses[name]?.tools || 0), 0)

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
        <div className={`rounded-lg p-3 text-sm flex items-center gap-2 ${
          message.type === 'success' ? 'bg-success/10 text-success border border-success/30' : 'bg-destructive/10 text-destructive border border-destructive/30'
        }`}>
          {message.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* 概览 + 操作栏 */}
      <SettingsSection
        title="MCP 服务器"
        description={entries.length > 0
          ? `${entries.length} 个服务器 · ${enabledCount} 启用 · ${connectedCount} 已连接 · ${totalTools} 个工具`
          : '连接外部 MCP 服务器，扩展 Agent 能力'
        }
        action={
          <div className="flex items-center gap-2">
            {entries.length > 0 && (
              <button
                onClick={handleReload}
                disabled={reloading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                <RefreshCw size={14} className={reloading ? 'animate-spin' : ''} />
                重新加载
              </button>
            )}
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity"
            >
              <Plus size={14} />
              添加
            </button>
          </div>
        }
      >
        {/* 添加表单 */}
        {showAdd && (
          <SettingsCard divided={false} className="p-4 space-y-3 bg-accent/20 border border-border/50">
            <div className="text-sm font-medium text-foreground mb-1">添加 MCP 服务器</div>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">名称</label>
                <input
                  type="text" value={formName} onChange={e => setFormName(e.target.value)}
                  placeholder="sequential-thinking"
                  className="w-full px-3 py-1.5 text-sm bg-muted border border-border rounded-lg outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">命令</label>
                <input
                  type="text" value={formCommand} onChange={e => setFormCommand(e.target.value)}
                  placeholder="npx"
                  className="w-full px-3 py-1.5 text-sm bg-muted border border-border rounded-lg outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">参数（空格分隔）</label>
                <input
                  type="text" value={formArgs} onChange={e => setFormArgs(e.target.value)}
                  placeholder="-y @modelcontextprotocol/server-sequential-thinking"
                  className="w-full px-3 py-1.5 text-sm bg-muted border border-border rounded-lg outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">环境变量（可选，每行一个 KEY=value）</label>
                <textarea
                  value={formEnv} onChange={e => setFormEnv(e.target.value)}
                  placeholder="GITHUB_PERSONAL_ACCESS_TOKEN=gho_xxx"
                  rows={2}
                  className="w-full px-3 py-1.5 text-sm bg-muted border border-border rounded-lg outline-none focus:ring-1 focus:ring-ring resize-y font-mono"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button onClick={handleTest} disabled={testing || !formCommand.trim()} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm bg-muted hover:bg-accent disabled:opacity-50 transition-colors">
                {testing ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
                测试连接
              </button>
              <div className="flex-1" />
              <button onClick={() => { setShowAdd(false); setTestResult(null) }} className="px-4 py-1.5 rounded-lg text-sm bg-muted hover:bg-accent">
                取消
              </button>
              <button onClick={handleAdd} className="px-4 py-1.5 rounded-lg text-sm bg-foreground text-background hover:opacity-90">
                添加
              </button>
            </div>
            {/* 测试结果 */}
            {testResult && (
              <div className={`mt-3 rounded-lg p-3 text-sm border ${
                testResult.success ? 'bg-success/5 border-success/30' : 'bg-destructive/5 border-destructive/30'
              }`}>
                {testResult.success ? (
                  <div>
                    <div className="flex items-center gap-1.5 text-success mb-1.5">
                      <Check size={14} /> 连接成功，发现 {testResult.tools_count} 个工具
                    </div>
                    {testResult.tools && testResult.tools.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {testResult.tools.map(t => (
                          <code key={t} className="text-xs bg-muted px-1.5 py-0.5 rounded">{t}</code>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-start gap-1.5 text-destructive">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>{testResult.error}</span>
                  </div>
                )}
              </div>
            )}
          </SettingsCard>
        )}

        {/* 空状态 */}
        {entries.length === 0 && (
          <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground space-y-2">
            <p>暂无 MCP 服务器。</p>
            <p>点击右上角"添加"按钮添加第一个 MCP 服务器。配置格式：</p>
            <pre className="text-xs font-mono overflow-x-auto p-2 rounded bg-muted">{`{
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@package/name"],
  "enabled": true
}`}</pre>
            <p className="text-xs">需要 <code className="bg-muted px-1 py-0.5 rounded">pip install mcp</code></p>
          </div>
        )}
      </SettingsSection>

      {/* 服务器列表 */}
      {entries.map(([name, config]) => {
        const status = statuses[name] || {}
        const isExpanded = expanded.has(name)
        return (
          <SettingsCard key={name}>
            <button
              onClick={() => toggleExpand(name)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Server size={18} className="text-muted-foreground shrink-0" />
                <div className="text-left min-w-0">
                  <div className="text-sm font-medium truncate">{name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {config.command} {config.args?.join(' ')}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                {config.enabled ? (
                  status.error ? (
                    <span className="flex items-center gap-1 text-xs text-destructive">
                      <AlertCircle size={12} /> 异常
                    </span>
                  ) : status.connected ? (
                    <span className="flex items-center gap-1 text-xs text-success">
                      <Wifi size={12} /> {status.tools || 0} 工具
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <WifiOff size={12} /> 未连接
                    </span>
                  )
                ) : (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground/50">
                    <WifiOff size={12} /> 已禁用
                  </span>
                )}
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-border/30">
                <div className="px-4 py-3 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">类型</span>
                    <span>{config.type === 'stdio' ? '标准输入输出 (stdio)' : config.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">命令</span>
                    <span className="font-mono truncate max-w-[300px]">{config.command} {config.args?.join(' ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">连接状态</span>
                    <span className={status.connected ? 'text-success' : status.error ? 'text-destructive' : 'text-muted-foreground'}>
                      {config.enabled ? (status.connected ? '已连接' : status.error || '未连接') : '已禁用'}
                    </span>
                  </div>
                  {status.tools > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">注册工具</span>
                      <span>{status.tools} 个</span>
                    </div>
                  )}
                  {status.error && (
                    <div className="rounded bg-destructive/10 border border-destructive/30 p-2 text-destructive">{status.error}</div>
                  )}
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-t border-border/30 bg-muted/30">
                  <button
                    onClick={() => handleToggle(name, !config.enabled)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      config.enabled
                        ? 'bg-muted-foreground/20 text-muted-foreground hover:bg-muted-foreground/30'
                        : 'bg-success/20 text-success hover:bg-success/30'
                    }`}
                  >
                    {config.enabled ? '禁用' : '启用'}
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={() => handleDelete(name)}
                    className="flex items-center gap-1 px-3 py-1 rounded text-xs text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 size={12} />
                    删除
                  </button>
                </div>
              </div>
            )}
          </SettingsCard>
        )
      })}
    </div>
  )
}
