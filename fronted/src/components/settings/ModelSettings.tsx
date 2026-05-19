/**
 * 模型设置（对接后端 LLM 配置 API）
 */

import React, { useState, useEffect } from 'react'
import { Cpu, Check, Loader2, Plus, X } from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import { API_BASE } from '@/lib/api'

interface LLMConfig {
  key: string
  name: string
  type: string
  base_url: string
  model: string
  active: boolean
}

export function ModelSettings() {
  const [configs, setConfigs] = useState<LLMConfig[]>([])
  const [activeKey, setActiveKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)

  // 添加表单
  const [form, setForm] = useState({
    key: '',
    name: '',
    base_url: '',
    model: '',
    api_key: '',
    type: 'cloud',
  })

  useEffect(() => { fetchConfigs() }, [])

  const fetchConfigs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/config/llm`)
      const data = await res.json()
      setConfigs(data.configs || [])
      setActiveKey(data.active || '')
    } catch {} finally { setLoading(false) }
  }

  const handleSwitch = async (key: string) => {
    if (key === activeKey) return
    setSwitching(key)
    try {
      const res = await fetch(`${API_BASE}/api/config/llm/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: key }),
      })
      const data = await res.json()
      if (data.success) {
        setActiveKey(key)
        setConfigs((prev) => prev.map((c) => ({ ...c, active: c.key === key })))
      }
    } catch {} finally { setSwitching('') }
  }

  const handleAdd = async () => {
    if (!form.key || !form.base_url || !form.model) {
      setAddError('key、API 地址、模型名称不能为空')
      return
    }
    setAdding(true)
    setAddError('')
    try {
      const res = await fetch(`${API_BASE}/api/config/llm/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.success) {
        setShowAdd(false)
        setForm({ key: '', name: '', base_url: '', model: '', api_key: '', type: 'cloud' })
        fetchConfigs()
      } else {
        setAddError(data.error || '添加失败')
      }
    } catch (e: any) {
      setAddError(e.message || '网络错误')
    } finally { setAdding(false) }
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
      {/* 已有模型列表 */}
      <SettingsSection
        title="模型配置"
        description="选择当前使用的 LLM 模型"
        action={
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {showAdd ? <X size={12} /> : <Plus size={12} />}
            {showAdd ? '取消' : '添加模型'}
          </button>
        }
      >
        <SettingsCard>
          {configs.map((cfg) => (
            <SettingsRow
              key={cfg.key}
              label={cfg.name}
              description={`${cfg.type === 'cloud' ? '云端' : '本地'} · ${cfg.model} · ${cfg.base_url}`}
              icon={<Cpu size={16} />}
            >
              <div className="flex items-center gap-2">
                {switching === cfg.key ? (
                  <Loader2 size={16} className="animate-spin text-muted-foreground" />
                ) : cfg.active ? (
                  <div className="flex items-center gap-1 text-xs text-primary font-medium">
                    <Check size={14} />
                    使用中
                  </div>
                ) : (
                  <button
                    onClick={() => handleSwitch(cfg.key)}
                    className="text-xs text-primary hover:underline"
                  >
                    切换
                  </button>
                )}
              </div>
            </SettingsRow>
          ))}
        </SettingsCard>
      </SettingsSection>

      {/* 添加模型表单 */}
      {showAdd && (
        <SettingsSection title="添加自定义模型" description="支持 OpenAI 兼容接口的云端或本地模型">
          <SettingsCard>
            <div className="px-4 py-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">标识 (key)</label>
                  <input
                    value={form.key}
                    onChange={(e) => setForm({ ...form, key: e.target.value })}
                    placeholder="如: qwen-14b"
                    className="w-full mt-1 px-2 py-1.5 text-xs bg-muted border border-border rounded outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">显示名称</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="如: Qwen-14B (本地)"
                    className="w-full mt-1 px-2 py-1.5 text-xs bg-muted border border-border rounded outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">API 地址</label>
                <input
                  value={form.base_url}
                  onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                  placeholder="https://api.example.com/v1"
                  className="w-full mt-1 px-2 py-1.5 text-xs bg-muted border border-border rounded outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">模型名称</label>
                  <input
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    placeholder="deepseek-v4-pro"
                    className="w-full mt-1 px-2 py-1.5 text-xs bg-muted border border-border rounded outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">类型</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full mt-1 px-2 py-1.5 text-xs bg-muted border border-border rounded outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="cloud">云端 API</option>
                    <option value="local">本地模型</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">API Key（本地模型可填 none）</label>
                <input
                  value={form.api_key}
                  onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                  placeholder="sk-..."
                  className="w-full mt-1 px-2 py-1.5 text-xs bg-muted border border-border rounded outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              {addError && (
                <p className="text-xs text-destructive">{addError}</p>
              )}
              <button
                onClick={handleAdd}
                disabled={adding}
                className="text-xs bg-primary text-primary-foreground px-4 py-1.5 rounded-lg hover:bg-primary/80 disabled:opacity-50 transition-colors"
              >
                {adding ? '添加中...' : '添加模型'}
              </button>
            </div>
          </SettingsCard>
        </SettingsSection>
      )}

      <SettingsSection title="视觉模型" description="用于资产图片分析的多模态模型">
        <SettingsCard>
          <SettingsRow label="视觉分析" description="使用多模态模型分析资产图片">
            <span className="text-sm text-muted-foreground">已启用</span>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
