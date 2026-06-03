/**
 * 关于与帮助
 */

import React, { useState, useEffect, useCallback } from 'react'
import { RefreshCw, CheckCircle2, AlertCircle, ExternalLink, Download, Info } from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import { HelpGuide } from './HelpGuide'
interface UpdateStatus {
  state: string
  version?: string
  error?: string
}

export function AboutSettings() {
  const [version, setVersion] = useState('')
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    const api = (window as any).electronAPI
    if (api?.getAppVersion) {
      api.getAppVersion().then((v: string) => setVersion(v))
    }
    if (api?.updater) {
      api.updater.getStatus().then((s: UpdateStatus) => {
        if (s && s.state !== 'idle') setUpdateStatus(s)
      })
      api.updater.onStatusChanged((s: UpdateStatus) => {
        setUpdateStatus(s)
        if (s.state !== 'checking') setChecking(false)
      })
    }
  }, [])

  const handleCheckUpdate = useCallback(async () => {
    setChecking(true)
    setUpdateStatus(null)
    const api = (window as any).electronAPI
    if (api?.updater) {
      await api.updater.checkForUpdates()
    } else {
      setUpdateStatus({ state: 'error', error: '当前环境不支持自动更新' })
      setChecking(false)
    }
  }, [])

  const handleRestart = useCallback(() => {
    (window as any).electronAPI?.updater?.quitAndInstall()
  }, [])

  const isElectron = typeof window !== 'undefined' && (window as any).electronAPI?.isElectron

  const statusText = () => {
    if (checking) return '检查中...'
    if (!updateStatus) return ''
    switch (updateStatus.state) {
      case 'checking': return '正在检查更新...'
      case 'available': return `发现新版本 ${updateStatus.version || ''}`
      case 'downloading': return '正在下载更新...'
      case 'downloaded': return `更新已下载 (${updateStatus.version || ''})`
      case 'not-available': return '已是最新版本'
      case 'error': return `检查失败: ${updateStatus.error || '未知错误'}`
      default: return ''
    }
  }

  return (
    <div className="space-y-6">
      <SettingsSection title="关于 TAgent" description="版本信息和更新">
        <SettingsCard>
          <SettingsRow label="版本号" icon={<Info size={16} />}>
            <span className="text-sm font-mono">{version || '...'}</span>
          </SettingsRow>

          {isElectron && (
            <SettingsRow
              label="应用更新"
              description={statusText() || '点击检查是否有新版本'}
              icon={
                updateStatus?.state === 'downloaded' ? <CheckCircle2 size={16} className="text-success" />
                : updateStatus?.state === 'error' ? <AlertCircle size={16} className="text-destructive" />
                : updateStatus?.state === 'downloading' ? <RefreshCw size={16} className="text-primary animate-spin" />
                : <Download size={16} />
              }
            >
              <div className="flex gap-2">
                {updateStatus?.state === 'downloaded' && (
                  <button
                    onClick={handleRestart}
                    className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/80 transition-colors"
                  >
                    重启更新
                  </button>
                )}
                <button
                  onClick={handleCheckUpdate}
                  disabled={checking || updateStatus?.state === 'downloading'}
                  className="text-xs bg-muted text-foreground px-3 py-1.5 rounded-lg hover:bg-accent disabled:opacity-50 transition-colors"
                >
                  {checking ? '检查中...' : '检查更新'}
                </button>
              </div>
            </SettingsRow>
          )}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="链接" description="项目资源">
        <SettingsCard>
          <SettingsRow label="GitHub 仓库" icon={<ExternalLink size={16} />}>
            <a
              href="https://github.com/Frank-LiangMX/TA_Agent"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              github.com/Frank-LiangMX/TA_Agent
            </a>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <HelpGuide />
    </div>
  )
}
