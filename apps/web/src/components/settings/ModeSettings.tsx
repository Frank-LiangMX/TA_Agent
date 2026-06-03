/**
 * 模式设置 - 工作台模式切换 + 中心服务器配置
 */

import React, { useState, useEffect } from 'react'
import { Wifi, WifiOff, RefreshCw, AlertCircle, CheckCircle, Loader2, Package, Bot, Cloud, CloudOff } from 'lucide-react'
import { getConfig, saveConfig, type AppConfig, setAgentMode, updateCloudConfig } from '../../services/config'
import { healthCheck } from '../../services/api'
import { tagentClient } from '../../services/websocket'
import { clearCache } from '../../lib/cache'
import { resetRuntimeEndpointCache } from '../../lib/api'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import { useConfirm } from '@/hooks/useConfirm'

interface ModeSettingsProps {
  onModeChange?: () => void
}

export function ModeSettings({ onModeChange }: ModeSettingsProps) {
  const { confirm, ConfirmUI } = useConfirm()
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)
  const [serverStatus, setServerStatus] = useState<'unknown' | 'connected' | 'error'>('unknown')
  const [error, setError] = useState('')
  const [agentMode, setAgentModeState] = useState<'ta' | 'general'>('ta')

  // 中心服务器表单
  const [serverUrl, setServerUrl] = useState('')
  const [userId, setUserId] = useState('')
  const [userName, setUserName] = useState('')
  const [cloudEnabled, setCloudEnabled] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const cfg = await getConfig()
      setConfig(cfg)
      setCloudEnabled(cfg.cloud?.enabled === true)
      setServerUrl(cfg.cloud?.server_url || '')
      setUserId(cfg.cloud?.user_id || '')
      setUserName(cfg.cloud?.user_name || '')
      setAgentModeState(cfg.agent_mode === 'general' ? 'general' : 'ta')

      if (cfg.cloud?.enabled && cfg.cloud.server_url) {
        checkServer()
      }
    } catch (err) {
      console.error('加载配置失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const checkServer = async () => {
    setServerStatus('unknown')
    try {
      await healthCheck()
      setServerStatus('connected')
    } catch {
      setServerStatus('error')
    }
  }

  const handleToggleCloud = async (enabled: boolean) => {
    if (!config) return
    if (enabled && !serverUrl) {
      setError('请先填写服务器地址')
      return
    }
    if (enabled && !userId) {
      setError('请先填写用户 ID')
      return
    }

    setSwitching(true)
    setError('')
    try {
      tagentClient.disconnect()
      clearCache()

      await updateCloudConfig({
        enabled,
        server_url: serverUrl,
        user_id: userId,
        user_name: userName || userId,
      })

      const cfg = await getConfig()
      setConfig(cfg)
      setCloudEnabled(enabled)

      if (enabled) {
        await checkServer()
      }

      // 重连 WebSocket
      const storedActiveId = localStorage.getItem('tagent-active-tab')
      if (storedActiveId) {
        tagentClient.reconnectWithSession(storedActiveId).catch(() => {})
      } else {
        tagentClient.connect().catch(() => {})
      }

      onModeChange?.()
    } catch (err) {
      setError('切换失败: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSwitching(false)
    }
  }

  const handleSaveCloudConfig = async () => {
    if (!config) return
    if (!serverUrl) {
      setError('请输入服务器地址')
      return
    }
    if (!userId) {
      setError('请输入用户 ID')
      return
    }

    setSwitching(true)
    setError('')
    try {
      await updateCloudConfig({
        server_url: serverUrl,
        user_id: userId,
        user_name: userName || userId,
      })
      const cfg = await getConfig()
      setConfig(cfg)
      if (cfg.cloud?.enabled) {
        await checkServer()
      }
    } catch (err) {
      setError('保存失败')
    } finally {
      setSwitching(false)
    }
  }

  const handleSwitchAgentMode = async (mode: 'ta' | 'general') => {
    if (switching || agentMode === mode) return
    const modeLabel = mode === 'general' ? '通用模式' : 'TA 模式'
    const confirmed = await confirm(
      '将切换工作台界面，不会删除另一个模式的会话与记忆。',
      {
        title: `确认切换到${modeLabel}？`,
        confirmText: '切换',
        cancelText: '取消',
      },
    )
    if (!confirmed) return
    setSwitching(true)
    setError('')
    try {
      tagentClient.disconnect(true)
      clearCache()
      resetRuntimeEndpointCache()
      await setAgentMode(mode)
      setAgentModeState(mode)
      resetRuntimeEndpointCache()
      if (typeof window !== 'undefined' && window.electronAPI?.restartRuntime) {
        await new Promise((r) => setTimeout(r, 800))
      }
      onModeChange?.()
    } catch (err) {
      setError('切换工作台失败: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSwitching(false)
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">加载中...</div>
  }

  return (
    <div className="space-y-6">
      {/* 工作台模式 */}
      <SettingsSection
        title="工作台模式"
        description="TA 模式包含资产与审核工作流，通用模式仅保留对话工作台"
      >
        <div className="grid grid-cols-2 gap-4">
          <div
            className={`p-4 border-2 rounded-xl cursor-pointer transition-all ${
              switching ? 'opacity-50 pointer-events-none' : ''
            } ${
              agentMode === 'ta'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
            onClick={() => !switching && handleSwitchAgentMode('ta')}
          >
            <div className="flex items-center gap-2 mb-2">
              <Package size={20} />
              <span className="font-medium">TA 模式</span>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• 资产库 / 分析 / 审核 / 搜索 / 流水线</li>
              <li>• 游戏资产管理工作流</li>
            </ul>
          </div>

          <div
            className={`p-4 border-2 rounded-xl cursor-pointer transition-all ${
              switching ? 'opacity-50 pointer-events-none' : ''
            } ${
              agentMode === 'general'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
            onClick={() => !switching && handleSwitchAgentMode('general')}
          >
            <div className="flex items-center gap-2 mb-2">
              <Bot size={20} />
              <span className="font-medium">通用模式</span>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• 仅对话工作台 + 会话工作区</li>
              <li>• 办公 / 编码任务优先</li>
            </ul>
          </div>
        </div>
      </SettingsSection>

      {/* 中心服务器 */}
      <SettingsSection
        title="中心服务器"
        description="可选。连接公司服务器以启用团队协作、资产同步和用量统计"
        action={
          cloudEnabled ? (
            <button
              onClick={checkServer}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <RefreshCw size={12} />
              测试连接
            </button>
          ) : undefined
        }
      >
        <SettingsCard>
          <SettingsRow
            label={switching ? '切换中...' : (cloudEnabled ? '已连接' : '未连接')}
            description={
              switching
                ? '正在切换...'
                : cloudEnabled
                  ? `${config?.cloud?.user_name || config?.cloud?.user_id || ''} @ ${config?.cloud?.server_url || ''}`
                  : '本地独立运行，不依赖中心服务器'
            }
            icon={
              switching
                ? <Loader2 size={18} className="animate-spin" />
                : cloudEnabled
                  ? <Cloud size={18} />
                  : <CloudOff size={18} />
            }
          />

          {cloudEnabled && serverStatus !== 'unknown' && (
            <div className={`flex items-center gap-2 px-4 py-2 text-sm ${
              serverStatus === 'connected' ? 'text-green-600 bg-green-50' : 'text-destructive bg-destructive/5'
            }`}>
              {serverStatus === 'connected' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              {serverStatus === 'connected' ? '服务器连接正常' : '服务器连接失败'}
            </div>
          )}
        </SettingsCard>

        {/* 服务器配置表单 */}
        <SettingsCard>
          <div className="px-4 py-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">服务器地址</label>
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="10.11.131.124:8081"
                  className="mt-1 w-full px-3 py-1.5 text-sm bg-muted border border-border rounded-lg outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-sm font-medium">用户 ID</label>
                <input
                  type="text"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="请输入用户 ID"
                  className="mt-1 w-full px-3 py-1.5 text-sm bg-muted border border-border rounded-lg outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">用户名</label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="可选，显示用"
                className="mt-1 w-full px-3 py-1.5 text-sm bg-muted border border-border rounded-lg outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSaveCloudConfig}
                disabled={switching}
                className="flex-1 py-2 bg-muted text-foreground border border-border rounded-lg hover:bg-muted/80 disabled:opacity-50 text-sm font-medium"
              >
                {switching ? '保存中...' : '保存配置'}
              </button>
              <button
                onClick={() => handleToggleCloud(!cloudEnabled)}
                disabled={switching || (!cloudEnabled && !serverUrl)}
                className={`flex-1 py-2 rounded-lg disabled:opacity-50 text-sm font-medium ${
                  cloudEnabled
                    ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                    : 'bg-foreground text-background hover:opacity-90'
                }`}
              >
                {cloudEnabled ? '断开连接' : '启用连接'}
              </button>
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>

      {/* 错误提示 */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* 说明 */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>• 本地 Runtime 始终运行，中心服务器是可选叠加</p>
        <p>• 连接中心服务器后，资产数据会后台同步</p>
        <p>• 断开中心服务器不影响本地对话和工具使用</p>
      </div>
      {ConfirmUI}
    </div>
  )
}
