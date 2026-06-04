/**
 * SubAgent 事件订阅器
 *
 * 在 app 启动时调用 subscribeSubAgentEvents(client) 一次，
 * 之后所有 subagent_* 事件会被分发到 jotai store。
 */
import type { TAgentClient } from '@/services/websocket'
import {
  upsertSubAgentStateAtom,
  updateSubAgentStateAtom,
  pushSubAgentToolAtom,
} from '@/atoms/subagent-store'
import { getDefaultStore } from 'jotai'

export function subscribeSubAgentEvents(client: TAgentClient): () => void {
  const store = getDefaultStore()

  const offStart = client.on('subagent_start', (payload: any) => {
    store.set(upsertSubAgentStateAtom, {
      task_id: payload.task_id,
      subagent_type: payload.subagent_type,
      description: payload.description,
      run_in_background: !!payload.run_in_background,
      status: 'running',
      started_at: Date.now(),
      step_count: 0,
      tools: [],
    })
  })

  const offTool = client.on('subagent_tool', (payload: any) => {
    store.set(pushSubAgentToolAtom, {
      taskId: payload.task_id,
      name: payload.tool_name,
      args_preview: payload.args_preview,
    })
  })

  const offProgress = client.on('subagent_progress', (payload: any) => {
    store.set(updateSubAgentStateAtom, {
      taskId: payload.task_id,
      patch: {
        step_count: payload.step_count,
        model: payload.model,
      },
    })
  })

  const offDone = client.on('subagent_done', (payload: any) => {
    store.set(updateSubAgentStateAtom, {
      taskId: payload.task_id,
      patch: {
        status: payload.status,
        result_preview: payload.result_preview,
        total_steps: payload.total_steps,
        total_tokens: payload.total_tokens,
      },
    })
  })

  const offLog = client.on('subagent_log', (payload: any) => {
    // 日志事件：当前仅 console 打印，后续可加 UI 折叠展示
    // eslint-disable-next-line no-console
    console.log(`[SubAgent ${payload.task_id} ${payload.level}]`, payload.message)
  })

  return () => {
    offStart()
    offTool()
    offProgress()
    offDone()
    offLog()
  }
}
