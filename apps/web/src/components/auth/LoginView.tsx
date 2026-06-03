import { useState } from 'react'
import { updateOnlineConfig } from '../../services/config'

interface LoginViewProps {
  onLoginSuccess: (userId: string, userName: string) => void
  onBack: () => void
}

export function LoginView({ onLoginSuccess, onBack }: LoginViewProps) {
  const [serverHost, setServerHost] = useState('')
  const [serverPort, setServerPort] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!serverHost || !username) {
      setError('请填写服务器地址和用户名')
      return
    }

    setLoading(true)
    setError('')

    try {
      // 测试服务器连接
      const response = await fetch(`http://${serverHost}:${serverPort}/health`)
      if (!response.ok) {
        throw new Error('无法连接到服务器')
      }

      // TODO: 集成 SSO 登录
      await updateOnlineConfig({
        server_host: serverHost,
        server_port: parseInt(serverPort),
        user_id: username,
        user_name: username,
      })

      onLoginSuccess(username, username)
    } catch (err) {
      setError(err instanceof Error ? err.message : '连接失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, hsl(var(--shell-start)) 0%, hsl(var(--shell-end)) 100%)' }}
    >
      <div className="max-w-sm w-full space-y-6 p-8 rounded-2xl border border-white/20 bg-white/60 backdrop-blur-xl shadow-xl dark:bg-black/30 dark:border-white/10">
        <div className="text-center">
          <h2 className="text-xl font-bold text-foreground">连接服务器</h2>
          <p className="mt-1 text-sm text-muted-foreground">输入服务器地址和登录信息</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground">服务器地址</label>
            <input
              type="text"
              value={serverHost}
              onChange={(e) => setServerHost(e.target.value)}
              placeholder="请输入服务器地址"
              className="mt-1 block w-full px-3 py-2 bg-background border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground">端口</label>
            <input
              type="text"
              value={serverPort}
              onChange={(e) => setServerPort(e.target.value)}
              placeholder="请输入端口号"
              className="mt-1 block w-full px-3 py-2 bg-background border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              className="mt-1 block w-full px-3 py-2 bg-background border border-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码（待接入 SSO）"
              disabled
              className="mt-1 block w-full px-3 py-2 bg-muted border border-border rounded-md shadow-sm text-muted-foreground"
            />
            <p className="mt-1 text-xs text-muted-foreground">密码登录待接入公司 SSO 系统</p>
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
              className="flex-1 py-2 px-4 border border-border/50 text-foreground rounded-xl hover:bg-white/40 dark:hover:bg-white/5 transition-colors"
            >
              返回
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 px-4 bg-foreground text-background rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity font-medium"
            >
              {loading ? '连接中...' : '连接'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
