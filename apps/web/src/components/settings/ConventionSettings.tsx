/**
 * 规范管理（对接后端 conventions API）
 */

import React, { useState, useEffect, useMemo } from 'react'
import {
  BookOpen, FileCheck, Loader2, Trash2, Eye, EyeOff,
  Tag, Box, Image, ChevronDown, ChevronRight, Sparkles, Check,
} from 'lucide-react'
import { SettingsSection } from './primitives'
import { localApiFetch } from '@/lib/api'
import { useConfirm } from '@/hooks/useConfirm'

interface ConventionData {
  loaded: boolean
  content_preview: string
  default_rules: {
    naming: Record<string, string>
    mesh_budgets: Record<string, number>
    texture_budgets: Record<string, Record<string, number>>
  }
}

// 3 类规范的展示色（蓝/紫/绿）
const RULE_META = {
  naming: {
    label: '命名规范',
    desc: '资产命名前缀规则',
    icon: <Tag size={16} />,
    color: 'text-blue-600 dark:text-blue-400',
    chip: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
    bar: 'bg-blue-500/40',
    bg: 'bg-blue-500/15 dark:bg-blue-400/20',
  },
  mesh: {
    label: '面数预算',
    desc: '各类型资产的面数上限',
    icon: <Box size={16} />,
    color: 'text-purple-600 dark:text-purple-400',
    chip: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
    bar: 'bg-purple-500/40',
    bg: 'bg-purple-500/15 dark:bg-purple-400/20',
  },
  texture: {
    label: '贴图预算',
    desc: '各类型贴图的分辨率和格式',
    icon: <Image size={16} />,
    color: 'text-emerald-600 dark:text-emerald-400',
    chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    bar: 'bg-emerald-500/40',
    bg: 'bg-emerald-500/15 dark:bg-emerald-400/20',
  },
}

