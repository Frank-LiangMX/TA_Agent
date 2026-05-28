/**
 * 主题管理
 *
 * 支持模式：light / dark / system / special
 * 支持风格：default / ocean / forest / slate（每种有 light/dark 变体）
 * 主题 class 加到 <html> 上，CSS 变量自动切换。
 */

export type ThemeMode = 'light' | 'dark' | 'system' | 'special'
export type ThemeVariant = 'default' | 'ocean' | 'forest' | 'slate'

const STORAGE_KEY_MODE = 'tagent-theme-mode'
const STORAGE_KEY_VARIANT = 'tagent-theme-variant'

/** 获取系统主题偏好 */
function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** 应用主题到 DOM */
export function applyTheme(mode: ThemeMode, variant: ThemeVariant) {
  const root = document.documentElement

  // 解析实际的 light/dark
  let resolved: 'light' | 'dark'
  if (mode === 'system') {
    resolved = getSystemTheme()
  } else if (mode === 'special') {
    // special 模式下，从 variant 推断 light/dark
    // 默认用 dark，除非 variant 是 light 变体
    resolved = 'dark'
  } else {
    resolved = mode
  }

  // 清除所有主题 class
  root.classList.remove(
    'light', 'dark',
    'theme-ocean-light', 'theme-ocean-dark',
    'theme-forest-light', 'theme-forest-dark',
    'theme-slate-light', 'theme-slate-dark'
  )

  // 设置基础模式
  root.classList.add(resolved)

  // 设置变体（default 不加额外 class）
  if (variant !== 'default') {
    root.classList.add(`theme-${variant}-${resolved}`)
  }
}

/** 从 localStorage 读取主题设置 */
export function loadTheme(): { mode: ThemeMode; variant: ThemeVariant } {
  const mode = (localStorage.getItem(STORAGE_KEY_MODE) as ThemeMode) || 'dark'
  const variant = (localStorage.getItem(STORAGE_KEY_VARIANT) as ThemeVariant) || 'default'
  return { mode, variant }
}

/** 保存主题设置到 localStorage */
export function saveTheme(mode: ThemeMode, variant: ThemeVariant) {
  localStorage.setItem(STORAGE_KEY_MODE, mode)
  localStorage.setItem(STORAGE_KEY_VARIANT, variant)
  applyTheme(mode, variant)
}

/** 初始化主题（在 main.tsx 中调用） */
export function initTheme() {
  const { mode, variant } = loadTheme()
  applyTheme(mode, variant)

  // 监听系统主题变化
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const current = loadTheme()
    if (current.mode === 'system' || current.mode === 'special') {
      applyTheme(current.mode, current.variant)
    }
  })
}
