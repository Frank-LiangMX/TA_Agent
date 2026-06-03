/**
 * 模型设置 - Provider / 模型两层结构
 *
 * Provider = API 提供方（如 DeepSeek）
 * Model = Provider 下的具体模型（如 deepseek-v4-pro）
 */

import React, { useState, useEffect } from 'react'
import {
  Cpu, Loader2, Plus, X, Trash2, ChevronRight, ChevronDown,
  CheckCircle2, Circle, Download, Search, Eye, EyeOff, Zap
} from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import { localApiFetch } from '@/lib/api'
import { useConfirm } from '@/hooks/useConfirm'
import { Tooltip } from '@/components/ui/Tooltip'

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

interface DiscoveredModel {
  id: string
  name: string
}

// ========== Form State ==========

interface ProviderForm {
  name: string
  base_url: string
  api_key: string
  protocol: 'openai' | 'anthropic'
  extra_headers: Record<string, string>
  models: ProviderModel[]   // 已选择要启用的模型
  discovered: DiscoveredModel[]  // 从 API 发现但尚未添加的
}

// ========== Component ==========

export function ModelSettings() {
  const { confirm, ConfirmUI } = useConfirm()

  const [providers, setProviders] = useState<Provider[]>([])
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null)
  const [activeModelId, setActiveModelId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // 新增 / 编辑 Provider 表单
  const [editingId, setEditingId] = useState<string | null>(null)  // null = 不编辑，'__new__' = 新增
  const [form, setForm] = useState<ProviderForm>({
    name: '', base_url: '', api_key: '', protocol: 'openai',
    extra_headers: {}, models: [], discovered: [],
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [discovering, setDiscovering] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)

  // 模型搜索过滤
  const [modelFilter, setModelFilter] = useState('')

  useEffect(() => { fetchProviders() }, [])

  // ========== API ==========

  const fetchProviders = async () => {
    try {
      const res = await localApiFetch('/api/config/providers')
      if (res.ok) {
        const data = await res.json()
        setProviders(data.providers || [])
        setActiveProviderId(data.active_provider_id || null)
        setActiveModelId(data.active_model_id || null)
      }
    } catch {} finally {
      setLoading(false)
    }
  }

  // ========== Provider 操作 ==========

  const handleAddProvider = () => {
    setEditingId('__new__')
    setForm({
      name: '', base_url: '', api_key: '', protocol: 'openai',
      extra_headers: {}, models: [], discovered: [],
    })
    setError('')
  }

  const handleEditProvider = (p: Provider) => {
    setEditingId(p.id)
    setForm({
      name: p.name,
      base_url: p.base_url,
      api_key: p.has_api_key ? '••••••••' : '',
      protocol: p.protocol || 'openai',
      extra_headers: p.extra_headers || {},
      models: [...p.models],
      discovered: [],
    })
    setError('')
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setForm({ name: '', base_url: '', api_key: '', protocol: 'openai', extra_headers: {}, models: [], discovered: [] })
    setError('')
  }

  const handleDiscover = async () => {
    if (!form.base_url) { setError('请先填写 Base URL'); return }
    setDiscovering(true)
    setError('')
    try {
      const res = await localApiFetch('/api/models/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_url: form.base_url, api_key: form.api_key }),
      })
      const data = await res.json()
      if (data.success && data.models?.length > 0) {
        // 合并：已有模型标记为 selected，新发现的加入 discovered 列表
        const existingIds = new Set(form.models.map(m => m.id))
        const alreadyEnabled = data.models.filter((m: DiscoveredModel) => existingIds.has(m.id))
        const newlyFound = data.models.filter((m: DiscoveredModel) => !existingIds.has(m.id))
        setForm(f => ({
          ...f,
          models: [
            ...f.models,
            ...alreadyEnabled.map((m: DiscoveredModel) => ({ id: m.id, name: m.name || m.id, enabled: true })),
          ],
          discovered: newlyFound.map((m: DiscoveredModel) => ({ id: m.id, name: m.name || m.id })),
        }))
      } else {
        setError(data.error || '未发现可用模型')
      }
    } catch { setError('请求失败') }
    setDiscovering(false)
  }

  const handleToggleDiscoveredModel = (m: DiscoveredModel) => {
    setForm(f => {
      const alreadySelected = f.models.some(pm => pm.id === m.id)
      if (alreadySelected) {
        return { ...f, models: f.models.filter(pm => pm.id !== m.id) }
      } else {
        return { ...f, models: [...f.models, { id: m.id, name: m.name || m.id, enabled: true }] }
      }
    })
  }

  const handleRemoveSelectedModel = (modelId: string) => {
    setForm(f => ({ ...f, models: f.models.filter(m => m.id !== modelId) }))
  }

  const handleSaveProvider = async () => {
    if (!form.name.trim()) { setError('名称不能为空'); return }
    if (!form.base_url.trim()) { setError('Base URL 不能为空'); return }
    if (!form.api_key && editingId === '__new__') { setError('API Key 不能为空'); return }
    if (form.models.length === 0) { setError('请至少选择一个模型'); return }

    setSaving(true)
    setError('')
    try {
      const apiKeyToSave = form.api_key === '••••••••' ? '' : form.api_key
      let res: Response
      if (editingId === '__new__') {
        res = await localApiFetch('/api/config/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            base_url: form.base_url,
            api_key: apiKeyToSave,
            protocol: form.protocol,
            extra_headers: form.extra_headers,
            models: form.models,
            enabled: true,
          }),
        })
      } else {
        res = await localApiFetch(`/api/config/providers/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            base_url: form.base_url,
            api_key: apiKeyToSave,
            protocol: form.protocol,
            extra_headers: form.extra_headers,
          }),
        })
      }
      const data = await res.json()
      if (data.success) {
        // 如果是新创建，还需要添加模型
        if (editingId === '__new__' && form.models.length > 0) {
          const providerId = data.id || data.provider?.id
          for (const m of form.models) {
            await localApiFetch(`/api/config/providers/${providerId}/models`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: m.id, name: m.name }),
            })
            if (!m.enabled) {
              await localApiFetch(`/api/config/providers/${providerId}/models/${m.id}/enabled`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: false }),
              })
            }
          }
        }
        setEditingId(null)
        fetchProviders()
      } else {
        setError(data.error || '保存失败')
      }
    } catch { setError('网络错误') }
    setSaving(false)
  }

  const handleDeleteProvider = async (id: string) => {
    if (!await confirm('确定删除此 Provider？模型配置将丢失。', { danger: true })) return
    setDeleting(id)
    try {
      const res = await localApiFetch(`/api/config/providers/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        if (activeProviderId === id) setActiveProviderId(null)
        fetchProviders()
      }
    } finally { setDeleting(null) }
  }

  const handleToggleProviderEnabled = async (p: Provider) => {
    await localApiFetch(`/api/config/providers/${p.id}/enabled`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !p.enabled }),
    })
    fetchProviders()
  }

  // ========== Model 操作 ==========

  const handleToggleModelEnabled = async (providerId: string, modelId: string, currentEnabled: boolean) => {
    await localApiFetch(`/api/config/providers/${providerId}/models/${modelId}/enabled`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !currentEnabled }),
    })
    fetchProviders()
  }

  const handleAddModelManually = (providerId: string) => {
    const modelId = prompt('模型 ID（如 deepseek-v4-pro）：')
    if (!modelId?.trim()) return
    const modelName = prompt('显示名称（可选）：') || modelId.trim()
    localApiFetch(`/api/config/providers/${providerId}/models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: modelId.trim(), name: modelName }),
    }).then(() => fetchProviders())
  }

  const handleRemoveModel = async (providerId: string, modelId: string) => {
    if (!await confirm('从 Provider 移除此模型？')) return
    await localApiFetch(`/api/config/providers/${providerId}/models/${modelId}`, { method: 'DELETE' })
    fetchProviders()
  }

  // ========== Render ==========

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 size={20} className="animate-spin mr-2" />
        <span className="text-sm">加载中...</span>
      </div>
    )
  }

  const isNew = editingId === '__new__'
  const isEditing = editingId !== null

  // 已启用的模型
  const enabledModels = (p: Provider) => p.models.filter(m => m.enabled)
  const disabledModels = (p: Provider) => p.models.filter(m => !m.enabled)

  // 过滤后的可用模型
  const filteredDisabled = (p: Provider) => {
    if (!modelFilter.trim()) return disabledModels(p)
    const kw = modelFilter.toLowerCase()
    return disabledModels(p).filter(m => m.id.toLowerCase().includes(kw) || m.name.toLowerCase().includes(kw))
  }

  return (
    <div className="space-y-4">
      <SettingsSection
        title="模型配置"
        description="管理 API Provider 及其下的模型"
        action={
          isEditing ? null : (
            <button onClick={handleAddProvider} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <Plus size={12} /> 添加 Provider
            </button>
          )
        }
      >
        <SettingsCard>
          {/* ========== 新增 / 编辑表单 ========== */}
          {isEditing && (
            <div className="px-4 py-3 border-b border-border bg-muted/50 space-y-3">
              <div className="text-xs font-medium">{isNew ? '新增 Provider' : '编辑 Provider'}</div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">名称</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="如: DeepSeek" className="w-full mt-0.5 px-2 py-1.5 text-xs bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">协议</label>
                  <select value={form.protocol} onChange={e => setForm(f => ({ ...f, protocol: e.target.value as 'openai' | 'anthropic' }))}
                    className="w-full mt-0.5 px-2 py-1.5 text-xs bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring">
                    <option value="openai">OpenAI（/v1/chat/completions）</option>
                    <option value="anthropic">Anthropic（/v1/messages）</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Base URL</label>
                <input value={form.base_url} onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))}
                  placeholder="https://api.deepseek.com/v1"
                  className="w-full mt-0.5 px-2 py-1.5 text-xs bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring" />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">API Key {isNew && <span className="text-destructive">*</span>}</label>
                <div className="relative">
                  <input type={showApiKey ? 'text' : 'password'} value={form.api_key}
                    onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
                    placeholder={isNew ? 'sk-...' : '不修改则留空'}
                    className="w-full mt-0.5 px-2 py-1.5 text-xs bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring pr-8" />
                  <button onClick={() => setShowApiKey(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
                    {showApiKey ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
              </div>

              {/* 发现模型 */}
              <button onClick={handleDiscover} disabled={discovering || !form.base_url}
                className="w-full text-xs bg-muted hover:bg-accent text-muted-foreground hover:text-foreground px-3 py-1.5 rounded border border-border/50 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                {discovering ? <><Loader2 size={12} className="animate-spin" /> 发现中...</> : <><Download size={12} /> 从 API 发现模型</>}
              </button>

              {/* 发现的模型列表（可勾选） */}
              {form.discovered.length > 0 && (
                <div className="border border-border/50 rounded-lg max-h-[180px] overflow-y-auto">
                  <div className="px-2 py-1 text-[11px] text-muted-foreground bg-muted/50 border-b border-border/50">
                    发现 {form.discovered.length} 个模型，点击勾选启用
                  </div>
                  {form.discovered.map(m => {
                    const selected = form.models.some(pm => pm.id === m.id)
                    return (
                      <button key={m.id} onClick={() => handleToggleDiscoveredModel(m)}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors ${selected ? 'bg-primary/10 text-primary' : 'hover:bg-accent'}`}>
                        {selected ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                        <span className="truncate">{m.name || m.id}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground font-mono">{m.id}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* 已选择的模型 */}
              {form.models.length > 0 && (
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1">已选择 {form.models.length} 个模型</div>
                  <div className="flex flex-wrap gap-1">
                    {form.models.map(m => (
                      <span key={m.id} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                        {m.name || m.id}
                        <button onClick={() => handleRemoveSelectedModel(m.id)} className="hover:text-destructive"><X size={10} /></button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {error && <p className="text-xs text-destructive">{error}</p>}

              <div className="flex gap-2">
                <button onClick={handleSaveProvider} disabled={saving}
                  className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/80 disabled:opacity-50">
                  {saving ? '保存中...' : '保存'}
                </button>
                <button onClick={handleCancelEdit}
                  className="text-xs bg-muted text-muted-foreground px-3 py-1.5 rounded hover:bg-muted/80">
                  取消
                </button>
              </div>
            </div>
          )}

          {/* ========== Provider 列表 ========== */}
          {providers.length === 0 && !isEditing ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              暂无 Provider，点击上方添加
            </div>
          ) : (
            providers.map(p => {
              const isExpanded = activeProviderId === p.id
              const isActive = activeProviderId === p.id && activeModelId
              return (
                <div key={p.id} className="border-b border-border/50 last:border-0">
                  {/* Provider 主行 */}
                  <div className={`flex items-center gap-2 px-4 py-2.5 ${isActive ? 'bg-primary/5' : 'hover:bg-muted/30'} transition-colors`}>
                    {/* 展开/收起 */}
                    <button onClick={() => setActiveProviderId(isExpanded ? null : p.id)}
                      className="p-0.5 text-muted-foreground hover:text-foreground">
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    {/* 图标 */}
                    <Cpu size={14} className="text-muted-foreground shrink-0" />

                    {/* 名称 */}
                    <span className="text-sm flex-1 truncate">{p.name}</span>

                    {/* Base URL */}
                    <span className="text-xs text-muted-foreground truncate hidden md:inline">{p.base_url}</span>

                    {/* 启用标签 */}
                    {isActive && <span className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">已启用</span>}

                    {/* Provider 启用开关 */}
                    <button onClick={() => handleToggleProviderEnabled(p)}
                      className={`p-1 shrink-0 ${p.enabled ? 'text-emerald-500' : 'text-muted-foreground'}`}
                      title={p.enabled ? '点击禁用' : '点击启用'}>
                      {p.enabled ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                    </button>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Tooltip content="编辑">
                        <button onClick={() => handleEditProvider(p)} className="p-1 text-muted-foreground hover:text-foreground">
                          <Zap size={13} />
                        </button>
                      </Tooltip>
                      <Tooltip content="删除">
                        <button onClick={() => handleDeleteProvider(p.id)} disabled={deleting === p.id}
                          className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-50">
                          {deleting === p.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      </Tooltip>
                    </div>
                  </div>

                  {/* ========== 展开的模型列表 ========== */}
                  {isExpanded && (
                    <div className="pl-6 pr-4 pb-3 space-y-1">
                      {/* 已启用模型 */}
                      {enabledModels(p).length > 0 && (
                        <div className="mb-2">
                          <div className="text-[11px] text-muted-foreground px-2 py-1">已启用</div>
                          {enabledModels(p).map(m => (
                            <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/50 group">
                              <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                              <span className="text-xs flex-1">{m.name || m.id}</span>
                              <span className="text-[10px] text-muted-foreground font-mono">{m.id}</span>
                              <button onClick={() => handleToggleModelEnabled(p.id, m.id, true)}
                                className="p-0.5 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100">
                                <Circle size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 可用模型（未启用）+ 搜索 */}
                      {filteredDisabled(p).length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <div className="text-[11px] text-muted-foreground px-2 py-1">
                              可用（{disabledModels(p).length}）
                            </div>
                            {disabledModels(p).length > 5 && (
                              <div className="relative flex-1 max-w-[160px]">
                                <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <input value={modelFilter} onChange={e => setModelFilter(e.target.value)}
                                  placeholder="搜索..."
                                  className="w-full h-6 pl-6 pr-2 text-[11px] bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring" />
                              </div>
                            )}
                          </div>
                          {filteredDisabled(p).map(m => (
                            <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/50 group">
                              <Circle size={12} className="text-muted-foreground shrink-0" />
                              <span className="text-xs flex-1">{m.name || m.id}</span>
                              <span className="text-[10px] text-muted-foreground font-mono">{m.id}</span>
                              <button onClick={() => handleToggleModelEnabled(p.id, m.id, false)}
                                className="p-0.5 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100">
                                <CheckCircle2 size={12} />
                              </button>
                              <button onClick={() => handleRemoveModel(p.id, m.id)}
                                className="p-0.5 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100">
                                <Trash2 size={11} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 空状态 */}
                      {p.models.length === 0 && (
                        <div className="text-xs text-muted-foreground px-2 py-2">暂无模型</div>
                      )}

                      {/* 手动添加模型 */}
                      <button onClick={() => handleAddModelManually(p.id)}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary px-2 py-1 mt-1">
                        <Plus size={10} /> 手动添加模型
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </SettingsCard>
      </SettingsSection>

      <div className="text-xs text-muted-foreground px-2">
        💡 点击展开 Provider 选择具体模型，被选中的模型会用于所有 LLM 调用
      </div>
      {ConfirmUI}
    </div>
  )
}
