import React, { useEffect, useState, useCallback } from 'react'
import { FolderOpen } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { getSession, updateSession } from '@/services/sessions'
import { getWorkspaceTree, getWorkspaceFilePreview, type WorkspaceTreeNode } from '@/services/workspace'

interface GeneralWorkspaceViewProps {
  sessionId: string | null
}

export function GeneralWorkspaceView({ sessionId }: GeneralWorkspaceViewProps) {
  const [workspaceName, setWorkspaceName] = useState('')
  const [workspacePath, setWorkspacePath] = useState('')
  const [pathDraft, setPathDraft] = useState('')
  const [editingPath, setEditingPath] = useState(false)
  const [savingPath, setSavingPath] = useState(false)
  const [tree, setTree] = useState<WorkspaceTreeNode[]>([])
  const [treeError, setTreeError] = useState('')
  const [selectedFile, setSelectedFile] = useState<string>('')
  const [fileContent, setFileContent] = useState('')
  const [fileError, setFileError] = useState('')
  const [fileLoading, setFileLoading] = useState(false)

  const reloadTree = useCallback((sid: string) => {
    getWorkspaceTree(sid)
      .then((resp) => {
        setTree(resp.tree || [])
        setTreeError(resp.error || '')
      })
      .catch((e) => {
        setTree([])
        setTreeError(String((e as Error).message || '加载文件树失败'))
      })
  }, [])

  useEffect(() => {
    if (!sessionId) {
      setWorkspaceName('')
      setWorkspacePath('')
      setPathDraft('')
      setTree([])
      setTreeError('')
      return
    }
    getSession(sessionId)
      .then((meta) => {
        const name = meta?.workspaceName || ''
        const path = meta?.workspacePath || ''
        setWorkspaceName(name)
        setWorkspacePath(path)
        setPathDraft(path)
        if (meta?.sessionId) {
          reloadTree(meta.sessionId)
        } else {
          setTree([])
          setTreeError('')
        }
        setSelectedFile('')
        setFileContent('')
        setFileError('')
      })
      .catch(() => {
        setWorkspaceName('')
        setWorkspacePath('')
        setPathDraft('')
        setTree([])
        setTreeError('')
        setSelectedFile('')
        setFileContent('')
        setFileError('')
      })
  }, [sessionId, reloadTree])

  const handleSavePath = async () => {
    if (!sessionId) {
      window.alert('请先在对话页打开一个会话')
      return
    }
    const trimmed = pathDraft.trim()
    if (!trimmed) {
      window.alert('路径不能为空')
      return
    }
    setSavingPath(true)
    try {
      const updated = await updateSession(sessionId, { workspacePath: trimmed })
      if (!updated) {
        window.alert('保存失败')
        return
      }
      setWorkspaceName(updated.workspaceName || workspaceName)
      setWorkspacePath(updated.workspacePath || trimmed)
      setPathDraft(updated.workspacePath || trimmed)
      setEditingPath(false)
      reloadTree(sessionId)
    } catch {
      window.alert('保存失败')
    } finally {
      setSavingPath(false)
    }
  }

  const handlePickFolder = async () => {
    try {
      const picker = (window as any).electronAPI?.openFolder as (() => Promise<unknown>) | undefined
      if (!picker) {
        window.alert('当前环境不支持目录选择，请手动输入路径')
        return
      }
      const result = await picker()
      const data = result as { canceled?: boolean; filePaths?: string[]; path?: string } | undefined
      if (!data || data.canceled) return
      const picked = data.filePaths?.[0] || data.path || ''
      if (picked) setPathDraft(picked)
    } catch {
      window.alert('打开目录选择器失败')
    }
  }

  const handleSelectFile = (filePath: string) => {
    if (!sessionId) return
    setSelectedFile(filePath)
    setFileLoading(true)
    setFileError('')
    setFileContent('')
    getWorkspaceFilePreview(sessionId, filePath)
      .then((resp) => {
        if (resp.error) {
          setFileError(resp.error)
          return
        }
        const text = resp.content || ''
        setFileContent(text + ((resp.truncated && text) ? '\n\n...[预览已截断]' : ''))
      })
      .catch((e) => setFileError(String((e as Error).message || '读取失败')))
      .finally(() => setFileLoading(false))
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
      <PageHeader>
        <FolderOpen size={18} className="text-primary shrink-0" />
        <h2 className="text-sm font-medium">工作区</h2>
      </PageHeader>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-6">
        {!sessionId ? (
          <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-muted-foreground">
            请先在对话页打开或新建一个会话
          </div>
        ) : (
          <div className="flex flex-col gap-4 w-full min-h-0">
            <div className="rounded-xl border border-border/60 bg-card px-4 py-3 text-sm space-y-2 w-full">
              <div className="font-medium">{workspaceName || '默认工作区'}</div>
              {!editingPath ? (
                <>
                  <div className="text-xs text-muted-foreground break-all" title={workspacePath}>
                    {workspacePath || '（加载中…）'}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPathDraft(workspacePath)
                      setEditingPath(true)
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    更改目录
                  </button>
                </>
              ) : (
                <div className="flex flex-col gap-2 max-w-2xl">
                  <input
                    value={pathDraft}
                    onChange={(e) => setPathDraft(e.target.value)}
                    placeholder="本地目录绝对路径"
                    className="w-full text-xs px-2 py-1.5 rounded border border-border/60 bg-background outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handlePickFolder}
                      className="text-xs px-2 py-1 rounded border border-border/60 hover:bg-accent"
                    >
                      浏览
                    </button>
                    <button
                      type="button"
                      onClick={handleSavePath}
                      disabled={savingPath}
                      className="text-xs px-2 py-1 rounded border border-border/60 hover:bg-accent disabled:opacity-50"
                    >
                      {savingPath ? '保存中…' : '保存'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPathDraft(workspacePath)
                        setEditingPath(false)
                      }}
                      className="text-xs px-2 py-1 text-muted-foreground hover:underline"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border/60 bg-card p-4 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[360px] w-full flex-1">
              <div className="min-w-0 flex flex-col">
                <div className="text-sm font-medium mb-2 shrink-0">工作区文件（只读）</div>
                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin pr-1">
                  {treeError ? (
                    <div className="text-xs text-muted-foreground">{treeError}</div>
                  ) : tree.length === 0 ? (
                    <div className="text-xs text-muted-foreground">暂无可显示文件</div>
                  ) : (
                    <div className="space-y-1">
                      {tree.map((node) => (
                        <TreeNodeView
                          key={node.path}
                          node={node}
                          depth={0}
                          selectedFile={selectedFile}
                          onSelectFile={handleSelectFile}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="min-w-0 flex flex-col border-t lg:border-t-0 lg:border-l border-border/50 pt-4 lg:pt-0 lg:pl-4">
                <div className="text-sm font-medium mb-2 shrink-0">文件预览</div>
                <div className="flex-1 min-h-0 overflow-auto">
                  {!selectedFile ? (
                    <div className="text-xs text-muted-foreground">点击左侧文件开始预览</div>
                  ) : fileLoading ? (
                    <div className="text-xs text-muted-foreground">读取中...</div>
                  ) : fileError ? (
                    <div className="text-xs text-muted-foreground">{fileError}</div>
                  ) : (
                    <>
                      <div className="text-[11px] text-muted-foreground break-all mb-2">{selectedFile}</div>
                      <pre className="text-xs whitespace-pre-wrap break-words bg-background rounded border border-border/50 p-3">
{fileContent || '(文件为空)'}
                      </pre>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TreeNodeView({
  node,
  depth,
  selectedFile,
  onSelectFile,
}: {
  node: WorkspaceTreeNode
  depth: number
  selectedFile: string
  onSelectFile: (filePath: string) => void
}) {
  const isDir = node.type === 'directory'
  const isSelected = !isDir && node.path === selectedFile
  return (
    <div>
      <button
        type="button"
        onClick={() => !isDir && onSelectFile(node.path)}
        className={`w-full text-left text-xs truncate rounded px-1 ${isSelected ? 'bg-accent text-foreground' : 'text-foreground/90 hover:bg-accent/60'}`}
        style={{ paddingLeft: `${depth * 14}px` }}
        title={node.path}
      >
        {isDir ? '📁' : '📄'} {node.name}
      </button>
      {isDir && node.children?.map((child) => (
        <TreeNodeView
          key={child.path}
          node={child}
          depth={depth + 1}
          selectedFile={selectedFile}
          onSelectFile={onSelectFile}
        />
      ))}
    </div>
  )
}
