/**
 * 聊天消息组件
 */

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { User, Bot, Wrench, Copy, Check, ChevronDown, ChevronRight, Loader2, Scissors, Activity } from 'lucide-react'
import { ToolResultRenderer } from '../tools/ToolResultRenderer'
import { SubAgentCard } from '../agent/SubAgentCard'
import type { ChatMessage as ChatMessageType, ToolCall } from '@/types'
import {
  getTurnSegments,
  splitActivityAndResponse,
  buildActivitySummary,
  type TurnSegment,
} from '@/lib/chat-turn'
import { Tooltip } from '@/components/ui/Tooltip'

interface ChatMessageProps {
  message: ChatMessageType & {
    _toolStatus?: 'running' | 'done'
    _toolResult?: string
  }
  onAssetClick?: (asset: Record<string, unknown>) => void
  onSetDivider?: () => void
  onStopSubAgent?: (taskId: string) => void
  onViewSubAgent?: (taskId: string) => void
}

export function ChatMessage({ message, onAssetClick, onSetDivider, onStopSubAgent, onViewSubAgent }: ChatMessageProps) {
  const [copied, setCopied] = React.useState(false)
  const [toolExpanded, setToolExpanded] = React.useState(false)
  const [showArgs, setShowArgs] = React.useState(false)
  const segments = message.role === 'assistant' ? getTurnSegments(message as any) : []
  const useSegments = segments.length > 0
  const isThinkingLive = !!((message as any)._thinkingLive || (message as any)._thinkingStreaming)
  const isTurnActive = !!(
    isThinkingLive ||
    (message as any)._streaming ||
    (message as any)._turnOpen
  )
  const [showThinking, setShowThinking] = React.useState(isThinkingLive)
  const [expandedThinkingSegs, setExpandedThinkingSegs] = React.useState<
    Record<number, boolean>
  >({})
  const [expandedToolSegs, setExpandedToolSegs] = React.useState<Record<number, boolean>>({})
  const [showArgsSegs, setShowArgsSegs] = React.useState<Record<number, boolean>>({})
  const [activityExpanded, setActivityExpanded] = React.useState(isTurnActive)
  const isUser = message.role === 'user'
  const hasTools = message.toolCalls && message.toolCalls.length > 0
  const hasLegacyActivity =
    !useSegments &&
    (!!(message as any)._thinking || (hasTools && message.toolCalls!.length > 0))

  React.useEffect(() => {
    if (isTurnActive) {
      setActivityExpanded(true)
      if (isThinkingLive) setShowThinking(true)
      return
    }
    setActivityExpanded(false)
    setShowThinking(false)
    setExpandedThinkingSegs({})
    setExpandedToolSegs({})
    setShowArgsSegs({})
  }, [isThinkingLive, isTurnActive])

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative">
      {onSetDivider && <ContextDividerHint onSetDivider={onSetDivider} />}
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse animate-msg-user' : 'animate-msg-assistant'}`}>
      <div className={`
        w-8 h-8 rounded-lg flex items-center justify-center shrink-0
        ${isUser ? 'bg-primary' : 'bg-secondary'}
      `}>
        {isUser ? (
          <User size={16} className="text-primary-foreground" />
        ) : (
          <Bot size={16} className="text-foreground" />
        )}
      </div>

      <div className={`flex-1 min-w-0 ${isUser ? 'text-right' : ''}`}>
        <div className={`
          inline-block text-left rounded-xl px-4 py-2.5 max-w-full animate-msg-pop
          ${isUser
            ? 'bg-primary/10 text-foreground'
            : ''
          }
        `}>
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          ) : useSegments ? (
            <AssistantSegmentsBody
              segments={segments}
              isTurnActive={isTurnActive}
              isThinkingLive={isThinkingLive}
              activityExpanded={activityExpanded}
              onToggleActivity={() => setActivityExpanded((v) => !v)}
              expandedThinkingSegs={expandedThinkingSegs}
              onToggleThinkingSeg={(i) =>
                setExpandedThinkingSegs((prev) => ({ ...prev, [i]: !prev[i] }))
              }
              expandedToolSegs={expandedToolSegs}
              onToggleToolSeg={(i) =>
                setExpandedToolSegs((prev) => ({ ...prev, [i]: !prev[i] }))
              }
              showArgsSegs={showArgsSegs}
              onToggleArgsSeg={(i) =>
                setShowArgsSegs((prev) => ({ ...prev, [i]: !prev[i] }))
              }
            />
          ) : (
            <>
              {hasLegacyActivity ? (
                <ActivityFold
                  expanded={activityExpanded}
                  onToggle={() => setActivityExpanded((v) => !v)}
                  isRunning={isTurnActive}
                  summary={(() => {
                    const legacyActivity: { segment: TurnSegment; index: number }[] = []
                    if ((message as any)._thinking) {
                      legacyActivity.push({
                        segment: { type: 'thinking', text: (message as any)._thinking },
                        index: 0,
                      })
                    }
                    if (hasTools) {
                      legacyActivity.push({
                        segment: {
                          type: 'tools',
                          toolCalls: message.toolCalls!,
                          status: (message as any)._toolStatus || 'done',
                          results: (message as any)._toolResults || {},
                        },
                        index: 1,
                      })
                    }
                    return buildActivitySummary(legacyActivity) || '思考与工具'
                  })()}
                >
                  <ThinkingBlock
                    thinking={(message as any)._thinking}
                    streaming={isThinkingLive}
                    show={showThinking || isThinkingLive}
                    onToggle={() => setShowThinking(!showThinking)}
                    nested
                  />
                  {hasTools && (
                    <ToolCallsSection
                      toolCalls={message.toolCalls!}
                      expanded={toolExpanded || isTurnActive}
                      onToggleExpanded={() => setToolExpanded(!toolExpanded)}
                      showArgs={showArgs}
                      onToggleArgs={() => setShowArgs(!showArgs)}
                      toolStatus={(message as any)._toolStatus}
                      toolResults={(message as any)._toolResults}
                      toolResult={(message as any)._toolResult}
                      nested
                    />
                  )}
                </ActivityFold>
              ) : (
                <ThinkingBlock
                  thinking={(message as any)._thinking}
                  streaming={isThinkingLive}
                  show={showThinking}
                  onToggle={() => setShowThinking(!showThinking)}
                />
              )}
              {message.content ? (
                <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-pre:my-2 prose-code:text-primary prose-headings:my-2">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                </div>
              ) : isThinkingLive && (message as any)._thinking && !hasLegacyActivity ? (
                <div className="rounded-lg bg-muted/35 px-3 py-2.5 text-sm text-muted-foreground">
                  <span className="text-xs opacity-70">等待正式回复…</span>
                </div>
              ) : isTurnActive && hasLegacyActivity && !message.content ? (
                <div className="rounded-lg bg-muted/35 px-3 py-2.5 text-sm text-muted-foreground">
                  <span className="text-xs opacity-70">等待正式回复…</span>
                </div>
              ) : null}
            </>
          )}

          {/* SubAgent 任务卡片（general mode 下 Agent 工具调用产生） */}
          {message.subAgentTasks && message.subAgentTasks.length > 0 && (
            <div className="mt-2 space-y-1">
              {message.subAgentTasks.map((s) => (
                <SubAgentCard
                  key={s.task_id}
                  state={s}
                  onStop={onStopSubAgent}
                  onViewDetails={onViewSubAgent}
                />
              ))}
            </div>
          )}
        </div>

        <div className={`flex items-center gap-2 mt-1 ${(message as any)._streaming ? 'invisible h-0 mt-0' : ''} ${isUser ? 'justify-end' : ''}`}>
          <span className="text-xs text-muted-foreground">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
          {!isUser && (message as any)._elapsed != null && (
            <span className="text-[11px] text-muted-foreground/60">
              {(message as any)._elapsed < 60
                ? `${Math.round((message as any)._elapsed)}s`
                : `${Math.floor((message as any)._elapsed / 60)}m${Math.round((message as any)._elapsed % 60)}s`
              }
            </span>
          )}
          <button
            onClick={handleCopy}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>
      </div>
    </div>
    </div>
  )
}

