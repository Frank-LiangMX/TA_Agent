import type { SubAgentType } from '@/types'

const PHRASES: Record<SubAgentType, { label: string; loadingLabel: string }> = {
  explorer: { label: '探索代码结构', loadingLabel: '正在探索代码结构' },
  researcher: { label: '调研技术问题', loadingLabel: '正在调研' },
  'code-reviewer': { label: '审查代码', loadingLabel: '正在审查代码' },
}

const FALLBACK = { label: '委派子任务', loadingLabel: '正在委派子任务' }

export function getSubAgentPhrase(type: string): { label: string; loadingLabel: string } {
  return PHRASES[type as SubAgentType] || FALLBACK
}
