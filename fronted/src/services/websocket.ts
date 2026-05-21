/**
 * TAgent WebSocket 客户端
 *
 * 管理与 ta_agent 后端的 WebSocket 连接。
 * 提供 RPC 调用和事件订阅。
 */

import { WS_URL } from '@/lib/api'
import { getUserQueryParams } from '@/lib/user-config'

type EventCallback = (payload: unknown) => void
type CleanupFn = () => void

interface PendingRequest {
  resolve: (result: unknown) => void
  reject: (error: string) => void
}

/** 连接状态 */
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

/**
 * TAgent WebSocket 客户端
 */
export class TAgentClient {
  private ws: WebSocket | null = null
  private url: string
  private listeners = new Map<string, Set<EventCallback>>()
  private pendingRequests = new Map<string, PendingRequest>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private _status: ConnectionStatus = 'disconnected'
  private statusListeners = new Set<(status: ConnectionStatus) => void>()
  private _sessionId: string | null = null

  constructor(url: string = WS_URL) {
    this.url = url
  }

  /** 当前连接状态 */
  get status(): ConnectionStatus {
    return this._status
  }

  /** 当前会话 ID */
  get sessionId(): string | null {
    return this._sessionId
  }

  /** 连接到服务器（支持 sessionId 恢复会话） */
  connect(sessionId?: string): void {
    // 已连接或正在连接中，跳过
    if (this.ws?.readyState === WebSocket.OPEN) return
    if (this.ws?.readyState === WebSocket.CONNECTING) return

    // 关闭旧连接
    if (this.ws) {
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.close()
      this.ws = null
    }

    this._sessionId = sessionId || null
    this.setStatus('connecting')
    this._doConnect()
  }

  private _doConnect(): void {
    const userParams = getUserQueryParams()
    let wsUrl = this._sessionId ? `${this.url}?sessionId=${this._sessionId}` : this.url
    if (userParams) wsUrl += userParams
    this.ws = new WebSocket(wsUrl)

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.setStatus('connected')
      console.log('[TAgent] WebSocket 已连接')
    }

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'event') {
          // 事件推送
          console.log(`[TAgent] ← 事件: ${data.event}`, data.payload)
          this.emit(data.event, data.payload)
        } else if (data.id) {
          // RPC 响应
          console.log(`[TAgent] ← 响应: ${data.id}`, data.result || data.error)
          const pending = this.pendingRequests.get(data.id)
          if (pending) {
            this.pendingRequests.delete(data.id)
            if (data.error) {
              pending.reject(data.error)
            } else {
              pending.resolve(data.result)
            }
          }
        }
      } catch (e) {
        console.error('[TAgent] 解析消息失败:', e)
      }
    }

    this.ws.onclose = () => {
      this.setStatus('disconnected')
      this.reconnectAttempts++
      // 指数退避：5s, 10s, 20s, 最大 30s
      const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts - 1), 30000)
      console.log(`[TAgent] WebSocket 断开，${delay / 1000} 秒后重连 (第 ${this.reconnectAttempts} 次)...`)
      this.scheduleReconnect(delay)
    }

    this.ws.onerror = (e) => {
      console.error('[TAgent] WebSocket 错误:', e)
    }
  }

  /** 断开连接 */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.close()
    }
    this.ws = null
    this._sessionId = null
    this.reconnectAttempts = 0
    this.setStatus('disconnected')
  }

  /** 切换会话（断开后重连到新 sessionId） */
  reconnectWithSession(sessionId: string): void {
    // 清除所有重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    // 关闭旧连接，禁用 onclose 防止触发自动重连
    if (this.ws) {
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.close()
      this.ws = null
    }
    this._sessionId = sessionId
    this.reconnectAttempts = 0
    this.setStatus('connecting')

    // 直接建立新连接，跳过健康检查（刚断开说明后端在线）
    this._doConnect()
  }

  /** 发送 RPC 请求 */
  async rpc(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket 未连接')
    }
    // crypto.randomUUID() 在 HTTP 下不可用，用替代方案
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      const msg = { id, method, params }
      console.log(`[TAgent] → 发送: ${method}`, params)
      this.ws!.send(JSON.stringify(msg))
      // 超时
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error('请求超时'))
        }
      }, 300000) // 5 分钟超时（Agent 可能执行很久）
    })
  }

  /** 发送消息（不等待完整响应，事件通过订阅获取） */
  async sendMessage(content: string, contextCutoff?: number | null): Promise<void> {
    const params: Record<string, unknown> = { content }
    if (contextCutoff != null) {
      params.contextCutoff = contextCutoff
    }
    await this.rpc('sendMessage', params)
  }

  /** 清除上下文（分割线之前的不发给 LLM） */
  async clearContext(): Promise<{ cutoff: number }> {
    return (await this.rpc('clearContext')) as { cutoff: number }
  }

  /** 设置工作流模式 */
  async setMode(mode: 'step_by_step' | 'auto'): Promise<void> {
    await this.rpc('setMode', { mode })
  }

  /** 获取历史 */
  async getHistory(): Promise<unknown[]> {
    const result = await this.rpc('getHistory') as { history: unknown[] }
    return result.history
  }

  /** 清除历史 */
  async clearHistory(): Promise<void> {
    await this.rpc('clearHistory')
  }

  /** 获取状态 */
  async getStatus(): Promise<Record<string, unknown>> {
    return (await this.rpc('getStatus')) as Record<string, unknown>
  }

  /** 获取工具列表 */
  async listTools(): Promise<{ tools: string[]; count: number }> {
    return (await this.rpc('listTools')) as { tools: string[]; count: number }
  }

  /** 切换会话（不断开连接） */
  async switchSession(sessionId: string): Promise<{ sessionId: string; messageCount: number }> {
    this._sessionId = sessionId
    return (await this.rpc('switchSession', { sessionId })) as { sessionId: string; messageCount: number }
  }

  /** 订阅事件 */
  on(event: string, callback: EventCallback): CleanupFn {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
    return () => {
      this.listeners.get(event)?.delete(callback)
    }
  }

  /** 订阅连接状态变化 */
  onStatusChange(callback: (status: ConnectionStatus) => void): CleanupFn {
    this.statusListeners.add(callback)
    return () => {
      this.statusListeners.delete(callback)
    }
  }

  // ===== 内部方法 =====

  private emit(event: string, payload: unknown): void {
    this.listeners.get(event)?.forEach((cb) => {
      try { cb(payload) } catch (e) { console.error('[TAgent] 事件处理错误:', e) }
    })
  }

  private setStatus(status: ConnectionStatus): void {
    this._status = status
    this.statusListeners.forEach((cb) => cb(status))
  }

  private scheduleReconnect(delay: number = 5000): void {
    if (this.reconnectTimer) return
    const sid = this._sessionId
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect(sid || undefined)
    }, delay)
  }
}

// 全局单例
export const tagentClient = new TAgentClient()
