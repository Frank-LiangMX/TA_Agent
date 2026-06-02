/**
 * 助手单轮回复（Proma 风格）：一条消息 + 按时间顺序的 segments。
 */

import type { ChatMessage, ToolCall } from '@/types'

export type TurnSegment =
  | { type: 'thinking'; text: string; live?: boolean }
  | { type: 'text'; text: string }
  | {
      type: 'tools'
      toolCalls: ToolCall[]
      status: 'running' | 'done'
      results: Record<string, string>
    }

export type AssistantTurnMessage = ChatMessage & {
  _turnOpen?: boolean
  _streaming?: boolean
  _thinkingLive?: boolean
  _startTime?: number
  _elapsed?: number
  _toolStatus?: 'running' | 'done'
  _toolResults?: Record<string, string>
  _thinking?: string
  segments?: TurnSegment[]
}

export function getTurnSegments(msg: AssistantTurnMessage): TurnSegment[] {
  if (msg.segments?.length) return msg.segments
  const segs: TurnSegment[] = []
  if ((msg as AssistantTurnMessage)._thinking) {
    segs.push({ type: 'thinking', text: (msg as AssistantTurnMessage)._thinking! })
  }
  if (msg.toolCalls?.length) {
    segs.push({
      type: 'tools',
      toolCalls: msg.toolCalls,
      status: (msg as AssistantTurnMessage)._toolStatus || 'done',
      results: (msg as AssistantTurnMessage)._toolResults || {},
    })
  }
  if (msg.content?.trim()) {
    segs.push({ type: 'text', text: msg.content })
  }
  return segs
}

/** 同步 content / _thinking 字段，便于复制与历史兼容 */
export function syncTurnDerivedFields(msg: AssistantTurnMessage): AssistantTurnMessage {
  const segments = getTurnSegments(msg)
  const thinkingParts = segments
    .filter((s): s is Extract<TurnSegment, { type: 'thinking' }> => s.type === 'thinking')
    .map((s) => s.text)
  const textParts = segments
    .filter((s): s is Extract<TurnSegment, { type: 'text' }> => s.type === 'text')
    .map((s) => s.text)
  const lastTools = [...segments].reverse().find((s) => s.type === 'tools') as
    | Extract<TurnSegment, { type: 'tools' }>
    | undefined

  return {
    ...msg,
    segments,
    _thinking: thinkingParts.length ? thinkingParts.join('\n\n') : undefined,
    content: textParts.length ? textParts[textParts.length - 1] : '',
    toolCalls: lastTools?.toolCalls,
    _toolStatus: lastTools?.status,
    _toolResults: lastTools?.results,
    _thinkingLive: segments.some((s) => s.type === 'thinking' && s.live),
  }
}

export function appendThinkingSegment(msg: AssistantTurnMessage, delta: string): AssistantTurnMessage {
  const segments = [...getTurnSegments(msg)]
  const last = segments[segments.length - 1]
  if (last?.type === 'thinking' && last.live) {
    segments[segments.length - 1] = { ...last, text: last.text + delta }
  } else {
    segments.push({ type: 'thinking', text: delta, live: true })
  }
  return syncTurnDerivedFields({
    ...msg,
    segments,
    _turnOpen: true,
    _streaming: true,
  })
}

export function appendTextSegment(msg: AssistantTurnMessage, delta: string): AssistantTurnMessage {
  const segments = [...getTurnSegments(msg)]
  const last = segments[segments.length - 1]
  if (last?.type === 'text') {
    segments[segments.length - 1] = { ...last, text: last.text + delta }
  } else {
    segments.push({ type: 'text', text: delta })
  }
  return syncTurnDerivedFields({
    ...msg,
    segments,
    _turnOpen: true,
    _streaming: true,
    _startTime: msg._startTime ?? Date.now(),
    _thinkingLive: false,
  })
}

