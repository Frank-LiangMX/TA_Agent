import React, { useState, useCallback } from 'react'
import { RefreshCw, AlertCircle, CheckCircle2, Copy } from 'lucide-react'
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

function StatusLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {ok ? (
        <CheckCircle2 size={14} className="text-green-600 shrink-0" />
      ) : (
        <AlertCircle size={14} className="text-destructive shrink-0" />
      )}
      <span>{label}</span>
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

  return (
    <SettingsSection
      title="连接诊断"
      description="检查 dev/打包、TA/通用 下前端与本地 Runtime 是否一致（联机模式仅提示）"
      action={
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? '检测中…' : '运行诊断'}
        </button>
      }
    >
      <SettingsCard>
        {!report ? (
          <p className="text-xs text-muted-foreground px-1">
            点击「运行诊断」查看当前环境的 API 地址、/health、工作台模式、WebSocket 与会话 API。
          </p>
        ) : (
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">
                {SCENARIO_LABEL[report.scenario]} · UI {report.uiAgentMode.toUpperCase()} ·{' '}
                {new Date(report.checkedAt).toLocaleTimeString()}
              </span>
              <button
                type="button"
                onClick={copyReport}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <Copy size={12} />
                复制 JSON
              </button>
            </div>

            <StatusLine
              ok={report.health.ok}
              label={`/health ${report.endpoints.apiBase}/health`}
            />
            {report.health.data?.agentMode && (
              <div className="pl-5 text-muted-foreground">
                后端 agentMode={report.health.data.agentMode}
                {report.config.aligned ? '（与 UI 一致）' : '（与 UI 不一致）'}
              </div>
            )}
            <StatusLine ok={report.config.aligned} label="工作台模式对齐" />
            <StatusLine
              ok={report.websocket.status === 'connected'}
              label={`WebSocket ${report.websocket.status}${report.websocket.sessionId ? ` · ${report.websocket.sessionId}` : ''}`}
            />
            <StatusLine
              ok={report.sessions.ok}
              label={
                report.sessions.ok
                  ? `会话 API 正常（${report.sessions.count ?? 0} 条）`
                  : `会话 API 失败：${report.sessions.error || '未知'}`
              }
            />

            <div className="rounded-lg bg-muted/40 p-2 font-mono text-[10px] break-all space-y-1">
              <div>API: {report.endpoints.apiBase}</div>
              <div>WS: {report.endpoints.wsUrl}</div>
              {report.endpoints.ipc && (
                <div>IPC port: {report.endpoints.ipc.port}</div>
              )}
            </div>

            {report.issues.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 space-y-1">
                <div className="font-medium text-destructive">问题</div>
                {report.issues.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            )}
            {report.hints.length > 0 && (
              <div className="rounded-lg border border-border/60 p-2 space-y-1 text-muted-foreground">
                <div className="font-medium text-foreground">说明</div>
                {report.hints.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </SettingsCard>
    </SettingsSection>
  )
}
