/**
 * 模型设置 - Provider 列表 + 编辑子页
 *
 * 列表页：只显示 Provider，Switch 启用/禁用
 * 编辑页：基本信息 + 已启用模型 + 可用模型
 */

import React, { useState, useEffect, useRef } from 'react'
import * as RadixSwitch from '@radix-ui/react-switch'
import {
  Cpu, Loader2, Plus, X, Trash2, Pencil, ArrowLeft,
  CheckCircle2, Download, Search, Eye, EyeOff, Radio,
} from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import { localApiFetch } from '@/lib/api'
import { useConfirm } from '@/hooks/useConfirm'

// ========== Types ==========

interface ProviderModel {
  id: string
  name: string
  enabled: boolean
}

interface Provider {
  id: string
  name: string
  base_url: string
  protocol: 'openai' | 'anthropic'
  extra_headers?: Record<string, string>
  models: ProviderModel[]
  enabled: boolean
  has_api_key: boolean
}

type ViewMode = 'list' | 'create' | 'edit'

// ========== Component ==========

export function ModelSettings() {
  const { confirm, ConfirmUI } = useConfirm()

  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)

  // 表单状态
  const [formName, setFormName] = useState('')
  const [formBaseUrl, setFormBaseUrl] = useState('')
  const [formApiKey, setFormApiKey] = useState('')
  const [formProtocol, setFormProtocol] = useState<'openai' | 'anthropic'>('openai')
  const [formModels, setFormModels] = useState<ProviderModel[]>([])
  const [formDiscovered, setFormDiscovered] = useState<{ id: string; name: string }[]>([])
  const [showApiKey, setShowApiKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [discovering, setDiscovering] = useState(false)
  const [modelSearch, setModelSearch] = useState('')

  useEffect(() => { fetchProviders() }, [])

  // ========== API ==========

  const fetchProviders = async () => {
    try {
      const res = await localApiFetch('/api/config/providers')
      if (res.ok) {
        const data = await res.json()
        setProviders(data.providers || [])
      }
    } catch {} finally {
      setLoading(false)
    }
  }

  // ========== 列表页操作 ==========

  const handleToggleProvider = async (p: Provider) => {
    await localApiFetch(`/api/config/providers/${p.id}/enabled`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !p.enabled }),
    })
    fetchProviders()
  }

  const handleDeleteProvider = async (p: Provider) => {
    if (!await confirm(`确定删除「${p.name}」？模型配置将丢失。`, { danger: true })) return
    await localApiFetch(`/api/config/providers/${p.id}`, { method: 'DELETE' })
    fetchProviders()
  }

  // ========== 编辑页操作 ==========

  const openCreate = () => {
    setViewMode('create')
    setEditingProvider(null)
    setFormName('')
    setFormBaseUrl('')
    setFormApiKey('')
    setFormProtocol('openai')
    setFormModels([])
    setFormDiscovered([])
    setError('')
    setModelSearch('')
    setShowApiKey(false)
  }

  const openEdit = (p: Provider) => {
    setViewMode('edit')
    setEditingProvider(p)
    setFormName(p.name)
    setFormBaseUrl(p.base_url)
    setFormApiKey(p.has_api_key ? '••••••••' : '')
    setFormProtocol(p.protocol || 'openai')
    setFormModels([...p.models])
    setFormDiscovered([])
    setError('')
    setModelSearch('')
    setShowApiKey(false)
  }

  const goBack = () => {
    setViewMode('list')
    setEditingProvider(null)
    setError('')
  }

  const handleDiscover = async () => {
    setDiscovering(true)
    setError('')
    try {
      let res: Response
      if (viewMode === 'edit' && editingProvider) {
        // 编辑模式：用存储的 API Key 发现
        res = await localApiFetch(`/api/config/providers/${editingProvider.id}/discover`, { method: 'POST' })
      } else {
        // 创建模式：用表单中的 API Key 发现
        if (!formBaseUrl) { setError('请先填写 Base URL'); setDiscovering(false); return }
        res = await localApiFetch('/api/models/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base_url: formBaseUrl, api_key: formApiKey }),
        })
      }
      const data = await res.json()
      if (data.success && data.models?.length > 0) {
        const existingIds = new Set(formModels.map(m => m.id))
        const newlyFound = data.models.filter((m: { id: string }) => !existingIds.has(m.id))
        setFormDiscovered(newlyFound.map((m: { id: string; name: string }) => ({ id: m.id, name: m.name || m.id })))
      } else {
        setError(data.error || '未发现可用模型')
      }
    } catch { setError('请求失败') }
    setDiscovering(false)
  }

  const enableModel = (m: { id: string; name: string }) => {
    setFormModels(prev => [...prev, { id: m.id, name: m.name, enabled: true }])
    setFormDiscovered(prev => prev.filter(d => d.id !== m.id))
  }

  const disableModel = (modelId: string) => {
    const m = formModels.find(m => m.id === modelId)
    setFormModels(prev => prev.filter(m => m.id !== modelId))
    if (m) setFormDiscovered(prev => [...prev, { id: m.id, name: m.name }])
  }

  const handleSave = async () => {
    if (!formName.trim()) { setError('名称不能为空'); return }
    if (!formBaseUrl.trim()) { setError('Base URL 不能为空'); return }
    if (!formApiKey && viewMode === 'create') { setError('API Key 不能为空'); return }
    if (formModels.length === 0) { setError('请至少启用一个模型'); return }

    setSaving(true)
    setError('')
    try {
      const apiKeyToSave = formApiKey === '••••••••' ? '' : formApiKey
      // 合并所有模型：已启用 + 已发现（未启用）
      const allModels = [
        ...formModels,
        ...formDiscovered.map(m => ({ id: m.id, name: m.name, enabled: false })),
      ]

      let res: Response
      if (viewMode === 'create') {
        res = await localApiFetch('/api/config/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName, base_url: formBaseUrl, api_key: apiKeyToSave,
            protocol: formProtocol, models: allModels, enabled: true,
          }),
        })
      } else {
        // 更新 Provider 基本信息
        res = await localApiFetch(`/api/config/providers/${editingProvider!.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName, base_url: formBaseUrl, api_key: apiKeyToSave,
            protocol: formProtocol,
          }),
        })
      }
      const data = await res.json()
      if (data.success) {
        if (viewMode === 'create') {
          // 新建时后端已存 models，无需额外操作
        } else {
          // 编辑模式：同步模型列表
          const providerId = editingProvider!.id
          const oldModelIds = new Set(editingProvider!.models.map(m => m.id))
          const newModelIds = new Set(allModels.map(m => m.id))

          // 添加新模型
          for (const m of allModels) {
            if (!oldModelIds.has(m.id)) {
              await localApiFetch(`/api/config/providers/${providerId}/models`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: m.id, name: m.name }),
              })
            }
          }

          // 更新启用状态
          for (const m of allModels) {
            const old = editingProvider!.models.find(om => om.id === m.id)
            if (old && old.enabled !== m.enabled) {
              await localApiFetch(`/api/config/providers/${providerId}/models/${m.id}/enabled`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: m.enabled }),
              })
            }
          }

          // 删除不再存在的模型
          for (const oldId of oldModelIds) {
            if (!newModelIds.has(oldId)) {
              await localApiFetch(`/api/config/providers/${providerId}/models/${oldId}`, { method: 'DELETE' })
            }
          }
        }
        goBack()
        fetchProviders()
      } else {
        setError(data.error || '保存失败')
      }
    } catch { setError('网络错误') }
    setSaving(false)
  }

  const handleToggleModelInEdit = (modelId: string, currentEnabled: boolean) => {
    // 只更新本地状态，保存时统一同步
    setFormModels(prev => prev.map(m => m.id === modelId ? { ...m, enabled: !currentEnabled } : m))
  }

  // ========== 过滤 ==========

  const enabledModels = formModels.filter(m => m.enabled)
  const disabledModels = formModels.filter(m => !m.enabled)
  const filteredAvailable = modelSearch.trim()
    ? [...disabledModels, ...formDiscovered].filter(m =>
        m.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
        m.name.toLowerCase().includes(modelSearch.toLowerCase())
      )
    : [...disabledModels, ...formDiscovered]

  // ========== Loading ==========

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 size={20} className="animate-spin mr-2" />
        <span className="text-sm">加载中...</span>
      </div>
    )
  }

  // ========== 编辑/创建子页 ==========

  if (viewMode === 'create' || viewMode === 'edit') {
    return (
      <div className="space-y-6">
        {/* 顶栏 */}
        <div className="flex items-center gap-3">
          <button onClick={goBack} className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
            <ArrowLeft size={18} />
          </button>
          <h3 className="text-base font-semibold">{viewMode === 'create' ? '添加模型配置' : '编辑模型配置'}</h3>
        </div>

        {/* 基本信息 */}
        <SettingsSection title="基本信息">
          <SettingsCard>
            <div className="px-4 py-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">配置名称</label>
                  <input value={formName} onChange={e => setFormName(e.target.value)}
                    placeholder="如: DeepSeek"
                    className="w-full mt-1 px-3 py-1.5 text-sm bg-muted border border-border rounded-lg outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">协议</label>
                  <select value={formProtocol} onChange={e => setFormProtocol(e.target.value as 'openai' | 'anthropic')}
                    className="w-full mt-1 px-3 py-1.5 text-sm bg-muted border border-border rounded-lg outline-none focus:ring-1 focus:ring-ring">
                    <option value="openai">OpenAI（/v1/chat/completions）</option>
                    <option value="anthropic">Anthropic（/v1/messages）</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Base URL</label>
                <input value={formBaseUrl} onChange={e => setFormBaseUrl(e.target.value)}
                  placeholder="https://api.deepseek.com/v1"
                  className="w-full mt-1 px-3 py-1.5 text-sm bg-muted border border-border rounded-lg outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">API Key {viewMode === 'create' && <span className="text-destructive">*</span>}</label>
                <div className="relative mt-1">
                  <input type={showApiKey ? 'text' : 'password'} value={formApiKey}
                    onChange={e => setFormApiKey(e.target.value)}
                    placeholder={viewMode === 'create' ? 'sk-...' : '不修改则留空'}
                    className="w-full px-3 py-1.5 text-sm bg-muted border border-border rounded-lg outline-none focus:ring-1 focus:ring-ring pr-9" />
                  <button onClick={() => setShowApiKey(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground">
                    {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>
          </SettingsCard>
        </SettingsSection>

        {/* 已启用模型 */}
        <SettingsSection title="已启用模型" description={`${enabledModels.length} 个模型`}>
          <SettingsCard>
            {enabledModels.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                还没有启用任何模型，从下方可用模型中选择
              </div>
            ) : (
              enabledModels.map(m => (
                <div key={m.id} className="flex items-center gap-2 px-4 py-2.5 group">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  <span className="text-sm flex-1 truncate">{m.name}</span>
                  {m.name !== m.id && <span className="text-xs text-muted-foreground font-mono truncate">{m.id}</span>}
                  <button onClick={() => viewMode === 'edit' && editingProvider
                    ? handleToggleModelInEdit(m.id, true)
                    : disableModel(m.id)
                  }
                    className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                    <X size={14} />
                  </button>
                </div>
              ))
            )}
          </SettingsCard>
        </SettingsSection>

        {/* 可用模型 */}
        <SettingsSection
          title="可用模型"
          action={
            <button onClick={handleDiscover} disabled={discovering || !formBaseUrl}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border/50 rounded-lg px-2.5 py-1 hover:bg-accent transition-colors disabled:opacity-50">
              {discovering ? <><Loader2 size={12} className="animate-spin" /> 发现中...</> : <><Download size={12} /> 从 API 获取</>}
            </button>
          }
        >
          <SettingsCard>
            {/* 搜索 */}
            {filteredAvailable.length > 5 && (
              <div className="px-4 py-2 border-b border-border/50">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={modelSearch} onChange={e => setModelSearch(e.target.value)}
                    placeholder="搜索模型..."
                    className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted border border-border rounded-lg outline-none focus:ring-1 focus:ring-ring" />
                </div>
              </div>
            )}
            {filteredAvailable.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                {formDiscovered.length === 0 && disabledModels.length === 0
                  ? '点击「从 API 获取」发现可用模型'
                  : '没有匹配的模型'}
              </div>
            ) : (
              filteredAvailable.map(m => (
                <button key={m.id} onClick={() => {
                  const inForm = disabledModels.find(dm => dm.id === m.id)
                  if (inForm && editingProvider) {
                    handleToggleModelInEdit(m.id, false)
                  } else {
                    enableModel(m)
                  }
                }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-accent transition-colors group">
                  <span className="w-3.5 shrink-0" />
                  <span className="truncate flex-1">{m.name}</span>
                  {m.name !== m.id && <span className="text-xs text-muted-foreground font-mono truncate">{m.id}</span>}
                </button>
              ))
            )}
          </SettingsCard>
        </SettingsSection>

        {error && <p className="text-sm text-destructive px-1">{error}</p>}

        {/* 保存按钮 */}
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 bg-foreground text-background rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
            {saving ? '保存中...' : viewMode === 'create' ? '创建' : '保存'}
          </button>
          <button onClick={goBack}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border/50 rounded-xl hover:bg-accent transition-colors">
            取消
          </button>
        </div>
        {ConfirmUI}
      </div>
    )
  }

  // ========== 列表页 ==========

  return (
    <div className="space-y-6">
      <SettingsSection
        title="模型配置"
        description="管理 AI 供应商连接，配置 API Key 和可用模型"
        action={
          <button onClick={openCreate} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border/50 rounded-lg px-2.5 py-1 hover:bg-accent transition-colors">
            <Plus size={12} /> 添加配置
          </button>
        }
      >
        <SettingsCard>
          {providers.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              暂无配置，点击「添加配置」开始
            </div>
          ) : (
            providers.map(p => {
              const enabledCount = p.models.filter(m => m.enabled).length
              return (
                <div key={p.id} className="group">
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* 图标 */}
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Radio size={14} className="text-muted-foreground" />
                    </div>

                    {/* 名称 + 描述 */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {p.protocol === 'anthropic' ? 'Anthropic' : 'OpenAI'} · {enabledCount} 个模型已启用
                      </div>
                    </div>

                    {/* hover 操作按钮 */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(p)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDeleteProvider(p)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {/* Switch 开关 */}
                    <RadixSwitch.Root
                      checked={p.enabled}
                      onCheckedChange={() => handleToggleProvider(p)}
                      className="w-9 h-5 bg-input rounded-full relative data-[state=checked]:bg-foreground transition-colors shrink-0"
                    >
                      <RadixSwitch.Thumb className="block w-4 h-4 bg-background rounded-full shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-[18px]" />
                    </RadixSwitch.Root>
                  </div>
                </div>
              )
            })
          )}
        </SettingsCard>
      </SettingsSection>
      {ConfirmUI}
    </div>
  )
}
