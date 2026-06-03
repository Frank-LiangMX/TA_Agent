/**
 * 首次使用配置 - LocalConfigView
 *
 * 首次启动时引导用户配置第一个 LLM Provider：
 * 填 Base URL + API Key → 发现模型 → 选择启用哪些 → 保存
 */

import { useState } from 'react'
import { Cpu, Download, Loader2, CheckCircle2, Circle, Eye, EyeOff, X } from 'lucide-react'
import { localApiFetch } from '@/lib/api'

interface DiscoveredModel {
  id: string
  name: string
}

export function LocalConfigView() {
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [protocol, setProtocol] = useState<'openai' | 'anthropic'>('openai')
  const [extraHeaders, setExtraHeaders] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)

  const [discovering, setDiscovering] = useState(false)
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([])
  const [selectedModels, setSelectedModels] = useState<DiscoveredModel[]>([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleDiscover = async () => {
    if (!baseUrl) { setError('请先填写 Base URL'); return }
    setDiscovering(true)
    setError('')
    try {
      const res = await localApiFetch('/api/models/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_url: baseUrl, api_key: apiKey }),
      })
      const data = await res.json()
      if (data.success && data.models?.length > 0) {
        setDiscoveredModels(data.models)
      } else {
        setError(data.error || '未发现可用模型，请手动输入模型名称')
      }
    } catch { setError('请求失败，请检查网络') }
    setDiscovering(false)
  }

  const toggleModel = (m: DiscoveredModel) => {
    setSelectedModels(prev =>
      prev.some(p => p.id === m.id)
        ? prev.filter(p => p.id !== m.id)
        : [...prev, m]
    )
  }

  const handleSave = async () => {
    if (!name.trim()) { setError('请填写 Provider 名称'); return }
    if (!baseUrl.trim()) { setError('请填写 Base URL'); return }
    if (!apiKey.trim()) { setError('请填写 API Key'); return }

    // 至少要有一个模型
    const modelsToSave = selectedModels.length > 0 ? selectedModels : []
    if (modelsToSave.length === 0 && discoveredModels.length > 0) {
      setError('请至少选择一个模型，或先点击"从 API 发现模型"获取模型列表')
      return
    }
    if (modelsToSave.length === 0 && discoveredModels.length === 0) {
      setError('请先点击"从 API 发现模型"，或手动添加模型')
      return
    }

    setSaving(true)
    setError('')

    try {
      let headers: Record<string, string> = {}
      if (extraHeaders.trim()) {
        try { headers = JSON.parse(extraHeaders) } catch {}
      }

      // 1. 创建 Provider
      const providerRes = await localApiFetch('/api/config/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          base_url: baseUrl.trim(),
          api_key: apiKey.trim(),
          protocol,
          extra_headers: headers,
          models: modelsToSave.map(m => ({ id: m.id, name: m.name || m.id, enabled: true })),
          enabled: true,
        }),
      })
      const providerData = await providerRes.json()
      if (!providerData.success) {
        setError(providerData.error || '创建 Provider 失败')
        setSaving(false)
        return
      }

      const providerId = providerData.id || providerData.provider?.id

      // 2. 配置完成，跳转
      window.location.reload()
    } catch { setError('保存失败，请检查网络') }
    setSaving(false)
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, hsl(var(--shell-start)) 0%, hsl(var(--shell-end)) 100%)' }}
    >
      <div className="max-w-md w-full space-y-6 p-8 rounded-2xl border border-white/20 bg-white/60 backdrop-blur-xl shadow-xl dark:bg-black/30 dark:border-white/10">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-3">
            <Cpu size={24} className="text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground">配置 LLM</h2>
          <p className="mt-1 text-sm text-muted-foreground">添加你的第一个模型 Provider</p>
        </div>

        <div className="space-y-4">
          {/* Provider 名称 */}
          <div>
            <label className="block text-sm font-medium text-foreground">Provider 名称</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="如: DeepSeek、GLM"
              className="mt-1 block w-full px-3 py-2 bg-background border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground text-sm"
            />
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-sm font-medium text-foreground">Base URL</label>
            <input
              type="text"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://api.deepseek.com/v1"
              className="mt-1 block w-full px-3 py-2 bg-background border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground text-sm"
            />
          </div>

          {/* 协议 */}
          <div>
            <label className="block text-sm font-medium text-foreground">协议</label>
            <select
              value={protocol}
              onChange={e => setProtocol(e.target.value as 'openai' | 'anthropic')}
              className="mt-1 block w-full px-3 py-2 bg-background border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground text-sm"
            >
              <option value="openai">OpenAI（/v1/chat/completions）</option>
              <option value="anthropic">Anthropic（/v1/messages）</option>
            </select>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-foreground">API Key</label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="mt-1 block w-full px-3 py-2 pr-10 bg-background border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground text-sm"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              >
                {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* 发现模型 */}
          <button
            type="button"
            onClick={handleDiscover}
            disabled={discovering || !baseUrl.trim()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
          >
            {discovering ? <><Loader2 size={14} className="animate-spin" /> 发现中...</> : <><Download size={14} /> 从 API 发现模型</>}
          </button>

          {/* 发现的模型列表 */}
          {discoveredModels.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">
                发现 {discoveredModels.length} 个模型，点击选择要启用的模型
              </div>
              <div className="border border-border rounded-md max-h-[200px] overflow-y-auto">
                {discoveredModels.map(m => {
                  const selected = selectedModels.some(p => p.id === m.id)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleModel(m)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted/50 transition-colors ${selected ? 'bg-primary/5 text-foreground' : 'text-muted-foreground'}`}
                    >
                      {selected ? <CheckCircle2 size={14} className="text-primary shrink-0" /> : <Circle size={14} className="shrink-0" />}
                      <span className="truncate">{m.name || m.id}</span>
                      <span className="ml-auto text-[10px] font-mono opacity-60">{m.id}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 已选择的模型标签 */}
          {selectedModels.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">已选择 {selectedModels.length} 个模型</div>
              <div className="flex flex-wrap gap-1">
                {selectedModels.map(m => (
                  <span key={m.id} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                    {m.name || m.id}
                    <button type="button" onClick={() => toggleModel(m)} className="hover:text-destructive">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Extra Headers */}
          <div>
            <label className="block text-xs text-muted-foreground">Extra Headers（可选）</label>
            <input
              type="text"
              value={extraHeaders}
              onChange={e => setExtraHeaders(e.target.value)}
              placeholder='{"anthropic-version": "2023-06-01"}'
              className="mt-0.5 block w-full px-3 py-1.5 bg-background border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground text-xs"
            />
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2.5 px-4 bg-foreground text-background rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity font-medium text-sm"
          >
            {saving ? <><Loader2 size={14} className="inline animate-spin mr-1" /> 保存中...</> : '保存并启动'}
          </button>
        </div>
      </div>
    </div>
  )
}
