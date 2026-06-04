import React, { useState, useCallback } from 'react'
import { RefreshCw, AlertCircle, CheckCircle2, Copy, Server, Wifi, Activity, Box, ChevronRight } from 'lucide-react'
import { SettingsSection, SettingsCard } from './primitives'
import {
  runConnectionDiagnostic,
  type ConnectionDiagnosticReport,
} from '@/lib/connection-diagnostic'

const SCENARIO_LABEL: Record<ConnectionDiagnosticReport['scenario'], string> = {
  'dev-web': '浏览器 dev（Vite）',
  'dev-electron': 'Electron dev',
  'packaged-electron': 'Electron 打包',
  unknown: '未知',
}

interface MetricCardProps {
  icon: React.ReactNode
  label: string
  status: 'ok' | 'warn' | 'fail'
  detail?: string
}

function MetricCard({ icon, label, status, detail }: MetricCardProps) {
  const colorMap = {
    ok: 'text-green-600 bg-green-500/10 border-green-500/20',
    warn: 'text-yellow-600 bg-yellow-500/10 border-yellow-500/20',
    fail: 'text-destructive bg-destructive/10 border-destructive/20',
  }
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border p-3 ${colorMap[status]}`}>
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium">{label}</div>
        {detail && <div className="text-[10px] text-muted-foreground truncate mt-0.5">{detail}</div>}
      </div>
    </div>
  )
}

export function ConnectionDiagnostics() {
  const [report, setReport] = useState<ConnectionDiagnosticReport | null>(null)
  const [loading, setLoading] = useState(false)

  const run = useCallback(async () => {
    setLoading(true)
    try {
      const r = await runConnectionDiagnostic()
      setReport(r)
      console.log('[ConnectionDiagnostic]', r)
    } finally {
      setLoading(false)
    }
  }, [])

  const copyReport = () => {
    if (!report) return
    navigator.clipboard?.writeText(JSON.stringify(report, null, 2))
  }

  const overallStatus = !report
    ? 'idle'
    : report.health.ok && report.config.aligned && report.websocket.status === 'connected' && report.sessions.ok
    ? 'ok'
    : report.health.ok || report.websocket.status === 'connected'
    ? 'warn'
    : 'fail'

  return (
    <SettingsSection
      title="连接诊断"
      description="检查 dev/打包、TA/通用 下前端与本地 Runtime 是否一致（联机模式仅提示）"
      action={
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-foreground/10 bg-background hover:bg-accent transition-colors"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? '检测中…' : '运行诊断'}
        </button>
      }
    >
      {!report ? (
        <SettingsCard>
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <Activity size={32} className="opacity-30 mb-2" />
            <p className="text-sm">点击「运行诊断」检查连接</p>
            <p className="text-xs mt-1 opacity-70">检测 API 地址、/health、工作台模式、WebSocket 与会话 API</p>
          </div>
        </SettingsCard>
      ) : (
        <div className="space-y-3">
          {/* 状态总览条 */}
          <div className={`rounded-lg border p-3 flex items-center gap-3 ${
            overallStatus === 'ok'
              ? 'border-green-500/30 bg-green-500/5'
              : overallStatus === 'warn'
              ? 'border-yellow-500/30 bg-yellow-500/5'
              : 'border-destructive/30 bg-destructive/5'
          }`}>
            {overallStatus === 'ok' ? (
              <CheckCircle2 size={20} className="text-green-600 shrink-0" />
            ) : (
              <AlertCircle size={20} className="text-destructive shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">
                {overallStatus === 'ok' ? '所有连接正常' : '存在连接问题'}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {SCENARIO_LABEL[report.scenario]} · UI {report.uiAgentMode.toUpperCase()} ·{' '}
                {new Date(report.checkedAt).toLocaleTimeString()}
              </div>
            </div>
            <button
              type="button"
              onClick={copyReport}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <Copy size={12} />
              复制 JSON
            </button>
          </div>

          {/* 4 个 metric 卡片 */}
          <div className="grid grid-cols-2 gap-2">
            <MetricCard
              icon={<Activity size={16} />}
              label="/health"
              status={report.health.ok ? 'ok' : 'fail'}
              detail={report.endpoints.apiBase}
            />
            <MetricCard
              icon={<Box size={16} />}
              label="工作台模式对齐"
              status={report.config.aligned ? 'ok' : 'fail'}
              detail={report.health.data?.agentMode ? `后端 ${report.health.data.agentMode}` : undefined}
            />
            <MetricCard
              icon={<Wifi size={16} />}
              label="WebSocket"
              status={report.websocket.status === 'connected' ? 'ok' : 'fail'}
              detail={report.websocket.sessionId ? report.websocket.sessionId : report.websocket.status}
            />
            <MetricCard
              icon={<Server size={16} />}
              label="会话 API"
              status={report.sessions.ok ? 'ok' : 'fail'}
              detail={report.sessions.ok ? `${report.sessions.count ?? 0} 条` : report.sessions.error}
            />
          </div>

          {/* 端点信息 */}
          <SettingsCard divided={false}>
            <div className="px-4 py-3 space-y-1.5 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-12">API</span>
                <span className="truncate">{report.endpoints.apiBase}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-12">WS</span>
                <span className="truncate">{report.endpoints.wsUrl}</span>
              </div>
              {report.endpoints.ipc && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-12">IPC</span>
                  <span>port: {report.endpoints.ipc.port}</span>
                </div>
              )}
            </div>
          </SettingsCard>

          {/* 问题列表 */}
          {report.issues.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-destructive font-medium text-xs">
                <AlertCircle size={14} />
                发现 {report.issues.length} 个问题
              </div>
              <div className="space-y-1 text-xs pl-5">
                {report.issues.map((line, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <ChevronRight size={10} className="mt-1 shrink-0 text-destructive/60" />
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 说明 */}
          {report.hints.length > 0 && (
            <div className="rounded-lg border border-border/40 p-3 space-y-1.5">
              <div className="font-medium text-foreground text-xs">说明</div>
              <div className="space-y-1 text-xs text-muted-foreground pl-1">
                {report.hints.map((line, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <ChevronRight size={10} className="mt-1 shrink-0 opacity-60" />
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </SettingsSection>
  )
}
