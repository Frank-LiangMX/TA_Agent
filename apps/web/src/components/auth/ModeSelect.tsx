/**
 * 首次启动 - 直接进入 LLM 配置
 */

interface ModeSelectProps {
  onModeSelected: () => void
}

export function ModeSelect({ onModeSelected }: ModeSelectProps) {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, hsl(var(--shell-start)) 0%, hsl(var(--shell-end)) 100%)' }}
    >
      <div className="max-w-md w-full space-y-8 p-8 rounded-2xl border border-white/20 bg-white/60 backdrop-blur-xl shadow-xl dark:bg-black/30 dark:border-white/10">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground">欢迎使用 TAgent</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            请先配置 LLM 模型以开始使用
          </p>
        </div>

        <div className="space-y-4">
          <div className="p-4 border border-border rounded-xl bg-muted/30">
            <p className="text-sm text-muted-foreground">
              TAgent 在本地运行，配置 LLM API Key 后即可开始对话。
              如需团队协作，可在设置中连接中心服务器。
            </p>
          </div>
        </div>

        <button
          onClick={onModeSelected}
          className="w-full py-2.5 px-4 bg-foreground text-background rounded-xl hover:opacity-90 transition-opacity font-medium"
        >
          开始配置
        </button>
      </div>
    </div>
  )
}
