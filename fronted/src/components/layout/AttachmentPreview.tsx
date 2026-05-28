/**
 * 附件预览组件
 *
 * 显示已选择的附件：图片缩略图 / 文件名标签。
 */

import React from 'react'
import { X, FileImage, File } from 'lucide-react'

export interface Attachment {
  id: string
  name: string
  size: number
  type: string
  previewUrl?: string
  _file?: File
}

interface AttachmentPreviewProps {
  attachments: Attachment[]
  onRemove: (id: string) => void
}

export function AttachmentPreview({ attachments, onRemove }: AttachmentPreviewProps) {
  if (attachments.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5 px-3 pt-2">
      {attachments.map((att) => {
        const isImage = att.type.startsWith('image/')
        return (
          <div
            key={att.id}
            className="relative group rounded-lg overflow-hidden border border-border/50 bg-muted/30"
          >
            {isImage && att.previewUrl ? (
              <div className="w-[72px] h-[72px]">
                <img
                  src={att.previewUrl}
                  alt={att.name}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 max-w-[160px]">
                {isImage ? (
                  <FileImage size={12} className="text-muted-foreground shrink-0" />
                ) : (
                  <File size={12} className="text-muted-foreground shrink-0" />
                )}
                <span className="text-xs text-muted-foreground truncate">
                  {att.name.length > 20 ? att.name.slice(0, 17) + '...' : att.name}
                </span>
              </div>
            )}
            <button
              onClick={() => onRemove(att.id)}
              className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-foreground/80 text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={10} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
