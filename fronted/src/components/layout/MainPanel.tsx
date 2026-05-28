/**
 * 中间主面板 - 对话视图（支持真实 WebSocket 和 Mock 双模式）
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Square, Wifi, WifiOff, Loader2, CheckCircle2, FolderSearch, Brain, FileCheck, Package, MessageSquare, Bot, Paperclip } from 'lucide-react'
import { ChatMessage } from '../chat/ChatMessage'
import { ContextDivider } from '../chat/ContextDivider'
import { ScrollMinimap } from '../chat/ScrollMinimap'
import { AssetMentionPopover } from '../chat/AssetMentionPopover'
import { ModelSelector } from './ModelSelector'
import { AttachmentPreview, type Attachment } from './AttachmentPreview'
import { SessionTabBar } from '../session/SessionTabBar'
import { ThinkingDots, SkeletonBlock } from '../animations'
import { tagentClient, type ConnectionStatus } from '@/services/websocket'
import { getSessionMessages, getSession } from '@/services/sessions'
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
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(tagentClient.status)
  const [thinkingEnabled, setThinkingEnabled] = useState(() => {
    return localStorage.getItem('tagent-thinking-enabled') === 'true'
  })
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ===== 多标签会话管理 =====
  const [openTabIds, setOpenTabIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('tagent-open-tabs') || '[]') } catch { return [] }
  })
  const [activeTabId, setActiveTabId] = useState<string | null>(
    tagentClient.sessionId || localStorage.getItem('tagent-active-tab') || openTabIds[0] || null
  )
  const [tabMessages, setTabMessages] = useState<Record<string, ChatMessageType[]>>({})
  const [tabTitles, setTabTitles] = useState<Record<string, string>>({})

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const streamingMsgRef = useRef<string | null>(null)
  const streamingMsgRefs = useRef<Record<string, string | null>>({})
  const [visibleCount, setVisibleCount] = useState(50)
  const [contextCutoff, setContextCutoff] = useState<number | null>(null)
  const [activeTools, setActiveTools] = useState<Map<string, { name: string; startTime: number }>>(new Map())
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [sessionRefreshKey, setSessionRefreshKey] = useState(0)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionAssets, setMentionAssets] = useState<Array<{ id: string; name: string }>>([])
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [streamingTabs, setStreamingTabs] = useState<Set<string>>(new Set())
  const [promptSuggestion, setPromptSuggestion] = useState<string | null>(null)

  // 当前标签的消息
  // Ref 保持 openTabIds 在事件回调中最新
  const openTabIdsRef = useRef(openTabIds)
  openTabIdsRef.current = openTabIds
  const activeTabIdRef = useRef(activeTabId)
  activeTabIdRef.current = activeTabId
  const tabMessagesRef = useRef(tabMessages)
  tabMessagesRef.current = tabMessages

  // 当前标签的消息（activeTabId 为 null 时显示空数组）
  const messages = activeTabId ? (tabMessages[activeTabId] || []) : []
  const sessionId = activeTabId
  const isActiveTabStreaming = activeTabId ? streamingTabs.has(activeTabId) : isStreaming
  const activeStreamingMsgId = activeTabId ? streamingMsgRefs.current[activeTabId] : streamingMsgRef.current
  const setMessagesForTab = useCallback((tabId: string | null | undefined, updater: ChatMessageType[] | ((prev: ChatMessageType[]) => ChatMessageType[])) => {
    if (!tabId) return
    setTabMessages(prev => {
      const current = prev[tabId] || []
      return { ...prev, [tabId]: typeof updater === 'function' ? updater(current) : updater }
    })
  }, [])
  const setMessages = useCallback((updater: ChatMessageType[] | ((prev: ChatMessageType[]) => ChatMessageType[])) => {
    setMessagesForTab(activeTabIdRef.current, updater)
  }, [setMessagesForTab])

  // 持久化 openTabs
  useEffect(() => {
    localStorage.setItem('tagent-open-tabs', JSON.stringify(openTabIds))
  }, [openTabIds])

  // 持久化 activeTab
  useEffect(() => {
    if (activeTabId) localStorage.setItem('tagent-active-tab', activeTabId)
  }, [activeTabId])

  useEffect(() => {
    if (!activeTabId || sessionRefreshKey === 0) return
    getSession(activeTabId).then(meta => {
      if (meta?.title) setTabTitles(prev => ({ ...prev, [activeTabId]: meta.title }))
    }).catch(() => {})
  }, [activeTabId, sessionRefreshKey])

const loadTabHistory = useCallback(async (tabId: string) => {
    try {
      const history = await getSessionMessages(tabId, 50)
      if (history.length > 0) {
        // 第一遍：收集工具结果。结构化 JSON 必须完整保留，否则历史回放会退化成纯文本/参数展示。
        const toolResults: Record<string, string> = {}
        history.forEach((msg: Record<string, unknown>) => {
          if (msg.role === 'tool' && msg.toolCallId) {
            const content = (msg.content as string) || ''
            try {
              JSON.parse(content)
              toolResults[msg.toolCallId as string] = content
            } catch {
              toolResults[msg.toolCallId as string] = content.length > 500
                ? content.slice(0, 500) + '...[已截断]'
                : content
            }
          }
        })

        // 第二遍：构建消息，关联工具结果
        const converted: ChatMessageType[] = history
          .filter((msg: Record<string, unknown>) => {
            const role = msg.role as string
            if (role === 'tool') return false
            if (role === 'assistant' && !msg.content && !msg.toolCalls) return false
            return true
          })
          .map((msg: Record<string, unknown>, i: number) => {
            let toolCalls = msg.toolCalls as any[] | undefined
            if (toolCalls && Array.isArray(toolCalls)) {
              toolCalls = toolCalls.map((tc: any) => {
                // 兼容两种格式：
                // 1. OpenAI 格式: { id, function: { name, arguments } }
                // 2. 简化格式: { id, name, arguments }
                const name = tc.name || tc.function?.name || ''
                const rawArgs = tc.arguments ?? tc.function?.arguments ?? '{}'
                const parsedArgs = typeof rawArgs === 'string' ? (() => {
                  try { return JSON.parse(rawArgs) } catch { return {} }
                })() : rawArgs
                return {
                  id: tc.id,
                  name,
                  arguments: parsedArgs,
                }
              })
            }
            // 关联工具结果摘要
            const _toolResults: Record<string, string> = {}
            if (toolCalls) {
              toolCalls.forEach((tc: ToolCall) => {
                if (toolResults[tc.id]) {
                  _toolResults[tc.id] = toolResults[tc.id]
                }
              })
            }
            return {
              id: `hist-${tabId}-${i}`,
              role: (msg.role as ChatMessageType['role']) || 'assistant',
              content: (msg.content as string) || '',
              timestamp: msg.timestamp ? new Date(msg.timestamp as string).getTime() : Date.now(),
              toolCalls,
              _toolResults,
            }
          })
        setTabMessages(prev => ({ ...prev, [tabId]: converted }))
        setVisibleCount(Math.max(converted.length, 50))
      } else {
        setTabMessages(prev => ({ ...prev, [tabId]: [] }))
      }
    } catch (e) {
      console.error('[Session] 加载历史消息失败:', e)
      setTabMessages(prev => ({ ...prev, [tabId]: [] }))
    }
  }, [])

  // ===== 标签操作 =====

  // 添加标签（打开一个会话）
  const _openTab = useCallback(async (tabId: string, fetchHistory: boolean) => {
    setOpenTabIds(prev => prev.includes(tabId) ? prev : [...prev, tabId])
    setActiveTabId(tabId)
    setContextCutoff(null)
    streamingMsgRef.current = null
    setIsStreaming(false)
    setActiveTools(new Map())
    setProgress(null)

    // 获取会话标题（在缓存检查之前，标题总是需要更新）
    try {
      const meta = await getSession(tabId)
      if (meta?.title) setTabTitles(prev => ({ ...prev, [tabId]: meta.title }))
    } catch {}

    // 通过 RPC 切换后端会话
    try {
      await tagentClient.switchSession(tabId)
    } catch (e) {
      console.error('[Session] 切换失败:', e)
    }

    // 如果已有缓存，后端切换完成后直接显示缓存
    if (tabMessages[tabId] && tabMessages[tabId].length > 0) {
      return
    }

    // 拉历史
    if (!fetchHistory) return
    await loadTabHistory(tabId)
  }, [tabMessages, loadTabHistory])

  // 选择标签（切换会话）
  const handleTabSelect = useCallback(async (tabId: string) => {
    if (tabId === activeTabId) return
    await _openTab(tabId, true)
  }, [_openTab, activeTabId])

  // 新建标签
  const handleNewTab = useCallback(() => {
    setContextCutoff(null)
    streamingMsgRef.current = null
    setIsStreaming(false)
    tagentClient.disconnect()
    tagentClient.connect()
    // WebSocket 连接后会分配 sessionId，在 onopen/onmessage 里处理
  }, [])

// 关闭标签
  const handleTabClose = useCallback((tabId: string) => {
    setOpenTabIds(prev => {
      const next = prev.filter(id => id !== tabId)
      // 如果关的是当前标签，切到相邻或设为 null（空白状态）
      if (tabId === activeTabId) {
        const idx = prev.indexOf(tabId)
        const switchTo = next[Math.min(idx, next.length - 1)] || null
        setActiveTabId(switchTo)
      }
      return next
    })
  }, [activeTabId])

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
        const newSessionId = payload.sessionId

        // 只保留当前连接的会话，清理旧的累积会话
        setOpenTabIds(prev => {
          // 如果已存在，不修改
          if (prev.includes(newSessionId)) return prev
          // 否则，只保留当前会话（清理旧的累积会话）
          return [newSessionId]
        })
        setActiveTabId(newSessionId)

        if (!tabMessagesRef.current[newSessionId]) {
          loadTabHistory(newSessionId)
        }

        // 异步加载标题
        if (payload.title) {
          setTabTitles(prev => ({ ...prev, [newSessionId]: payload.title }))
        } else {
          getSession(newSessionId).then(meta => {
            if (meta?.title) setTabTitles(prev => ({ ...prev, [newSessionId]: meta.title }))
          }).catch(() => {})
        }
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
      const { text, sessionId } = payload
      const targetTabId = sessionId || activeTabIdRef.current
      setMessagesForTab(targetTabId, (prev) => {
        const last = prev[prev.length - 1]
        const streamId = targetTabId ? streamingMsgRefs.current[targetTabId] : streamingMsgRef.current
        // 情况 1：追加到当前流式消息
        if (last && last.id === streamId) {
          return [...prev.slice(0, -1), { ...last, content: last.content + text, _streaming: true }]
        }
        // 情况 2：最后一条是 thinking 消息，替换为流式消息（保留思考内容）
        if (last && last.role === 'assistant' && !last.toolCalls && !(last as any)._toolStatus) {
          const id = `stream-${Date.now()}`
          streamingMsgRef.current = id
          if (targetTabId) streamingMsgRefs.current[targetTabId] = id
          const thinkingContent = last.content?.startsWith('💭') ? last.content : undefined
          return [...prev.slice(0, -1), { id, role: 'assistant', content: text, timestamp: Date.now(), _startTime: Date.now(), _thinking: thinkingContent, _streaming: true }]
        }
        // 情况 3：创建新的流式消息
        const id = `stream-${Date.now()}`
        streamingMsgRef.current = id
        if (targetTabId) streamingMsgRefs.current[targetTabId] = id
        return [...prev, { id, role: 'assistant', content: text, timestamp: Date.now(), _startTime: Date.now(), _streaming: true }]
      })
    })

    // Agent 思考（不设置 ref，让后续 stream 替换 thinking 消息）
    const unsubThinking = tagentClient.on('agent_thinking', (payload: any) => {
      const { text, sessionId } = payload
      const targetTabId = sessionId || activeTabIdRef.current
      if (targetTabId && streamingMsgRefs.current[targetTabId]) return  // 流式输出进行中，跳过
      setMessagesForTab(targetTabId, (prev) => {
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
      const { toolCall, sessionId } = payload
      const targetTabId = sessionId || activeTabIdRef.current
      setActiveTools((prev) => new Map(prev).set(toolCall.id, { name: toolCall.name, startTime: Date.now() }))
      setMessagesForTab(targetTabId, (prev) => {
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
      if (targetTabId) streamingMsgRefs.current[targetTabId] = null
    })

    // 工具调用结果（支持合并消息的独立结果）
    const unsubToolResult = tagentClient.on('tool_result', (payload: any) => {
      const { toolCallId, name, result, sessionId } = payload
      setActiveTools((prev) => {
        const next = new Map(prev)
        next.delete(toolCallId)
        return next
      })
      setMessagesForTab(sessionId || activeTabIdRef.current, (prev) => {
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

      // 联机模式：同步工具结果到服务器
      import('@/services/sync').then(({ syncToolResult }) => {
        syncToolResult(name, result).catch(err => {
          console.error('[Sync] 同步工具结果失败:', err)
        })
      })
    })

    // 完成
    const unsubDone = tagentClient.on('done', (payload: any) => {
      const { content, sessionId, suggestion } = payload
      console.log('[MainPanel] done event received:', { suggestion, sessionId })
      const currentTabId = sessionId || activeTabIdRef.current
      const streamId = currentTabId ? streamingMsgRefs.current[currentTabId] : streamingMsgRef.current
      streamingMsgRef.current = null
      if (currentTabId) streamingMsgRefs.current[currentTabId] = null
      setIsStreaming(false)
      setActiveTools(new Map())
      setProgress(null) // 兜底：清除进度条
      setSessionRefreshKey((k) => k + 1) // 刷新会话标题

      // 设置建议（如果有）
      if (suggestion) {
        setPromptSuggestion(suggestion)
      }

      // 联机模式：记录 LLM 用量（粗略估算）
      if (content) {
        const tokensEstimate = content.length * 2 // 粗略估算：中文约 2 token/字
        import('@/services/sync').then(({ logLlmUsage }) => {
          logLlmUsage('agent', tokensEstimate).catch(() => {})
        })
      }

      // 移除当前标签的运行状态
      if (currentTabId) {
        setStreamingTabs(prev => {
          const next = new Set(prev)
          next.delete(currentTabId)
          return next
        })
      }

      if (content) {
        setMessagesForTab(currentTabId, (prev) => {
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
      const { error, sessionId } = payload
      const currentTabId = sessionId || activeTabIdRef.current
      streamingMsgRef.current = null
      if (currentTabId) streamingMsgRefs.current[currentTabId] = null
      setIsStreaming(false)
      setActiveTools(new Map())
      // 移除当前标签的运行状态
      if (currentTabId) {
        setStreamingTabs(prev => {
          const next = new Set(prev)
          next.delete(currentTabId)
          return next
        })
      }
      setMessagesForTab(currentTabId, (prev) => [...prev, {
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
  }, [loadTabHistory, setMessagesForTab])

  const handleFilesSelected = useCallback((files: FileList | null) => {
    if (!files) return
    const newAttachments: Attachment[] = Array.from(files).map((file) => ({
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: file.name,
      size: file.size,
      type: file.type,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      _file: file,
    }))
    setAttachments((prev) => [...prev, ...newAttachments])
  }, [])

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const removed = prev.find((a) => a.id === id)
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter((a) => a.id !== id)
    })
  }, [])

  const handleSend = useCallback(async () => {
    const targetTabId = activeTabIdRef.current
    console.log('[handleSend] called', { input: input.trim(), targetTabId, streamingTabs: Array.from(streamingTabs) })

    if (!input.trim() || !targetTabId || streamingTabs.has(targetTabId)) {
      console.log('[handleSend] blocked', { hasInput: !!input.trim(), hasTab: !!targetTabId, isStreaming: streamingTabs.has(targetTabId) })
      return
    }

    let content = input.trim()

    // 清除建议
    setPromptSuggestion(null)

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
    streamingMsgRefs.current[targetTabId] = null
    // 标记当前标签为运行中
    setStreamingTabs(prev => new Set(prev).add(targetTabId))

    // 读取附件（图片转 base64）
    const imageAttachments: { name: string; data: string }[] = []
    const fileAttachments: { name: string; path: string }[] = []
    for (const att of attachments) {
      if (att.type.startsWith('image/') && att._file) {
        const file = att._file
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.readAsDataURL(file)
        })
        imageAttachments.push({ name: att.name, data: base64 })
      } else if (att._file) {
        fileAttachments.push({ name: att.name, path: att.name })
      }
    }
    // 清除附件
    attachments.forEach((a) => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl) })
    setAttachments([])

    // 添加用户消息
    const userMsg: ChatMessageType = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    setMessagesForTab(targetTabId, (prev) => [...prev, userMsg])

    if (connectionStatus === 'connected') {
      // 真实模式：通过 WebSocket 发送
      try {
        await tagentClient.sendMessage(content, contextCutoff, targetTabId, thinkingEnabled, imageAttachments.length > 0 ? imageAttachments : undefined, fileAttachments.length > 0 ? fileAttachments : undefined)
        setTimeout(() => setSessionRefreshKey((k) => k + 1), 300)
      } catch (e: any) {
        setIsStreaming(false)
        setStreamingTabs(prev => {
          const next = new Set(prev)
          next.delete(targetTabId)
          return next
        })
        setMessagesForTab(targetTabId, (prev) => [...prev, {
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
        setMessagesForTab(targetTabId, (prev) => [...prev, {
          id: `mock-${Date.now()}`,
          role: 'assistant',
          content: response,
          timestamp: Date.now(),
        }])
        setIsStreaming(false)
        setStreamingTabs(prev => {
          const next = new Set(prev)
          next.delete(targetTabId)
          return next
        })
      }, 1500)
    }
  }, [input, connectionStatus, mentionAssets, contextCutoff, streamingTabs, setMessagesForTab])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isActiveTabStreaming) {
        handleSend()
      }
    }
  }

  // 停止当前对话（断开重连以中断 Agent）
  const handleStop = useCallback(async () => {
    streamingMsgRef.current = null
    if (sessionId) streamingMsgRefs.current[sessionId] = null
    setIsStreaming(false)
    if (sessionId) {
      setStreamingTabs(prev => {
        const next = new Set(prev)
        next.delete(sessionId)
        return next
      })
    }
    // 发送中断消息（不断开连接）
    try {
      await tagentClient.stopGeneration()
    } catch {
      // 如果发送失败（连接已断），忽略
    }
  }, [sessionId])

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
      {/* 头部：标签栏 + 操作区 */}
      <div className="flex items-center justify-between px-4 shrink-0 border-b border-border/50 bg-card">
        <div className="flex items-center min-w-0 flex-1 h-9">
          <SessionTabBar
            openTabs={openTabIds}
            activeTabId={activeTabId}
            tabTitles={tabTitles}
            streamingTabs={streamingTabs}
            sessionRefreshKey={sessionRefreshKey}
            onTabSelect={handleTabSelect}
            onTabClose={handleTabClose}
            onNewTab={handleNewTab}
          />
        </div>
        <div className="flex items-center gap-2 shrink-0 h-9">
          <ConnectionBadge status={connectionStatus} />
        </div>
      </div>

      <PipelineProgress sessionId={sessionId} />

      {/* 消息列表 */}
      <div className="flex-1 min-h-0 relative overflow-x-hidden">
      <div ref={listRef} onScroll={handleScroll} className="h-full overflow-y-auto overflow-x-hidden scrollbar-thin p-4 space-y-4">
        {/* 无会话时的空白状态 */}
        {!activeTabId && openTabIds.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageSquare size={48} className="opacity-20 mb-4" />
            <p className="text-sm">没有打开的会话</p>
            <p className="text-xs mt-1 opacity-60">点击左侧会话列表打开一个会话</p>
          </div>
        )}
        
        {/* 有会话但无消息 */}
        {activeTabId && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Bot size={48} className="opacity-20 mb-4" />
            <p className="text-sm">开始新对话</p>
            <p className="text-xs mt-1 opacity-60">输入消息开始与 Agent 交流</p>
          </div>
        )}
        
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
        {(isActiveTabStreaming || progress) && (
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
            {!progress && activeTools.size === 0 && !activeStreamingMsgId && (
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
      {!isAtBottom && isActiveTabStreaming && (
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
        {/* 建议卡片 */}
        {promptSuggestion && (
          <div className="flex items-center gap-2 mb-3 animate-msg-pop">
            <button
              onClick={() => {
                setInput(promptSuggestion)
                setPromptSuggestion(null)
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-accent rounded-full text-sm text-muted-foreground hover:text-foreground transition-colors border border-border/50"
            >
              <span className="text-xs opacity-60">→</span>
              <span className="truncate">{promptSuggestion}</span>
            </button>
            <button
              onClick={() => setPromptSuggestion(null)}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              ×
            </button>
          </div>
        )}
        <div className="relative rounded-xl border border-border/50 bg-background/70 backdrop-blur-sm transition-all duration-200 focus-within:border-foreground/20">
          {/* 流式动画 */}
          {isActiveTabStreaming && (
            <div
              className="absolute left-0 right-0 bottom-0 h-16 rounded-b-xl animate-input-breathe pointer-events-none overflow-hidden"
              style={{
                background: 'linear-gradient(0deg, hsl(var(--primary) / 0.25) 0%, hsl(var(--primary) / 0.08) 60%, transparent 100%)',
                filter: 'blur(10px)',
              }}
            />
          )}
          {/* 附件预览 */}
          <AttachmentPreview attachments={attachments} onRemove={handleRemoveAttachment} />
          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFilesSelected(e.target.files)}
          />
          {/* 文本输入 */}
          <textarea
            value={input}
            onChange={(e) => {
              const val = e.target.value
              setInput(val)
              const atMatch = val.match(/@([^\s@]*)$/)
              setMentionQuery(atMatch ? atMatch[1] : null)
            }}
            onKeyDown={(e) => {
              if (mentionQuery !== null && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter')) {
                return
              }
              handleKeyDown(e)
            }}
            onPaste={(e) => {
              const items = e.clipboardData?.items
              if (!items) return
              const imageFiles: File[] = []
              for (let i = 0; i < items.length; i++) {
                if (items[i].type.startsWith('image/')) {
                  const file = items[i].getAsFile()
                  if (file) imageFiles.push(file)
                }
              }
              if (imageFiles.length > 0) {
                e.preventDefault()
                const newAttachments: Attachment[] = imageFiles.map((file) => ({
                  id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  name: file.name || `clipboard-${Date.now()}.png`,
                  size: file.size,
                  type: file.type,
                  previewUrl: URL.createObjectURL(file),
                  _file: file,
                }))
                setAttachments((prev) => [...prev, ...newAttachments])
              }
            }}
            placeholder={connectionStatus === 'connected'
              ? '输入消息... (Enter 发送, Shift+Enter 换行)'
              : '未连接后端，将以 Mock 模式响应...'
            }
            rows={1}
            className="w-full bg-transparent resize-none outline-none text-sm placeholder:text-muted-foreground min-h-[24px] max-h-[120px] px-3 pt-2 scrollbar-none"
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
                setInput((prev) => prev.replace(/@[^\s@]*$/, `@${asset.name} `))
                setMentionQuery(null)
                setMentionAssets((prev) => [...prev, { id: asset.id, name: asset.name }])
              }}
              onClose={() => setMentionQuery(null)}
            />
          )}
          {/* 工具栏 */}
          <div className="flex items-center justify-between px-2 py-1 h-[40px]">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {/* 附件按钮 */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="添加附件"
              >
                <Paperclip size={18} />
              </button>
              {/* 模型选择器 */}
              <ModelSelector />
              {/* 思考模式开关 */}
              <button
                onClick={() => {
                  const next = !thinkingEnabled
                  setThinkingEnabled(next)
                  localStorage.setItem('tagent-thinking-enabled', String(next))
                }}
                className={`p-1.5 rounded-md transition-colors ${
                  thinkingEnabled
                    ? 'text-success hover:bg-success/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
                title={thinkingEnabled ? '关闭思考模式' : '开启思考模式'}
              >
                <Brain size={18} />
              </button>
            </div>
            {/* 发送/停止按钮 */}
            <button
              onClick={isActiveTabStreaming ? handleStop : handleSend}
              disabled={!isActiveTabStreaming && !input.trim()}
              className={`p-1.5 rounded-md transition-colors ${
                isActiveTabStreaming
                  ? 'text-destructive hover:bg-destructive/10'
                  : 'text-muted-foreground hover:text-primary disabled:opacity-30'
              }`}
            >
              {isActiveTabStreaming ? <Square size={18} /> : <Send size={18} />}
            </button>
          </div>
        </div>
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
  return `收到！你说的是："${input}"\n\n我是一个 Mock 响应。请启动 WebSocket 后端以获得真实功能。`
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
