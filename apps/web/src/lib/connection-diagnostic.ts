/**
 * 前端 ↔ 本地 Runtime 连接诊断（dev / 打包 × TA / 通用）
 */

import { getApiBase, getWsUrl, getResolvedRuntimeEndpoint, resetRuntimeEndpointCache } from '@/lib/api'
import { getConfig } from '@/services/config'
import { tagentClient } from '@/services/websocket'
import type { RuntimeHealth } from '@/lib/runtime-ready'

export type DiagnosticScenario =
  | 'dev-web'
  | 'dev-electron'
  | 'packaged-electron'
  | 'unknown'

export type AgentModeUi = 'ta' | 'general'

export interface ConnectionDiagnosticReport {
  checkedAt: string
  scenario: DiagnosticScenario
  uiAgentMode: AgentModeUi
  appMode: 'local' | 'online'
  pageUrl: string
  isElectron: boolean
  isPackaged: boolean
  endpoints: {
    apiBase: string
    wsUrl: string
    preload?: { host: string; port: number; apiBase: string }
    ipc?: { host: string; port: number; apiBase: string }
  }
  health: {
    ok: boolean
    error?: string
    data?: RuntimeHealth
  }
  config: {
    uiAgentMode: AgentModeUi
    backendAgentMode?: string
    aligned: boolean
    syncRecommended: boolean
  }
  websocket: {
    status: string
    sessionId: string | null
    agentInFlight: boolean
  }
  sessions: {
    ok: boolean
    count?: number
    error?: string
  }
  issues: string[]
  hints: string[]
}

function detectScenario(isElectron: boolean): DiagnosticScenario {
  if (!isElectron) return 'dev-web'
  // 打包加载 file://，开发 Electron 加载 localhost:5175
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return 'packaged-electron'
  }
  if (isElectron) return 'dev-electron'
  return 'unknown'
}

export async function runConnectionDiagnostic(): Promise<ConnectionDiagnosticReport> {
  resetRuntimeEndpointCache()
  const issues: string[] = []
  const hints: string[] = []
  const isElectron = Boolean(
    typeof window !== 'undefined' && window.electronAPI?.isElectron,
  )
  const scenario = detectScenario(isElectron)
  const pageUrl = typeof window !== 'undefined' ? window.location.href : ''

  const config = await getConfig()
  const uiAgentMode: AgentModeUi =
    config.agent_mode === 'general' ? 'general' : 'ta'
  const appMode = config.cloud?.enabled ? 'cloud' : 'local'

  const apiBase = await getApiBase()
  const wsUrl = await getWsUrl()
  const resolved = await getResolvedRuntimeEndpoint()
  const preload = window.electronAPI?.runtimeEndpoint

  let ipc: ConnectionDiagnosticReport['endpoints']['ipc']
  if (window.electronAPI?.getRuntimeEndpoint) {
    try {
      const ep = await window.electronAPI.getRuntimeEndpoint()
      ipc = { host: ep.host, port: ep.port, apiBase: ep.apiBase }
      if (ipc.apiBase !== apiBase) {
        issues.push(
          `preload 与解析后的 API 不一致：preload=${preload?.apiBase}，resolved=${apiBase}`,
        )
      }
    } catch (e) {
      issues.push(`无法读取 IPC runtime-endpoint：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (scenario === 'dev-web' && !pageUrl.includes('localhost') && !pageUrl.includes('127.0.0.1')) {
    hints.push('dev-web 通过当前页面 hostname 拼后端地址，非本机访问时需保证 8080 可达')
  }

  if (scenario === 'dev-electron') {
    hints.push('dev-electron：后端需由 dev-electron.bat / run-backend.bat 启动，注意 TAGENT_RUNTIME_PORT 与前端一致')
    if (preload && ipc && preload.port !== ipc.port) {
      issues.push(
        `Electron 端口不一致：preload 快照 port=${preload.port}，IPC 当前 port=${ipc.port}（建议重启客户端）`,
      )
    }
  }

  if (scenario === 'packaged-electron') {
    hints.push('打包模式：后端由 Electron 拉起，切换 TA/通用 会重启 TAgent.exe 并注入 TAGENT_AGENT_MODE')
    if (apiBase.includes(':8080') && ipc && ipc.port !== 8080) {
      issues.push('API 仍指向 8080，但 Electron 实际 Runtime 端口可能已变化，请确认 preload/IPC 端口')
    }
  }

  let health: ConnectionDiagnosticReport['health'] = { ok: false }
  if (appMode === 'online') {
    health = { ok: false, error: '当前为联机模式，未检测本地 Runtime' }
    hints.push('联机模式走 online.server_host，本诊断仅覆盖本地 Runtime')
  } else {
    try {
      const res = await fetch(`${apiBase}/health`, { signal: AbortSignal.timeout(4000) })
      if (!res.ok) {
        health = { ok: false, error: `HTTP ${res.status}` }
        issues.push(`本地 /health 失败：${apiBase}/health → ${res.status}`)
      } else {
        const data = (await res.json()) as RuntimeHealth
        if (data.app !== 'TAgentLocalRuntime') {
          health = { ok: false, error: `非 TAgent Runtime（app=${data.app}）` }
          issues.push(`端口 ${resolved.port} 上的服务不是 TAgent（app=${data.app}）`)
        } else {
          health = { ok: true, data }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      health = { ok: false, error: msg }
      issues.push(`无法访问 ${apiBase}/health：${msg}`)
      if (scenario === 'dev-electron') {
        hints.push('请先运行 scripts\\dev-electron.bat 或 scripts\\run-backend.bat')
      }
    }
  }

  const backendAgentMode = health.data?.agentMode
  const aligned =
    !backendAgentMode || backendAgentMode === uiAgentMode
  if (health.ok && !aligned) {
    issues.push(
      `工作台不一致：界面为「${uiAgentMode}」，后端 /health 为「${backendAgentMode}」`,
    )
    if (scenario === 'packaged-electron') {
      hints.push('请到 设置 → 工作模式 再切换一次以触发后端重启，或重启应用')
    } else {
      hints.push('请重启 Python 后端，或设置环境变量 TAGENT_AGENT_MODE=' + uiAgentMode)
    }
  }

  let sessions: ConnectionDiagnosticReport['sessions'] = { ok: false }
  if (health.ok && aligned) {
    try {
      const res = await fetch(`${apiBase}/api/sessions?include_archived=false`, {
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) {
        sessions = { ok: false, error: `HTTP ${res.status}` }
        issues.push(`会话列表 API 失败：HTTP ${res.status}`)
      } else {
        const body = await res.json()
        sessions = { ok: true, count: Array.isArray(body.sessions) ? body.sessions.length : 0 }
      }
    } catch (e) {
      sessions = { ok: false, error: e instanceof Error ? e.message : String(e) }
      issues.push(`会话列表请求失败：${sessions.error}`)
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    scenario,
    uiAgentMode,
    appMode,
    pageUrl,
    isElectron,
    isPackaged: scenario === 'packaged-electron',
    endpoints: {
      apiBase,
      wsUrl,
      preload: preload
        ? { host: preload.host, port: preload.port, apiBase: preload.apiBase }
        : undefined,
      ipc,
    },
    health,
    config: {
      uiAgentMode,
      backendAgentMode,
      aligned,
      syncRecommended: health.ok && !aligned,
    },
    websocket: {
      status: tagentClient.status,
      sessionId: tagentClient.sessionId,
      agentInFlight: tagentClient.agentInFlight,
    },
    sessions,
    issues,
    hints,
  }
}
