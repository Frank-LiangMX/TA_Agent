/**
 * 使用指南 - 设置页帮助模块
 * 给美术用户看的操作说明，与 docs/guides/artist-guide.md 同步
 */
import React from 'react'
import ReactMarkdown from 'react-markdown'
import { SettingsSection, SettingsCard } from './primitives'

const HELP_CONTENT = `
## 快速启动

打开浏览器访问 **http://localhost:5175** 即可进入主界面。

---

## 日常使用

### 检查一批新资产

做完一批模型/贴图后，想检查有没有问题。在对话框输入：

\`帮我看一下 D:\\我的资产\\角色 这批文件有没有问题\`

AI 会自动扫描目录、解析模型、检查贴图、检查命名，然后给出分析报告。

### 搜索以前做过的资产

在左侧点击"搜索"，然后输入：

\`我需要一个中世纪的铁剑，带磨损效果\`

AI 会从已入库的资产中找出匹配的结果。

### 批量改名

有一批文件命名不规范，在对话框输入：

\`帮我把 D:\\我的资产\\武器 目录下的所有文件按规范重命名\`

AI 会先列出建议的新名称，你确认后执行。

### 导入到 UE5

审核通过的资产想要导入 UE5，在对话框输入：

\`把刚才审核通过的那些资产导入到 UE5 的 /Game/Characters/ 目录\`

---

## 常用指令

| 你想做什么 | 对 AI 说 |
|-----------|---------|
| 检查一批文件 | \`分析 D:\\路径\` |
| 只看模型面数 | \`检查 D:\\路径 下的模型面数\` |
| 搜索资产 | 在搜索页直接输入自然语言 |
| 改名 | \`帮我把 xxx 改名为 xxx\` |
| 导入 UE5 | \`把资产导入到 /Game/xxx/\` |

---

## 提示

- **用自然语言跟 AI 说话就行**，不需要记命令格式
- **AI 推断错了就纠正它**，纠正一次下次就更准
- 遇到问题直接问 AI，或者找 TA 帮忙
`

export function HelpGuide() {
  const handleReplayTour = () => {
    window.dispatchEvent(new CustomEvent('tagent:show-tour'))
  }

  return (
    <SettingsSection title="使用指南"
      description="快速上手 TAgent，了解常用操作"
      action={
        <button
          onClick={handleReplayTour}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity"
        >
          重新引导
        </button>
      }
    >
      <SettingsCard divided={false} className="p-6">
        <div className="prose prose-sm prose-invert max-w-none
          prose-headings:text-foreground prose-headings:font-semibold
          prose-h2:text-base prose-h2:mt-6 prose-h2:mb-3
          prose-p:text-muted-foreground prose-p:leading-relaxed
          prose-code:text-primary prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
          prose-strong:text-foreground
          prose-table:text-sm prose-td:py-2 prose-td:pr-4
          prose-li:text-muted-foreground
        ">
          <ReactMarkdown>{HELP_CONTENT}</ReactMarkdown>
        </div>
      </SettingsCard>
    </SettingsSection>
  )
}
