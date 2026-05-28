/**
 * 模型设置
 *
 * 本地模式：完整的模型管理（增删改查 + 切换启用）
 */

import React, { useState, useEffect } from 'react'
import { Cpu, Check, Loader2, Plus, X, Edit2, Trash2, Star, StarOff } from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import { API_BASE } from '@/lib/api'

interface Model {
  id: string
  name: string
  base_url: string
  model: string
  api_key?: string
  protocol?: 'openai' | 'anthropic'
  extra_headers?: Record<string, string>
  has_api_key?: boolean
}

interface ModelWithKey extends Model {
  api_key: string
}

export function ModelSettings() {
  const [models, setModels] = useState<Model[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null) // editing model id
  const [isNew, setIsNew] = useState(false)
  const [form, setForm] = useState<ModelWithKey>({
    id: '',
    name: '',
    base_url: '',
    model: '',
    api_key: '',
    protocol: 'openai',
    extra_headers: {},
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [discoveredModels, setDiscoveredModels] = useState<{ id: string; name: string }[]>([])
  const [discovering, setDiscovering] = useState(false)

  useEffect(() => { fetchModels() }, [])

  const fetchModels = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/config/models`)
      if (res.ok) {
        const data = await res.json()
        setModels(data.models || [])
        setActiveId(data.active_id || null)
      }
    } catch {} finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setIsNew(true)
    setEditing('new')
    setForm({ id: '', name: '', base_url: '', model: '', api_key: '', protocol: 'openai', extra_headers: {} })
    setError('')
    setDiscoveredModels([])
  }

  const handleEdit = (model: Model) => {
    setIsNew(false)
    setEditing(model.id)
    // 如果已有 API Key，显示为掩码；否则为空
    setForm({
      ...model,
      api_key: model.has_api_key ? '••••••••' : '',
      protocol: model.protocol || 'openai',
      extra_headers: model.extra_headers || {},
    })
    setError('')
  }

  const handleCancel = () => {
    setEditing(null)
    setIsNew(false)
    setError('')
    setDiscoveredModels([])
  }

  const handleSave = async () => {
    if (!form.name) { setError('名称不能为空'); return }
    if (!form.base_url) { setError('Base URL 不能为空'); return }
    if (!form.model) { setError('模型不能为空'); return }
    if (!form.api_key && isNew) { setError('API Key 不能为空'); return }

    setSaving(true)
    setError('')

    try {
      // 如果 api_key 是掩码 '••••••••'，不发送（保持原样）
      const apiKeyToSave = form.api_key === '••••••••' ? '' : form.api_key

      let res: Response
      if (isNew) {
        res = await fetch(`${API_BASE}/api/config/models`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, api_key: apiKeyToSave }),
        })
      } else {
        res = await fetch(`${API_BASE}/api/config/models/${editing}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, api_key: apiKeyToSave }),
        })
      }

      const data = await res.json()
      if (data.success) {
        setEditing(null)
        setIsNew(false)
        fetchModels()
      } else {
        setError(data.error || '保存失败')
      }
    } catch {
      setError('网络错误')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这个模型？')) return
    setDeleting(id)
    try {
      const res = await fetch(`${API_BASE}/api/config/models/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        fetchModels()
      }
    } finally {
      setDeleting(null)
    }
  }

  const handleActivate = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/config/models/${id}/activate`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setActiveId(id)
        fetchModels()
      }
    } catch {}
  }

  const handleDiscover = async () => {
    if (!form.base_url) {
      setError('请先填写 Base URL')
      return
    }
    setDiscovering(true)
    setDiscoveredModels([])
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/models/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_url: form.base_url, api_key: form.api_key }),
      })
      const data = await res.json()
      if (data.success && data.models?.length > 0) {
        setDiscoveredModels(data.models)
      } else {
        setError(data.error || '未发现可用模型')
      }
    } catch {
      setError('请求失败，请检查网络')
    }
    setDiscovering(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 size={20} className="animate-spin mr-2" />
        <span className="text-sm">加载中...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SettingsSection
        title="模型配置"
        description="管理多个 LLM 模型配置"
        action={
          editing ? null : (
            <button
              onClick={handleAdd}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Plus size={12} />
              添加模型
            </button>
          )
        }
      >
        <SettingsCard>
          {/* 编辑/新增表单 */}
          {editing && (
            <div className="px-4 py-3 border-b border-border bg-muted/50">
              <div className="text-xs font-medium mb-3">{isNew ? '添加新模型' : '编辑模型'}</div>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">名称</label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="如: Claude 3.5"
                      className="w-full mt-0.5 px-2 py-1.5 text-xs bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">模型</label>
                    <input
                      value={form.model}
                      onChange={(e) => setForm({ ...form, model: e.target.value })}
                      placeholder="如: claude-3-5-sonnet-20241022"
                      className="w-full mt-0.5 px-2 py-1.5 text-xs bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Base URL</label>
                  <input
                    value={form.base_url}
                    onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                    placeholder="https://api.anthropic.com/v1"
                    className="w-full mt-0.5 px-2 py-1.5 text-xs bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">协议</label>
                  <select
                    value={form.protocol || 'openai'}
                    onChange={(e) => setForm({ ...form, protocol: e.target.value as 'openai' | 'anthropic' })}
                    className="w-full mt-0.5 px-2 py-1.5 text-xs bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="openai">OpenAI（/v1/chat/completions）</option>
                    <option value="anthropic">Anthropic（/v1/messages）</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">API Key {isNew && <span className="text-destructive">*</span>}</label>
                  <input
                    type="password"
                    value={form.api_key}
                    onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                    placeholder={isNew ? 'sk-ant-...' : '不修改则留空'}
                    className="w-full mt-0.5 px-2 py-1.5 text-xs bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                {/* 发现模型按钮 */}
                <button
                  onClick={handleDiscover}
                  disabled={discovering || !form.base_url}
                  className="w-full text-xs bg-muted hover:bg-accent text-muted-foreground hover:text-foreground px-3 py-1.5 rounded border border-border/50 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {discovering ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      发现中...
                    </>
                  ) : (
                    '发现模型'
                  )}
                </button>
                {/* 发现的模型列表 */}
                {discoveredModels.length > 0 && (
                  <div className="border border-border/50 rounded-lg max-h-[200px] overflow-y-auto">
                    <div className="px-2 py-1 text-[11px] text-muted-foreground bg-muted/50 border-b border-border/50">
                      发现 {discoveredModels.length} 个模型，点击选择
                    </div>
                    {discoveredModels.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setForm({ ...form, model: m.id, name: form.name || m.name })
                          setDiscoveredModels([])
                        }}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-accent transition-colors ${
                          form.model === m.id ? 'bg-primary/10 text-primary' : ''
                        }`}
                      >
                        <Cpu size={11} className="shrink-0 text-muted-foreground" />
                        <span className="truncate">{m.name || m.id}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground font-mono">{m.id}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div>
                  <label className="text-xs text-muted-foreground">Extra Headers (JSON)</label>
                  <input
                    value={JSON.stringify(form.extra_headers || {})}
                    onChange={(e) => {
                      try {
                        setForm({ ...form, extra_headers: JSON.parse(e.target.value) })
                      } catch {}
                    }}
                    placeholder='{"anthropic-version": "2023-06-01"}'
                    className="w-full mt-0.5 px-2 py-1.5 text-xs bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/80 disabled:opacity-50"
                  >
                    {saving ? '保存中...' : '保存'}
                  </button>
                  <button
                    onClick={handleCancel}
                    className="text-xs bg-muted text-muted-foreground px-3 py-1.5 rounded hover:bg-muted/80"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 模型列表 */}
          {models.length === 0 && !editing ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              暂无模型，点击上方添加
            </div>
          ) : (
            models.map((m) => (
              <SettingsRow
                key={m.id}
                label={
                  <div className="flex items-center gap-2">
                    <Cpu size={14} className="text-muted-foreground" />
                    <span>{m.name}</span>
                    {activeId === m.id && (
                      <span className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded">已启用</span>
                    )}
                  </div>
                }
                description={`${m.model} · ${m.base_url}`}
              >
                <div className="flex items-center gap-2">
                  {activeId !== m.id && (
                    <button
                      onClick={() => handleActivate(m.id)}
                      title="设为启用"
                      className="p-1 text-muted-foreground hover:text-primary"
                    >
                      <Star size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => handleEdit(m)}
                    title="编辑"
                    className="p-1 text-muted-foreground hover:text-foreground"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(m.id)}
                    disabled={deleting === m.id}
                    title="删除"
                    className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    {deleting === m.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              </SettingsRow>
            ))
          )}
        </SettingsCard>
      </SettingsSection>

      <div className="text-xs text-muted-foreground px-2">
        💡 点击星标启用模型，被启用的模型会用于所有 LLM 调用
      </div>
    </div>
  )
}
