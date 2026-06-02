/**
 * 设置页面原语组件
 */

import React from 'react'
import * as RadixSwitch from '@radix-ui/react-switch'

// ===== 样式常量 =====

const LABEL_CLASS = 'text-sm font-medium text-foreground'
const DESCRIPTION_CLASS = 'text-sm text-muted-foreground'
const SECTION_TITLE_CLASS = 'text-base font-semibold text-foreground'
const SECTION_DESCRIPTION_CLASS = 'text-sm text-muted-foreground mt-1'
const CARD_CLASS = 'rounded-xl overflow-hidden settings-card w-full'
const ROW_CLASS = 'flex items-center justify-between px-4 py-3'
const DIVIDER_CLASS = 'border-border/50'

// ===== SettingsSection =====

interface SettingsSectionProps {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
}

export function SettingsSection({ title, description, action, children }: SettingsSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h4 className={SECTION_TITLE_CLASS}>{title}</h4>
          {description && <p className={SECTION_DESCRIPTION_CLASS}>{description}</p>}
        </div>
        {action && <div className="flex-shrink-0 ml-4">{action}</div>}
      </div>
      {children}
    </div>
  )
}

// ===== SettingsCard =====

interface SettingsCardProps {
  children: React.ReactNode
  divided?: boolean
  className?: string
}

export function SettingsCard({ children, divided = true, className = '' }: SettingsCardProps) {
  const childArray = React.Children.toArray(children).filter(Boolean)

  return (
    <div className={`${CARD_CLASS} ${className}`}>
      {divided
        ? childArray.map((child, index) => (
            <React.Fragment key={index}>
              {child}
              {index < childArray.length - 1 && (
                <div className={`border-t ${DIVIDER_CLASS}`} />
              )}
            </React.Fragment>
          ))
        : children}
    </div>
  )
}

// ===== SettingsRow =====

interface SettingsRowProps {
  label: React.ReactNode
  description?: string
  icon?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

export function SettingsRow({ label, description, icon, children, className = '' }: SettingsRowProps) {
  return (
    <div className={`${ROW_CLASS} ${className}`}>
      {icon && <div className="flex-shrink-0 mr-3 text-muted-foreground">{icon}</div>}
      <div className="flex-1 min-w-0">
        <div className={LABEL_CLASS}>{label}</div>
        {description && (
          <div className={`${DESCRIPTION_CLASS} mt-0.5`}>{description}</div>
        )}
      </div>
      {children && <div className="flex-shrink-0 ml-4">{children}</div>}
    </div>
  )
}

// ===== SettingsToggle =====

interface SettingsToggleProps {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function SettingsToggle({ label, description, checked, onChange, disabled }: SettingsToggleProps) {
  return (
    <div className={ROW_CLASS}>
      <div className="flex-1 min-w-0 mr-4">
        <div className={LABEL_CLASS}>{label}</div>
        {description && (
          <div className={`${DESCRIPTION_CLASS} mt-0.5`}>{description}</div>
        )}
      </div>
      <RadixSwitch.Root
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="w-9 h-5 bg-input rounded-full relative data-[state=checked]:bg-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <RadixSwitch.Thumb className="block w-4 h-4 bg-background rounded-full shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-[18px]" />
      </RadixSwitch.Root>
    </div>
  )
}

// ===== SettingsInput =====

interface SettingsInputProps {
  label: string
  description?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  error?: string
}

export function SettingsInput({ label, description, value, onChange, placeholder, type = 'text', error }: SettingsInputProps) {
  return (
    <div className="px-4 py-3 space-y-2">
      <div>
        <div className={LABEL_CLASS}>{label}</div>
        {description && (
          <div className={`${DESCRIPTION_CLASS} mt-0.5`}>{description}</div>
        )}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-1.5 text-sm bg-muted border border-border rounded-lg outline-none focus:ring-1 focus:ring-ring ${error ? 'border-destructive focus-visible:ring-destructive' : ''}`}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

// ===== SettingsSelect =====

interface SettingsSelectProps {
  label: string
  description?: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
}

export function SettingsSelect({ label, description, value, onChange, options, disabled }: SettingsSelectProps) {
  return (
    <div className="px-4 py-3 space-y-2">
      <div>
        <div className={LABEL_CLASS}>{label}</div>
        {description && (
          <div className={`${DESCRIPTION_CLASS} mt-0.5`}>{description}</div>
        )}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-1.5 text-sm bg-muted border border-border rounded-lg outline-none focus:ring-1 focus:ring-ring"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}

// ===== SettingsTextarea =====

interface SettingsTextareaProps {
  label: string
  description?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeight?: number
  error?: string
}

export function SettingsTextarea({ label, description, value, onChange, placeholder, minHeight = 96, error }: SettingsTextareaProps) {
  return (
    <div className="px-4 py-3 space-y-2">
      <div>
        <div className={LABEL_CLASS}>{label}</div>
        {description && (
          <div className={`${DESCRIPTION_CLASS} mt-0.5`}>{description}</div>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ minHeight }}
        className={`w-full px-3 py-1.5 text-sm bg-muted border border-border rounded-lg outline-none focus:ring-1 focus:ring-ring resize-y ${error ? 'border-destructive focus-visible:ring-destructive' : ''}`}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

// ===== SettingsSegmentedControl =====

interface SettingsSegmentedControlProps {
  label: string
  description?: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
}

export function SettingsSegmentedControl({ label, description, value, onChange, options, disabled }: SettingsSegmentedControlProps) {
  return (
    <div className="px-4 py-3 space-y-2">
      <div>
        <div className={LABEL_CLASS}>{label}</div>
        {description && (
          <div className={`${DESCRIPTION_CLASS} mt-0.5`}>{description}</div>
        )}
      </div>
      <div className="inline-flex rounded-lg bg-muted p-1 gap-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              value === option.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
