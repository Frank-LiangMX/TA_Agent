/**
 * 入库向导 — 选资产 → 配置 → 预览 → 执行 → UE 指引
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Package,
  ChevronRight,
  ChevronLeft,
  FolderOpen,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  FileCode2,
  Copy,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  type ApprovedAsset,
  type IntakeAssetResult,
  type IntakeBatchResult,
  type IntakeStatusCounts,
  type ProjectConfigOption,
  fetchApprovedAssets,
  fetchIntakeStatusCounts,
  fetchProjectConfigs,
  formatAssetTypeLabel,
  getSavedTargetDir,
  previewIntake,
  runIntake,
  saveTargetDir,
} from '@/services/intake'

const STEPS = [
  { id: 'select', label: '选择资产' },
  { id: 'config', label: '目标配置' },
  { id: 'preview', label: '预览' },
  { id: 'run', label: '执行' },
  { id: 'done', label: '完成' },
] as const

type StepId = (typeof STEPS)[number]['id']

interface IntakeWizardProps {
  initialAssetIds?: string[]
  onGoReview?: () => void
}

export function IntakeWizard({ initialAssetIds, onGoReview }: IntakeWizardProps) {
  const [step, setStep] = useState<StepId>('select')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [assets, setAssets] = useState<ApprovedAsset[]>([])
  const [statusCounts, setStatusCounts] = useState<IntakeStatusCounts>({ pending: 0, approved: 0 })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [configs, setConfigs] = useState<ProjectConfigOption[]>([])
  const [targetDir, setTargetDir] = useState(getSavedTargetDir())
  const [projectConfig, setProjectConfig] = useState('')
  const [preview, setPreview] = useState<IntakeBatchResult | null>(null)
  const [result, setResult] = useState<IntakeBatchResult | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [approved, projectConfigs, counts] = await Promise.all([
        fetchApprovedAssets(),
        fetchProjectConfigs(),
        fetchIntakeStatusCounts(),
      ])
      setAssets(approved)
      setStatusCounts(counts)
      setConfigs(projectConfigs)
      if (projectConfigs.length === 1) {
        setProjectConfig(projectConfigs[0].name)
      }
      const initial = new Set(initialAssetIds?.length ? initialAssetIds : approved.map((a) => a.asset_id))
      setSelected(new Set(approved.filter((a) => initial.has(a.asset_id)).map((a) => a.asset_id)))
    } catch (err) {
      toast.error('加载失败', { description: err instanceof Error ? err.message : String(err) })
    } finally {
      setLoading(false)
    }
  }, [initialAssetIds])

  useEffect(() => {
    loadData()
  }, [loadData])

  const selectedAssets = useMemo(
    () => assets.filter((a) => selected.has(a.asset_id)),
    [assets, selected],
  )

  const stepIndex = STEPS.findIndex((s) => s.id === step)

  const toggleAll = () => {
    if (selected.size === assets.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(assets.map((a) => a.asset_id)))
    }
  }

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handlePickFolder = async () => {
    try {
      const picker = window.electronAPI?.openFolder
      if (!picker) {
        toast.message('请手动输入 UE Content 目录路径')
        return
      }
      const raw = await picker()
      const data = raw as { canceled?: boolean; filePaths?: string[]; path?: string } | undefined
      if (!data || data.canceled) return
      const picked = data.filePaths?.[0] || data.path || ''
      if (picked) setTargetDir(picked)
    } catch {
      toast.error('打开目录选择器失败')
    }
  }

  const goPreview = async () => {
    if (selected.size === 0) {
      toast.error('请至少选择一个资产')
      return
    }
    if (!targetDir.trim()) {
      toast.error('请填写 UE Content 目录')
      return
    }
    setBusy(true)
    try {
      saveTargetDir(targetDir)
      const data = await previewIntake({
        asset_ids: Array.from(selected),
        target_engine_dir: targetDir.trim(),
        project_config_name: projectConfig || undefined,
      })
      setPreview(data)
      setStep('preview')
    } catch (err) {
      toast.error('预览失败', { description: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleRun = async () => {
    if (selected.size === 0) return
    setBusy(true)
    setStep('run')
    try {
      const data = await runIntake({
        asset_ids: Array.from(selected),
        target_engine_dir: targetDir.trim(),
        project_config_name: projectConfig || undefined,
      })
      setResult(data)
      setStep('done')
      if (data.failed === 0) {
        toast.success('入库完成')
      } else {
        toast.warning(`入库完成：${data.success} 成功，${data.failed} 失败`)
      }
    } catch (err) {
      toast.error('入库失败', { description: err instanceof Error ? err.message : String(err) })
      setStep('preview')
    } finally {
      setBusy(false)
    }
  }

  const copyText = (text: string) => {
    navigator.clipboard?.writeText(text)
    toast.success('已复制')
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <Loader2 size={20} className="animate-spin mr-2" />
        <span className="text-sm">加载待入库资产…</span>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
      <PageHeader
        actions={
          <button
            type="button"
            onClick={loadData}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-muted"
          >
            <RefreshCw size={16} />
          </button>
        }
      >
        <Package size={18} className="text-primary shrink-0" />
        <h2 className="text-sm font-medium">入库向导</h2>
        <span className="text-xs text-muted-foreground ml-1">
          {selected.size > 0 ? `${selected.size} 项已选` : '无选中'}
        </span>
      </PageHeader>

      {/* 步骤条 */}
      <div className="px-4 py-3 border-b border-border/40 bg-muted/20">
        <div className="flex items-center gap-1 overflow-x-auto">
          {STEPS.map((s, i) => {
            const active = s.id === step
            const done = i < stepIndex
            return (
              <React.Fragment key={s.id}>
                {i > 0 && <ChevronRight size={14} className="text-muted-foreground/40 shrink-0" />}
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs whitespace-nowrap ${
                    active
                      ? 'bg-background text-foreground font-medium shadow-sm border border-border/50'
                      : done
                        ? 'text-foreground/70'
                        : 'text-muted-foreground'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                    active ? 'bg-primary text-primary-foreground' : done ? 'bg-primary/20 text-primary' : 'bg-muted'
                  }`}>
                    {done ? '✓' : i + 1}
                  </span>
                  {s.label}
                </div>
              </React.Fragment>
            )
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
        <StatusBanner counts={statusCounts} onGoReview={onGoReview} />

        {step === 'select' && (
          <SelectStep
            assets={assets}
            selected={selected}
            counts={statusCounts}
            onToggleAll={toggleAll}
            onToggleOne={toggleOne}
            onGoReview={onGoReview}
          />
        )}

        {step === 'config' && (
          <ConfigStep
            targetDir={targetDir}
            projectConfig={projectConfig}
            configs={configs}
            onTargetDirChange={setTargetDir}
            onProjectConfigChange={setProjectConfig}
            onPickFolder={handlePickFolder}
          />
        )}

        {step === 'preview' && preview && (
          <PreviewStep
            preview={preview}
            targetDir={targetDir}
            onRemove={(assetId) => {
              toggleOne(assetId)
              setPreview((prev) => prev ? {
                ...prev,
                results: prev.results?.filter((r) => r.asset_id !== assetId),
              } : null)
            }}
          />
        )}

        {step === 'run' && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Loader2 size={28} className="animate-spin mb-3" />
            <p className="text-sm">正在入库 {selected.size} 个资产…</p>
          </div>
        )}

        {step === 'done' && result && (
          <DoneStep result={result} onCopy={copyText} />
        )}
      </div>

      {/* 底栏 */}
      {step !== 'run' && (
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-t border-border/50 bg-muted/20">
          <div className="text-xs text-muted-foreground">
            {step === 'select' && assets.length === 0 && statusCounts.pending > 0 && (
              <>审核队列有 {statusCounts.pending} 个待审核，需先通过审核才会出现在此</>
            )}
            {step === 'select' && assets.length === 0 && statusCounts.pending === 0 && '暂无已审核通过的资产'}
            {step === 'select' && assets.length > 0 && `已审核通过 ${assets.length} 个，已选 ${selected.size} 个`}
            {step === 'preview' && preview && `预览 ${preview.success}/${preview.total} 项可通过`}
            {step === 'done' && result && result.message}
          </div>
          <div className="flex items-center gap-2">
            {step !== 'select' && step !== 'done' && (
              <button
                type="button"
                onClick={() => {
                  if (step === 'config') setStep('select')
                  else if (step === 'preview') setStep('config')
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted"
              >
                <ChevronLeft size={14} />
                上一步
              </button>
            )}
            {step === 'select' && (
              <button
                type="button"
                disabled={selected.size === 0}
                onClick={() => setStep('config')}
                className="inline-flex items-center gap-1 px-4 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
              >
                下一步
                <ChevronRight size={14} />
              </button>
            )}
            {step === 'config' && (
              <button
                type="button"
                disabled={busy || selected.size === 0 || !targetDir.trim()}
                onClick={goPreview}
                className="inline-flex items-center gap-1 px-4 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                预览入库
              </button>
            )}
            {step === 'preview' && (
              <button
                type="button"
                disabled={busy || !preview || preview.success === 0}
                onClick={handleRun}
                className="inline-flex items-center gap-1 px-4 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
              >
                确认入库
              </button>
            )}
            {step === 'done' && (
              <button
                type="button"
                onClick={() => {
                  setStep('select')
                  setPreview(null)
                  setResult(null)
                  loadData()
                }}
                className="inline-flex items-center gap-1 px-4 py-1.5 text-sm rounded-lg border border-border hover:bg-muted"
              >
                再次入库
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBanner({
  counts,
  onGoReview,
}: {
  counts: IntakeStatusCounts
  onGoReview?: () => void
}) {
  return (
    <div className="mb-4 rounded-xl border border-border/50 bg-muted/20 px-4 py-3 text-sm">
      <p className="text-foreground/90">
        入库仅包含<strong className="mx-1">已审核通过</strong>的资产，与审核队列中的待审条目不是同一批。
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>待审核 <strong className="text-foreground">{counts.pending}</strong></span>
        <span>可入库 <strong className="text-foreground">{counts.approved}</strong></span>
        {counts.pending > 0 && onGoReview && (
          <button type="button" onClick={onGoReview} className="text-primary hover:underline">
            去审核队列 →
          </button>
        )}
      </div>
    </div>
  )
}

function SelectStep({
  assets,
  selected,
  counts,
  onToggleAll,
  onToggleOne,
  onGoReview,
}: {
  assets: ApprovedAsset[]
  selected: Set<string>
  counts: IntakeStatusCounts
  onToggleAll: () => void
  onToggleOne: (id: string) => void
  onGoReview?: () => void
}) {
  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Package size={32} className="text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">当前没有可入库的资产</p>
        <p className="text-xs text-muted-foreground/70 mt-2 max-w-md leading-relaxed">
          审核队列里的 {counts.pending} 个资产仍处于<strong className="text-foreground/80">待审核</strong>状态；
          在审核页点击「通过」后，才会出现在这里。侧边栏数字 {counts.approved} 表示已通过、等待入库的数量。
        </p>
        {counts.pending > 0 && onGoReview && (
          <button
            type="button"
            onClick={onGoReview}
            className="mt-4 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90"
          >
            前往审核队列
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">共 {assets.length} 个资产可入库</p>
        <button type="button" onClick={onToggleAll} className="text-xs text-primary hover:underline">
          {selected.size === assets.length ? '取消全选' : '全选'}
        </button>
      </div>
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2 text-left" />
              <th className="px-3 py-2 text-left font-medium">名称</th>
              <th className="px-3 py-2 text-left font-medium hidden md:table-cell">类型</th>
              <th className="px-3 py-2 text-left font-medium hidden lg:table-cell">路径</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr
                key={asset.asset_id}
                className="border-t border-border/30 hover:bg-muted/20 cursor-pointer"
                onClick={() => onToggleOne(asset.asset_id)}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(asset.asset_id)}
                    onChange={() => onToggleOne(asset.asset_id)}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded"
                  />
                </td>
                <td className="px-3 py-2 font-medium truncate max-w-[200px]">{asset.asset_name}</td>
                <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">
                  {formatAssetTypeLabel(asset.asset_type, asset.category)}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[280px] hidden lg:table-cell font-mono">{asset.file_path}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ConfigStep({
  targetDir,
  projectConfig,
  configs,
  onTargetDirChange,
  onProjectConfigChange,
  onPickFolder,
}: {
  targetDir: string
  projectConfig: string
  configs: ProjectConfigOption[]
  onTargetDirChange: (v: string) => void
  onProjectConfigChange: (v: string) => void
  onPickFolder: () => void
}) {
  return (
    <div className="max-w-xl space-y-5">
      <div className="space-y-2">
        <label className="text-sm font-medium">UE Content 目录</label>
        <p className="text-xs text-muted-foreground">资产的目标引擎目录，例如 D:/MyGame/Content</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={targetDir}
            onChange={(e) => onTargetDirChange(e.target.value)}
            placeholder="D:/UE5/MyProject/Content"
            className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:ring-1 focus:ring-ring font-mono"
          />
          <button
            type="button"
            onClick={onPickFolder}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted"
          >
            <FolderOpen size={14} />
            浏览
          </button>
        </div>
      </div>

      {configs.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium">项目配置</label>
          <p className="text-xs text-muted-foreground">决定规范命名与 UE 路径映射（可选）</p>
          <select
            value={projectConfig}
            onChange={(e) => onProjectConfigChange(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">默认（自动选择第一个配置）</option>
            {configs.map((c) => (
              <option key={c.name} value={c.name}>
                {c.project_name || c.name} · {c.engine || 'UE'}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground space-y-1">
        <p>入库将更新资产规范名称与目标路径，<strong className="text-foreground">不会移动源文件</strong>。</p>
        <p>完成后会生成 import_manifest.json 与 import_assets.py，在 UE Python Console 中运行脚本完成导入。</p>
      </div>
    </div>
  )
}

function PreviewStep({
  preview,
  targetDir,
  onRemove,
}: {
  preview: IntakeBatchResult
  targetDir: string
  onRemove: (assetId: string) => void
}) {
  const rows = preview.results || []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-sm">
        <StatPill label="总计" value={String(preview.total)} />
        <StatPill label="可通过" value={String(preview.success)} accent="text-green-600" />
        {preview.failed > 0 && <StatPill label="失败" value={String(preview.failed)} accent="text-destructive" />}
        <StatPill label="目标目录" value={targetDir} mono />
      </div>

      <div className="rounded-xl border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">原名</th>
              <th className="px-3 py-2 text-left font-medium">规范名</th>
              <th className="px-3 py-2 text-left font-medium hidden md:table-cell">UE 路径</th>
              <th className="px-3 py-2 text-left font-medium w-16">状态</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <PreviewRow key={row.asset_id} row={row} onRemove={onRemove} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PreviewRow({
  row,
  onRemove,
}: {
  row: IntakeAssetResult
  onRemove: (id: string) => void
}) {
  const warning = row.steps?.some((s) => s.status === 'warning')
  return (
    <tr className="border-t border-border/30">
      <td className="px-3 py-2 truncate max-w-[140px]">{row.original_name || '—'}</td>
      <td className="px-3 py-2 font-mono text-xs">{row.canonical_name || '—'}</td>
      <td className="px-3 py-2 font-mono text-xs text-muted-foreground hidden md:table-cell">{row.target_engine_path || '—'}</td>
      <td className="px-3 py-2">
        {row.success ? (
          warning ? (
            <span className="inline-flex items-center gap-1 text-amber-600 text-xs"><AlertTriangle size={12} /> 警告</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-green-600 text-xs"><CheckCircle2 size={12} /> OK</span>
          )
        ) : (
          <span className="text-destructive text-xs" title={row.error}>失败</span>
        )}
      </td>
      <td className="px-2 py-2">
        {row.asset_id && row.success && (
          <button type="button" onClick={() => onRemove(row.asset_id!)} className="text-xs text-muted-foreground hover:text-destructive">
            移除
          </button>
        )}
      </td>
    </tr>
  )
}

function DoneStep({
  result,
  onCopy,
}: {
  result: IntakeBatchResult
  onCopy: (text: string) => void
}) {
  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-border/50 p-4 bg-muted/20">
        <CheckCircle2 size={22} className="text-green-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium">{result.message || '入库完成'}</p>
          <p className="text-xs text-muted-foreground mt-1">
            成功 {result.success} · 失败 {result.failed} · 源文件未移动
          </p>
        </div>
      </div>

      {(result.manifest_path || result.script_path) && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <FileCode2 size={16} />
            UE 导入文件
          </h3>
          {result.manifest_path && (
            <PathRow label="清单" path={result.manifest_path} onCopy={onCopy} />
          )}
          {result.script_path && (
            <PathRow label="脚本" path={result.script_path} onCopy={onCopy} />
          )}
          <div className="rounded-lg border border-border/50 p-3 text-xs text-muted-foreground space-y-1">
            <p>1. 打开 UE5 编辑器</p>
            <p>2. 打开 <strong className="text-foreground">Output Log → Python</strong> 或 Python Console</p>
            <p>3. 运行生成的 import_assets.py（或按项目内 UE 插件指引导入）</p>
            <p>4. 导入成功后资产状态会更新为「已入库」</p>
          </div>
        </div>
      )}

      {(result.results || []).some((r) => !r.success) && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-destructive">失败项</h3>
          <ul className="text-xs space-y-1">
            {(result.results || []).filter((r) => !r.success).map((r) => (
              <li key={r.asset_id} className="text-muted-foreground">
                {r.original_name || r.asset_id}: {r.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function StatPill({ label, value, accent, mono }: { label: string; value: string; accent?: string; mono?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-1.5 bg-card">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium truncate max-w-[240px] ${accent || ''} ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  )
}

function PathRow({ label, path, onCopy }: { label: string; path: string; onCopy: (t: string) => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 bg-card">
      <span className="text-xs text-muted-foreground shrink-0 w-8">{label}</span>
      <code className="flex-1 text-xs font-mono truncate">{path}</code>
      <button type="button" onClick={() => onCopy(path)} className="shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground">
        <Copy size={14} />
      </button>
    </div>
  )
}
