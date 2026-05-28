/**
 * 聊天消息组件
 */

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { User, Bot, Wrench, Copy, Check, ChevronDown, ChevronRight, Loader2, Scissors } from 'lucide-react'
import { ToolResultRenderer } from '../tools/ToolResultRenderer'
import type { ChatMessage as ChatMessageType } from '@/types'

interface ChatMessageProps {
  message: ChatMessageType & {
    _toolStatus?: 'running' | 'done'
    _toolResult?: string
  }
  onAssetClick?: (asset: Record<string, unknown>) => void
  onSetDivider?: () => void
}

export function ChatMessage({ message, onAssetClick, onSetDivider }: ChatMessageProps) {
  const [copied, setCopied] = React.useState(false)
  const [toolExpanded, setToolExpanded] = React.useState(false)
  const [showArgs, setShowArgs] = React.useState(false)
  const [showThinking, setShowThinking] = React.useState(false)
  const isUser = message.role === 'user'
  const hasTools = message.toolCalls && message.toolCalls.length > 0

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // 工具调用消息
  if (hasTools) {
    const toolCalls = message.toolCalls!
    const isRunning = (message as any)._toolStatus === 'running'
    const results = (message as any)._toolResults || {}
    const isGrouped = toolCalls.length > 1
    const toolName = toolCalls[0].name

    return (
      <div className="flex gap-3 animate-msg-assistant">
        <div className="w-8 h-8 rounded-lg bg-warning/20 flex items-center justify-center shrink-0">
          <Wrench size={16} className="text-warning" />
        </div>
        <div className="flex-1 min-w-0">
          {/* 工具调用头 */}
          <button
            onClick={() => setToolExpanded(!toolExpanded)}
            className="flex items-center gap-2 bg-muted hover:bg-accent px-3 py-2 rounded-lg text-sm w-full text-left transition-colors"
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
                {formatArgs(toolCalls[0].arguments)}
              </span>
            )}
            <span className="ml-auto">
              {toolExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          </button>

          {/* 展开的详情 */}
          {toolExpanded && (
            <div className="mt-2 space-y-2">
              {isGrouped ? (
                // 分组模式：每个工具调用独立展示
                toolCalls.map((tc, i) => (
                  <GroupedToolItem
                    key={tc.id}
                    toolCall={tc}
                    index={i}
                    result={results[tc.id]}
                  />
                ))
              ) : (
                // 单工具模式
                <>
                  {results[toolCalls[0].id] || (message as any)._toolResult ? (
                    <ToolResultRenderer toolName={toolName} result={results[toolCalls[0].id] || (message as any)._toolResult} />
                  ) : (
                    <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                      工具已执行完成
                    </div>
                  )}
                  <button
                    onClick={() => setShowArgs(!showArgs)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showArgs ? '▾ 隐藏参数' : '▸ 查看参数'}
                  </button>
                  {showArgs && (
                    <pre className="mt-1 bg-muted/50 rounded-lg p-3 text-xs overflow-x-auto">
                      {JSON.stringify(toolCalls[0].arguments, null, 2)}
                    </pre>
                  )}
                </>
              )}
            </div>
          )}

          {/* 思考内容（折叠） */}
          {message.content && (() => {
            const thinkingFromContent = message.content.match(/^💭 \*思考中\.\.\*\n\n([\s\S]*)$/)
            const thinkingText = thinkingFromContent ? thinkingFromContent[1] : (message as any)._thinking
            const hasThinking = !!thinkingText
            const mainContent = thinkingFromContent
              ? message.content.replace(/^💭 \*思考中\.\.\*\n\n/, '')
              : message.content

            return (
              <>
                {hasThinking && (
                  <div className="mt-2">
                    <button
                      onClick={() => setShowThinking(!showThinking)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showThinking ? '▾' : '▸'} 💭 思考过程
                    </button>
                    {showThinking && (
                      <div className="mt-1 pl-3 border-l-2 border-border/30 text-xs text-muted-foreground/80 prose prose-sm dark:prose-invert max-w-none prose-p:my-0.5">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {typeof thinkingText === 'string' ? thinkingText.replace(/^💭 \*思考中\.\.\*\n\n/, '') : ''}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                )}
                {mainContent && (
                  <div className="mt-2 prose prose-sm dark:prose-invert max-w-none prose-p:my-1">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {mainContent}
                    </ReactMarkdown>
                  </div>
                )}
              </>
            )
          })()}

          <div className={`flex items-center gap-2 mt-1 ${(message as any)._streaming ? 'invisible h-0 mt-0' : ''}`}>
            <span className="text-xs text-muted-foreground">
              {new Date(message.timestamp).toLocaleTimeString()}
            </span>
            {(message as any)._elapsed != null && (
              <span className="text-[11px] text-muted-foreground/60">
                {(message as any)._elapsed < 60
                  ? `${Math.round((message as any)._elapsed)}s`
                  : `${Math.floor((message as any)._elapsed / 60)}m${Math.round((message as any)._elapsed % 60)}s`
                }
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  // 普通消息
  return (
    <div className="relative group/msg">
      {/* 分割线按钮 + 虚线指示器（悬停显示在消息上方） */}
      {onSetDivider && (
        <div className="absolute -top-4 left-0 right-0 opacity-0 group-hover/msg:opacity-100 transition-opacity z-10 flex items-center gap-1 pb-1">
          <div className="flex-1 border-t border-dashed border-muted-foreground/30" />
          <button
            onClick={onSetDivider}
            className="bg-background border border-muted-foreground/30 rounded-full p-1 text-muted-foreground hover:text-primary hover:border-primary/50 shrink-0"
            title="在此处插入上下文分割线"
          >
            <Scissors size={12} />
          </button>
          <div className="flex-1 border-t border-dashed border-muted-foreground/30" />
        </div>
      )}
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
            ? 'bg-primary text-primary-foreground'
            : 'bg-card shadow-sm'
          }
        `}>
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          ) : (
            <>
              {/* 思考内容（折叠） */}
              {(message as any)._thinking && (
                <div className="mb-2">
                  <button
                    onClick={() => setShowThinking(!showThinking)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showThinking ? '▾' : '▸'} 💭 思考过程
                  </button>
                  {showThinking && (
                    <div className="mt-1 pl-3 border-l-2 border-border/30 text-xs text-muted-foreground/80 prose prose-sm dark:prose-invert max-w-none prose-p:my-0.5">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {(message as any)._thinking.replace(/^💭 \*思考中\.\.\*\n\n/, '')}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              )}
              <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-pre:my-2 prose-code:text-primary prose-headings:my-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
              </div>
            </>
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
