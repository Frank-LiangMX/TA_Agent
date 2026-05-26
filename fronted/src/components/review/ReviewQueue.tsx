/**
 * 审核队列页面
 *
 * Tab 切换高/低置信度，每页 20 条，数字分页。
 * 按资产类型展示不同的审核维度。
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react'
import {
  FileCheck, RefreshCw, CheckCircle2, XCircle,
  AlertTriangle, ChevronDown, ChevronRight, ChevronLeft, Send, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { tagentClient } from '@/services/websocket'
import { useReviews } from '@/lib/cache'

interface ReviewCriterion {
  value: unknown
  confidence: number
  label: string
  issues?: string[]
}

interface ReviewAsset {
  asset_id: string
  asset_name: string
  file_path: string
  asset_type: string
  tri_count: number
  avg_confidence: number
  review_type: string
  review_criteria: Record<string, ReviewCriterion>
  review_determined: Record<string, { value: unknown; label: string }>
}

type ReviewDecision = 'approve' | 'reject' | 'modify'
type TabType = 'high' | 'low'

const PAGE_SIZE = 20

export function ReviewQueue() {
  const { data, loading, refresh } = useReviews()
  const [activeTab, setActiveTab] = useState<TabType>('high')
  const [highPage, setHighPage] = useState(1)
  const [lowPage, setLowPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [modifyAssetId, setModifyAssetId] = useState<string | null>(null)
  const [modifyForm, setModifyForm] = useState({ category: '', subcategory: '', material: '', style: '', condition: '' })
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())

  const refreshAfterAction = useCallback(() => {
    setTimeout(() => refresh(), 2000)
  }, [refresh])

  const currentList = activeTab === 'high' ? (data?.high_confidence || []) : (data?.low_confidence || [])
  const currentPage = activeTab === 'high' ? highPage : lowPage
  const setCurrentPage = activeTab === 'high' ? setHighPage : setLowPage
  const totalPages = Math.max(1, Math.ceil(currentList.length / PAGE_SIZE))
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return currentList.slice(start, start + PAGE_SIZE)
  }, [currentList, currentPage])

  useEffect(() => { setCurrentPage(1) }, [activeTab])

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
    setExpandedId(null)
    setModifyAssetId(null)
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectCurrentPage = () => {
    const ids = pageItems.map((a) => a.asset_id)
    setSelected((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.add(id))
      return next
    })
  }

  const selectAllCurrent = () => {
    setSelected(new Set(currentList.map((a) => a.asset_id)))
  }

  const batchApprove = async () => {
    if (selected.size === 0) return
    const ids = Array.from(selected)
    const count = ids.length
    setProcessingIds(new Set(ids))
    setSelected(new Set())
    setActionLoading('batch')
    try {
      await tagentClient.sendMessage(
        `批量通过以下资产：${ids.join(', ')}，使用 batch_approve 工具`
      )
      toast.success(`已提交 ${count} 个资产的批量通过`, {
        description: '正在后台处理，完成后会自动刷新',
      })
      setTimeout(() => {
        setProcessingIds(new Set())
        refreshAfterAction()
      }, 3000)
    } catch (e: any) {
      toast.error('批量通过失败', { description: e.message })
      setProcessingIds(new Set())
    } finally { setActionLoading(null) }
  }

  const batchReject = async () => {
    if (selected.size === 0) return
    if (!confirm(`确定拒绝选中的 ${selected.size} 个资产？`)) return
    const ids = Array.from(selected)
    const count = ids.length
    setProcessingIds(new Set(ids))
    setSelected(new Set())
    setActionLoading('batch-reject')
    try {
      await tagentClient.sendMessage(
        `批量拒绝以下资产：${ids.join(', ')}，使用 batch_reject 工具`
      )
      toast.success(`已提交 ${count} 个资产的批量拒绝`, {
        description: '正在后台处理，完成后会自动刷新',
      })
      setTimeout(() => {
        setProcessingIds(new Set())
        refreshAfterAction()
      }, 3000)
    } catch (e: any) {
      toast.error('批量拒绝失败', { description: e.message })
      setProcessingIds(new Set())
    } finally { setActionLoading(null) }
  }

  const reviewSingle = async (assetId: string, decision: ReviewDecision) => {
    if (decision === 'modify') {
      const asset = currentList.find((a) => a.asset_id === assetId)
      if (asset) {
        // 从 AI 推断结果预填表单
        const criteria = asset.review_criteria || {}
        const catValue = String(criteria.category?.value || '')
        const [cat, subcat] = catValue.includes('/') ? catValue.split('/') : [catValue, '']
        setModifyForm({
          category: cat || '',
          subcategory: subcat || '',
          material: String(criteria.material?.value || ''),
          style: String(criteria.style?.value || ''),
          condition: String(criteria.condition?.value || ''),
        })
      }
      setModifyAssetId(assetId)
      setExpandedId(assetId)
      return
    }
    setActionLoading(assetId)
    try {
      const action = decision === 'approve' ? '通过' : '拒绝'
      await tagentClient.sendMessage(
        `审核资产 ${assetId}，操作：${decision}，使用 submit_review 工具`
      )
      toast.success(`已提交审核：${action}`)
      setTimeout(() => refreshAfterAction(), 2000)
    } catch (e: any) { toast.error('审核失败', { description: e.message }) }
    finally { setActionLoading(null) }
  }

  const submitModify = async () => {
    if (!modifyAssetId) return
    setActionLoading(modifyAssetId)
    try {
      const corrections: Record<string, string> = {}
      if (modifyForm.category) corrections.category = modifyForm.category
      if (modifyForm.subcategory) corrections.subcategory = modifyForm.subcategory
      if (modifyForm.material) corrections.material = modifyForm.material
      if (modifyForm.style) corrections.style = modifyForm.style
      if (modifyForm.condition) corrections.condition = modifyForm.condition

      await tagentClient.sendMessage(
        `审核资产 ${modifyAssetId}，操作：modify，修正内容：${JSON.stringify(corrections)}，使用 submit_review 工具`
      )
      toast.success('已提交修改')
      setModifyAssetId(null)
      setTimeout(() => refreshAfterAction(), 2000)
    } catch (e: any) { toast.error('修改失败', { description: e.message }) }
    finally { setActionLoading(null) }
  }

  // 自然语言指令
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  const handleChatSubmit = async () => {
    if (!chatInput.trim()) return
    setChatLoading(true)
    try {
      window.dispatchEvent(new CustomEvent('tagent:user-message', { detail: { content: chatInput.trim() } }))
      await tagentClient.sendMessage(chatInput.trim())
      toast.success('指令已发送')
      setChatInput('')
    } catch (e: any) { toast.error('发送失败', { description: e.message }) }
    finally { setChatLoading(false) }
  }

  const pageNumbers = useMemo(() => {
    const pages: number[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      let start = Math.max(2, currentPage - 2)
      let end = Math.min(totalPages - 1, currentPage + 2)
      if (currentPage <= 3) end = Math.min(5, totalPages - 1)
      if (currentPage >= totalPages - 2) start = Math.max(2, totalPages - 4)
      if (start > 2) pages.push(-1)
      for (let i = start; i <= end; i++) pages.push(i)
      if (end < totalPages - 1) pages.push(-1)
      pages.push(totalPages)
    }
    return pages
  }, [totalPages, currentPage])

  if (!data && !loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p className="text-sm">{error || '暂无数据'}</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
      {/* 头部 */}
      <header className="h-14 flex items-center justify-between px-4 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2">
          <FileCheck size={18} className="text-primary" />
          <h2 className="text-sm font-medium">审核队列</h2>
          {data && <span className="text-xs text-muted-foreground">{data.total_pending} 个待审</span>}
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <button onClick={batchApprove} disabled={actionLoading === 'batch'} className="text-xs bg-success text-white px-3 py-1.5 rounded-lg hover:bg-success/80 transition-colors">
                {actionLoading === 'batch' ? '提交中...' : `批量通过 (${selected.size})`}
              </button>
              <button onClick={batchReject} disabled={actionLoading === 'batch-reject'} className="text-xs bg-destructive text-white px-3 py-1.5 rounded-lg hover:bg-destructive/80 transition-colors">
                {actionLoading === 'batch-reject' ? '提交中...' : `批量拒绝 (${selected.size})`}
              </button>
            </>
          )}
          <button onClick={refresh} disabled={loading} className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded hover:bg-muted">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {/* Tab 栏 */}
      {data && data.total_pending > 0 && (
        <div className="flex items-center gap-1 px-4 pt-3 shrink-0">
          <TabButton active={activeTab === 'high'} onClick={() => handleTabChange('high')} icon={<CheckCircle2 size={14} />} label="高置信度" count={data.high_confidence_count} color="text-success" />
          <TabButton active={activeTab === 'low'} onClick={() => handleTabChange('low')} icon={<AlertTriangle size={14} />} label="低置信度" count={data.low_confidence_count} color="text-warning" />
        </div>
      )}

      {/* 内容区 */}
      {data && data.total_pending > 0 ? (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
            <div className="p-4">
              {/* 全选操作栏 */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <button onClick={selectCurrentPage} className="text-xs text-primary hover:underline">全选当页</button>
                  <button onClick={selectAllCurrent} className="text-xs text-primary hover:underline">全选{activeTab === 'high' ? '高置信度' : '低置信度'} ({currentList.length})</button>
                  {selected.size > 0 && <button onClick={() => setSelected(new Set())} className="text-xs text-destructive hover:underline">取消全选 ({selected.size})</button>}
                </div>
              </div>

              {/* 资产列表 */}
              <div key={`${activeTab}-${currentPage}`} className="rounded-lg shadow-sm overflow-hidden animate-tab-fade">
                <div className="divide-y divide-border">
                  {pageItems.map((asset, index) => (
                    <ReviewItem
                      key={asset.asset_id}
                      asset={asset}
                      index={index}
                      isExpanded={expandedId === asset.asset_id}
                      isSelected={selected.has(asset.asset_id)}
                      isLoading={actionLoading === asset.asset_id}
                      isProcessing={processingIds.has(asset.asset_id)}
                      isHigh={activeTab === 'high'}
                      onToggle={() => { setExpandedId(expandedId === asset.asset_id ? null : asset.asset_id); setModifyAssetId(null) }}
                      onSelect={() => toggleSelect(asset.asset_id)}
                      onReview={(d) => reviewSingle(asset.asset_id, d)}
                      modifyAssetId={modifyAssetId}
                      modifyForm={modifyForm}
                      onModifyFormChange={setModifyForm}
                      onSubmitModify={submitModify}
                      onCancelModify={() => setModifyAssetId(null)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-border/50 flex items-center justify-between shrink-0">
              <span className="text-xs text-muted-foreground">第 {currentPage}/{totalPages} 页</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="p-1.5 rounded hover:bg-accent disabled:opacity-30 transition-colors"><ChevronLeft size={16} /></button>
                {pageNumbers.map((p, i) => p === -1 ? <span key={`e${i}`} className="px-1 text-xs text-muted-foreground">...</span> : (
                  <button key={p} onClick={() => setCurrentPage(p)} className={`min-w-[28px] h-7 text-xs rounded transition-colors ${p === currentPage ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'}`}>{p}</button>
                ))}
                <button onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded hover:bg-accent disabled:opacity-30 transition-colors"><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
        </>
      ) : data && data.total_pending === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
          <CheckCircle2 size={48} className="mb-4 text-success/30" />
          <p className="text-sm">没有待审核的资产</p>
</div>
      ) : loading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <RefreshCw size={24} className="animate-spin mr-2" />
          <span className="text-sm">加载中...</span>
        </div>
      ) : null}

      {/* 自然语言指令 */}
      <div className="px-4 py-3 border-t border-border/50 shrink-0">
        <div className="flex gap-2">
          <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSubmit() } }}
            placeholder="用自然语言描述审核操作..." className="flex-1 px-3 py-1.5 text-xs bg-muted border border-border rounded-lg outline-none focus:ring-1 focus:ring-ring" disabled={chatLoading} />
          <button onClick={handleChatSubmit} disabled={!chatInput.trim() || chatLoading} className="text-xs bg-primary text-primary-foreground px-4 py-1.5 rounded-lg hover:bg-primary/80 disabled:opacity-50 transition-colors flex items-center gap-1">
            <Send size={12} />{chatLoading ? '...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ===== 审核项组件 =====

function ReviewItem({ asset, index, isExpanded, isSelected, isLoading, isProcessing, isHigh, onToggle, onSelect, onReview, modifyAssetId, modifyForm, onModifyFormChange, onSubmitModify, onCancelModify }: {
  asset: ReviewAsset; index: number; isExpanded: boolean; isSelected: boolean; isLoading: boolean; isProcessing: boolean; isHigh: boolean
  onToggle: () => void; onSelect: () => void; onReview: (d: ReviewDecision) => void
  modifyAssetId: string | null; modifyForm: any; onModifyFormChange: (f: any) => void; onSubmitModify: () => void; onCancelModify: () => void
}) {
  const [showArgs, setShowArgs] = useState(false)
  const criteria = asset.review_criteria || {}
  const determined = asset.review_determined || {}

  return (
    <div className={`animate-fade-in-up relative ${isProcessing ? 'opacity-60' : ''}`} style={{ animationDelay: `${index * 30}ms` }}>
      {/* 处理中遮罩 */}
      {isProcessing && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10 rounded-lg">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            处理中...
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-accent/30 transition-colors">
        <input type="checkbox" checked={isSelected} onChange={onSelect} className="rounded shrink-0" />
        <button onClick={onToggle} className="flex-1 flex items-center gap-2 text-left min-w-0">
          <span className="text-sm font-medium truncate">{asset.asset_name}</span>
          {asset.file_path && <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0 uppercase">.{asset.file_path.split('.').pop()}</span>}
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">{asset.review_type}</span>
          <span className={`text-xs font-mono shrink-0 ${isHigh ? 'text-success' : 'text-warning'}`}>{(asset.avg_confidence * 100).toFixed(0)}%</span>
          <span className="ml-auto shrink-0">{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
        </button>
      </div>

      {isExpanded && (
        <div className="px-3 pb-3 pl-8 space-y-3 animate-slide-down">
          {/* 审核维度（按资产类型动态） */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs text-muted-foreground">综合置信度</span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${asset.avg_confidence >= 0.9 ? 'bg-success' : asset.avg_confidence >= 0.6 ? 'bg-warning' : 'bg-destructive'}`} style={{ width: `${Math.max(Math.round(asset.avg_confidence * 100), 2)}%` }} />
              </div>
              <span className={`text-xs font-mono font-medium ${isHigh ? 'text-success' : 'text-warning'}`}>{(asset.avg_confidence * 100).toFixed(0)}%</span>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {Object.entries(criteria).map(([key, c]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-14 shrink-0">{c.label}</span>
                  <span className="text-xs truncate flex-1">{String(c.value)}</span>
                  <div className="w-12 h-1 bg-muted rounded-full overflow-hidden shrink-0">
                    <div className={`h-full rounded-full ${c.confidence >= 0.9 ? 'bg-success' : c.confidence >= 0.6 ? 'bg-warning' : c.confidence > 0 ? 'bg-destructive' : 'bg-muted-foreground/30'}`} style={{ width: `${Math.max(Math.round(c.confidence * 100), c.confidence > 0 ? 2 : 0)}%` }} />
                  </div>
                  <span className={`text-[11px] font-mono w-7 text-right shrink-0 ${c.confidence >= 0.9 ? 'text-success' : c.confidence >= 0.6 ? 'text-warning' : c.confidence > 0 ? 'text-destructive' : 'text-muted-foreground/50'}`}>
                    {c.confidence > 0 ? `${(c.confidence * 100).toFixed(0)}%` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 确定数据 */}
          {Object.keys(determined).length > 0 && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {Object.entries(determined).map(([key, d]) => (
                <div key={key}>
                  <span className="text-muted-foreground">{d.label}: </span>
                  <span>{String(d.value)}</span>
                </div>
              ))}
            </div>
          )}

          {/* 问题列表 */}
          {Object.values(criteria).some((c) => c.issues && c.issues.length > 0) && (
            <div className="space-y-1">
              {Object.values(criteria).filter((c) => c.issues && c.issues.length > 0).map((c) => (
                <div key={c.label} className="text-xs text-destructive bg-destructive/5 rounded px-2 py-1">
                  {c.label}: {c.issues!.join('、')}
                </div>
              ))}
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-2">
            <button onClick={() => onReview('approve')} disabled={isLoading} className="flex items-center gap-1 text-xs bg-success/10 text-success px-3 py-1.5 rounded hover:bg-success/20 transition-colors"><CheckCircle2 size={12} /> 通过</button>
            <button onClick={() => onReview('reject')} disabled={isLoading} className="flex items-center gap-1 text-xs bg-destructive/10 text-destructive px-3 py-1.5 rounded hover:bg-destructive/20 transition-colors"><XCircle size={12} /> 拒绝</button>
            {modifyAssetId !== asset.asset_id ? (
              <button onClick={() => onReview('modify')} disabled={isLoading} className="flex items-center gap-1 text-xs bg-warning/10 text-warning px-3 py-1.5 rounded hover:bg-warning/20 transition-colors"><AlertTriangle size={12} /> 修改</button>
            ) : (
              <button onClick={onCancelModify} className="flex items-center gap-1 text-xs bg-muted text-muted-foreground px-3 py-1.5 rounded hover:bg-accent transition-colors">取消</button>
            )}
          </div>

          {/* 修改表单 */}
          {modifyAssetId === asset.asset_id && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <h5 className="text-xs font-medium">修正 AI 推断结果</h5>
              <div className="grid grid-cols-2 gap-2">
                <ModifyField label="分类" value={modifyForm.category} onChange={(v) => onModifyFormChange({ ...modifyForm, category: v })} placeholder={String(criteria.category?.value || '')} />
                <ModifyField label="子分类" value={modifyForm.subcategory} onChange={(v) => onModifyFormChange({ ...modifyForm, subcategory: v })} placeholder="" />
                <ModifyField label="材质" value={modifyForm.material} onChange={(v) => onModifyFormChange({ ...modifyForm, material: v })} placeholder={String(criteria.material?.value || '')} />
                <ModifyField label="风格" value={modifyForm.style} onChange={(v) => onModifyFormChange({ ...modifyForm, style: v })} placeholder={String(criteria.style?.value || '')} />
                <ModifyField label="状态" value={modifyForm.condition} onChange={(v) => onModifyFormChange({ ...modifyForm, condition: v })} placeholder={String(criteria.condition?.value || '')} />
              </div>
              <button onClick={onSubmitModify} disabled={isLoading} className="text-xs bg-primary text-primary-foreground px-4 py-1.5 rounded hover:bg-primary/80 transition-colors">{isLoading ? '提交中...' : '提交修改'}</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ===== 子组件 =====

function TabButton({ active, onClick, icon, label, count, color }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number; color: string }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${active ? 'bg-foreground/[0.08] shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
      <span className={active ? color : ''}>{icon}</span>
      {label}
      <span className={`px-1.5 py-0.5 rounded-full text-[11px] ${active ? 'bg-foreground/10' : 'bg-muted'}`}>{count}</span>
    </button>
  )
}

function ModifyField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="w-full mt-0.5 px-2 py-1 text-xs bg-background border border-border rounded outline-none focus:ring-1 focus:ring-primary" placeholder={placeholder || `输入${label}`} />
    </div>
  )
}
