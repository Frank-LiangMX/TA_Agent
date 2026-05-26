import { useState } from 'react'
import { saveConfig, getConfig } from '../../services/config'

interface ModeSelectProps {
  onModeSelected: (mode: 'local' | 'online') => void
}

export function ModeSelect({ onModeSelected }: ModeSelectProps) {
  const [selected, setSelected] = useState<'local' | 'online'>('local')
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    try {
      const config = await getConfig()
      config.mode = selected
      await saveConfig(config)
      onModeSelected(selected)
    } catch (err) {
      console.error('保存配置失败:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full space-y-8 p-8 bg-card rounded-lg shadow border border-border">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground">选择使用模式</h2>
          <p className="mt-2 text-sm text-muted-foreground">首次使用请选择工作模式</p>
        </div>

        <div className="space-y-4">
          {/* 本地模式 */}
          <div
            className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
              selected === 'local'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
            onClick={() => setSelected('local')}
          >
            <div className="flex items-center">
              <input
                type="radio"
                name="mode"
                value="local"
                checked={selected === 'local'}
                onChange={() => setSelected('local')}
                className="h-4 w-4 text-primary"
              />
              <label className="ml-3 block text-sm font-medium text-foreground">
                本地模式
              </label>
            </div>
            <p className="mt-2 ml-7 text-xs text-muted-foreground">
              独立使用，自己配置 LLM API，数据存储在本地
            </p>
          </div>

          {/* 联机模式 */}
          <div
            className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
              selected === 'online'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
            onClick={() => setSelected('online')}
          >
            <div className="flex items-center">
              <input
                type="radio"
                name="mode"
                value="online"
                checked={selected === 'online'}
                onChange={() => setSelected('online')}
                className="h-4 w-4 text-primary"
              />
              <label className="ml-3 block text-sm font-medium text-foreground">
                联机模式
              </label>
            </div>
            <p className="mt-2 ml-7 text-xs text-muted-foreground">
              连接公司服务器，多人协作，数据共享
            </p>
          </div>
        </div>

        <button
          onClick={handleConfirm}
          disabled={loading}
          className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50"
        >
          {loading ? '保存中...' : '确定'}
        </button>
      </div>
    </div>
  )
}