export function appendToolStart(
  msg: AssistantTurnMessage,
  toolCall: ToolCall,
): AssistantTurnMessage {
  const segments = [...getTurnSegments(msg)].map((s) =>
    s.type === 'thinking' && s.live ? { ...s, live: false } : s,
  )
  const last = segments[segments.length - 1]
  if (
    last?.type === 'tools' &&
    last.toolCalls.length > 0 &&
    last.toolCalls[0].name === toolCall.name
  ) {
    segments[segments.length - 1] = {
      ...last,
      toolCalls: [...last.toolCalls, toolCall],
      status: 'running',
    }
  } else {
    segments.push({
      type: 'tools',
      toolCalls: [toolCall],
      status: 'running',
      results: {},
    })
  }
  return syncTurnDerivedFields({
    ...msg,
    segments,
    _turnOpen: true,
    _streaming: true,
  })
}

export function appendToolResult(
  msg: AssistantTurnMessage,
  toolCallId: string,
  result: string,
): AssistantTurnMessage {
  const segments = getTurnSegments(msg).map((s) => {
    if (s.type !== 'tools') return s
    if (!s.toolCalls.some((tc) => tc.id === toolCallId)) return s
    const results = { ...s.results, [toolCallId]: result }
    const allDone = s.toolCalls.every((tc) => results[tc.id])
    const status: 'running' | 'done' = allDone ? 'done' : 'running'
    return { ...s, results, status }
  })
  return syncTurnDerivedFields({ ...msg, segments })
}

export function finalizeTurn(
  msg: AssistantTurnMessage,
  answerText: string,
  thinkingFromServer?: string,
): AssistantTurnMessage {
  let segments = getTurnSegments(msg).map((s) =>
    s.type === 'thinking' && s.live ? { ...s, live: false } : s,
  )

  if (thinkingFromServer) {
    const hasThinking = segments.some((s) => s.type === 'thinking')
    if (!hasThinking) {
      segments = [{ type: 'thinking', text: thinkingFromServer }, ...segments]
    }
  }

  if (answerText.trim()) {
    const last = segments[segments.length - 1]
    if (last?.type === 'text') {
      segments[segments.length - 1] = { ...last, text: answerText }
    } else {
      segments.push({ type: 'text', text: answerText })
    }
  }

  return syncTurnDerivedFields({
    ...msg,
    segments,
    _turnOpen: false,
    _streaming: false,
    _thinkingLive: false,
  })
}

export type IndexedSegment = { segment: TurnSegment; index: number }

/** 将 segments 拆为 Activity（思考/工具/中间说明）与最终回复 */
export function splitActivityAndResponse(
  segments: TurnSegment[],
  isTurnActive: boolean,
): { activity: IndexedSegment[]; response: IndexedSegment[] } {
  const indexed = segments.map((segment, index) => ({ segment, index }))
  const textIndices = segments
    .map((s, i) => (s.type === 'text' && s.text.trim() ? i : -1))
    .filter((i) => i >= 0)

  if (textIndices.length === 0) {
    return { activity: indexed, response: [] }
  }

  const lastTextIdx = textIndices[textIndices.length - 1]!
  const lastSeg = segments[segments.length - 1]

  if (isTurnActive && lastSeg?.type !== 'text') {
    return { activity: indexed, response: [] }
  }

  if (lastTextIdx === 0 && segments.length === 1) {
    return { activity: [], response: indexed }
  }

  return {
    activity: indexed.slice(0, lastTextIdx),
    response: indexed.slice(lastTextIdx),
  }
}

export function buildActivitySummary(activity: IndexedSegment[]): string {
  let thinkRounds = 0
  let toolCalls = 0
  let interimText = 0
  for (const { segment } of activity) {
    if (segment.type === 'thinking') thinkRounds++
    else if (segment.type === 'tools') toolCalls += segment.toolCalls.length
    else if (segment.type === 'text') interimText++
  }
  const parts: string[] = []
  if (thinkRounds) parts.push(`${thinkRounds} 轮思考`)
  if (toolCalls) parts.push(`${toolCalls} 次工具`)
  if (interimText) parts.push(`${interimText} 段说明`)
  return parts.join(' · ')
}

export function createEmptyTurn(): AssistantTurnMessage {
  return {
    id: `asst-${Date.now()}`,
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    segments: [],
    _turnOpen: true,
    _streaming: true,
    _thinking: '',
  }
}
