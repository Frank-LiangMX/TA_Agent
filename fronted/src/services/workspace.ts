import { getDataSource } from '@/lib/cache'

export interface WorkspaceTreeNode {
  name: string
  path: string
  type: 'directory' | 'file'
  children?: WorkspaceTreeNode[]
}

interface WorkspaceTreeResponse {
  error?: string
  tree: WorkspaceTreeNode[]
}

export interface WorkspaceFilePreview {
  error?: string
  path?: string
  name?: string
  size?: number
  truncated?: boolean
  content?: string
}

export async function getWorkspaceTree(sessionId: string): Promise<WorkspaceTreeResponse> {
  const dataSource = await getDataSource()
  const res = await fetch(
    `${dataSource}/api/workspace/tree?session_id=${encodeURIComponent(sessionId)}&max_depth=2&max_items=200`
  )
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  return res.json()
}

export async function getWorkspaceFilePreview(
  sessionId: string,
  filePath: string,
): Promise<WorkspaceFilePreview> {
  const dataSource = await getDataSource()
  const res = await fetch(
    `${dataSource}/api/workspace/file?session_id=${encodeURIComponent(sessionId)}&file_path=${encodeURIComponent(filePath)}`
  )
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  return res.json()
}
