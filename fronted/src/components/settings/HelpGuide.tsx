/**
 * 使用指南 - 设置页帮助模块
 */
import React from 'react'
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  FileSearch,
  FolderSearch,
  Gamepad2,
  PlayCircle,
  RefreshCw,
  Search,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { SettingsSection, SettingsCard } from './primitives'

const workflowCards = [
  {
    icon: <FolderSearch size={18} />,
    title: '检查新资产',
    description: '把模型、贴图或整批目录交给 Agent，得到命名、面数、贴图和入库建议。',
    prompt: '帮我检查 D:\\项目资产\\Characters 这批文件有没有问题',
  },
  {
    icon: <Search size={18} />,
    title: '搜索旧资产',
    description: '用自然语言描述需要的资产，不必记文件名或目录结构。',
    prompt: '我需要一个中世纪铁剑，带磨损效果',
  },
  {
    icon: <Wand2 size={18} />,
    title: '批量改名',
    description: '先让 Agent 给出规范命名建议，确认后再执行真实改名。',
    prompt: '帮我把 D:\\项目资产\\Weapons 下的文件按规范重命名',
  },
  {
    icon: <Gamepad2 size={18} />,
    title: '导入 UE5',
    description: '审核通过后，把资产导入到指定的 Unreal 内容目录。',
    prompt: '把刚才审核通过的资产导入到 /Game/Characters/',
  },
]

const quickTips = [
  '直接说目标，不需要背命令格式。',
  '涉及改名、删除、导入前，先看 Agent 给出的计划。',
  '搜索页适合找资产，对话页适合做分析和执行任务。',
  '结果不符合预期时，直接指出哪里错了，下一轮会更准。',
]

const commonCommands = [
  ['检查目录', '分析 D:\\路径'],
  ['只看模型面数', '检查 D:\\路径 下的模型面数'],
  ['检查贴图', '检查 D:\\路径 下贴图分辨率是不是 2 的幂'],
  ['批量改名', '帮我把 xxx 改名为符合项目规范的名称'],
  ['导入 UE5', '把这些资产导入到 /Game/xxx/'],
]

export function HelpGuide() {
  const handleReplayTour = () => {
    window.dispatchEvent(new CustomEvent('tagent:show-tour'))
  }

  return (
    <div className="space-y-6">
      <SettingsSection
        title="使用指南"
        description="从资产检查、搜索、改名到导入，按实际工作流快速上手。"
        action={
          <button
            type="button"
            onClick={handleReplayTour}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity"
          >
            <PlayCircle size={15} />
            重新引导
          </button>
        }
      >
        <SettingsCard divided={false} className="overflow-hidden">
          <div className="px-5 py-4 border-b border-border/50 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Bot size={17} />
                TAgent 工作方式
              </div>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                用自然语言描述任务，Agent 会先分析资产与上下文，再给出可执行的检查、搜索或处理结果。
              </p>
            </div>
            <div className="hidden md:flex h-9 px-3 rounded-lg border border-border/60 bg-muted/40 items-center gap-2 text-xs text-muted-foreground shrink-0">
              <Sparkles size={14} />
              TA workflow
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border/50">
            {workflowCards.map((item) => (
              <div key={item.title} className="bg-card px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg border border-border/60 bg-muted/40 flex items-center justify-center text-foreground shrink-0">
                    {item.icon}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-medium text-foreground">{item.title}</h4>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                    <div className="mt-3 rounded-md bg-muted/50 border border-border/50 px-2.5 py-2 text-xs font-mono text-foreground/85 break-words">
                      {item.prompt}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SettingsCard>
      </SettingsSection>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-6">
        <SettingsSection title="日常流程">
          <SettingsCard>
            {[
              ['描述目标', '告诉 Agent 你想检查、搜索、改名或导入什么。'],
              ['确认计划', '遇到会修改文件或工程的动作，先看清楚它准备做什么。'],
              ['查看结果', '从报告、资产详情和审核队列里确认问题项。'],
              ['继续追问', '针对某个问题继续让 Agent 解释或修正。'],
            ].map(([title, description], index) => (
              <div key={title} className="px-4 py-3 flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-muted border border-border/60 flex items-center justify-center text-[11px] text-foreground shrink-0">
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">{title}</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</div>
                </div>
              </div>
            ))}
          </SettingsCard>
        </SettingsSection>

        <SettingsSection title="常用说法">
          <SettingsCard>
            {commonCommands.map(([label, command]) => (
              <div key={label} className="px-4 py-3 flex items-center gap-3">
                <div className="w-24 shrink-0 text-xs text-muted-foreground">{label}</div>
                <ArrowRight size={14} className="text-muted-foreground/50 shrink-0" />
                <code className="flex-1 min-w-0 rounded-md bg-muted/60 border border-border/50 px-2 py-1.5 text-xs text-foreground break-words">
                  {command}
                </code>
              </div>
            ))}
          </SettingsCard>
        </SettingsSection>
      </div>

      <SettingsSection title="使用建议">
        <SettingsCard>
          {quickTips.map((tip) => (
            <div key={tip} className="px-4 py-3 flex items-center gap-3">
              <CheckCircle2 size={16} className="text-success shrink-0" />
              <span className="text-sm text-muted-foreground">{tip}</span>
            </div>
          ))}
        </SettingsCard>
      </SettingsSection>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          ['资产库', '查看已经入库的资产和分析结果。', <FileSearch size={16} />],
          ['审核队列', '集中处理需要确认的问题资产。', <CheckCircle2 size={16} />],
          ['重新引导', '忘了入口时可以再次播放新手引导。', <RefreshCw size={16} />],
        ].map(([title, description, icon]) => (
          <div key={String(title)} className="rounded-lg border border-border/50 bg-card px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              {icon}
              {title}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
