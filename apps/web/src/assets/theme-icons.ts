import defaultDark from './theme-icons/icon-default-dark.png'
import defaultLight from './theme-icons/icon-default-light.png'
import forestDark from './theme-icons/icon-forest-dark.png'
import forestLight from './theme-icons/icon-forest-light.png'
import oceanDark from './theme-icons/icon-ocean-dark.png'
import oceanLight from './theme-icons/icon-ocean-light.png'
import slateDark from './theme-icons/icon-slate-dark.png'
import slateLight from './theme-icons/icon-slate-light.png'

export const themeIcons = {
  'default-dark': defaultDark,
  'default-light': defaultLight,
  'forest-dark': forestDark,
  'forest-light': forestLight,
  'ocean-dark': oceanDark,
  'ocean-light': oceanLight,
  'slate-dark': slateDark,
  'slate-light': slateLight,
} as const

export type ThemeIconKey = keyof typeof themeIcons

export function getThemeIconSrc(key: string) {
  return themeIcons[key as ThemeIconKey] ?? defaultDark
}
