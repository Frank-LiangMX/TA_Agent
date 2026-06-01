import React, { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, FolderOpen, Loader2 } from 'lucide-react'
import { FbxViewer } from './FbxViewer'
import { API_BASE } from '@/lib/api'

interface FbxViewerModalProps {
  open: boolean
  onClose: () => void
  assetId?: string
  assetName?: string
  filePath?: string
}

export function FbxViewerModal({ open, onClose, assetId, assetName, filePath }: FbxViewerModalProps) {
  const [fbxFile, setFbxFile] = useState<File | null>(null)
  const [textureFiles, setTextureFiles] = useState<Map<string, string>>(new Map())
  const [textureStatus, setTextureStatus] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // ESC to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Auto-fetch FBX file when modal opens
  useEffect(() => {
    if (!open || !assetId) return

    // Only auto-fetch for FBX files
    const isFbx = filePath?.toLowerCase().endsWith('.fbx')
    if (!isFbx) return

    let cancelled = false
    const fetchFile = async () => {
      setFetching(true)
      setFetchError(null)
      try {
        const res = await fetch(`${API_BASE}/api/assets/${assetId}/file`)
        if (!res.ok) {
          throw new Error(`下载失败 (${res.status})`)
        }
        const blob = await res.blob()
        if (cancelled) return
        const fileName = filePath?.split(/[/\\]/).pop() || 'model.fbx'
        const file = new File([blob], fileName, { type: 'application/octet-stream' })
        setFbxFile(file)
      } catch (err: any) {
        if (!cancelled) setFetchError(err.message || '加载失败')
      } finally {
        if (!cancelled) setFetching(false)
      }
    }
    fetchFile()

    return () => { cancelled = true }
  }, [open, assetId, filePath])

  // Reset state when closing
  useEffect(() => {
    if (!open) {
      setFbxFile(null)
      setTextureFiles(new Map())
      setTextureStatus('')
      setFetchError(null)
    }
  }, [open])

  const handleFbxSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setFbxFile(file)
      setFetchError(null)
    }
  }, [])

  const handleTextureDir = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const map = new Map<string, string>()
    let tgaCount = 0, imgCount = 0
    files.forEach((f) => {
      map.set(f.name, URL.createObjectURL(f))
      if (f.name.toLowerCase().endsWith('.tga')) tgaCount++
      else imgCount++
    })
    setTextureFiles(map)
    setTextureStatus(`${tgaCount} TGA + ${imgCount} 张贴图`)
  }, [])

  if (!open) return null

  const isFbx = filePath?.toLowerCase().endsWith('.fbx')

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative m-4 flex-1 bg-background rounded-xl border border-border/50 shadow-2xl flex flex-col overflow-hidden min-h-0">
        {/* Header */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-medium">
              3D 预览{assetName ? ` - ${assetName}` : ''}
            </h3>
            <label className="flex items-center gap-1.5 px-2.5 py-1 bg-primary text-primary-foreground rounded text-xs cursor-pointer hover:opacity-90 transition-opacity">
              <FolderOpen size={12} />
              更换 FBX
              <input type="file" accept=".fbx" className="hidden" onChange={handleFbxSelect} />
            </label>
            <label className="flex items-center gap-1.5 px-2.5 py-1 bg-muted text-foreground rounded text-xs cursor-pointer hover:bg-accent transition-colors">
              <FolderOpen size={12} />
              贴图目录
              <input
                type="file"
                // @ts-expect-error webkitdirectory is non-standard
                webkitdirectory=""
                multiple
                className="hidden"
                onChange={handleTextureDir}
              />
            </label>
            {textureStatus && (
              <span className="text-[11px] text-muted-foreground">{textureStatus}</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Viewer */}
        <div className="flex-1 min-h-0 relative">
          {/* Fetching overlay */}
          {fetching && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 z-20">
              <Loader2 size={24} className="animate-spin text-primary" />
              <span className="mt-2 text-xs text-muted-foreground">正在加载模型文件...</span>
            </div>
          )}

          {/* Error state */}
          {fetchError && !fbxFile && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
              <p className="text-sm text-destructive mb-2">{fetchError}</p>
              <p className="text-xs text-muted-foreground mb-3">请手动选择 FBX 文件</p>
              <label className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs cursor-pointer hover:opacity-90">
                <FolderOpen size={12} />
                选择 FBX 文件
                <input type="file" accept=".fbx" className="hidden" onChange={handleFbxSelect} />
              </label>
            </div>
          )}

          {/* Not FBX file */}
          {!isFbx && !fbxFile && !fetching && !fetchError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
              <p className="text-xs text-muted-foreground mb-3">该资产不是 FBX 文件，请手动选择</p>
              <label className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs cursor-pointer hover:opacity-90">
                <FolderOpen size={12} />
                选择 FBX 文件
                <input type="file" accept=".fbx" className="hidden" onChange={handleFbxSelect} />
              </label>
            </div>
          )}

          <FbxViewer fbxFile={fbxFile} textureFiles={textureFiles} />
        </div>
      </div>
    </div>,
    document.body
  )
}
