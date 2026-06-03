import { getApiBase } from './api'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface RuntimeHealth {
  status: string
  app?: string
  agentMode?: string
  version?: string
  runtime?: string
  ws_sessions?: number
}

export interface WaitRuntimeResult {
  /** Runtime 可达且为 TAgentLocalRuntime */
  ok: boolean
  health?: RuntimeHealth
  /** 后端 agentMode 与期望不一致（仍允许连接，由调用方决定是否重启） */
  agentModeMismatch: boolean
  expectedAgentMode?: 'ta' | 'general'
  actualAgentMode?: string
}

/** 等待本地 Runtime /health 就绪 */
export async function waitForLocalRuntime(options?: {
  expectedAgentMode?: 'ta' | 'general'
  timeoutMs?: number
  /** 为 true 时要求 agentMode 一致才返回 ok；默认 false，避免通用模式永远连不上 */
  strictAgentMode?: boolean
}): Promise<WaitRuntimeResult> {
  const timeoutMs = options?.timeoutMs ?? 20000
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    try {
      const baseUrl = await getApiBase()
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2500) })
      if (!res.ok) {
        await sleep(400)
        continue
      }
      const health = (await res.json()) as RuntimeHealth
      if (health.status !== 'ok' || health.app !== 'TAgentLocalRuntime') {
        await sleep(400)
        continue
      }
      const mismatch = Boolean(
        options?.expectedAgentMode &&
          health.agentMode &&
          health.agentMode !== options.expectedAgentMode,
      )
      if (options?.strictAgentMode && mismatch) {
        await sleep(400)
        continue
      }
      return {
        ok: true,
        health,
        agentModeMismatch: mismatch,
        expectedAgentMode: options?.expectedAgentMode,
        actualAgentMode: health.agentMode,
      }
    } catch {
      await sleep(400)
    }
  }
  return {
    ok: false,
    agentModeMismatch: false,
    expectedAgentMode: options?.expectedAgentMode,
  }
}
