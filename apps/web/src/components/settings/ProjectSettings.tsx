/**
 * 项目配置设置（用户信息 + 项目配置）
 */

import React, { useState, useEffect } from 'react'
import { User, FolderOpen, Users, Key, FileText, ExternalLink, Copy, Check, Box, Cpu, Hash, Eye, EyeOff } from 'lucide-react'
import { SettingsSection } from './primitives'
import { fetchUserConfig, saveUserConfig } from '@/lib/user-config'

interface FieldMeta {
  key: string
  label: string
  desc: string
  icon: React.ReactNode
  type: 'text' | 'password'
  placeholder: string
  color: string
  ring: string
  bar: string
}

const USER_FIELDS: FieldMeta[] = [
  {
    key: 'name',
    label: '用户名',
    desc: '用于资产审核记录和会话关联',
    icon: <User size={14} />,
    type: 'text',
    placeholder: '输入用户名',
    color: 'text-blue-600 dark:text-blue-400',
    ring: 'ring-blue-500/30',
    bar: 'bg-blue-500/50',
  },
  {
    key: 'token',
    label: '认证 Token',
    desc: '中心模式使用，本地模式留空',
    icon: <Key size={14} />,
    type: 'password',
    placeholder: '留空表示本地模式',
    color: 'text-purple-600 dark:text-purple-400',
    ring: 'ring-purple-500/30',
    bar: 'bg-purple-500/50',
  },
  {
    key: 'group',
    label: '分组',
    desc: '角色组、场景组等（可选）',
    icon: <Users size={14} />,
    type: 'text',
    placeholder: '未设置',
    color: 'text-emerald-600 dark:text-emerald-400',
    ring: 'ring-emerald-500/30',
    bar: 'bg-emerald-500/50',
  },
]

interface ProjectFieldMeta {
  label: string
  desc: string
  icon: React.ReactNode
  value: string
  chip: string
  color: string
}

const PROJECT_FIELDS: ProjectFieldMeta[] = [
  {
    label: '项目名称',
    desc: '当前项目的显示名称',
    icon: <Hash size={14} />,
    value: '未配置',
    chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    color: 'text-amber-600 dark:text-amber-400',
  },
  {
    label: '引擎模板',
    desc: 'UE5 / Unity / 通用',
    icon: <Cpu size={14} />,
    value: '通用',
    chip: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
    color: 'text-blue-600 dark:text-blue-400',
  },
  {
    label: '资产根目录',
    desc: '项目资产文件的根目录',
    icon: <FolderOpen size={14} />,
    value: '未设置',
    chip: 'bg-muted text-muted-foreground',
    color: 'text-muted-foreground',
  },
]

