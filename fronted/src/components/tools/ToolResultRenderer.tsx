/**
 * 工具结果渲染器
 *
 * 根据工具名称分发到对应的可视化组件。
 * 未匹配的工具使用通用 JSON 展示。
 */

import React from 'react'
import { MeshBudgetResult } from './results/MeshBudgetResult'
import { TextureInfoResult } from './results/TextureInfoResult'
import { NamingCheckResult } from './results/NamingCheckResult'
import { ScanDirectoryResult } from './results/ScanDirectoryResult'
import { AssetListResult } from './results/AssetListResult'
import { SearchAssetsResult } from './results/SearchAssetsResult'
import { ReportResult } from './results/ReportResult'
import { ReviewQueueResult } from './results/ReviewQueueResult'
import { AnalyzeAssetsResult } from './results/AnalyzeAssetsResult'
import { StatusResult } from './results/StatusResult'
import { JsonResult } from './results/JsonResult'

interface ToolResultRendererProps {
  toolName: string
  result: string
}

export function ToolResultRenderer({ toolName, result }: ToolResultRendererProps) {
  // 解析 JSON
  let data: unknown
  try {
    data = JSON.parse(result)
  } catch {
    // 非 JSON，直接显示文本
    return <StatusResult text={result} />
  }

  if (!data || typeof data !== 'object') {
    return <StatusResult text={String(data)} />
  }

  const d = data as Record<string, unknown>

  // 错误
  if (d.error) {
    return <StatusResult text={String(d.error)} status="error" />
  }

  // 根据工具名分发
  switch (toolName) {
    case 'check_mesh_budget':
      return <MeshBudgetResult data={d as any} />
    case 'check_texture_info':
      return <TextureInfoResult data={d as any} />
    case 'check_texture_batch':
      return <JsonResult data={d} title="贴图批量检查" />
    case 'check_naming':
      return <NamingCheckResult data={d as any} />
    case 'suggest_naming':
      return <NamingSuggestResult data={d as any} />
    case 'scan_directory':
      return <ScanDirectoryResult data={d as any} />
    case 'check_file_info':
      return <FileInfoResult data={d as any} />
    case 'analyze_assets':
      return <AnalyzeAssetsResult data={d as any} />
    case 'list_assets':
      return <AssetListResult data={d as any} />
    case 'search_assets':
      return <SearchAssetsResult data={d as any} />
    case 'get_asset_detail':
      return <JsonResult data={d} title="资产详情" />
    case 'generate_report':
      return <ReportResult data={d as any} />
    case 'get_pending_reviews':
      return <ReviewQueueResult data={d as any} />
    case 'check_directory_structure':
      return <DirectoryResult data={d as any} />
    case 'count_assets_by_type':
      return <CountAssetsResult data={d as any} />
    case 'get_memory_stats':
      return <MemoryStatsResult data={d as any} />
    case 'record_correction':
    case 'update_project_profile':
    case 'load_project_config':
    case 'create_project_config':
    case 'load_conventions':
      return <StatusResult text={String(d.message || (d.success ? '操作成功' : JSON.stringify(d)))} status={d.error ? 'error' : 'success'} />
    case 'update_asset_type':
      return <StatusResult text={d.message || `已更新 ${d.updated} 个资产`} status="success" />
    case 'intake_asset':
    case 'intake_batch':
    case 'intake_approved':
      return <JsonResult data={d} title="入库结果" />
    case 'submit_review':
    case 'batch_approve':
      return <StatusResult text={d.message || `已处理`} status={d.error ? 'error' : 'success'} />
    default:
      return <JsonResult data={d} title={toolName} />
  }
}

// ===== 简单内联组件 =====

function NamingSuggestResult({ data }: { data: { asset_type: string; prefix: string; suggested_name: string; alternatives: string[] } }) {
  return (
    <div className="rounded-lg shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-primary/10">
        <span className="text-sm font-medium">命名建议</span>
      </div>
      <div className="p-3 space-y-2">
        <div className="text-sm">
          <span className="text-muted-foreground">建议名称：</span>
          <span className="font-mono font-medium text-primary">{data.suggested_name}</span>
        </div>
        {data.alternatives?.length > 0 && (
          <div className="text-xs text-muted-foreground">
            备选：{data.alternatives.join('、')}
          </div>
        )}
      </div>
    </div>
  )
}

function FileInfoResult({ data }: { data: { filename: string; extension: string; size_mb: number; category: string; exists: boolean } }) {
  if (!data.exists) {
    return <StatusResult text="文件不存在" status="error" />
  }
  return (
    <div className="rounded-lg shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted">
        <span className="text-sm font-medium">{data.filename}</span>
        <span className="text-xs text-muted-foreground ml-auto">{data.category}</span>
      </div>
      <div className="p-3 grid grid-cols-3 gap-2 text-xs">
        <div><span className="text-muted-foreground">格式：</span>{data.extension}</div>
        <div><span className="text-muted-foreground">大小：</span>{data.size_mb} MB</div>
        <div><span className="text-muted-foreground">类型：</span>{data.category}</div>
      </div>
    </div>
  )
}

function DirectoryResult({ data }: { data: { current_path: string; asset_type: string; is_in_correct_directory: boolean; suggestion: string | null } }) {
  return (
    <div className="rounded-lg shadow-sm overflow-hidden">
      <div className={`flex items-center gap-2 px-3 py-2 ${data.is_in_correct_directory ? 'bg-success/10' : 'bg-warning/10'}`}>
        <span className="text-sm font-medium">
          {data.is_in_correct_directory ? '✅ 目录结构正确' : '⚠️ 目录结构不正确'}
        </span>
      </div>
      <div className="p-3 space-y-1 text-xs">
        <div><span className="text-muted-foreground">路径：</span>{data.current_path}</div>
        <div><span className="text-muted-foreground">资产类型：</span>{data.asset_type}</div>
        {data.suggestion && (
          <div className="text-warning mt-1">{data.suggestion}</div>
        )}
      </div>
    </div>
  )
}

function CountAssetsResult({ data }: { data: { total: number; by_type: Record<string, number> } }) {
  const entries = Object.entries(data.by_type).sort((a, b) => b[1] - a[1])
  return (
    <div className="rounded-lg shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted">
        <span className="text-sm font-medium">📊 资产统计</span>
        <span className="text-xs text-muted-foreground ml-auto">共 {data.total} 个</span>
      </div>
      <div className="p-3 space-y-1.5">
        {entries.map(([type, count]) => (
          <div key={type} className="flex items-center gap-2 text-xs">
            <span className="w-24 truncate">{type}</span>
            <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full"
                style={{ width: `${(count / data.total) * 100}%` }}
              />
            </div>
            <span className="w-8 text-right font-mono">{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MemoryStatsResult({ data }: { data: { profile_chars?: number; rule_count?: number; correction_count?: number; total_tokens_estimate?: number; error?: string } }) {
  if (data.error) {
    return <StatusResult text={data.error} status="error" />
  }
  return (
    <div className="rounded-lg shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted">
        <span className="text-sm font-medium">🧠 记忆系统状态</span>
      </div>
      <div className="p-3 grid grid-cols-2 gap-2">
        <StatBox label="项目画像" value={`${data.profile_chars || 0} 字符`} />
        <StatBox label="推断规则" value={`${data.rule_count || 0} 条`} />
        <StatBox label="修正记录" value={`${data.correction_count || 0} 条`} />
        <StatBox label="Token 估算" value={`${data.total_tokens_estimate || 0}`} />
      </div>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted rounded-lg p-2 text-center">
      <div className="text-sm font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
