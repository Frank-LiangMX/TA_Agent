import { useState } from 'react'
import { updateLocalConfig } from '../../services/config'

interface LocalConfigViewProps {
  onConfigComplete: () => void
  onBack: () => void
}

export function LocalConfigView({ onConfigComplete, onBack }: LocalConfigViewProps) {
  const [llmApiKey, setLlmApiKey] = useState('')
  const [llmBaseUrl, setLlmBaseUrl] = useState('')
  const [llmModel, setLlmModel] = useState('')
  const [extraHeaders, setExtraHeaders] = useState('')
  const [blenderPath, setBlenderPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!llmApiKey) {
      setError('请填写 API Key')
      return
    }
    if (!llmBaseUrl) {
      setError('请填写 Base URL')
      return
    }
    if (!llmModel) {
      setError('请填写模型名称')
      return
    }

    setLoading(true)
    setError('')

    try {
      // 解析 extra_headers
      let headers: Record<string, string> = {}
      if (extraHeaders.trim()) {
        try {
          headers = JSON.parse(extraHeaders)
        } catch {
          // 尝试用 "key: value" 格式解析，每行一个
          headers = {}
          extraHeaders.split('\n').forEach(line => {
            const [key, ...valueParts] = line.split(':')
            if (key && valueParts.length > 0) {
              headers[key.trim()] = valueParts.join(':').trim()
            }
          })
        }
      }

      await updateLocalConfig({
        llm_provider: 'custom',
        llm_api_key: llmApiKey,
        llm_base_url: llmBaseUrl,
        llm_model: llmModel,
        llm_extra_headers: headers,
        blender_path: blenderPath,
      })
      onConfigComplete()
    } catch (err) {
      setError('保存配置失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-sm w-full space-y-6 p-8 bg-card rounded-lg shadow border border-border">
        <div className="text-center">
          <h2 className="text-xl font-bold text-foreground">本地模式配置</h2>
          <p className="mt-1 text-sm text-muted-foreground">配置 LLM API</p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground">Base URL <span className="text-destructive">*</span></label>
            <input
              type="text"
              value={llmBaseUrl}
              onChange={(e) => setLlmBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1 或 http://localhost:8000/v1"
              className="mt-1 block w-full px-3 py-2 bg-background border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
            />
            <p className="mt-1 text-xs text-muted-foreground">OpenAI / Anthropic 兼容 API 地址</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground">API Key <span className="text-destructive">*</span></label>
            <input
              type="password"
              value={llmApiKey}
              onChange={(e) => setLlmApiKey(e.target.value)}
              placeholder="sk-..."
              className="mt-1 block w-full px-3 py-2 bg-background border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground">模型 <span className="text-destructive">*</span></label>
            <input
              type="text"
              value={llmModel}
              onChange={(e) => setLlmModel(e.target.value)}
              placeholder="gpt-4o, claude-3-5-sonnet, deepseek-v4-pro..."
              className="mt-1 block w-full px-3 py-2 bg-background border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground">额外 Headers（可选）</label>
            <textarea
              value={extraHeaders}
              onChange={(e) => setExtraHeaders(e.target.value)}
              placeholder='{"anthropic-version": "2023-06-01"}'
              rows={2}
              className="mt-1 block w-full px-3 py-2 bg-background border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground resize-none"
            />
            <p className="mt-1 text-xs text-muted-foreground">Anthropic 等特殊 API 需要</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground">Blender 路径（可选）</label>
            <input
              type="text"
              value={blenderPath}
              onChange={(e) => setBlenderPath(e.target.value)}
              placeholder="D:\Program Files\Blender Foundation\Blender 4.3\blender.exe"
              className="mt-1 block w-full px-3 py-2 bg-background border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
            />
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
              {error}
            </div>
          )}

          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onBack}
              className="flex-1 py-2 px-4 border border-border text-foreground rounded-md hover:bg-muted"
            >
              返回
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 px-4 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50"
            >
              {loading ? '保存中...' : '保存并启动'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