export function ProjectSettings() {
  const [userName, setUserName] = useState('')
  const [userToken, setUserToken] = useState('')
  const [userGroup, setUserGroup] = useState('')
  const [savedField, setSavedField] = useState<string | null>(null)
  const [showToken, setShowToken] = useState(false)
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
    setSavedField(field)
    setTimeout(() => setSavedField(null), 1500)
  }

  const getValue = (key: string) => {
    if (key === 'name') return userName
    if (key === 'token') return userToken
    if (key === 'group') return userGroup
    return ''
  }

  const setValue = (key: string, v: string) => {
    if (key === 'name') setUserName(v)
    else if (key === 'token') setUserToken(v)
    else if (key === 'group') setUserGroup(v)
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
      {/* ===== 用户信息卡 ===== */}
      <SettingsSection
        title="用户信息"
        description="当前操作用户的基本信息，用于会话关联和协作标识"
      >
        <div className="space-y-2">
          {USER_FIELDS.map((field) => {
            const value = getValue(field.key)
            const isSaved = savedField === field.key
            return (
              <div
                key={field.key}
                className="group relative rounded-xl border border-foreground/10 bg-background overflow-hidden shadow-[0_2px_8px_-3px_rgb(0_0%_0/0.06)] hover:shadow-[0_4px_12px_-4px_rgb(0_0%_0/0.1)] hover:border-foreground/20 transition-all"
              >
                {/* 左侧主题色条 */}
                <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${field.bar}`} />

                <div className="flex items-center gap-4 pl-5 pr-4 py-3">
                  <span className={`flex items-center justify-center w-9 h-9 rounded-lg bg-foreground/5 dark:bg-foreground/10 shrink-0 ${field.color}`}>
                    {field.icon}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-foreground/90">{field.label}</span>
                      {isSaved && (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 animate-fade-in-up">
                          <Check size={10} strokeWidth={3} />
                          已保存
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-muted-foreground/80 leading-relaxed">{field.desc}</p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type={field.type === 'password' && !showToken ? 'password' : 'text'}
                      value={value}
                      onChange={(e) => setValue(field.key, e.target.value)}
                      onBlur={() => handleSave(field.key, value)}
                      placeholder={field.placeholder}
                      className="w-56 px-3 py-1.5 text-sm bg-muted/40 border border-border/40 rounded-lg outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/30 transition-all font-mono"
                    />
                    {field.type === 'password' && value && (
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title={showToken ? '隐藏' : '显示'}
                      >
                        {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </SettingsSection>

      {/* ===== 项目配置卡 ===== */}
      <SettingsSection title="项目配置" description="项目名称、引擎模板、资产目录等（只读）">
        <div className="grid grid-cols-3 gap-2">
          {PROJECT_FIELDS.map((field) => (
            <div
              key={field.label}
              className="rounded-xl border border-foreground/10 bg-background p-3 hover:border-foreground/20 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className={field.color}>{field.icon}</span>
                <span className="text-xs font-medium text-foreground/85">{field.label}</span>
              </div>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${field.chip}`}>
                {field.value}
              </span>
              <p className="text-[11px] text-muted-foreground/75 mt-1.5 leading-relaxed">{field.desc}</p>
            </div>
          ))}
        </div>
      </SettingsSection>

      {/* ===== 桌面应用卡（仅 Electron） ===== */}
      {isElectron && (
        <SettingsSection title="桌面应用" description="Electron 运行时、后端日志和本地数据目录">
          <div className="grid grid-cols-2 gap-2">
            {/* 后端日志 */}
            <div className="rounded-xl border border-foreground/10 bg-background p-3.5 hover:border-foreground/20 transition-colors">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex items-center justify-center w-7 h-7 rounded-md bg-foreground/5 dark:bg-foreground/10 text-foreground/70 shrink-0">
                    <FileText size={13} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground/90">后端日志</div>
                    <div className="text-[11px] text-muted-foreground/80 font-mono truncate" title={backendLogPath}>
                      {backendLogPath || 'backend.log'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={openBackendLog}
                    className="px-2 py-1 text-xs font-medium rounded-md border border-foreground/15 hover:bg-accent transition-colors inline-flex items-center gap-1"
                  >
                    <ExternalLink size={12} />
                    打开
                  </button>
                  <button
                    type="button"
                    onClick={copyBackendLogPath}
                    className="p-1 rounded-md border border-foreground/15 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    aria-label="复制后端日志路径"
                    title="复制路径"
                  >
                    <Copy size={12} />
                  </button>
                </div>
              </div>
            </div>

            {/* 本地数据目录 */}
            <div className="rounded-xl border border-foreground/10 bg-background p-3.5 hover:border-foreground/20 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex items-center justify-center w-7 h-7 rounded-md bg-foreground/5 dark:bg-foreground/10 text-foreground/70 shrink-0">
                    <FolderOpen size={13} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground/90">本地数据目录</div>
                    <div className="text-[11px] text-muted-foreground/80 leading-relaxed">Electron userData</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={openUserDataDir}
                  className="px-2 py-1 text-xs font-medium rounded-md border border-foreground/15 hover:bg-accent transition-colors inline-flex items-center gap-1 shrink-0"
                >
                  <ExternalLink size={12} />
                  打开目录
                </button>
              </div>
            </div>
          </div>
        </SettingsSection>
      )}
    </div>
  )
}
