/**
 * 流水线 API 服务
 */
import { API_BASE } from '@/lib/api'

export interface PipelineRun {
  runId: string
  stageId: string
  sessionId: string
  status: string
  startedAt: string
  toolsUsed?: string[]
  summary?: string
}

/** 获取指定会话的流水线执行记录 */
export async function fetchPipelineRunsForSession(sessionId: string): Promise<PipelineRun[]> {
  try {
    const res = await fetch(`${API_BASE}/api/pipeline/runs?sessionId=${encodeURIComponent(sessionId)}&limit=50`)
    const data = await res.json()
    return data.runs || []
  } catch {
    return []
  }
}
