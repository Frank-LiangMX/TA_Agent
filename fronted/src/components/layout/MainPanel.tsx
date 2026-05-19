/**
 * 中间主面板 - 对话视图（支持真实 WebSocket 和 Mock 双模式）
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Square, Wifi, WifiOff, Settings2, Trash2, Loader2, CheckCircle2, FolderSearch, Brain, FileCheck, Package } from 'lucide-react'
import { ChatMessage } from '../chat/ChatMessage'
import { ContextDivider } from '../chat/ContextDivider'
import { ScrollMinimap } from '../chat/ScrollMinimap'
import { AssetMentionPopover } from '../chat/AssetMentionPopover'
import { SessionSelector } from '../session/SessionSelector'
import { ThinkingDots, SkeletonBlock } from '../animations'
import { tagentClient, type ConnectionStatus } from '@/services/websocket'
import { getSessionMessages } from '@/services/sessions'
import { fetchPipelineRunsForSession, type PipelineRun } from '@/services/pipeline'
import type { ChatMessage as ChatMessageType, ToolCall } from '@/types'

interface ProgressEvent {
  phase: string
  current: number
  total: number
  detail: string
  elapsed: number
}

const phaseLabels: Record<string, string> = {
  scan: '目录扫描',
  textures: '贴图检查',
  assets: '资产扫描',
  mesh: '面数检查',
  naming: '命名检查',
  inference: 'AI 推断',
  storing: '数据存储',
  done: '完成',
}

/** 格式化耗时 */
function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m${s}s`
}

interface MainPanelProps {
  onAssetSelect: (asset: Record<string, unknown>) => void
}

// Mock 消息（未连接后端时使用）
const MOCK_MESSAGES: ChatMessageType[] = [
  {
    id: 'mock-1',
    role: 'assistant',
    content: '你好！我是 TAgent，游戏技术美术 AI 助手。\n\n我可以帮你：\n- **扫描资产目录** — 自动检测命名、面数、贴图规范\n- **分析资产身份** — AI 推断分类、材质、风格\n- **批量审核** — 快速审批或标记问题资产\n- **语义搜索** — 用自然语言查找资产\n\n请告诉我你需要做什么？',
    timestamp: Date.now() - 60000,
  },
]

export function MainPanel({ onAssetSelect }: MainPanelProps) {
  const [messages, setMessages] = useState<ChatMessageType[]>(MOCK_MESSAGES)
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(tagentClient.status)
  const [workflowMode, setWorkflowMode] = useState<'step_by_step' | 'auto'>('step_by_step')
  const [sessionId, setSessionId] = useState<string | null>(
    tagentClient.sessionId || localStorage.getItem('tagent-session-id')
  )
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const streamingMsgRef = useRef<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(50)
  const [contextCutoff, setContextCutoff] = useState<number | null>(null)
  const [activeTools, setActiveTools] = useState<Map<string, { name: string; startTime: number }>>(new Map())
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [sessionRefreshKey, setSessionRefreshKey] = useState(0)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionAssets, setMentionAssets] = useState<Array<{ id: string; name: string }>>([])
  const [isAtBottom, setIsAtBottom] = useState(true)

  // 持久化 sessionId（页面切换不丢失）
  useEffect(() => {
    if (sessionId) {
      localStorage.setItem('tagent-session-id', sessionId)
    } else {
      localStorage.removeItem('tagent-session-id')
    }
  }, [sessionId])

  // 切换会话：通过 RPC 切换，不断开连接
  const handleSessionChange = useCallback(async (newSessionId: string) => {
    setSessionId(newSessionId)
    setContextCutoff(null)
    streamingMsgRef.current = null
    setIsStreaming(false)
    setActiveTools(new Map())
    setProgress(null)

    // 先通过 RPC 切换后端会话
    try {
      const result = await tagentClient.switchSession(newSessionId)
      console.log('[Session] 后端已切换:', result)
    } catch (e) {
      console.error('[Session] 切换失败:', e)
    }

    // 异步加载历史消息
    try {
      const history = await getSessionMessages(newSessionId, 50)
      if (history.length > 0) {
        const converted: ChatMessageType[] = history
          .filter((msg: Record<string, unknown>) => {
            // 过滤 tool 消息和空内容 assistant 消息
            const role = msg.role as string
            if (role === 'tool') return false
            if (role === 'assistant' && !msg.content && !msg.toolCalls) return false
            return true
          })
          .map((msg: Record<string, unknown>, i: number) => {
            let toolCalls = msg.toolCalls as ToolCall[] | undefined
            if (toolCalls && Array.isArray(toolCalls)) {
              toolCalls = toolCalls.map((tc: any) => ({
                ...tc,
                arguments: typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments,
              }))
            }
            return {
              id: `hist-${newSessionId}-${i}`,
              role: (msg.role as string) || 'assistant',
              content: (msg.content as string) || '',
              timestamp: msg.timestamp ? new Date(msg.timestamp as string).getTime() : Date.now(),
              toolCalls,
            }
          })
        setMessages(converted)
        setVisibleCount(Math.max(converted.length, 50))
      } else {
        setMessages(MOCK_MESSAGES)
      }
    } catch (e) {
      console.error('[Session] 加载历史消息失败:', e)
      setMessages(MOCK_MESSAGES)
    }
  }, [])

  // 新建会话
  const handleNewSession = useCallback(() => {
    setSessionId(null)
    setMessages(MOCK_MESSAGES)
    setContextCutoff(null)
    streamingMsgRef.current = null
    setIsStreaming(false)
    // 断开让后端创建新会话
    tagentClient.disconnect()
    tagentClient.connect()
  }, [])

  // 滚到顶部加载更多 + 检测是否在底部
  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    if (el.scrollTop < 50) {
      setVisibleCount((prev) => Math.min(prev + 50, messages.length))
    }
    // 检测是否在底部（距离底部 50px 以内）
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
    setIsAtBottom(atBottom)
  }, [messages.length])

  // Ctrl+K 清除上下文快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        handleClearContext()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [messages.length, contextCutoff])

  // 监听其他页面发送的消息（如审核页）
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.content) {
        setMessages((prev) => [...prev, {
          id: `user-${Date.now()}`,
          role: 'user',
          content: detail.content,
          timestamp: Date.now(),
        }])
      }
    }
    window.addEventListener('tagent:user-message', handler)
    return () => window.removeEventListener('tagent:user-message', handler)
  }, [])

  // 新消息时保持最新 50 条
  useEffect(() => {
    if (messages.length <= 50) {
      setVisibleCount(messages.length)
    }
  }, [messages.length])

  // 滚动到底部（仅在用户已在底部时自动滚动）
  useEffect(() => {
    if (isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isAtBottom])

  // WebSocket 连接由 App 层管理，这里只订阅事件
  useEffect(() => {

    const unsubStatus = tagentClient.onStatusChange((status) => {
      setConnectionStatus(status)
    })

    // 连接确认：捕获后端分配的 sessionId
    const unsubConnected = tagentClient.on('connected', (payload: any) => {
      if (payload?.sessionId) {
        setSessionId(payload.sessionId)
      }
    })

    // 分析进度
    const unsubProgress = tagentClient.on('analysis_progress', (payload: any) => {
      setProgress(payload)
      // 完成后 3 秒自动隐藏
      if (payload.phase === 'done') {
        setTimeout(() => setProgress(null), 3000)
      }
    })

    // 流式文本
    const unsubText = tagentClient.on('stream_text', (payload: any) => {
      const { text } = payload
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        // 情况 1：追加到当前流式消息
        if (last && last.id === streamingMsgRef.current) {
          return [...prev.slice(0, -1), { ...last, content: last.content + text }]
        }
        // 情况 2：最后一条是 thinking 消息，替换为流式消息（保留思考内容）
        if (last && last.role === 'assistant' && !last.toolCalls && !(last as any)._toolStatus) {
          const id = `stream-${Date.now()}`
          streamingMsgRef.current = id
          const thinkingContent = last.content?.startsWith('💭') ? last.content : undefined
          return [...prev.slice(0, -1), { id, role: 'assistant', content: text, timestamp: Date.now(), _startTime: Date.now(), _thinking: thinkingContent }]
        }
        // 情况 3：创建新的流式消息
        const id = `stream-${Date.now()}`
        streamingMsgRef.current = id
        return [...prev, { id, role: 'assistant', content: text, timestamp: Date.now(), _startTime: Date.now() }]
      })
    })

    // Agent 思考（不设置 ref，让后续 stream 替换 thinking 消息）
    const unsubThinking = tagentClient.on('agent_thinking', (payload: any) => {
      if (streamingMsgRef.current) return  // 流式输出进行中，跳过
      const { text } = payload
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last && last.role === 'assistant' && !last.toolCalls && !(last as any)._toolStatus) {
          return [...prev.slice(0, -1), {
            ...last,
            content: `💭 *思考中...*\n\n${text}`,
          }]
        }
        return [...prev, {
          id: `think-${Date.now()}`,
          role: 'assistant',
          content: `💭 *思考中...*\n\n${text}`,
          timestamp: Date.now(),
        }]
      })
    })

    // 工具调用开始（同类工具合并到一条消息）
    const unsubToolStart = tagentClient.on('tool_start', (payload: any) => {
      const { toolCall } = payload
      setActiveTools((prev) => new Map(prev).set(toolCall.id, { name: toolCall.name, startTime: Date.now() }))
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        const newToolCall: ToolCall = {
          id: toolCall.id,
          name: toolCall.name,
          arguments: toolCall.arguments,
        }
        // 如果最后一条是同名工具消息（无论运行中还是已完成），合并进去
        if (
          last &&
          last.toolCalls &&
          last.toolCalls.length > 0 &&
          last.toolCalls[0].name === toolCall.name
        ) {
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              toolCalls: [...last.toolCalls, newToolCall],
              _toolStatus: 'running',
            },
          ]
        }
        // 否则创建新消息
        const id = `tool-${toolCall.id}`
        return [...prev, {
          id,
          role: 'assistant' as const,
          content: '',
          timestamp: Date.now(),
          toolCalls: [newToolCall],
          _toolStatus: 'running',
        } as any]
      })
      streamingMsgRef.current = null
    })

    // 工具调用结果（支持合并消息的独立结果）
    const unsubToolResult = tagentClient.on('tool_result', (payload: any) => {
      const { toolCallId, name, result } = payload
      setActiveTools((prev) => {
        const next = new Map(prev)
        next.delete(toolCallId)
        return next
      })
      setMessages((prev) => {
        return prev.map((msg: any) => {
          if (msg.toolCalls?.some((tc: ToolCall) => tc.id === toolCallId)) {
            const results = { ...(msg._toolResults || {}), [toolCallId]: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }
            const allDone = msg.toolCalls.every((tc: ToolCall) => results[tc.id])
            return {
              ...msg,
              _toolStatus: allDone ? 'done' : 'running',
              _toolResults: results,
              // 兼容单工具的 _toolResult
              _toolResult: msg.toolCalls.length === 1 ? results[toolCallId] : undefined,
            }
          }
          return msg
        })
      })
    })

    // 完成
    const unsubDone = tagentClient.on('done', (payload: any) => {
      const { content } = payload
      const streamId = streamingMsgRef.current
      streamingMsgRef.current = null
      setIsStreaming(false)
      setActiveTools(new Map())
      setProgress(null) // 兜底：清除进度条
      setSessionRefreshKey((k) => k + 1) // 刷新会话标题

      if (content) {
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          // 如果最后一条是流式消息，替换为完整内容 + 计算用时
          if (last && last.id === streamId) {
            const elapsed = (last as any)._startTime ? (Date.now() - (last as any)._startTime) / 1000 : null
            return [...prev.slice(0, -1), { ...last, content, _elapsed: elapsed }]
          }
          // 如果最后一条是工具消息，追加最终回答
          if (last && (last as any)._toolStatus) {
            return [...prev, {
              id: `done-${Date.now()}`,
              role: 'assistant' as const,
              content,
              timestamp: Date.now(),
            }]
          }
          // 其他情况：添加新消息
          return [...prev, {
            id: `done-${Date.now()}`,
            role: 'assistant' as const,
            content,
            timestamp: Date.now(),
          }]
        })
      }
    })

    // 错误
    const unsubError = tagentClient.on('error', (payload: any) => {
      const { error } = payload
      streamingMsgRef.current = null
      setIsStreaming(false)
      setActiveTools(new Map())
      setMessages((prev) => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant' as const,
        content: `❌ ${error}`,
        timestamp: Date.now(),
      }])
    })

    return () => {
      unsubStatus()
      unsubConnected()
      unsubProgress()
      unsubText()
      unsubThinking()
      unsubToolStart()
      unsubToolResult()
      unsubDone()
      unsubError()
      // 不断开 WebSocket，由 App 层管理连接
    }
  }, [])

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return

    let content = input.trim()

    // 如果有 @ 引用的资产，附加到消息末尾
    if (mentionAssets.length > 0) {
      const refs = mentionAssets.map((a) => `[资产: ${a.name} (${a.id})]`).join(' ')
      content += `\n\n${refs}`
      setMentionAssets([])
    }

    setInput('')
    setMentionQuery(null)
    setIsStreaming(true)
    streamingMsgRef.current = null

    // 添加用户消息
    const userMsg: ChatMessageType = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, userMsg])

    if (connectionStatus === 'connected') {
      // 真实模式：通过 WebSocket 发送
      try {
        await tagentClient.sendMessage(content, contextCutoff)
      } catch (e: any) {
        setIsStreaming(false)
        setMessages((prev) => [...prev, {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `❌ 发送失败: ${e.message}`,
          timestamp: Date.now(),
        }])
      }
    } else {
      // Mock 模式
      setTimeout(() => {
        const response = generateMockResponse(content)
        setMessages((prev) => [...prev, {
          id: `mock-${Date.now()}`,
          role: 'assistant',
          content: response,
          timestamp: Date.now(),
        }])
        setIsStreaming(false)
      }, 1500)
    }
  }, [input, isStreaming, connectionStatus])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isStreaming) {
        handleSend()
      }
    }
  }

  // 停止当前对话（断开重连以中断 Agent）
  const handleStop = useCallback(() => {
    streamingMsgRef.current = null
    setIsStreaming(false)
    // 断开并重连以中断后端 Agent
    tagentClient.disconnect()
    setTimeout(() => tagentClient.connect(sessionId || undefined), 500)
  }, [sessionId])

  const handleClear = async () => {
    if (connectionStatus === 'connected') {
      await tagentClient.clearHistory()
    }
    setMessages(MOCK_MESSAGES)
    setContextCutoff(null)
  }

  const handleClearContext = async () => {
    // 在最后一条消息后设置分割点
    setContextCutoff(messages.length)
    if (connectionStatus === 'connected') {
      try {
        await tagentClient.clearContext()
      } catch (e) {
        console.error('清除上下文失败:', e)
      }
    }
  }

  const handleRemoveDivider = () => {
    setContextCutoff(null)
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
      {/* 头部 */}
      <header className="h-14 flex items-center justify-between px-4 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-3">
          <SessionSelector
            sessionId={sessionId}
            onSessionChange={handleSessionChange}
            onNewSession={handleNewSession}
            refreshKey={sessionRefreshKey}
          />
          <ConnectionBadge status={connectionStatus} />
        </div>
        <div className="flex items-center gap-2">
          {/* 工作流模式切换 */}
          <select
            value={workflowMode}
            onChange={(e) => {
              const mode = e.target.value as 'step_by_step' | 'auto'
              setWorkflowMode(mode)
              if (connectionStatus === 'connected') {
                tagentClient.setMode(mode)
              }
            }}
            className="text-xs bg-muted border border-border rounded px-2 py-1 outline-none"
          >
            <option value="step_by_step">逐步模式</option>
            <option value="auto">自动模式</option>
          </select>
          <button
            onClick={handleClear}
            className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded hover:bg-muted"
            title="清除对话"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      <PipelineProgress sessionId={sessionId} />

      {/* 消息列表 */}
      <div className="flex-1 min-h-0 relative overflow-x-hidden">
      <div ref={listRef} onScroll={handleScroll} className="h-full overflow-y-auto overflow-x-hidden scrollbar-thin p-4 space-y-4">
        {messages.length > visibleCount && (
          <div className="text-center py-2">
            <button
              onClick={() => setVisibleCount((prev) => Math.min(prev + 50, messages.length))}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1 rounded-full bg-muted"
            >
              加载更早的消息（还有 {messages.length - visibleCount} 条）
            </button>
          </div>
        )}
        {messages.slice(-visibleCount).map((msg, i) => {
          const globalIndex = messages.length - visibleCount + i
          return (
            <React.Fragment key={msg.id}>
              {/* 上下文分割线位置 */}
              {contextCutoff !== null && globalIndex === contextCutoff && (
                <ContextDivider onDelete={handleRemoveDivider} />
              )}
              <div data-msg-index={globalIndex}>
                <ChatMessage
                  message={msg}
                  onAssetClick={onAssetSelect}
                  onSetDivider={() => setContextCutoff(globalIndex)}
                />
              </div>
            </React.Fragment>
          )
        })}
        {/* 分割线在所有消息之后 */}
        {contextCutoff !== null && contextCutoff >= messages.length && (
          <ContextDivider onDelete={handleRemoveDivider} />
        )}

        {/* 工具活动 + 分析进度（在滚动区内，随消息一起滚动） */}
        {(isStreaming || progress) && (
          <div className="py-2">
            {/* 分析进度条 */}
            {progress && (
              <div className="mb-2 rounded-lg bg-card p-3 shadow-card animate-in slide-in-from-top">
                <div className="flex items-center gap-2 mb-2">
                  {progress.phase === 'done' ? (
                    <CheckCircle2 size={14} className="text-success" />
                  ) : (
                    <Loader2 size={14} className="text-primary animate-spin" />
                  )}
                  <span className="text-xs font-medium">
                    {progress.phase === 'done' ? '分析完成' : `${phaseLabels[progress.phase] || progress.phase}`}
                  </span>
                  <span className="text-[11px] text-muted-foreground ml-auto">
                    {progress.current}/{progress.total}
                    {progress.elapsed > 0 && ` · ${formatElapsed(progress.elapsed)}`}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${progress.phase === 'done' ? 'bg-success' : 'bg-primary'}`}
                    style={{ width: `${progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%` }}
                  />
                </div>
                {progress.detail && progress.phase !== 'done' && (
                  <p className="text-[11px] text-muted-foreground mt-1 truncate">{progress.detail}</p>
                )}
              </div>
            )}
            {/* 工具活动指示器 */}
            {!progress && activeTools.size > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg animate-fade-in-up">
                <div className="flex gap-0.5">
                  <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-muted-foreground">
                  {Array.from(activeTools.values()).map(t => t.name).join(' → ')}
                </span>
              </div>
            )}
            {/* 思考中 */}
            {!progress && activeTools.size === 0 && !streamingMsgRef.current && (
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg">
                <ThinkingDots text="思考中..." />
              </div>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 消息导航 */}
      <ScrollMinimap
        messages={messages}
        scrollContainerRef={listRef}
        onJumpTo={(index) => {
          const el = listRef.current?.querySelector(`[data-msg-index="${index}"]`)
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }}
      />

      {/* 滚动到底部按钮 */}
      {!isAtBottom && isStreaming && (
        <button
          onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="absolute bottom-2 right-2 z-10 px-3 py-1.5 text-xs bg-card border border-border/50 rounded-full shadow-md hover:bg-accent transition-colors text-muted-foreground"
        >
          ↓ 新消息
        </button>
      )}
      </div>

      {/* 输入框 */}
      <div className="p-4 border-t border-border/50 overflow-x-hidden">
        <div className="relative">
          {isStreaming && (
            <div
              className="absolute left-0 right-0 bottom-0 h-16 rounded-b-xl animate-input-breathe pointer-events-none overflow-hidden"
              style={{
                background: 'linear-gradient(0deg, hsl(var(--primary) / 0.25) 0%, hsl(var(--primary) / 0.08) 60%, transparent 100%)',
                filter: 'blur(10px)',
              }}
            />
          )}
          <div className={`relative flex items-end gap-2 rounded-xl p-3 transition-all duration-300 ${isStreaming ? 'bg-primary/10 ring-1 ring-primary/40' : 'bg-muted'}`}>
          <textarea
            value={input}
            onChange={(e) => {
              const val = e.target.value
              setInput(val)
              // 检测 @ 提及
              const atMatch = val.match(/@([^\s@]*)$/)
              setMentionQuery(atMatch ? atMatch[1] : null)
            }}
            onKeyDown={(e) => {
              // 如果 mention 弹出框打开，让弹出框处理方向键和回车
              if (mentionQuery !== null && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter')) {
                return
              }
              handleKeyDown(e)
            }}
            placeholder={connectionStatus === 'connected'
              ? '输入消息... (Enter 发送, Shift+Enter 换行)'
              : '未连接后端，将以 Mock 模式响应...'
            }
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-sm placeholder:text-muted-foreground min-h-[24px] max-h-[120px]"
            style={{ height: 'auto' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement
              target.style.height = 'auto'
              target.style.height = Math.min(target.scrollHeight, 120) + 'px'
            }}
          />
          {/* @ 资产提及弹出框 */}
          {mentionQuery !== null && (
            <AssetMentionPopover
              query={mentionQuery}
              onSelect={(asset) => {
                // 替换 @query 为 @assetName
                setInput((prev) => prev.replace(/@[^\s@]*$/, `@${asset.name} `))
                setMentionQuery(null)
                setMentionAssets((prev) => [...prev, { id: asset.id, name: asset.name }])
              }}
              onClose={() => setMentionQuery(null)}
            />
          )}
          <button
            onClick={isStreaming ? handleStop : handleSend}
            disabled={!isStreaming && !input.trim()}
            className={`disabled:opacity-50 transition-colors p-1 rounded ${
              isStreaming
                ? 'text-destructive hover:bg-destructive/10'
                : 'text-muted-foreground hover:text-primary'
            }`}
          >
            {isStreaming ? <Square size={18} /> : <Send size={18} />}
          </button>
        </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          TAgent v0.1.0 · 游戏 TA AI Agent
          {connectionStatus !== 'connected' && ' · Mock 模式'}
          {contextCutoff !== null && ` · 上下文: ${messages.length - contextCutoff} 条消息`}
        </p>
      </div>
    </div>
  )
}