/** Hermes 风格 Activity：思考 + 工具 + 中间说明；最终回复在外层 */
function AssistantSegmentsBody({
  segments,
  isTurnActive,
  isThinkingLive,
  activityExpanded,
  onToggleActivity,
  expandedThinkingSegs,
  onToggleThinkingSeg,
  expandedToolSegs,
  onToggleToolSeg,
  showArgsSegs,
  onToggleArgsSeg,
}: {
  segments: TurnSegment[]
  isTurnActive: boolean
  isThinkingLive: boolean
  activityExpanded: boolean
  onToggleActivity: () => void
  expandedThinkingSegs: Record<number, boolean>
  onToggleThinkingSeg: (index: number) => void
  expandedToolSegs: Record<number, boolean>
  onToggleToolSeg: (index: number) => void
  showArgsSegs: Record<number, boolean>
  onToggleArgsSeg: (index: number) => void
}) {
  const { activity, response } = splitActivityAndResponse(segments, isTurnActive)
  const hasResponse = response.length > 0
  const activityRunning =
    isTurnActive &&
    activity.some(
      ({ segment }) =>
        (segment.type === 'thinking' && segment.live) ||
        (segment.type === 'tools' && segment.status === 'running'),
    )
  const summary =
    buildActivitySummary(activity) || (isTurnActive ? '处理中…' : '思考与工具')
  const waitingForAnswer =
    isTurnActive && !hasResponse && activity.length > 0

  const renderSegment = (
    { segment, index }: { segment: TurnSegment; index: number },
    nested: boolean,
  ) => {
    if (segment.type === 'thinking') {
      const streaming = !!segment.live
      const expanded = streaming || !!expandedThinkingSegs[index]
      return (
        <ThinkingBlock
          key={`think-${index}`}
          thinking={segment.text}
          streaming={streaming}
          show={expanded}
          onToggle={() => onToggleThinkingSeg(index)}
          nested={nested}
        />
      )
    }
    if (segment.type === 'tools') {
      return (
        <ToolCallsSection
          key={`tools-${index}`}
          toolCalls={segment.toolCalls}
          expanded={!!expandedToolSegs[index] || (nested && isTurnActive && segment.status === 'running')}
          onToggleExpanded={() => onToggleToolSeg(index)}
          showArgs={!!showArgsSegs[index]}
          onToggleArgs={() => onToggleArgsSeg(index)}
          toolStatus={segment.status}
          toolResults={segment.results}
          nested={nested}
        />
      )
    }
    if (segment.type === 'text' && segment.text.trim()) {
      return (
        <div
          key={`text-${index}`}
          className={`prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-pre:my-2 prose-code:text-primary prose-headings:my-2 ${
            nested ? 'text-sm opacity-90' : ''
          }`}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{segment.text}</ReactMarkdown>
        </div>
      )
    }
    return null
  }

  if (activity.length === 0) {
    return (
      <>
        {response.map((item) => renderSegment(item, false))}
        {waitingForAnswer && <WaitingForAnswerHint />}
      </>
    )
  }

  return (
    <>
      <ActivityFold
        expanded={activityExpanded}
        onToggle={onToggleActivity}
        isRunning={activityRunning || (isTurnActive && !hasResponse)}
        summary={summary}
      >
        {activity.map((item) => renderSegment(item, true))}
      </ActivityFold>
      {response.map((item) => renderSegment(item, false))}
      {waitingForAnswer && <WaitingForAnswerHint />}
    </>
  )
}

