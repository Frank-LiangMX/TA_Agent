/**
 * useConfirm - 确认弹窗 Hook
 *
 * 使用示例：
 *   const confirm = useConfirm()
 *   if (await confirm('确定删除？', { danger: true })) { ... }
 */

import { useState, useCallback } from 'react'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'

interface ConfirmOptions {
  title?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean
    message: string
    options: ConfirmOptions
    resolve: (value: boolean) => void
  } | null>(null)

  const confirm = useCallback((message: string, options: ConfirmOptions = {}): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ open: true, message, options, resolve })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    state?.resolve(true)
    setState(null)
  }, [state])

  const handleCancel = useCallback(() => {
    state?.resolve(false)
    setState(null)
  }, [state])

  const ConfirmUI = state ? (
    <ConfirmDialog
      open={state.open}
      title={state.options.title || '确认操作'}
      message={state.message}
      confirmText={state.options.confirmText}
      cancelText={state.options.cancelText}
      danger={state.options.danger}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null

  return { confirm, ConfirmUI }
}
