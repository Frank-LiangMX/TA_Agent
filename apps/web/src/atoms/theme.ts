export type ThemeMode = 'light' | 'dark' | 'system' | 'special'
export type ThemeVariant = 'default' | 'ocean' | 'forest' | 'slate'
export type ResolvedThemeMode = 'light' | 'dark'

export interface ThemeAppearance {
  resolved: ResolvedThemeMode
  variant: ThemeVariant
  styleId: string
  themeClass: string
  iconKey: string
}

const STORAGE_KEY_MODE = 'tagent-theme-mode'
const STORAGE_KEY_VARIANT = 'tagent-theme-variant'
const STORAGE_KEY_STYLE = 'tagent-theme-style'

function getSystemTheme(): ResolvedThemeMode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function resolveThemeAppearance(mode: ThemeMode, variant: ThemeVariant): ThemeAppearance {
  const styleId = localStorage.getItem(STORAGE_KEY_STYLE) || ''
  let resolved: ResolvedThemeMode

  if (mode === 'system') {
    resolved = getSystemTheme()
  } else if (mode === 'special') {
    resolved = styleId.endsWith('-light') ? 'light' : 'dark'
  } else {
    resolved = mode
  }

  const resolvedVariant = mode === 'special' ? variant : 'default'
  const themeClass = resolvedVariant !== 'default' ? `theme-${resolvedVariant}-${resolved}` : ''

  return {
    resolved,
    variant: resolvedVariant,
    styleId,
    themeClass,
    iconKey: `${resolvedVariant}-${resolved}`,
  }
}

export function applyTheme(mode: ThemeMode, variant: ThemeVariant) {
  const root = document.documentElement
  const appearance = resolveThemeAppearance(mode, variant)

  root.classList.remove(
    'light', 'dark',
    'theme-ocean-light', 'theme-ocean-dark',
    'theme-forest-light', 'theme-forest-dark',
    'theme-slate-light', 'theme-slate-dark'
  )

  root.classList.add(appearance.resolved)
  if (appearance.themeClass) {
    root.classList.add(appearance.themeClass)
  }

  window.dispatchEvent(new CustomEvent('tagent-theme-change', { detail: appearance }))
  console.log('[Theme]', { mode, requestedVariant: variant, ...appearance, classes: root.className })
}

export function loadTheme(): { mode: ThemeMode; variant: ThemeVariant } {
  const mode = (localStorage.getItem(STORAGE_KEY_MODE) as ThemeMode) || 'dark'
  const variant = (localStorage.getItem(STORAGE_KEY_VARIANT) as ThemeVariant) || 'default'
  return { mode, variant }
}

export function saveTheme(mode: ThemeMode, variant: ThemeVariant, styleId?: string) {
  localStorage.setItem(STORAGE_KEY_MODE, mode)
  localStorage.setItem(STORAGE_KEY_VARIANT, variant)
  if (styleId) {
    localStorage.setItem(STORAGE_KEY_STYLE, styleId)
  }
  applyTheme(mode, variant)
}

export function initTheme() {
  const { mode, variant } = loadTheme()
  applyTheme(mode, variant)

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const current = loadTheme()
    if (current.mode === 'system' || current.mode === 'special') {
      applyTheme(current.mode, current.variant)
    }
  })
}
