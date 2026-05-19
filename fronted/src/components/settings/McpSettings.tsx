/**
 * MCP 服务器设置
 * 参考 Proma Agent mcp.json 格式配置外部 MCP 服务器
 */
import React, { useState, useEffect } from 'react'
import { Server, Plug, Wifi, WifiOff, Loader2, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
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

export function McpSettings() {
  const [servers, setServers] = useState<Record<string, McpServerStatus>>({})
  const [loading, setLoading] = useState(true)
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch(`${API_BASE}/api/mcp`)
      .then(r => r.json())
      .then(data => setServers(data.servers || {}))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const toggleExpand = (name: string) => {
    setExpandedServers(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const entries = Object.entries(servers)
  const enabledCount = entries.filter(([, s]) => s.enabled).length
  const connectedCount = entries.filter(([, s]) => s.connected).length
  const totalTools = entries.reduce((sum, [, s]) => sum + (s.tools || 0), 0)

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
      <SettingsSection
        title="MCP 服务器"
        description={
          entries.length > 0
            ? `${entries.length} 个服务器，${enabledCount} 个启用，${connectedCount} 个已连接，共 ${totalTools} 个工具`
            : '连接外部 MCP 服务器，扩展 Agent 能力'
        }
      >
        {entries.length === 0 && (
          <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground space-y-2">
            <p>暂无 MCP 服务器配置。</p>
            <p>在 <code className="text-xs bg-muted px-1 py-0.5 rounded">config.py</code> 的 <code className="text-xs bg-muted px-1 py-0.5 rounded">MCP_SERVERS</code> 中添加服务器，然后将 <code className="text-xs bg-muted px-1 py-0.5 rounded">enabled</code> 设为 <code className="text-xs bg-muted px-1 py-0.5 rounded">true</code> 即可启用。</p>
            <p className="text-xs">配置格式参照根目录 <code className="text-xs bg-muted px-1 py-0.5 rounded">mcp.json</code>。</p>
          </div>
        )}

        {entries.map(([name, server]) => {
          const isExpanded = expandedServers.has(name)
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
                      {server.command} {server.args?.join(' ')}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {server.enabled ? (
                    server.error ? (
                      <span className="flex items-center gap-1 text-xs text-destructive">
                        <AlertCircle size={12} />
                        异常
                      </span>
                    ) : server.connected ? (
                      <span className="flex items-center gap-1 text-xs text-success">
                        <Wifi size={12} />
                        {server.tools > 0 ? `${server.tools} 工具` : '已连接'}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-warning">
                        <Loader2 size={12} className="animate-spin" />
                        连接中
                      </span>
                    )
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
                      <WifiOff size={12} />
                      未启用
                    </span>
                  )}
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-border/30 px-4 py-3 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">类型</span>
                    <span>{server.type === 'stdio' ? '标准输入输出 (stdio)' : server.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">启动命令</span>
                    <span className="font-mono">{server.command} {server.args?.join(' ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">连接状态</span>
                    <span className={server.connected ? 'text-success' : server.error ? 'text-destructive' : 'text-muted-foreground'}>
                      {server.connected ? '已连接' : server.error || '未连接'}
                    </span>
                  </div>
                  {server.tools > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">注册工具</span>
                      <span>{server.tools} 个</span>
                    </div>
                  )}
                  {server.error && (
                    <div className="mt-2 rounded bg-destructive/10 border border-destructive/30 p-2 text-destructive">
                      {server.error}
                    </div>
                  )}
                </div>
              )}
            </SettingsCard>
          )
        })}
      </SettingsSection>

      <SettingsSection title="使用说明" description="MCP 服务器通过子进程通信，Agent 启动时自动连接已启用的服务器">
        <SettingsCard>
          <SettingsRow label="配置格式" description="在 config.py 的 MCP_SERVERS 中添加服务器配置" icon={<Plug size={16} />} />
          <div className="border-t border-border/50 px-4 py-3">
            <pre className="text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap">
{`{
  "server-name": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@package/name"],
    "enabled": true
  }
}`}
            </pre>
          </div>
          <div className="border-t border-border/50 px-4 py-3 space-y-1">
            <div className="text-xs text-muted-foreground">添加后设置 enabled: true 并重启 Agent 即可生效</div>
            <div className="text-xs text-muted-foreground">需要 <code className="text-xs bg-muted px-1 py-0.5 rounded">pip install mcp</code></div>
          </div>
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