export function ConventionSettings() {
  const { confirm, ConfirmUI } = useConfirm()
  const [data, setData] = useState<ConventionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showContent, setShowContent] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [expandedRule, setExpandedRule] = useState<string | null>('naming')

  useEffect(() => {
    fetchConventions()
  }, [])

  const fetchConventions = async () => {
    try {
      const res = await localApiFetch('/api/conventions')
      const json = await res.json()
      setData(json)
    } catch {} finally { setLoading(false) }
  }

  const handleClear = async () => {
    if (!await confirm('确定卸载已加载的规范文档？', { danger: true })) return
    setClearing(true)
    try {
      await localApiFetch('/api/conventions/clear', { method: 'POST' })
      fetchConventions()
    } catch {} finally { setClearing(false) }
  }

  // 必须放在 early return 之前
  const rules = useMemo(() => ({
    naming: Object.entries(data?.default_rules?.naming || {}),
    mesh: Object.entries(data?.default_rules?.mesh_budgets || {}),
    texture: Object.entries(data?.default_rules?.texture_budgets || {}),
  }), [data])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 size={20} className="animate-spin mr-2" />
        <span className="text-sm">加载中...</span>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6">
        {/* ===== Hero 状态卡 ===== */}
        <div className={`relative overflow-hidden rounded-2xl border ${
          data?.loaded
            ? 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/8 via-emerald-500/3 to-transparent'
            : 'border-foreground/10 bg-muted/20'
        }`}>
          <div className="flex items-start gap-4 p-5">
            <div className={`flex items-center justify-center w-12 h-12 rounded-xl shrink-0 ${
              data?.loaded
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/30'
                : 'bg-muted text-muted-foreground ring-1 ring-foreground/10'
            }`}>
              {data?.loaded ? <Check size={22} strokeWidth={2.5} /> : <BookOpen size={22} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base font-semibold text-foreground">
                  {data?.loaded ? '规范文档已加载' : '未加载规范文档'}
                </h3>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  data?.loaded
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {data?.loaded ? 'Active' : 'Empty'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                通过 Agent 的 <code className="px-1 py-0.5 rounded bg-muted/60 font-mono text-[11px]">load_conventions</code> 工具加载项目规范后，Agent 会按此规范审核资产。
              </p>

              {data?.loaded && data.content_preview && (
                <div className="mt-3 space-y-2">
                  <button
                    onClick={() => setShowContent(!showContent)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showContent ? <EyeOff size={12} /> : <Eye size={12} />}
                    {showContent ? '隐藏内容预览' : '查看内容预览'}
                  </button>
                  {showContent && (
                    <pre className="bg-background/60 backdrop-blur-sm rounded-lg p-3 text-xs text-foreground/80 font-mono whitespace-pre-wrap break-words max-h-[240px] overflow-y-auto scrollbar-thin border border-foreground/10">
                      {data.content_preview}
                    </pre>
                  )}
                </div>
              )}
            </div>
            {data?.loaded && (
              <button
                onClick={handleClear}
                disabled={clearing}
                className="flex items-center gap-1 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10 border border-destructive/20 rounded-md transition-colors disabled:opacity-50 shrink-0"
              >
                {clearing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                {clearing ? '卸载中...' : '卸载'}
              </button>
            )}
          </div>
        </div>

        {/* ===== 3 类规范 metric 卡 ===== */}
        <div className="grid grid-cols-3 gap-2">
          {(['naming', 'mesh', 'texture'] as const).map(key => {
            const meta = RULE_META[key]
            const count = rules[key].length
            const isActive = expandedRule === key
            return (
              <button
                key={key}
                onClick={() => setExpandedRule(isActive ? null : key)}
                className={`relative rounded-xl border p-3 text-left transition-all ${
                  isActive
                    ? `${meta.bg} border-transparent ring-1 ring-foreground/15 shadow-[0_2px_8px_-2px_rgb(0_0%_0/0.08)]`
                    : 'border-foreground/10 bg-background hover:border-foreground/20'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={meta.color}>{meta.icon}</span>
                  <span className="text-xs font-medium text-foreground/90">{meta.label}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className={`text-sm font-semibold tabular-nums ${isActive ? meta.color : 'text-foreground/70'}`}>{count}</span>
                  <span className="text-[10px] text-muted-foreground">{key === 'texture' ? '种类型' : '条规则'}</span>
                </div>
              </button>
            )
          })}
        </div>

        {/* ===== 当前展开的规则详情 ===== */}
        {expandedRule && rules[expandedRule].length > 0 && (
          <div className="rounded-xl border border-foreground/10 bg-background overflow-hidden shadow-[0_2px_8px_-3px_rgb(0_0%_0/0.06)]">
            {/* 标题栏 */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30">
              <span className={RULE_META[expandedRule as keyof typeof RULE_META].color}>
                {RULE_META[expandedRule as keyof typeof RULE_META].icon}
              </span>
              <span className="text-sm font-medium">{RULE_META[expandedRule as keyof typeof RULE_META].label}</span>
              <span className="text-[10px] text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">{RULE_META[expandedRule as keyof typeof RULE_META].desc}</span>
            </div>

            {/* 命名规范：prefix + 描述 */}
            {expandedRule === 'naming' && (
              <div>
                {rules.naming.map(([prefix, desc], i) => (
                  <div
                    key={prefix}
                    className={`flex items-center gap-3 pl-5 pr-4 py-2.5 ${
                      i < rules.naming.length - 1 ? 'border-b border-border/10' : ''
                    }`}
                  >
                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-blue-500/15 dark:bg-blue-400/20 shrink-0">
                      <Tag size={9} className="text-blue-600 dark:text-blue-400" strokeWidth={2.5} />
                    </span>
                    <span className="text-[13px] font-mono text-foreground/90 font-medium tracking-tight shrink-0">
                      {prefix}
                    </span>
                    <span className="hidden sm:inline-block flex-shrink-0 w-6 border-t border-dashed border-foreground/15" />
                    <span className="text-[12px] text-muted-foreground/75 leading-relaxed">{desc as string}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 面数预算：type + 数字 */}
            {expandedRule === 'mesh' && (
              <div>
                {rules.mesh.map(([type, budget], i) => (
                  <div
                    key={type}
                    className={`flex items-center gap-3 pl-5 pr-4 py-2.5 ${
                      i < rules.mesh.length - 1 ? 'border-b border-border/10' : ''
                    }`}
                  >
                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-purple-500/15 dark:bg-purple-400/20 shrink-0">
                      <Box size={9} className="text-purple-600 dark:text-purple-400" strokeWidth={2.5} />
                    </span>
                    <span className="text-[13px] font-mono text-foreground/90 font-medium tracking-tight shrink-0 min-w-[80px]">
                      {type}
                    </span>
                    <span className="hidden sm:inline-block flex-shrink-0 w-6 border-t border-dashed border-foreground/15" />
                    <span className="text-[12px] text-muted-foreground/75 flex-1 leading-relaxed">面数上限</span>
                    <span className="text-sm font-mono font-semibold text-purple-600 dark:text-purple-400 tabular-nums shrink-0">
                      {(budget as number).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">面</span>
                  </div>
                ))}
              </div>
            )}

            {/* 贴图预算：type + 分辨率 chips */}
            {expandedRule === 'texture' && (
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {rules.texture.map(([type, config]) => (
                  <div
                    key={type}
                    className="rounded-lg border border-foreground/10 bg-background p-3 hover:border-emerald-500/30 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex items-center justify-center w-5 h-5 rounded-md bg-emerald-500/15 dark:bg-emerald-400/20 shrink-0">
                        <Image size={11} className="text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
                      </span>
                      <span className="text-[13px] font-mono font-medium text-foreground/90 tracking-tight">
                        {type}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(config as Record<string, number>).map(([k, v]) => (
                        <span
                          key={k}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-emerald-500/8 dark:bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 font-mono tabular-nums"
                        >
                          <span className="opacity-70">{k}</span>
                          <span className="font-semibold">{v}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 没有任何规则时的提示 */}
        {expandedRule && rules[expandedRule].length === 0 && (
          <div className="rounded-xl border border-dashed border-foreground/15 bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
            <Sparkles size={20} className="mx-auto mb-2 opacity-30" />
            {expandedRule === 'texture' ? '暂无贴图预算配置' : '暂无相关规则'}
          </div>
        )}
      </div>
      {ConfirmUI}
    </>
  )
}
