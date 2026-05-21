/**
 * 项目配置设置（用户信息 + 项目配置）
 */

import React, { useState, useEffect } from 'react'
import { User, FolderOpen, Users, Key, FileText, ExternalLink, Copy } from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import { loadUserConfig, saveUserConfig, fetchUserConfig } from '@/lib/user-config'

export function ProjectSettings() {
  const [userName, setUserName] = useState('')
  const [userToken, setUserToken] = useState('')
  const [userGroup, setUserGroup] = useState('')
  const [loading, setLoading] = useState(true)
  const [backendLogPath, setBackendLogPath] = useState('')
  const isElectron = Boolean(window.electronAPI?.isElectron)

  useEffect(() => {
    fetchUserConfig().then((cfg) => {
      setUserName(cfg.name)
      setUserToken(cfg.token)
      setUserGroup(cfg.group)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!isElectron) return
    window.electronAPI?.getBackendLogPath?.()
      .then(setBackendLogPath)
      .catch(() => setBackendLogPath(''))
  }, [isElectron])

  const handleSave = async (field: string, value: string) => {
    await saveUserConfig({ [field]: value })
  }

  const openBackendLog = () => {
    window.electronAPI?.openBackendLog?.()
  }

  const openUserDataDir = () => {
    window.electronAPI?.openUserDataDir?.()
  }

  const copyBackendLogPath = () => {
    if (backendLogPath) navigator.clipboard?.writeText(backendLogPath)
  }

  return (
    <div className="space-y-6">
      <SettingsSection title="用户信息" description="当前操作用户的基本信息，用于会话关联和协作标识">
        <SettingsCard>
          <SettingsRow label="用户名" description="用于资产审核记录和会话关联" icon={<User size={16} />}>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              onBlur={() => handleSave('name', userName)}
              placeholder="输入用户名"
              className="w-48 px-2 py-1 text-xs bg-muted border border-border rounded outline-none focus:ring-1 focus:ring-ring text-right"
            />
          </SettingsRow>
          <SettingsRow label="认证 Token" description="中心模式使用，本地模式留空" icon={<Key size={16} />}>
            <input
              type="password"
              value={userToken}
              onChange={(e) => setUserToken(e.target.value)}
              onBlur={() => handleSave('token', userToken)}
              placeholder="留空表示本地模式"
              className="w-48 px-2 py-1 text-xs bg-muted border border-border rounded outline-none focus:ring-1 focus:ring-ring text-right"
            />
          </SettingsRow>
          <SettingsRow label="分组" description="角色组、场景组等（可选）" icon={<Users size={16} />}>
            <input
              type="text"
              value={userGroup}
              onChange={(e) => setUserGroup(e.target.value)}
              onBlur={() => handleSave('group', userGroup)}
              placeholder="未设置"
              className="w-48 px-2 py-1 text-xs bg-muted border border-border rounded outline-none focus:ring-1 focus:ring-ring text-right"
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="项目配置" description="项目名称、引擎模板、资产目录等">
        <SettingsCard>
          <SettingsRow label="项目名称" description="当前项目的显示名称">
            <span className="text-sm text-muted-foreground">未配置</span>
          </SettingsRow>
          <SettingsRow label="引擎模板" description="UE5 / Unity / 通用">
            <span className="text-sm text-muted-foreground">通用</span>
          </SettingsRow>
          <SettingsRow label="资产根目录" description="项目资产文件的根目录" icon={<FolderOpen size={16} />}>
            <span className="text-sm text-muted-foreground">未设置</span>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      {isElectron && (
        <SettingsSection title="桌面应用" description="Electron 运行时、后端日志和本地数据目录。">
          <SettingsCard>
            <SettingsRow label="后端日志" description={backendLogPath || 'backend.log'} icon={<FileText size={16} />}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openBackendLog}
                  className="h-8 px-2.5 rounded-md border border-border bg-background text-xs text-foreground hover:bg-accent inline-flex items-center gap-1.5"
                >
                  <ExternalLink size={14} />
                  打开
                </button>
                <button
                  type="button"
                  onClick={copyBackendLogPath}
                  className="h-8 w-8 rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground inline-flex items-center justify-center"
                  aria-label="复制后端日志路径"
                  title="复制后端日志路径"
                >
                  <Copy size={14} />
                </button>
              </div>
            </SettingsRow>
            <SettingsRow label="本地数据目录" description="打开 Electron userData 目录。" icon={<FolderOpen size={16} />}>
              <button
                type="button"
                onClick={openUserDataDir}
                className="h-8 px-2.5 rounded-md border border-border bg-background text-xs text-foreground hover:bg-accent inline-flex items-center gap-1.5"
              >
                <ExternalLink size={14} />
                打开目录
              </button>
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>
      )}
    </div>
  )
}
