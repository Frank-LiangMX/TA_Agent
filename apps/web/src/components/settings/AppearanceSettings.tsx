/**
 * 主题外观设置
 */

import React, { useState, useEffect } from 'react'
import { Check } from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsSegmentedControl, SettingsRow } from './primitives'
import { type ThemeMode, type ThemeVariant, loadTheme, saveTheme, applyTheme } from '@/atoms/theme'

// 主题模式选项
const THEME_OPTIONS = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
  { value: 'special', label: '特殊风格' },
]

// 特殊风格配置
interface StyleDef {
  id: string
  name: string
  mode: 'light' | 'dark'
  left: string
  right: string
}

const SPECIAL_STYLES: StyleDef[] = [
  { id: 'slate-light', name: '云朵舞者', mode: 'light', left: '#e8e6e2', right: '#f0efec' },
  { id: 'ocean-light', name: '晴空碧海', mode: 'light', left: '#c9dded', right: '#e2edf5' },
  { id: 'forest-light', name: '森息晨光', mode: 'light', left: '#e2e9e4', right: '#3f8361' },
  { id: 'ocean-dark', name: '苍穹暮色', mode: 'dark', left: '#1a2535', right: '#3a6a9b' },
  { id: 'forest-dark', name: '森息夜语', mode: 'dark', left: '#1b2721', right: '#185337' },
  { id: 'slate-dark', name: '莫兰迪夜', mode: 'dark', left: '#272429', right: '#c9a89e' },
]

export function AppearanceSettings() {
  const [mode, setMode] = useState<ThemeMode>('dark')
  const [variant, setVariant] = useState<ThemeVariant>('default')
  const [activeStyle, setActiveStyle] = useState<string>('')

  useEffect(() => {
    const { mode: m, variant: v } = loadTheme()
    setMode(m)
    setVariant(v)
    // 从 localStorage 读取完整的 style ID
    const savedStyle = localStorage.getItem('tagent-theme-style') || ''
    if (savedStyle) setActiveStyle(savedStyle)
    else if (v !== 'default') {
      const style = SPECIAL_STYLES.find((s) => s.id.includes(v))
      if (style) setActiveStyle(style.id)
    }
  }, [])

  const handleModeChange = (newMode: string) => {
    const m = newMode as ThemeMode
    if (m === 'special') {
      // 切换到特殊风格模式，选中第一个或上次的风格
      const style = SPECIAL_STYLES.find((s) => s.id === activeStyle) || SPECIAL_STYLES[0]
      setActiveStyle(style.id)
      const variant = style.id.split('-')[0] as ThemeVariant
      setMode(m)
      setVariant(variant)
      saveTheme(m, variant, style.id)
    } else {
      setMode(m)
      setVariant('default')
      setActiveStyle('')
      saveTheme(m, 'default')
    }
  }

  const handleStyleSelect = (style: StyleDef) => {
    setActiveStyle(style.id)
    const variant = style.id.split('-')[0] as ThemeVariant
    setVariant(variant)
    setMode('special')
    saveTheme('special', variant, style.id)
  }

  return (
    <div className="space-y-6">
      <SettingsSection title="外观设置" description="选择应用的外观模式和色调风格">
        <SettingsCard>
          <SettingsSegmentedControl
            label="主题模式"
            description="选择浅色、深色或跟随系统"
            value={mode}
            onChange={handleModeChange}
            options={THEME_OPTIONS}
          />

          {/* 特殊风格选择 */}
          <div className="px-4 py-3 space-y-2">
            <div className="text-sm font-medium text-foreground">特殊风格</div>
            <div className="flex justify-between">
              {SPECIAL_STYLES.map((style) => {
                const isSelected = mode === 'special' && activeStyle === style.id
                return (
                  <button
                    key={style.id}
                    onClick={() => handleStyleSelect(style)}
                    className={`relative flex flex-col items-center gap-2 rounded-lg p-3 transition-all ${
                      isSelected
                        ? 'shadow-lg shadow-primary/20 bg-card'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    {/* 重叠圆圈预览 */}
                    <div className="relative w-14 h-10">
                      <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 size-10 rounded-full"
                        style={{ backgroundColor: style.left }}
                      />
                      <div
                        className="absolute right-0 top-1/2 -translate-y-1/2 size-10 rounded-full"
                        style={{ backgroundColor: style.right }}
                      />
                    </div>
                    <span className="text-xs font-medium">{style.name}</span>
                    {/* 选中勾 */}
                    {isSelected && (
                      <div className="absolute top-1 right-1 size-4 rounded-full bg-primary flex items-center justify-center">
                        <Check className="size-2.5 text-primary-foreground" />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <SettingsRow
            label="界面缩放"
            description="使用 Ctrl + / Ctrl - 来调整界面缩放比例"
          />
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
