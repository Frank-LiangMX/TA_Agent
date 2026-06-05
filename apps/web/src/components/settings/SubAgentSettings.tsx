import React from 'react'

interface SubAgentSettingsProps {
  overrides: Record<string, string>  // {"explorer": "glm-4-flash"}
  availableModels: string[]
  onChange: (overrides: Record<string, string>) => void
}

const SUBAGENT_NAMES: Record<string, string> = {
  explorer: '代码探索 (explorer)',
  researcher: '技术调研 (researcher)',
  'code-reviewer': '代码评审 (code-reviewer)',
}

export function SubAgentSettings({ overrides, availableModels, onChange }: SubAgentSettingsProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">SubAgent 模型覆盖</h3>
      <p className="text-xs text-slate-500">
        默认按子 agent 的 model_tier 选模型（explorer/researcher 用轻量模型，code-reviewer 用主模型）。
        在此可单独覆盖任一子 agent 的模型。
      </p>
      {Object.entries(SUBAGENT_NAMES).map(([name, label]) => (
        <div key={name} className="flex items-center gap-2">
          <label className="w-48 text-sm">{label}</label>
          <select
            className="rounded border border-slate-300 px-2 py-1 text-sm bg-white"
            value={overrides[name] || ''}
            onChange={(e) => {
              const next = { ...overrides }
              if (e.target.value) {
                next[name] = e.target.value
              } else {
                delete next[name]
              }
              onChange(next)
            }}
          >
            <option value="">（使用 tier 默认）</option>
            {availableModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}