/** 连接状态徽章 */
function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const styles = {
    connected: 'bg-success/20 text-success',
    connecting: 'bg-warning/20 text-warning animate-pulse-status',
    disconnected: 'bg-muted text-muted-foreground',
  }
  const labels = {
    connected: '已连接',
    connecting: '连接中...',
    disconnected: '未连接',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${styles[status]}`}>
      {status === 'connected' ? <Wifi size={10} /> : <WifiOff size={10} />}
      {labels[status]}
    </span>
  )
}

function generateMockResponse(input: string): string {
  const lower = input.toLowerCase()
  if (lower.includes('扫描') || lower.includes('scan')) {
    return `好的，我来扫描资产目录。\n\n\`\`\`\n[工具调用] scan_directory({ path: "D:/Project/Assets" })\n\`\`\`\n\n扫描完成！发现 **24 个资产**：\n- 角色模型: 5\n- 武器道具: 8\n- 环境资产: 7\n- 纹理贴图: 4\n\n需要我对这些资产进行详细的命名和规范检查吗？`
  }
  if (lower.includes('分析') || lower.includes('analyze')) {
    return `开始资产分析...\n\n**阶段 1/6**: 扫描目录 ✓\n**阶段 2/6**: 提取几何信息...\n\n发现以下资产：\n\n| 文件名 | 类型 | 面数 |\n|--------|------|------|\n| SM_Chair.fbx | 静态网格 | 2,450 |\n| SK_Hero.fbx | 骨骼网格 | 28,000 |\n| T_Wood_D.png | 纹理 | - |\n\n需要继续 AI 推断分析吗？`
  }
  return `收到！你说的是："${input}"\n\n我是一个 Mock 响应。请启动 WebSocket 后端以获得真实功能。\n\n启动方式：\n\`\`\`\ncd F:\\Proma\\apps\\tagent-web\\server\npython server.py\n\`\`\``
}

