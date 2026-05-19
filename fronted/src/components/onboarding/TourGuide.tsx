/**
 * 首次使用引导 - TourGuide
 *
 * 在第一次打开应用时显示引导遮罩，分步介绍核心功能。
 * 使用 localStorage 记录是否已看过引导。
 */
import React, { useState, useEffect } from 'react'
import {
  MessageSquare, Search, CheckSquare, Package,
  Settings, ArrowRight, ChevronRight
} from 'lucide-react'

const STORAGE_KEY = 'tagent_tour_completed'

const STEPS = [
  {
    icon: <MessageSquare size={32} />,
    title: '对话分析',
    description: '在输入框中告诉 AI 你要做什么，比如"分析 D:\\我的资产"。AI 会自动扫描、检查并给出报告。',
  },
  {
    icon: <Search size={32} />,
    title: '资产搜索',
    description: '左侧点击"搜索"，可以用自然语言找资产——"我需要一个中世纪风格的铁剑"，不用记文件名。',
  },
  {
    icon: <CheckSquare size={32} />,
    title: '审核队列',
    description: 'AI 分析完后，在"审核"页面查看结果。高置信度的自动通过，有疑问的你可以手动确认。',
  },
  {
    icon: <Package size={32} />,
    title: '资产入库',
    description: '审核通过后，告诉 AI"导入到 UE5"，它会帮你改名、整理、生成导入脚本。',
  },
  {
    icon: <Settings size={32} />,
    title: '更多设置',
    description: '左下角齿轮进入设置，可以切换模型、配置项目规范、管理记忆系统。',
  },
]

export function TourGuide() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY)
    if (!completed) {
      const timer = setTimeout(() => setOpen(true), 800)
      return () => clearTimeout(timer)
    }
  }, [])

  // 监听手动重新引导事件（从设置页触发）
  useEffect(() => {
    const handler = () => {
      localStorage.removeItem(STORAGE_KEY)
      setStep(0)
      setOpen(true)
    }
    window.addEventListener('tagent:show-tour', handler)
    return () => window.removeEventListener('tagent:show-tour', handler)
  }, [])

  const handleFinish = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setOpen(false)
  }

  const handleSkip = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setOpen(false)
  }

  if (!open) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleSkip} />

      {/* Card */}
      <div className="relative bg-card border border-border/50 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in duration-300">
        {/* Step indicator */}
        <div className="flex gap-1.5 px-6 pt-5 pb-0 justify-center">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? 'w-8 bg-foreground' : 'w-1.5 bg-muted-foreground/30'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-6 py-6 text-center">
          <div className="flex justify-center mb-4 text-foreground">
            <div className="p-3 rounded-xl bg-foreground/[0.06]">
              {current.icon}
            </div>
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">{current.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{current.description}</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 pb-5">
          <button
            onClick={handleSkip}
            className="text-sm text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            跳过引导
          </button>

          <div className="flex items-center gap-2">
            {!isLast ? (
              <button
                onClick={() => setStep(s => s + 1)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
              >
                下一步
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                onClick={handleFinish}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
              >
                开始使用
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