function WaitingForAnswerHint() {
  return (
    <div className="rounded-lg bg-muted/35 px-3 py-2.5 text-sm text-muted-foreground">
      <span className="text-xs opacity-70">等待正式回复…</span>
    </div>
  )
}

function ActivityFold({
  expanded,
  onToggle,
  isRunning,
  summary,
  children,
}: {
  expanded: boolean
  onToggle: () => void
  isRunning: boolean
  summary: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-lg border border-border/50 bg-muted/40 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
      >
        <Activity size={14} className="shrink-0 text-muted-foreground" />
        <span className="font-medium text-foreground/90">Activity</span>
        {isRunning && (
          <Loader2 size={12} className="shrink-0 animate-spin text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{summary}</span>
        <span className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {expanded && (
        <div className="mt-2 space-y-2 border-l-2 border-border/30 pl-3">
          {children}
        </div>
      )}
    </div>
  )
}

function ToolCallsSection({
  toolCalls,
  expanded,
  onToggleExpanded,
  showArgs,
  onToggleArgs,
  toolStatus,
  toolResults,
  toolResult,
  nested,
}: {
  toolCalls: NonNullable<ChatMessageType['toolCalls']>
  expanded: boolean
  onToggleExpanded: () => void
  showArgs: boolean
  onToggleArgs: () => void
  toolStatus?: 'running' | 'done'
  toolResults?: Record<string, string>
  toolResult?: string
  nested?: boolean
}) {
  const isRunning = toolStatus === 'running'
  const results = toolResults || {}
  const isGrouped = toolCalls.length > 1
  const firstToolCall = toolCalls[0]
  const toolName = firstToolCall?.name || 'tool'

  return (
    <div className={nested ? '' : 'mb-2'}>
      <button
        type="button"
        onClick={onToggleExpanded}
        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
          nested ? 'bg-muted/50 hover:bg-muted' : 'bg-muted hover:bg-accent'
        }`}
      >
        {isRunning ? (
          <Loader2 size={14} className="text-warning animate-spin" />
        ) : (
          <Wrench size={14} className="text-success" />
        )}
        <span className="font-mono font-medium">{toolName}</span>
        {isGrouped && (
          <span className="text-xs text-muted-foreground bg-muted-foreground/10 px-1.5 py-0.5 rounded">
            × {toolCalls.length}
          </span>
        )}
        {!isGrouped && (
            <span className="text-muted-foreground text-xs truncate">
            {formatArgs(firstToolCall?.arguments || {})}
          </span>
        )}
        <span className="ml-auto">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          {isGrouped ? (
            toolCalls.map((tc, i) => (
              <GroupedToolItem
                key={tc.id}
                toolCall={tc}
                index={i}
                result={results[tc.id]}
              />
            ))
          ) : (
            <>
              {firstToolCall && (results[firstToolCall.id] || toolResult) ? (
                <ToolResultRenderer
                  toolName={toolName}
                  result={results[firstToolCall.id] || toolResult || ''}
                />
              ) : (
                <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                  工具已执行完成
                </div>
              )}
              <button
                type="button"
                onClick={onToggleArgs}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showArgs ? '▾ 隐藏参数' : '▸ 查看参数'}
              </button>
              {showArgs && (
                <pre className="mt-1 bg-muted/50 rounded-lg p-3 text-xs overflow-x-auto">
                  {JSON.stringify(firstToolCall?.arguments || {}, null, 2)}
                </pre>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ThinkingBlock({
  thinking,
  streaming,
  show,
  onToggle,
  nested,
}: {
  thinking?: string
  streaming: boolean
  show: boolean
  onToggle: () => void
  nested?: boolean
}) {
  if (!thinking) return null
  const text = thinking.replace(/^💭 \*思考中\.\.\*\n\n/, '')
  const expanded = streaming || show

  return (
    <div
      className={
        streaming
          ? nested
            ? 'rounded-md bg-muted/30 px-2 py-1.5'
            : 'mb-2 rounded-lg bg-muted/35 px-3 py-2'
          : nested
            ? ''
            : 'mb-2'
      }
    >
      {streaming ? (
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">💭 思考中…</div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {show ? '▾' : '▸'} 💭 {nested ? '思考' : '思考过程'}
        </button>
      )}
      {expanded && (
        <div
          className={`pl-3 border-l-2 border-border/30 text-xs text-muted-foreground/85 prose prose-sm dark:prose-invert max-w-none prose-p:my-0.5 ${
            streaming ? 'max-h-72 overflow-y-auto scrollbar-thin' : ''
          }`}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}

function isPointerOverSessionUi(x: number, y: number) {
  return document.elementsFromPoint(x, y).some((el) => el.closest('[data-session-ui-root]'))
}

/** 上下文分割线入口：消息上方窄条悬停显示，失焦/滚动后收起 */
function ContextDividerHint({ onSetDivider }: { onSetDivider: () => void }) {
  const [visible, setVisible] = React.useState(false)
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const showTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPointer = React.useRef({ x: 0, y: 0 })

  const clearHideTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }

  const clearShowTimer = () => {
    if (showTimer.current) {
      clearTimeout(showTimer.current)
      showTimer.current = null
    }
  }

  const dismiss = React.useCallback(() => {
    clearShowTimer()
    clearHideTimer()
    setVisible(false)
  }, [])

  const scheduleShow = (e: React.MouseEvent) => {
    lastPointer.current = { x: e.clientX, y: e.clientY }
    clearHideTimer()
    clearShowTimer()
    showTimer.current = setTimeout(() => {
      const { x, y } = lastPointer.current
      if (isPointerOverSessionUi(x, y)) return
      setVisible(true)
    }, 80)
  }

  const scheduleHide = () => {
    clearShowTimer()
    clearHideTimer()
    hideTimer.current = setTimeout(() => setVisible(false), 120)
  }

  React.useEffect(() => () => {
    clearHideTimer()
    clearShowTimer()
  }, [])

  React.useEffect(() => {
    const onSessionUi = () => dismiss()
    window.addEventListener('session-ui-active', onSessionUi)
    return () => window.removeEventListener('session-ui-active', onSessionUi)
  }, [dismiss])

  // 滚动、点击外部、或指针移入会话列表区域时强制收起
  React.useEffect(() => {
    const onScroll = () => dismiss()
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-context-divider-zone]')) return
      if (target.closest('[data-session-ui-root]')) return
      dismiss()
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!visible) return
      if (isPointerOverSessionUi(e.clientX, e.clientY)) dismiss()
    }
    document.addEventListener('scroll', onScroll, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('pointermove', onPointerMove, true)
    return () => {
      document.removeEventListener('scroll', onScroll, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('pointermove', onPointerMove, true)
    }
  }, [dismiss, visible])

  return (
    <div
      data-context-divider-zone
      className="absolute -top-4 left-0 right-0 z-20 h-8"
      onMouseEnter={(e) => scheduleShow(e)}
      onMouseLeave={scheduleHide}
    >
      <div
        className={`flex items-center gap-1 pb-1 transition-opacity duration-150 ${
          visible ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div className="pointer-events-none flex-1 border-t border-dashed border-muted-foreground/30" />
        <Tooltip content="在此处插入上下文分割线">
          <button
            type="button"
            onClick={() => {
              dismiss()
              onSetDivider()
            }}
            className="group inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            aria-label="在此处插入上下文分割线"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-muted-foreground/30 bg-background text-muted-foreground transition-colors group-hover:border-primary/50 group-hover:text-primary">
              <Scissors size={11} strokeWidth={2} />
            </span>
          </button>
        </Tooltip>
        <div className="pointer-events-none flex-1 border-t border-dashed border-muted-foreground/30" />
      </div>
    </div>
  )
}

/** 格式化工具参数摘要 */
function formatArgs(args: unknown): string {
  if (!args) return '()'
  // 兼容字符串类型的 arguments（历史消息可能未解析）
  let obj: Record<string, unknown>
  if (typeof args === 'string') {
    try { obj = JSON.parse(args) } catch { return args.slice(0, 40) }
  } else if (typeof args === 'object') {
    obj = args as Record<string, unknown>
  } else {
    return String(args)
  }
  const entries = Object.entries(obj)
  if (entries.length === 0) return '()'
  const first = entries[0]
  if (entries.length === 1) {
    const val = typeof first![1] === 'string' ? first![1] : JSON.stringify(first![1])
    return `${first![0]}: ${val.length > 30 ? val.slice(0, 30) + '...' : val}`
  }
  return `${first![0]}: ..., +${entries.length - 1} 参数`
}

/** 分组工具的单个调用项 */
function GroupedToolItem({ toolCall, index, result }: { toolCall: ToolCall; index: number; result?: string }) {
  const [expanded, setExpanded] = React.useState(false)

  return (
    <div className="bg-muted/30 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-1.5 w-full text-left hover:bg-muted/50 transition-colors text-xs"
      >
        <span className="text-muted-foreground w-5 text-right">{index + 1}</span>
        <span className="font-mono truncate flex-1">{formatArgs(toolCall.arguments)}</span>
        {result ? (
          <span className="text-success text-[11px]">✓</span>
        ) : (
          <Loader2 size={10} className="text-muted-foreground animate-spin" />
        )}
        <span className="text-muted-foreground">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-1">
          {result && <ToolResultRenderer toolName={toolCall.name} result={result} />}
          <pre className="bg-muted/50 rounded p-2 text-[11px] overflow-x-auto text-muted-foreground">
            {JSON.stringify(toolCall.arguments, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