/**
 * 对话页已完成阶段标签
 * 只展示当前会话已完成的阶段，不强求线性流程
 */
const STAGE_META: Record<string, { icon: React.ReactNode; label: string }> = {
  scan:    { icon: <FolderSearch size={12} />, label: '扫描' },
  analyze: { icon: <Brain size={12} />, label: '分析' },
  review:  { icon: <FileCheck size={12} />, label: '审核' },
  intake:  { icon: <Package size={12} />, label: '入库' },
}

function PipelineProgress({ sessionId }: { sessionId: string | null }) {
  const [done, setDone] = useState<string[]>([])
  const [running, setRunning] = useState<string[]>([])
  const mountRef = useRef<number>(0)

  useEffect(() => {
    if (!sessionId) { setDone([]); setRunning([]); return }

    mountRef.current = Date.now()
    let cancelled = false

    const check = async () => {
      const runs = await fetchPipelineRunsForSession(sessionId)
      if (cancelled) return
      const fresh = runs.filter(r => new Date(r.startedAt).getTime() >= mountRef.current - 1000)
      // 已完成：有 completed 状态记录的阶段
      const completedStages = [...new Set(fresh.filter(r => r.status === 'completed').map(r => r.stageId))]
      // 执行中：有 running 记录但尚未有 completed 记录的阶段
      const runningStages = [...new Set(fresh.filter(r => r.status === 'running').map(r => r.stageId))]
        .filter(id => !completedStages.includes(id))
      setDone(completedStages)
      setRunning(runningStages)
    }

    const timer = setTimeout(() => check(), 500)
    const interval = setInterval(check, 3000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [sessionId])

  // 没有任何活动时只占位
  if (done.length === 0 && running.length === 0) {
    return <div className="px-4 py-1.5 border-b border-border/30 bg-muted/20" />
  }

  return (
    <div className="px-4 py-1.5 border-b border-border/30 bg-muted/20">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="text-muted-foreground/40">流水线:</span>
        {/* 执行中 */}
        {running.map((id) => {
          const meta = STAGE_META[id]
          if (!meta) return null
          return (
            <span key={id} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-primary/10 text-primary font-medium animate-pulse">
              {meta.icon}
              {meta.label}
              <span className="w-1 h-1 rounded-full bg-primary animate-ping" />
            </span>
          )
        })}
        {/* 已完成 */}
        {done.map((id) => {
          const meta = STAGE_META[id]
          if (!meta) return null
          return (
            <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-foreground/[0.06] text-foreground font-medium">
              {meta.icon}
              {meta.label}
              <span className="text-success">✓</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
