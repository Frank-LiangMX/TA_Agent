/**
 * 右侧工作区面板 - 抽屉式
 *
 * 参考 Proma 的 SidePanel：切换按钮在主面板右上角，展开后显示：
 * - 当前工作区路径（可改）
 * - 文件树（可点击预览）
 * - 文件预览
 *
 * 状态：与 MainPanel 的 rightPanelOpen 同步，state 提到 MainPanel 里
 */

import React, { useEffect, useState, useCallback } from 'react'
import { FolderOpen, X, Eye, EyeOff, Save, ChevronRight, ChevronDown } from 'lucide-react'
import { getSession, updateSession } from '@/services/sessions'
import { getWorkspaceTree, getWorkspaceFilePreview, type WorkspaceTreeNode } from '@/services/workspace'

interface Props {
  open: boolean
  onClose: () => void
  sessionId: string | null
  onWorkspaceChange?: () => void
}

export function RightWorkspacePanel({ open, onClose, sessionId, onWorkspaceChange }: Props) {
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

  // 关闭动画：保留挂载到动画结束再卸载
  const [shouldRender, setShouldRender] = useState(open)
  const [isClosing, setIsClosing] = useState(false)
  useEffect(() => {
    if (open) {
      setShouldRender(true)
      setIsClosing(false)
    } else if (shouldRender) {
      setIsClosing(true)
      const t = setTimeout(() => {
        setShouldRender(false)
        setIsClosing(false)
      }, 200)
      return () => clearTimeout(t)
    }
  }, [open, shouldRender])

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
    if (!open || !sessionId) {
      setWorkspaceName('')
      setWorkspacePath('')
      setPathDraft('')
      setTree([])
      setTreeError('')
      setSelectedFile('')
      setFileContent('')
      setFileError('')
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
  }, [open, sessionId, reloadTree])

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
      onWorkspaceChange?.()
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
        window.alert('当前环境不支持目录选择，请手动输入绝对路径')
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

  if (!shouldRender) return null

  const displayName = workspaceName || '默认工作区'
  const displayPath = workspacePath || '（加载中…）'

  return (
    <aside
      className={`shrink-0 h-full m-2 ml-0 rounded-2xl shadow-xl border border-border/30 bg-card overflow-hidden flex flex-col duration-200 ${
        isClosing ? 'animate-out slide-out-to-right' : 'animate-in slide-in-from-right'
      }`}
      style={{ width: 340 }}
    >
      {/* Header */}
      <div className="shrink-0 px-4 py-2.5 border-b border-border/30 flex items-center gap-2">
        <FolderOpen size={14} className="text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">{displayName}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="关闭工作区面板"
        >
          <X size={14} />
        </button>
      </div>

      {/* 路径栏 */}
      <div className="shrink-0 px-3 py-2 border-b border-border/30">
        {!editingPath ? (
          <div className="flex items-center gap-1.5">
            <code
              className="flex-1 min-w-0 text-[11px] font-mono px-2 py-1 rounded bg-muted/40 text-muted-foreground truncate"
              title={displayPath}
            >
              {displayPath}
            </code>
            <button
              type="button"
              onClick={() => {
                setPathDraft(workspacePath)
                setEditingPath(true)
              }}
              className="shrink-0 text-[11px] px-2 py-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              更改
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <input
              value={pathDraft}
              onChange={(e) => setPathDraft(e.target.value)}
              placeholder="本地目录绝对路径"
              autoFocus
              className="w-full text-[11px] font-mono px-2 py-1 rounded border border-border/60 bg-background text-foreground outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handlePickFolder}
                className="text-[11px] px-2 py-1 rounded border border-border/60 hover:bg-accent"
              >
                浏览
              </button>
              <button
                type="button"
                onClick={handleSavePath}
                disabled={savingPath}
                className="text-[11px] px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {savingPath ? '保存中…' : '保存'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPathDraft(workspacePath)
                  setEditingPath(false)
                }}
                className="text-[11px] px-2 py-1 text-muted-foreground hover:text-foreground"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 文件树 */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="shrink-0 px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          文件
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-2 pb-2">
          {treeError ? (
            <div className="text-xs text-muted-foreground px-2 py-2">{treeError}</div>
          ) : tree.length === 0 ? (
            <div className="text-xs text-muted-foreground px-2 py-2">暂无可显示文件</div>
          ) : (
            <div className="space-y-0.5">
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

        {/* 文件预览 */}
        {selectedFile && (
          <div className="shrink-0 h-1/2 border-t border-border/40 flex flex-col">
            <div className="shrink-0 px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>预览</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile('')
                  setFileContent('')
                  setFileError('')
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={12} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto px-3 pb-3">
              <div className="text-[10px] text-muted-foreground break-all mb-1.5">{selectedFile}</div>
              {fileLoading ? (
                <div className="text-xs text-muted-foreground">读取中...</div>
              ) : fileError ? (
                <div className="text-xs text-muted-foreground">{fileError}</div>
              ) : (
                <pre className="text-[11px] whitespace-pre-wrap break-words bg-background rounded border border-border/50 p-2">
{fileContent || '(文件为空)'}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
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
  const [expanded, setExpanded] = useState(depth < 1)

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (isDir) setExpanded(!expanded)
          else onSelectFile(node.path)
        }}
        className={`w-full text-left text-[11px] truncate rounded px-1.5 py-1 ${
          isSelected
            ? 'bg-primary/10 text-foreground font-medium'
            : 'text-foreground/85 hover:bg-accent/60'
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        title={node.path}
      >
        {isDir ? (
          expanded ? <ChevronDown size={10} className="inline-block mr-1 -mt-0.5" /> : <ChevronRight size={10} className="inline-block mr-1 -mt-0.5" />
        ) : (
          <span className="inline-block w-2.5 mr-0.5" />
        )}
        <span className="mr-1">{isDir ? '📁' : '📄'}</span>
        {node.name}
      </button>
      {isDir && expanded && node.children?.map((child) => (
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
