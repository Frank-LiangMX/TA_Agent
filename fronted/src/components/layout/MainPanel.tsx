/**
 * 中间主面板 - 对话视图（支持真实 WebSocket 和 Mock 双模式）
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Square, Loader2, CheckCircle2, FolderSearch, Brain, FileCheck, Package, MessageSquare, Bot, Paperclip } from 'lucide-react'
import { ChatMessage } from '../chat/ChatMessage'
import { ContextDivider } from '../chat/ContextDivider'
import { ScrollMinimap } from '../chat/ScrollMinimap'
import { AssetMentionPopover } from '../chat/AssetMentionPopover'
import { ModelSelector } from './ModelSelector'
import { AttachmentPreview, type Attachment } from './AttachmentPreview'
import { SessionTabBar } from '../session/SessionTabBar'
import { ThinkingDots, SkeletonBlock } from '../animations'
import { tagentClient, type ConnectionStatus } from '@/services/websocket'
import { getSessionMessages, getSession, updateSession, createSession, listSessions } from '@/services/sessions'
import { fetchPipelineRunsForSession, type PipelineRun } from '@/services/pipeline'
import type { ChatMessage as ChatMessageType, ToolCall } from '@/types'
import {
  appendThinkingSegment,
  appendTextSegment,
  appendToolStart,
  appendToolResult,
  finalizeTurn,
  createEmptyTurn,
  getTurnSegments,
  syncTurnDerivedFields,
  type AssistantTurnMessage,
} from '@/lib/chat-turn'
import { Tooltip } from '@/components/ui/Tooltip'
import { AppTitleBar } from '@/components/layout/AppTitleBar'
import { PAGE_TITLE_BAR_STYLE } from '@/components/layout/PageHeader'

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
  agentMode?: 'ta' | 'general'
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

export function MainPanel({ onAssetSelect, agentMode = 'ta' }: MainPanelProps) {
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
  const [workspaceInfo, setWorkspaceInfo] = useState<{ name: string; path: string } | null>(null)
  const [editingWorkspace, setEditingWorkspace] = useState(false)
  const [workspaceDraft, setWorkspaceDraft] = useState('')

  // 当前标签的消息
  // Ref 保持 openTabIds 在事件回调中最新
  const openTabIdsRef = useRef(openTabIds)
  openTabIdsRef.current = openTabIds
  const activeTabIdRef = useRef(activeTabId)
  activeTabIdRef.current = activeTabId
  const tabMessagesRef = useRef(tabMessages)
  tabMessagesRef.current = tabMessages
  const pendingNewTabRef = useRef(false)

  // 启动时清理已删除会话的标签，避免 localStorage 堆积
  useEffect(() => {
    listSessions(false)
      .then((sessions) => {
        const valid = new Set(sessions.map((s) => s.sessionId))
        setOpenTabIds((prev) => {
          const next = prev.filter((id) => valid.has(id))
          if (next.length === prev.length) return prev
          return next
        })
        setActiveTabId((current) => {
          if (current && !valid.has(current)) {
            const stored = localStorage.getItem('tagent-active-tab')
            if (stored && valid.has(stored)) return stored
            return null
          }
          return current
        })
      })
      .catch(() => {})
  }, [])

  // 当前标签的消息（activeTabId 为 null 时显示空数组）
  const messages = activeTabId ? (tabMessages[activeTabId] || []) : []
  const sessionId = activeTabId
  const isActiveTabStreaming = activeTabId ? streamingTabs.has(activeTabId) : isStreaming
  const activeTurnMessage = messages.find(
    (m) => m.role === 'assistant' && !!(m as any)._turnOpen,
  )
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

  const handleSetActiveWorkspace = useCallback(async () => {
    const targetTabId = activeTabIdRef.current
    if (!targetTabId) {
      window.alert('请先打开一个会话再设置工作区')
      return
    }
    const trimmed = workspaceDraft.trim()
    if (!trimmed) {
      window.alert('工作区路径不能为空')
      return
    }
    try {
      const updated = await updateSession(targetTabId, { workspacePath: trimmed })
      setWorkspaceInfo({
        name: updated?.workspaceName || '',
        path: updated?.workspacePath || trimmed,
      })
      setEditingWorkspace(false)
      setSessionRefreshKey((k) => k + 1)
    } catch (e) {
      console.error('[Workspace] 设置工作区失败:', e)
      window.alert('设置工作区失败，请检查路径后重试')
    }
  }, [workspaceDraft])

  const handlePickWorkspaceFolder = useCallback(async () => {
    try {
      const picker = (window as any).electronAPI?.openFolder as (() => Promise<unknown>) | undefined
      if (!picker) {
        window.alert('当前环境不支持目录选择，请手动输入绝对路径')
        return
      }
      const result = await picker()
      const data = result as { canceled?: boolean; filePaths?: string[]; path?: string } | undefined
      if (!data || data.canceled) return
      const picked = data.filePaths?.[0] || data.path || ''
      if (picked) {
        setWorkspaceDraft(picked)
      }
    } catch (e) {
      console.error('[Workspace] 选择目录失败:', e)
      window.alert('打开目录选择器失败，请手动输入路径')
    }
  }, [])

  useEffect(() => {
    if (!activeTabId || sessionRefreshKey === 0) return
    getSession(activeTabId).then(meta => {
      if (meta?.title) setTabTitles(prev => ({ ...prev, [activeTabId]: meta.title }))
      if (meta?.workspacePath || meta?.workspaceName) {
        setWorkspaceInfo({
          name: meta?.workspaceName || '',
          path: meta?.workspacePath || '',
        })
      } else {
        setWorkspaceInfo(null)
      }
    }).catch(() => {})
  }, [activeTabId, sessionRefreshKey])

  useEffect(() => {
    if (!activeTabId) {
      setWorkspaceInfo(null)
      return
    }
    getSession(activeTabId).then(meta => {
      if (meta?.workspacePath || meta?.workspaceName) {
        setWorkspaceInfo({
          name: meta?.workspaceName || '',
          path: meta?.workspacePath || '',
        })
      } else {
        setWorkspaceInfo(null)
      }
    }).catch(() => {
      setWorkspaceInfo(null)
    })
  }, [activeTabId])

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
            if (role === 'assistant' && !msg.content && !msg.toolCalls && !msg.thinking) return false
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
              ...(msg.thinking ? { _thinking: msg.thinking as string } : {}),
              ...(toolCalls?.length ? { _toolStatus: 'done' as const } : {}),
            }
          })

        const mergeHistoryTurns = (msgs: ChatMessageType[]): ChatMessageType[] => {
          const out: ChatMessageType[] = []
          for (const msg of msgs) {
            const prev = out[out.length - 1]
            if (
              prev?.role === 'assistant' &&
              msg.role === 'assistant' &&
              msg.toolCalls?.length &&
              !msg.content?.trim() &&
              !(msg as any)._thinking
            ) {
              out[out.length - 1] = {
                ...prev,
                toolCalls: [...(prev.toolCalls || []), ...msg.toolCalls],
                _toolResults: {
                  ...((prev as any)._toolResults || {}),
                  ...((msg as any)._toolResults || {}),
                },
                _toolStatus: 'done',
              } as ChatMessageType
              continue
            }
            if (
              prev?.role === 'assistant' &&
              msg.role === 'assistant' &&
              prev.toolCalls?.length &&
              !prev.content?.trim()
            ) {
              out[out.length - 1] = {
                ...prev,
                content: msg.content || prev.content,
                _thinking: (msg as any)._thinking || (prev as any)._thinking,
                _toolStatus: 'done',
              } as ChatMessageType
              continue
            }
            out.push(msg)
          }
          return out.map((m) =>
            m.role === 'assistant' ? syncTurnDerivedFields(m as AssistantTurnMessage) : m,
          )
        }

        setTabMessages(prev => ({ ...prev, [tabId]: mergeHistoryTurns(converted) }))
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

  // 新建标签：先 REST 创建会话，再切换 WS，避免无 sessionId 连接误建空会话
  const handleNewTab = useCallback(async () => {
    setContextCutoff(null)
    setIsStreaming(false)
    pendingNewTabRef.current = true
    try {
      const meta = await createSession('新会话')
      setOpenTabIds((prev) => (prev.includes(meta.sessionId) ? prev : [...prev, meta.sessionId]))
      setActiveTabId(meta.sessionId)
      setTabTitles((prev) => ({ ...prev, [meta.sessionId]: meta.title || '新会话' }))
      await tagentClient.reconnectWithSession(meta.sessionId)
      setSessionRefreshKey((k) => k + 1)
    } catch (e) {
      pendingNewTabRef.current = false
      console.error('[Session] 新建会话失败:', e)
    }
  }, [])

// 关闭标签
  const handleTabClose = useCallback((tabId: string) => {
    setOpenTabIds(prev => {
      const next = prev.filter(id => id !== tabId)
      if (tabId === activeTabId) {
        const idx = prev.indexOf(tabId)
        const switchTo = next[Math.min(idx, next.length - 1)] || null
        setActiveTabId(switchTo)
        if (switchTo) {
          tagentClient.reconnectWithSession(switchTo).catch(() => {})
        }
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
      if (!payload?.sessionId) return
      const newSessionId = payload.sessionId as string
      const storedActive = localStorage.getItem('tagent-active-tab')
      const isKnownTab = openTabIdsRef.current.includes(newSessionId)
      const isExplicitNew = pendingNewTabRef.current
      pendingNewTabRef.current = false

      const shouldTrackTab =
        isExplicitNew ||
        isKnownTab ||
        newSessionId === storedActive ||
        newSessionId === activeTabIdRef.current ||
        (openTabIdsRef.current.length === 0 && !storedActive && !activeTabIdRef.current)

      if (!shouldTrackTab) {
        // 意外的新会话（如误触 connect 无 sessionId）：切回已有标签，不新增
        console.warn('[Session] 忽略意外新会话:', newSessionId)
        const fallbackId = storedActive || activeTabIdRef.current || openTabIdsRef.current[0]
        if (fallbackId && fallbackId !== newSessionId) {
          tagentClient.reconnectWithSession(fallbackId).catch(() => {})
        }
        return
      }

      setOpenTabIds((prev) => (prev.includes(newSessionId) ? prev : [...prev, newSessionId]))
      if (!activeTabIdRef.current || isExplicitNew || newSessionId === storedActive) {
        setActiveTabId(newSessionId)
      }

      if (!tabMessagesRef.current[newSessionId]?.length) {
        loadTabHistory(newSessionId)
      }

      if (payload.workspacePath || payload.workspaceName) {
        setWorkspaceInfo({
          name: payload.workspaceName || '',
          path: payload.workspacePath || '',
        })
      }

      if (payload.title) {
        setTabTitles(prev => ({ ...prev, [newSessionId]: payload.title }))
      } else {
        getSession(newSessionId).then(meta => {
          if (meta?.title) setTabTitles(prev => ({ ...prev, [newSessionId]: meta.title }))
        }).catch(() => {})
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

    const findActiveTurnIndex = (msgs: ChatMessageType[]) =>
      msgs.findIndex((m) => m.role === 'assistant' && !!(m as any)._turnOpen)

    const closeOpenTurn = (msgs: ChatMessageType[]) =>
      msgs.map((m) => {
        if (m.role !== 'assistant' || !(m as any)._turnOpen) return m
        return finalizeTurn(m as AssistantTurnMessage, m.content || '', undefined)
      })

    const resolveEventTabId = (eventSessionId?: string | null) => {
      const wsId = tagentClient.sessionId
      const active = activeTabIdRef.current
      if (eventSessionId && (eventSessionId === active || eventSessionId === wsId)) {
        return eventSessionId
      }
      return wsId || active || eventSessionId || null
    }

    const applyToOpenTurn = (
      prev: ChatMessageType[],
      updater: (msg: AssistantTurnMessage) => AssistantTurnMessage,
    ): ChatMessageType[] => {
      const idx = findActiveTurnIndex(prev)
      if (idx >= 0) {
        return prev.map((m, i) =>
          i === idx ? updater(m as AssistantTurnMessage) : m,
        )
      }
      return [...prev, updater(createEmptyTurn())]
    }

    const unsubText = tagentClient.on('stream_text', (payload: any) => {
      const { text, sessionId } = payload
      const targetTabId = resolveEventTabId(sessionId)
      if (!text || !targetTabId) return
      setMessagesForTab(targetTabId, (prev) =>
        applyToOpenTurn(prev, (msg) => appendTextSegment(msg, text)),
      )
    })

    const unsubThinking = tagentClient.on('agent_thinking', (payload: any) => {
      const { text, sessionId } = payload
      const targetTabId = resolveEventTabId(sessionId)
      if (!text || !targetTabId) return
      setMessagesForTab(targetTabId, (prev) =>
        applyToOpenTurn(prev, (msg) => appendThinkingSegment(msg, text)),
      )
    })

    const unsubToolStart = tagentClient.on('tool_start', (payload: any) => {
      const { toolCall, sessionId } = payload
      const targetTabId = resolveEventTabId(sessionId)
      setActiveTools((prev) => new Map(prev).set(toolCall.id, { name: toolCall.name, startTime: Date.now() }))
      if (!targetTabId) return
      const newToolCall: ToolCall = {
        id: toolCall.id,
        name: toolCall.name,
        arguments: toolCall.arguments,
      }
      setMessagesForTab(targetTabId, (prev) =>
        applyToOpenTurn(prev, (msg) => appendToolStart(msg, newToolCall)),
      )
    })

    // 工具调用结果（支持合并消息的独立结果）
    const unsubToolResult = tagentClient.on('tool_result', (payload: any) => {
      const { toolCallId, name, result, sessionId } = payload
      setActiveTools((prev) => {
        const next = new Map(prev)
        next.delete(toolCallId)
        return next
      })
      const toolTabId = resolveEventTabId(sessionId)
      if (!toolTabId) return
      const resultStr =
        typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      setMessagesForTab(toolTabId, (prev) =>
        prev.map((msg) => {
          const segs = getTurnSegments(msg as AssistantTurnMessage)
          const hasTool = segs.some(
            (s) =>
              s.type === 'tools' &&
              s.toolCalls.some((tc) => tc.id === toolCallId),
          )
          if (!hasTool) return msg
          const updated = appendToolResult(
            msg as AssistantTurnMessage,
            toolCallId,
            resultStr,
          )
          const tools = updated.toolCalls
          return {
            ...updated,
            _toolResult:
              tools?.length === 1 ? updated._toolResults?.[toolCallId] : undefined,
          }
        }),
      )

      // 联机模式：同步工具结果到服务器
      import('@/services/sync').then(({ syncToolResult }) => {
        syncToolResult(name, result).catch(err => {
          console.error('[Sync] 同步工具结果失败:', err)
        })
      })
    })

    // 完成
    const unsubDone = tagentClient.on('done', (payload: any) => {
      const { content, sessionId, suggestion, thinking } = payload
      const currentTabId = resolveEventTabId(sessionId)
      setIsStreaming(false)
      setActiveTools(new Map())
      setProgress(null)
      setSessionRefreshKey((k) => k + 1)

      if (suggestion) setPromptSuggestion(suggestion)

      if (content) {
        const tokensEstimate = content.length * 2
        import('@/services/sync').then(({ logLlmUsage }) => {
          logLlmUsage('agent', tokensEstimate).catch(() => {})
        })
      }

      if (currentTabId) {
        setStreamingTabs((prev) => {
          const next = new Set(prev)
          next.delete(currentTabId)
          return next
        })
      }

      const answerText = (content as string) || ''
      if (!currentTabId) return

      setMessagesForTab(currentTabId, (prev) => {
        const turnIdx = findActiveTurnIndex(prev)
        if (turnIdx >= 0) {
          const msg = prev[turnIdx] as AssistantTurnMessage
          const elapsed = msg._startTime
            ? (Date.now() - msg._startTime) / 1000
            : null
          const finalized = finalizeTurn(
            msg,
            answerText || msg.content || '',
            (thinking as string) || undefined,
          )
          const withToolsDone = finalized.segments?.some((s) => s.type === 'tools')
            ? syncTurnDerivedFields({
                ...finalized,
                segments: finalized.segments!.map((s) =>
                  s.type === 'tools' ? { ...s, status: 'done' as const } : s,
                ),
              })
            : finalized
          return [
            ...prev.slice(0, turnIdx),
            { ...withToolsDone, _elapsed: elapsed },
            ...prev.slice(turnIdx + 1),
          ]
        }

        if (answerText) {
          return [
            ...closeOpenTurn(prev),
            syncTurnDerivedFields(
              finalizeTurn(
                {
                  id: `done-${Date.now()}`,
                  role: 'assistant',
                  content: '',
                  timestamp: Date.now(),
                  segments: [],
                },
                answerText,
                thinking as string | undefined,
              ),
            ),
          ]
        }

        return closeOpenTurn(prev)
      })
    })

    const unsubError = tagentClient.on('error', (payload: any) => {
      const { error, sessionId } = payload
      const currentTabId = resolveEventTabId(sessionId) || activeTabIdRef.current
      setIsStreaming(false)
      setActiveTools(new Map())
      if (currentTabId) {
        setStreamingTabs((prev) => {
          const next = new Set(prev)
          next.delete(currentTabId)
          return next
        })
        const errText =
          typeof error === 'string' ? error : (error != null ? String(error) : '未知错误')
        setMessagesForTab(currentTabId, (prev) => [
          ...closeOpenTurn(prev),
          {
            id: `error-${Date.now()}`,
            role: 'assistant' as const,
            content: `❌ ${errText}`,
            timestamp: Date.now(),
          },
        ])
      }
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

    const userMsg: ChatMessageType = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    }

    if (connectionStatus === 'connected') {
      let messageTabId = targetTabId
      try {
        if (targetTabId && tagentClient.sessionId && targetTabId !== tagentClient.sessionId) {
          await tagentClient.switchSession(targetTabId)
        }
        messageTabId = tagentClient.sessionId || targetTabId
        setMessagesForTab(messageTabId, (prev) => [...prev, userMsg])
        await tagentClient.sendMessage(
          content,
          contextCutoff,
          messageTabId,
          thinkingEnabled,
          imageAttachments.length > 0 ? imageAttachments : undefined,
          fileAttachments.length > 0 ? fileAttachments : undefined,
        )
        setTimeout(() => setSessionRefreshKey((k) => k + 1), 300)
      } catch (e: any) {
        setIsStreaming(false)
        setStreamingTabs(prev => {
          const next = new Set(prev)
          next.delete(targetTabId)
          return next
        })
        setMessagesForTab(messageTabId, (prev) => [...prev, {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `❌ 发送失败: ${e instanceof Error ? e.message : String(e)}`,
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
      {/* 头部：标签栏 + 拖拽 + 连接状态（窗口按钮见 ElectronChrome） */}
      <AppTitleBar
        size="sm"
        style={PAGE_TITLE_BAR_STYLE}
        leading={
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
        }
        trailing={<ConnectionBadge status={connectionStatus} />}
      />

      {agentMode === 'general' && (
        <div className="px-4 py-1 border-b border-border/30 bg-muted/15">
          {!editingWorkspace ? (
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="text-[11px] text-muted-foreground truncate"
                title={workspaceInfo?.path || '系统默认工作区目录'}
              >
                {workspaceInfo?.name || '默认工作区'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setWorkspaceDraft(workspaceInfo?.path || '')
                  setEditingWorkspace(true)
                }}
                className="shrink-0 text-[11px] px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                设置
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                value={workspaceDraft}
                onChange={(e) => setWorkspaceDraft(e.target.value)}
                placeholder="本地目录路径"
                className="flex-1 min-w-0 text-[11px] px-2 py-0.5 rounded border border-border/60 bg-background text-foreground outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={handlePickWorkspaceFolder}
                className="shrink-0 text-[11px] px-1.5 py-0.5 rounded border border-border/60 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                浏览
              </button>
              <button
                type="button"
                onClick={handleSetActiveWorkspace}
                className="shrink-0 text-[11px] px-1.5 py-0.5 rounded border border-border/60 text-foreground hover:bg-accent transition-colors"
              >
                保存
              </button>
              <button
                type="button"
                onClick={() => setEditingWorkspace(false)}
                className="shrink-0 text-[11px] px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                取消
              </button>
            </div>
          )}
        </div>
      )}

      {agentMode === 'ta' ? <PipelineProgress sessionId={sessionId} /> : null}

      {/* 消息列表 */}
      <div className="flex-1 min-h-0 relative overflow-x-hidden flex flex-col">
      {!activeTabId && openTabIds.length === 0 ? (
        <div className="flex-1 flex items-center justify-center overflow-hidden px-6">
          <div className="flex flex-col items-center text-center text-muted-foreground max-w-sm">
            <MessageSquare size={48} className="opacity-20 mb-4" />
            <p className="text-sm">没有打开的会话</p>
            <p className="text-xs mt-2 opacity-60 leading-relaxed">点击标签栏「+」新建，或从「历史」打开已有会话</p>
          </div>
        </div>
      ) : activeTabId && messages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center overflow-hidden px-6">
          <div className="flex flex-col items-center text-center text-muted-foreground max-w-md">
            <Bot size={48} className="opacity-20 mb-4" />
            <p className="text-sm font-medium text-foreground/80">
              {agentMode === 'general' ? '通用工作台' : '开始新对话'}
            </p>
            <p className="text-xs mt-3 opacity-60 leading-relaxed">
              {agentMode === 'general'
                ? '可读写工作区文件、整理文档或协作编码。试试发送：「你能做什么」或「列出工作区根目录」'
                : '输入消息开始与 Agent 交流，例如：分析某文件夹下的资产'}
            </p>
          </div>
        </div>
      ) : (
      <>
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin py-4 px-12 space-y-4"
      >
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
            {!progress && activeTools.size === 0 && !activeTurnMessage && (
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg">
                <ThinkingDots text="思考中..." />
              </div>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <ScrollMinimap
        messages={messages}
        scrollContainerRef={listRef}
        onJumpTo={(index) => {
          const el = listRef.current?.querySelector(`[data-msg-index="${index}"]`)
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }}
      />

      {!isAtBottom && isActiveTabStreaming && (
        <button
          onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="absolute bottom-2 right-2 z-10 px-3 py-1.5 text-xs bg-card border border-border/50 rounded-full shadow-md hover:bg-accent transition-colors text-muted-foreground"
        >
          ↓ 新消息
        </button>
      )}
      </>
      )}
      </div>

      {/* 输入框 */}
      <div className="p-4 overflow-x-hidden">
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
        <div className="composer-focus-shell relative rounded-xl border border-border/50 bg-card">
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
            placeholder={
              connectionStatus === 'connected'
                ? (
                  agentMode === 'general'
                    ? '输入办公/编码任务... (Enter 发送, Shift+Enter 换行)'
                    : '输入消息... (Enter 发送, Shift+Enter 换行)'
                )
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
          {agentMode === 'ta' && mentionQuery !== null && (
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
              <Tooltip content="添加附件">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <Paperclip size={18} />
                </button>
              </Tooltip>
              {/* 模型选择器 */}
              <ModelSelector />
              {/* 思考模式开关 */}
              <Tooltip content={thinkingEnabled ? '关闭思考模式' : '开启思考模式'}>
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
              >
                <Brain size={18} />
              </button>
              </Tooltip>
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
  const dotColor = {
    connected: 'bg-green-500',
    connecting: 'bg-yellow-500 animate-pulse-status',
    disconnected: 'bg-red-500',
  }
  const mode = localStorage.getItem('tagent-mode') || 'local'
  const modeLabel = mode === 'online' ? '联机模式' : '本地模式'
  return (
    <span className="text-xs flex items-center gap-1.5 text-muted-foreground">
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor[status]}`} />
      {modeLabel}
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

  // 没有任何活动时不渲染
  if (done.length === 0 && running.length === 0) {
    return null
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
