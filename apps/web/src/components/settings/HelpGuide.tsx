/**
 * 使用指南 — 使用 settings primitives 保持风格一致
 */
import React from 'react'
import {
  Bot, CheckCircle2, FileSearch, FolderSearch, Gamepad2,
  ListChecks, PlayCircle, Search, Wand2,
} from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'

const SCENARIOS = [
  { icon: <FolderSearch size={16} />, title: '检查新资产', desc: '把模型、贴图或整批目录交给 Agent，得到命名、面数、贴图和入库建议。', prompt: '帮我检查 D:\\项目资产\\Characters 这批文件有没有问题' },
  { icon: <Search size={16} />, title: '搜索旧资产', desc: '用自然语言描述需要的资产，不必记文件名或目录结构。', prompt: '我需要一个中世纪铁剑，带磨损效果' },
  { icon: <Wand2 size={16} />, title: '批量改名', desc: '先让 Agent 给出规范命名建议，确认后再执行真实改名。', prompt: '帮我把 D:\\项目资产\\Weapons 下的文件按规范重命名' },
  { icon: <Gamepad2 size={16} />, title: '导入 UE5', desc: '审核通过后，把资产导入到指定的 Unreal 内容目录。', prompt: '把刚才审核通过的资产导入到 /Game/Characters/' },
]

const FLOW_STEPS = [
  { title: '描述目标', desc: '告诉 Agent 要检查、搜索、改名或导入什么。' },
  { title: '确认计划', desc: '会改文件或工程前，先看清楚它准备做什么。' },
  { title: '查看结果', desc: '从报告、资产详情和审核队列确认问题项。' },
  { title: '继续追问', desc: '针对某个问题让 Agent 解释或修正。' },
]

const PHRASES: [string, string][] = [
  ['检查目录', '分析 D:\\路径'],
  ['只看模型面数', '检查 D:\\路径 下的模型面数'],
  ['检查贴图', '检查 D:\\路径 下贴图分辨率是不是 2 的幂'],
  ['批量改名', '帮我把 xxx 改名为符合项目规范的名称'],
  ['导入 UE5', '把这些资产导入到 /Game/xxx/'],
]

const TIPS = [
  '直接说目标，不需要背命令格式。',
  '涉及改名、删除、导入前，先看 Agent 给出的计划。',
  '搜索页适合找资产，对话页适合做分析和执行任务。',
  '结果不符合预期时，指出哪里错了，下一轮会更准。',
]

export function HelpGuide() {
  const handleReplayTour = () => {
    window.dispatchEvent(new CustomEvent('tagent:show-tour'))
  }

  return (
    <div className="space-y-6">
      <SettingsSection
        title="使用指南"
        description="用自然语言描述任务即可，Agent 会分析资产与上下文后给出结果"
        action={
          <button
            type="button"
            onClick={handleReplayTour}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <PlayCircle size={14} />
            重新播放引导
          </button>
        }
      >
        <SettingsCard>
          {SCENARIOS.map((s) => (
            <SettingsRow key={s.title} label={s.title} description={s.desc} icon={s.icon}>
              <code className="text-[11px] text-muted-foreground bg-muted px-2 py-1 rounded font-mono break-all max-w-[200px] text-right">
                {s.prompt}
              </code>
            </SettingsRow>
          ))}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="推荐流程">
        <SettingsCard>
          {FLOW_STEPS.map((step, i) => (
            <SettingsRow
              key={step.title}
              label={
                <span className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                    {i + 1}
                  </span>
                  {step.title}
                </span>
              }
              description={step.desc}
            />
          ))}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="常用说法">
        <SettingsCard>
          {PHRASES.map(([label, cmd]) => (
            <SettingsRow key={label} label={label}>
              <code className="text-[11px] text-muted-foreground bg-muted px-2 py-1 rounded font-mono">
                {cmd}
              </code>
            </SettingsRow>
          ))}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="使用建议">
        <SettingsCard>
          {TIPS.map((tip) => (
            <SettingsRow key={tip} label={tip} icon={<CheckCircle2 size={16} className="text-success" />} />
          ))}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="相关功能">
        <SettingsCard>
          <SettingsRow label="资产库" description="查看已入库资产与分析结果" icon={<FileSearch size={16} />} />
          <SettingsRow label="审核队列" description="集中处理待确认的问题资产" icon={<CheckCircle2 size={16} />} />
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
