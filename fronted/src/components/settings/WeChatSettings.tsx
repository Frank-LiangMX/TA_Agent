/**
 * 微信 Bridge 设置
 *
 * 扫码登录、启停 Bridge、状态展示。
 * 仅在 Electron 桌面模式下可用。
 */

import React, { useState, useEffect, useCallback } from 'react'
import { QrCode, Power, PowerOff, LogOut, Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { useConfirm } from '@/hooks/useConfirm'

type BridgeState = 'idle' | 'scanning' | 'connected' | 'disconnected'

interface WeChatStatus {
  state: BridgeState
  uin?: string | null
}

const STATE_LABELS: Record<BridgeState, { label: string; color: string; icon: React.ReactNode }> = {
  idle: { label: '未连接', color: 'text-muted-foreground', icon: <XCircle size={14} /> },
  scanning: { label: '等待扫码...', color: 'text-warning', icon: <Loader2 size={14} className="animate-spin" /> },
  connected: { label: '已连接', color: 'text-success', icon: <CheckCircle2 size={14} /> },
  disconnected: { label: '已断开', color: 'text-destructive', icon: <AlertCircle size={14} /> },
}

declare global {
  interface Window {
    electronAPI?: {
      wechat: {
        getConfig: () => Promise<{ enabled: boolean; hasCredentials: boolean }>
        startLogin: () => Promise<{ qrDataUrl?: string }>
        logout: () => Promise<{ success: boolean }>
        startBridge: () => Promise<{ success: boolean }>
        stopBridge: () => Promise<{ success: boolean }>
        getStatus: () => Promise<WeChatStatus>
        setupListener: () => Promise<void>
        onStatusChanged: (callback: (state: WeChatStatus) => void) => void
      }
    }
  }
}

export function WeChatSettings() {
  const { confirm, ConfirmUI } = useConfirm()
  const [status, setStatus] = useState<WeChatStatus>({ state: 'idle' })
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isElectron, setIsElectron] = useState(false)

  const wechat = typeof window !== 'undefined' ? window.electronAPI?.wechat : undefined

  useEffect(() => {
    setIsElectron(!!wechat)
    if (!wechat) return

    // 获取初始状态
    wechat.getStatus().then(setStatus).catch(() => {})

    // 监听状态变化
    wechat.onStatusChanged((state) => {
      setStatus(state)
      if (state.state === 'connected' || state.state === 'idle') {
        setQrDataUrl(null)
      }
    })
    wechat.setupListener()
  }, [wechat])

  const handleLogin = useCallback(async () => {
    if (!wechat) return
    setLoading(true)
    setError('')
    try {
      const result = await wechat.startLogin()
      if (result.qrDataUrl) {
        setQrDataUrl(result.qrDataUrl)
      }
    } catch (err: any) {
      setError(err.message || '登录失败')
    }
    setLoading(false)
  }, [wechat])

  const handleStartBridge = useCallback(async () => {
    if (!wechat) return
    setLoading(true)
    setError('')
    try {
      await wechat.startBridge()
    } catch (err: any) {
      setError(err.message || '启动失败')
    }
    setLoading(false)
  }, [wechat])

  const handleStopBridge = useCallback(async () => {
    if (!wechat) return
    setLoading(true)
    try {
      await wechat.stopBridge()
    } catch (err: any) {
      setError(err.message || '停止失败')
    }
    setLoading(false)
  }, [wechat])

  const handleLogout = useCallback(async () => {
    if (!wechat) return
    if (!await confirm('确定要登出微信吗？', { danger: true })) return
    setLoading(true)
    try {
      await wechat.logout()
      setQrDataUrl(null)
    } catch (err: any) {
      setError(err.message || '登出失败')
    }
    setLoading(false)
  }, [wechat])

  if (!isElectron) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <AlertCircle size={16} />
          <span>微信 Bridge 仅在 Electron 桌面应用中可用</span>
        </div>
      </div>
    )
  }

  const stateInfo = STATE_LABELS[status.state]

  return (
    <div className="space-y-6">
      {/* 状态指示 */}
      <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/30 border border-border/50">
        <div className={`${stateInfo.color}`}>
          {stateInfo.icon}
        </div>
        <div>
          <div className={`text-sm font-medium ${stateInfo.color}`}>{stateInfo.label}</div>
          {status.uin && (
            <div className="text-xs text-muted-foreground">UIN: {status.uin}</div>
          )}
        </div>
      </div>

      {/* QR 码显示 */}
      {qrDataUrl && status.state === 'scanning' && (
        <div className="flex flex-col items-center gap-3 p-4 rounded-lg border border-border/50">
          <div className="text-sm text-muted-foreground">使用微信扫描二维码登录</div>
          <img src={qrDataUrl} alt="微信登录二维码" className="w-[280px] h-[280px] rounded-lg" />
          <div className="text-xs text-muted-foreground">二维码 2 分钟内有效</div>
        </div>
      )}

      {/* 错误信息 */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex flex-wrap gap-2">
        {status.state === 'idle' || status.state === 'disconnected' ? (
          <button
            onClick={handleLogin}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/80 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <QrCode size={14} />}
            扫码登录
          </button>
        ) : status.state === 'connected' ? (
          <>
            <button
              onClick={handleStopBridge}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted text-foreground text-sm hover:bg-accent disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <PowerOff size={14} />}
              停止
            </button>
            <button
              onClick={handleLogout}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border/50 text-muted-foreground text-sm hover:bg-muted disabled:opacity-50 transition-colors"
            >
              <LogOut size={14} />
              登出
            </button>
          </>
        ) : status.state === 'scanning' ? (
          <button
            onClick={() => { setStatus({ state: 'idle' }); setQrDataUrl(null) }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border/50 text-muted-foreground text-sm hover:bg-muted transition-colors"
          >
            取消
          </button>
        ) : null}

        {status.state === 'idle' && (
          <button
            onClick={handleStartBridge}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border/50 text-muted-foreground text-sm hover:bg-muted disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
            直接连接
          </button>
        )}
      </div>

      {/* 使用说明 */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>1. 点击「扫码登录」→ 用微信扫描二维码</p>
        <p>2. 登录成功后 Bridge 自动启动</p>
        <p>3. 从微信发消息给机器人，Agent 会自动回复</p>
        <p className="pt-1">
          基于{' '}
          <a href="https://ilinkai.weixin.qq.com" target="_blank" rel="noopener" className="text-primary hover:underline">
            微信 iLink Bot API
          </a>
        </p>
      </div>
      {ConfirmUI}
    </div>
  )
}
