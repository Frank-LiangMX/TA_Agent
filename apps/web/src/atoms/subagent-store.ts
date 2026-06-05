import { atom } from 'jotai'
import type { SubAgentState } from '@/components/agent/SubAgentCard'

/** 所有 in-flight + 最近完成的 subagent 状态 */
export const subagentStatesAtom = atom<Record<string, SubAgentState>>({})

/** upsert: 设置或更新一个 subagent 状态 */
export const upsertSubAgentStateAtom = atom(
  null,
  (get, set, state: SubAgentState) => {
    const cur = get(subagentStatesAtom)
    set(subagentStatesAtom, { ...cur, [state.task_id]: state })
  },
)

/** patch: 部分更新一个已有 subagent 状态 */
export const updateSubAgentStateAtom = atom(
  null,
  (get, set, payload: { taskId: string; patch: Partial<SubAgentState> }) => {
    const cur = get(subagentStatesAtom)
    const existing = cur[payload.taskId]
    if (!existing) return
    set(subagentStatesAtom, {
      ...cur,
      [payload.taskId]: { ...existing, ...payload.patch },
    })
  },
)

/** push tool: 追加一个嵌套工具调用 */
export const pushSubAgentToolAtom = atom(
  null,
  (get, set, payload: { taskId: string; name: string; args_preview: string }) => {
    const cur = get(subagentStatesAtom)
    const existing = cur[payload.taskId]
    if (!existing) return
    set(subagentStatesAtom, {
      ...cur,
      [payload.taskId]: {
        ...existing,
        tools: [...existing.tools, { name: payload.name, args_preview: payload.args_preview }],
      },
    })
  },
)

/** append streaming text: 追加子 agent LLM 实时流式输出片段（Proma 风格"打字机"） */
export const appendSubAgentTextAtom = atom(
  null,
  (get, set, payload: { taskId: string; delta: string }) => {
    const cur = get(subagentStatesAtom)
    const existing = cur[payload.taskId]
    if (!existing) return
    const prev = existing.streaming_text ?? ''
    // 限制累计长度，避免内存爆
    const next = (prev + payload.delta).slice(-4000)
    set(subagentStatesAtom, {
      ...cur,
      [payload.taskId]: { ...existing, streaming_text: next },
    })
  },
)
