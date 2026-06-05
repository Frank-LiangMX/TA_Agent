/**
 * TAgent 类型定义
 *
 * 对应 ta_agent Python 后端的数据结构
 */

// ===== 资产身份卡片 =====

/** 几何体信息 */
export interface MeshInfo {
  triangleCount: number
  vertexCount: number
  hasSkeleton: boolean
  boneCount: number
  hasUV: boolean
  boundingBox: { x: number; y: number; z: number }
}

/** 纹理信息 */
export interface TextureInfo {
  resolution: string        // "2048x2048"
  format: string            // "PNG", "TGA"
  channels: string          // "RGBA", "RGB"
  colorSpace: string        // "sRGB", "Linear"
  usageType: string         // "BaseColor", "Normal", "ORM"
}

/** 资产分类 */
export interface AssetCategory {
  primary: string           // "Character", "Prop", "Environment"
  secondary: string         // "Weapon", "Armor", "Foliage"
  confidence: number        // 0-1
}

/** 材质结构 */
export interface MaterialStructure {
  primary: string           // "Metal", "Fabric", "Wood"
  secondary?: string
  shaderType?: string       // "PBR", "Unlit", "Glass"
}

/** 视觉属性 */
export interface VisualAttributes {
  style: string             // "Realistic", "Stylized", "Pixel"
  colorPalette: string[]    // ["#ff0000", "#333339"]
  condition: string         // "New", "Worn", "Damaged"
  description: string
}

/** 空间关系 */
export interface SpatialRelation {
  relatedAssets: string[]
  parentAsset?: string
}

/** 元信息 */
export interface MetaInfo {
  namingSuggestion?: string
  compliance: boolean
  enginePath?: string       // "/Game/Characters/Hero/SK_Hero"
  status: 'pending' | 'approved' | 'rejected' | 'needs_fix'
}

/** 资产标签 - 完整的资产身份卡 */
export interface AssetTags {
  id: string
  filename: string
  filePath: string
  basic: {
    type: string
    size: number
    intakeTime: string
  }
  geometry?: MeshInfo
  textures?: TextureInfo[]
  category?: AssetCategory
  material?: MaterialStructure
  visual?: VisualAttributes
  spatial?: SpatialRelation
  meta?: MetaInfo
}

// ===== 工具调用 =====

/** 工具调用信息 */
export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

/** 工具结果 */
export interface ToolResult {
  toolCallId: string
  name: string
  result: unknown
  error?: string
}

// ===== 消息类型 =====

export type MessageRole = 'user' | 'assistant' | 'tool' | 'system'

// ===== SubAgent 事件类型 =====

export type SubAgentType = 'explorer' | 'researcher' | 'code-reviewer'
export type SubAgentStatus = 'running' | 'completed' | 'error' | 'stopped'

export interface SubAgentStartEvent {
  type: 'subagent_start'
  subagent_type: SubAgentType
  task_id: string
  description: string
  run_in_background: boolean
}

export interface SubAgentToolEvent {
  type: 'subagent_tool'
  task_id: string
  tool_name: string
  args_preview: string
}

export interface SubAgentProgressEvent {
  type: 'subagent_progress'
  task_id: string
  step_count: number
  elapsed_ms: number
  model: string
}

export interface SubAgentDoneEvent {
  type: 'subagent_done'
  task_id: string
  status: SubAgentStatus
  result_preview: string
  total_steps: number
  total_tokens: number
}

export interface SubAgentLogEvent {
  type: 'subagent_log'
  task_id: string
  level: 'info' | 'warn' | 'error'
  message: string
}

export type SubAgentEvent =
  | SubAgentStartEvent
  | SubAgentToolEvent
  | SubAgentProgressEvent
  | SubAgentDoneEvent
  | SubAgentLogEvent

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: number
  toolCalls?: ToolCall[]
  toolResults?: ToolResult[]
  /** 关联的资产（用于展示资产卡片） */
  assetIds?: string[]
  /** SubAgent 任务列表（general mode 下 Agent 工具调用产生） */
  subAgentTasks?: Array<import('@/components/agent/SubAgentCard').SubAgentState>
}

// ===== 会话 =====

/** 会话元数据（对应后端 session_manager 返回的结构） */
export interface SessionMeta {
  sessionId: string
  title: string
  createdAt: string
  lastActive: string
  messageCount: number
  workflowMode: 'step_by_step' | 'auto'
  isDraft: boolean
  isPinned: boolean
  isArchived: boolean
  tags: string[]
  summary: string
  workspacePath?: string
  workspaceName?: string
}

// ===== 分析进度 =====

export type AnalysisPhase =
  | 'scanning'
  | 'extracting'
  | 'naming_check'
  | 'mesh_check'
  | 'texture_check'
  | 'ai_inference'
  | 'storing'
  | 'complete'

export interface AnalysisProgress {
  phase: AnalysisPhase
  current: number
  total: number
  currentFile?: string
  message?: string
}

// ===== 审核 =====

export type ReviewDecision = 'approve' | 'reject' | 'needs_fix'

export interface ReviewItem {
  assetId: string
  filename: string
  category?: AssetCategory
  issues: string[]
  decision?: ReviewDecision
  comment?: string
}

// ===== 语义搜索 =====

export interface SearchResult {
  asset: AssetTags
  score: number
  matchBreakdown: Record<string, number>
}

// ===== WebSocket 协议 =====

/** 客户端 → 服务端 */
export interface WSRequest {
  id: string
  method: string
  params?: Record<string, unknown>
}

/** 服务端 → 客户端：响应 */
export interface WSResponse {
  id: string
  result?: unknown
  error?: string
}

/** 服务端 → 客户端：事件推送 */
export interface WSEvent {
  type: 'event'
  event: string
  payload: unknown
}

/** 流式文本事件 */
export interface StreamTextEvent {
  sessionId: string
  text: string
}

/** 工具调用开始事件 */
export interface ToolStartEvent {
  sessionId: string
  toolCall: ToolCall
}

/** 工具调用结果事件 */
export interface ToolResultEvent {
  sessionId: string
  toolCallId: string
  result: unknown
  error?: string
}

/** 分析进度事件 */
export interface AnalysisProgressEvent {
  sessionId: string
  progress: AnalysisProgress
}

/** 资产发现事件 */
export interface AssetDiscoveredEvent {
  sessionId: string
  asset: AssetTags
}
