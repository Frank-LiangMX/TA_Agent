/**
 * 使用指南 — 设置页帮助（分区 + 轻量卡片，少嵌套边框）
 */
import React from 'react'
import {
  Bot,
  CheckCircle2,
  FileSearch,
  FolderSearch,
  Gamepad2,
  ListChecks,
  PlayCircle,
  Search,
  Wand2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const SCENARIOS: {
  Icon: LucideIcon
  title: string
  description: string
  prompt: string
}[] = [
  {
    Icon: FolderSearch,
    title: '检查新资产',
    description: '把模型、贴图或整批目录交给 Agent，得到命名、面数、贴图和入库建议。',
    prompt: '帮我检查 D:\\项目资产\\Characters 这批文件有没有问题',
  },
  {
    Icon: Search,
    title: '搜索旧资产',
    description: '用自然语言描述需要的资产，不必记文件名或目录结构。',
    prompt: '我需要一个中世纪铁剑，带磨损效果',
  },
  {
    Icon: Wand2,
    title: '批量改名',
    description: '先让 Agent 给出规范命名建议，确认后再执行真实改名。',
    prompt: '帮我把 D:\\项目资产\\Weapons 下的文件按规范重命名',
  },
  {
    Icon: Gamepad2,
    title: '导入 UE5',
    description: '审核通过后，把资产导入到指定的 Unreal 内容目录。',
    prompt: '把刚才审核通过的资产导入到 /Game/Characters/',
  },
]

const FLOW_STEPS = [
  { title: '描述目标', description: '告诉 Agent 要检查、搜索、改名或导入什么。' },
  { title: '确认计划', description: '会改文件或工程前，先看清楚它准备做什么。' },
  { title: '查看结果', description: '从报告、资产详情和审核队列确认问题项。' },
  { title: '继续追问', description: '针对某个问题让 Agent 解释或修正。' },
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-foreground">{children}</h3>
}

function SectionLead({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</p>
}

export function HelpGuide() {
  const handleReplayTour = () => {
    window.dispatchEvent(new CustomEvent('tagent:show-tour'))
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-4">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-foreground">
            <Bot size={18} className="text-primary shrink-0" />
            <span className="text-sm font-medium">TAgent 怎么用</span>
          </div>
          <SectionLead>
            用自然语言描述任务即可。Agent 会先分析资产与上下文，再给出检查、搜索或处理结果；下方按场景和流程组织，便于对照。
          </SectionLead>
        </div>
        <button
          type="button"
          onClick={handleReplayTour}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <PlayCircle size={16} />
          重新播放引导
        </button>
      </header>

      <section className="space-y-3">
        <SectionTitle>典型场景</SectionTitle>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {SCENARIOS.map(({ Icon, title, description, prompt }) => (
            <article
              key={title}
              className="rounded-lg p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-medium text-foreground">{title}</h4>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
                  <p className="mt-2.5 rounded-md bg-muted/60 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-foreground/90 break-words">
                    {prompt}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>推荐流程</SectionTitle>
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FLOW_STEPS.map((step, index) => (
            <li
              key={step.title}
              className="rounded-lg bg-foreground/[0.03] px-3 py-3"
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                {index + 1}
              </span>
              <p className="mt-2 text-sm font-medium text-foreground">{step.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{step.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <ListChecks size={16} className="text-muted-foreground" />
            <SectionTitle>常用说法</SectionTitle>
          </div>
          <ul className="space-y-2">
            {PHRASES.map(([label, command]) => (
              <li key={label} className="rounded-lg bg-foreground/[0.03] px-3 py-2.5">
                <span className="text-xs font-medium text-foreground">{label}</span>
                <p className="mt-1 font-mono text-[11px] leading-relaxed text-muted-foreground break-words">
                  {command}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3">
          <SectionTitle>使用建议</SectionTitle>
          <ul className="space-y-2">
            {TIPS.map((tip) => (
              <li key={tip} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="space-y-3">
        <SectionTitle>相关功能</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <FeatureChip icon={FileSearch} title="资产库" description="查看已入库资产与分析结果" />
          <FeatureChip icon={CheckCircle2} title="审核队列" description="集中处理待确认的问题资产" />
        </div>
        <p className="text-xs text-muted-foreground/70">
          左侧导航可进入对应页面；忘记入口时，使用上方「重新播放引导」。
        </p>
      </section>
    </div>
  )
}

function FeatureChip({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="flex min-w-[200px] flex-1 items-start gap-2.5 rounded-lg bg-foreground/[0.03] px-3 py-2.5 sm:max-w-[240px] sm:flex-none">
      <Icon size={16} className="mt-0.5 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
