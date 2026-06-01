/**
 * 模式设置 - 本地/联机模式切换
 */

import React, { useState, useEffect } from 'react'
import { Wifi, WifiOff, RefreshCw, AlertCircle, CheckCircle, Loader2, Package, Bot } from 'lucide-react'
import { getConfig, saveConfig, type AppConfig, setAgentMode } from '../../services/config'
import { healthCheck } from '../../services/api'
import { tagentClient } from '../../services/websocket'
import { clearCache } from '../../lib/cache'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'

interface ModeSettingsProps {
  onModeChange?: () => void
}

export function ModeSettings({ onModeChange }: ModeSettingsProps) {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)
  const [serverStatus, setServerStatus] = useState<'unknown' | 'connected' | 'error'>('unknown')
  const [error, setError] = useState('')
  const [agentMode, setAgentModeState] = useState<'ta' | 'general'>('ta')

  // 联机模式表单
  const [serverHost, setServerHost] = useState('')
  const [serverPort, setServerPort] = useState('')
  const [userId, setUserId] = useState('')
  const [userName, setUserName] = useState('')

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const cfg = await getConfig()
      setConfig(cfg)
      setServerHost(cfg.online.server_host || '')
      setServerPort(String(cfg.online.server_port || '8081'))
      setUserId(cfg.online.user_id || '')
      setUserName(cfg.online.user_name || '')
      setAgentModeState(cfg.agent_mode === 'general' ? 'general' : 'ta')

      // 如果是联机模式，检查服务器状态
      if (cfg.mode === 'online' && cfg.online.server_host) {
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

  const handleSwitchMode = async (mode: 'local' | 'online') => {
    if (!config) return

    setSwitching(true)
    setError('')

    try {
      // 1. 断开当前 WebSocket 连接
      tagentClient.disconnect()

      // 2. 清除缓存数据
      clearCache()

      // 3. 更新配置
      config.mode = mode
      await saveConfig(config)
      setConfig({ ...config })

      // 4. 重新连接 WebSocket（恢复当前会话，避免无 sessionId 误建新会话）
      const storedActiveId = localStorage.getItem('tagent-active-tab')
      if (storedActiveId) {
        tagentClient.reconnectWithSession(storedActiveId).catch(err => {
          console.error('[ModeSettings] WebSocket 连接失败:', err)
        })
      } else {
        tagentClient.connect().catch(err => {
          console.error('[ModeSettings] WebSocket 连接失败:', err)
        })
      }

      // 5. 检查服务器连接（联机模式）
      if (mode === 'online' && serverHost) {
        await checkServer()
      } else if (mode === 'local') {
        setServerStatus('unknown')
      }

      // 6. 通知父组件刷新数据
      onModeChange?.()
    } catch (err) {
      console.error('[ModeSettings] 切换失败:', err)
      setError('切换失败: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSwitching(false)
    }
  }

  const handleSaveOnlineConfig = async () => {
    if (!config) return

    if (!serverHost) {
      setError('请输入服务器地址')
      return
    }
    if (!userId) {
      setError('请输入用户名')
      return
    }

    setSwitching(true)
    setError('')

    try {
      config.online = {
        server_host: serverHost,
        server_port: parseInt(serverPort) || 8081,
        user_id: userId,
        user_name: userName || userId,
      }
      await saveConfig(config)
      setConfig({ ...config })
      await checkServer()
    } catch (err) {
      setError('保存失败')
    } finally {
      setSwitching(false)
    }
  }

  const handleSwitchAgentMode = async (mode: 'ta' | 'general') => {
    if (switching || agentMode === mode) return
    const modeLabel = mode === 'general' ? '通用模式' : 'TA 模式'
    const confirmed = window.confirm(
      `确认切换到${modeLabel}？\n\n将切换工作台界面，不会删除另一个模式的会话与记忆。`
    )
    if (!confirmed) return
    setSwitching(true)
    setError('')
    try {
      await setAgentMode(mode)
      setAgentModeState(mode)
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
      <SettingsSection
        title="工作模式"
        description="选择本地独立使用或连接公司服务器"
      >
        {/* 当前状态 */}
        <SettingsCard>
          <SettingsRow
            label={switching ? '切换中...' : (config?.mode === 'online' ? '联机模式' : '本地模式')}
            description={
              switching
                ? '正在断开连接并切换模式...'
                : config?.mode === 'online'
                  ? `${config.online.user_name || config.online.user_id} @ ${config.online.server_host}`
                  : '数据存储在本地，独立运行'
            }
            icon={
              switching
                ? <Loader2 size={18} className="animate-spin" />
                : config?.mode === 'online'
                  ? <Wifi size={18} />
                  : <WifiOff size={18} />
            }
          />
          <SettingsRow
            label={agentMode === 'general' ? '通用工作台' : 'TA 工作台'}
            description={
              agentMode === 'general'
                ? '会话级工作区，聚焦办公与编码任务'
                : '资产库、分析、审核、搜索与流水线工作流'
            }
            icon={agentMode === 'general' ? <Bot size={18} /> : <Package size={18} />}
          />
        </SettingsCard>

        {/* 错误提示 */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {/* 模式选择 */}
        <div className="grid grid-cols-2 gap-4">
          <div
            className={`p-4 border-2 rounded-xl cursor-pointer transition-all ${
              switching ? 'opacity-50 pointer-events-none' : ''
            } ${
              config?.mode === 'local'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
            onClick={() => !switching && handleSwitchMode('local')}
          >
            <div className="flex items-center gap-2 mb-2">
              <WifiOff size={20} />
              <span className="font-medium">本地模式</span>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• 使用自己的 LLM API Key</li>
              <li>• 数据存储在本地</li>
              <li>• 独立运行，不依赖服务器</li>
            </ul>
          </div>

          <div
            className={`p-4 border-2 rounded-xl cursor-pointer transition-all ${
              switching ? 'opacity-50 pointer-events-none' : ''
            } ${
              config?.mode === 'online'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
            onClick={() => !switching && handleSwitchMode('online')}
          >
            <div className="flex items-center gap-2 mb-2">
              <Wifi size={20} />
              <span className="font-medium">联机模式</span>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• 使用服务器 LLM 配额</li>
              <li>• 数据同步到服务器</li>
              <li>• 支持多人协作</li>
            </ul>
          </div>
        </div>
      </SettingsSection>

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

      {/* 联机模式配置 */}
      {config?.mode === 'online' && (
        <SettingsSection
          title="服务器配置"
          description="配置中心服务器连接信息"
          action={
            <button
              onClick={checkServer}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <RefreshCw size={12} />
              测试连接
            </button>
          }
        >
          <SettingsCard>
            {/* 服务器状态 */}
            {serverStatus !== 'unknown' && (
              <div className={`flex items-center gap-2 px-4 py-2 text-sm ${
                serverStatus === 'connected' ? 'text-green-600 bg-green-50' : 'text-destructive bg-destructive/5'
              }`}>
                {serverStatus === 'connected' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                {serverStatus === 'connected' ? '服务器连接正常' : '服务器连接失败'}
              </div>
            )}

            <div className="px-4 py-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">服务器地址</label>
                  <input
                    type="text"
                    value={serverHost}
                    onChange={(e) => setServerHost(e.target.value)}
                    placeholder="10.11.131.124"
                    className="mt-1 w-full px-3 py-1.5 text-sm bg-muted border border-border rounded-lg outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">端口</label>
                  <input
                    type="text"
                    value={serverPort}
                    onChange={(e) => setServerPort(e.target.value)}
                    placeholder="8081"
                    className="mt-1 w-full px-3 py-1.5 text-sm bg-muted border border-border rounded-lg outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <label className="text-sm font-medium">用户名</label>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="请输入用户名"
                    className="mt-1 w-full px-3 py-1.5 text-sm bg-muted border border-border rounded-lg outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>

              <button
                onClick={handleSaveOnlineConfig}
                disabled={switching}
                className="w-full py-2 bg-foreground text-background rounded-lg hover:opacity-90 disabled:opacity-50 text-sm font-medium"
              >
                {switching ? '保存中...' : '保存配置'}
              </button>
            </div>
          </SettingsCard>
        </SettingsSection>
      )}

      {/* 说明 */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>• 切换模式不会删除本地数据</p>
        <p>• 联机模式下，新的分析结果会同步到服务器</p>
        <p>• 本地模式下，所有数据存储在本地</p>
      </div>
    </div>
  )
}
