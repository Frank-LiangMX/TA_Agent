/**
 * 动画组件集合
 *
 * 为 TAgent Web 提供视觉增强效果。
 * 参考 react-bits 设计，手写实现，零外部依赖。
 */

import React, { useEffect, useRef, useState } from 'react'

// ===== BlurText =====
// 文字逐字模糊淡入效果

interface BlurTextProps {
  text: string
  className?: string
  delay?: number
}

export function BlurText({ text, className = '', delay = 50 }: BlurTextProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 100)
    return () => clearTimeout(timer)
  }, [])

  return (
    <span className={className}>
      {text.split('').map((char, i) => (
        <span
          key={i}
          className="inline-block transition-all duration-500"
          style={{
            opacity: visible ? 1 : 0,
            filter: visible ? 'blur(0px)' : 'blur(8px)',
            transitionDelay: `${i * delay}ms`,
          }}
        >
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </span>
  )
}

// ===== AnimatedCounter =====
// 数字滚动动画

interface AnimatedCounterProps {
  value: number
  duration?: number
  className?: string
}

export function AnimatedCounter({ value, duration = 800, className = '' }: AnimatedCounterProps) {
  const [display, setDisplay] = useState(0)
  const ref = useRef<number | null>(null)

  useEffect(() => {
    const start = display
    const diff = value - start
    if (diff === 0) return

    const startTime = performance.now()

    const animate = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(start + diff * eased))

      if (progress < 1) {
        ref.current = requestAnimationFrame(animate)
      }
    }

    ref.current = requestAnimationFrame(animate)
    return () => { if (ref.current) cancelAnimationFrame(ref.current) }
  }, [value, duration])

  return <span className={className}>{display.toLocaleString()}</span>
}

// ===== FadeIn =====
// 淡入包裹组件

interface FadeInProps {
  children: React.ReactNode
  delay?: number
  duration?: number
  className?: string
  direction?: 'up' | 'down' | 'left' | 'right' | 'none'
}

export function FadeIn({ children, delay = 0, duration = 500, className = '', direction = 'up' }: FadeInProps) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.1 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  const transforms = {
    up: 'translateY(20px)',
    down: 'translateY(-20px)',
    left: 'translateX(20px)',
    right: 'translateX(-20px)',
    none: 'none',
  }

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : transforms[direction],
        transition: `opacity ${duration}ms ease-out ${delay}ms, transform ${duration}ms ease-out ${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}

// ===== Shimmer =====
// 加载占位闪光效果

interface ShimmerProps {
  className?: string
  width?: string
  height?: string
}

export function Shimmer({ className = '', width = '100%', height = '20px' }: ShimmerProps) {
  return (
    <div
      className={`rounded bg-muted overflow-hidden ${className}`}
      style={{ width, height }}
    >
      <div
        className="w-full h-full animate-shimmer"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, hsl(var(--muted-foreground) / 0.1) 50%, transparent 100%)',
          backgroundSize: '200% 100%',
        }}
      />
    </div>
  )
}

// ===== TypeWriter =====
// 打字机效果

interface TypeWriterProps {
  text: string
  speed?: number
  className?: string
  onComplete?: () => void
}

export function TypeWriter({ text, speed = 30, className = '', onComplete }: TypeWriterProps) {
  const [display, setDisplay] = useState('')
  const indexRef = useRef(0)

  useEffect(() => {
    indexRef.current = 0
    setDisplay('')

    const timer = setInterval(() => {
      indexRef.current++
      if (indexRef.current <= text.length) {
        setDisplay(text.slice(0, indexRef.current))
      } else {
        clearInterval(timer)
        onComplete?.()
      }
    }, speed)

    return () => clearInterval(timer)
  }, [text, speed])

  return <span className={className}>{display}</span>
}

// ===== ScaleIn =====
// 缩放淡入

interface ScaleInProps {
  children: React.ReactNode
  delay?: number
  className?: string
}

export function ScaleIn({ children, delay = 0, className = '' }: ScaleInProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  return (
    <div
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1)' : 'scale(0.9)',
        transition: 'opacity 300ms ease-out, transform 300ms ease-out',
      }}
    >
      {children}
    </div>
  )
}

// ===== StaggerChildren =====
// 子元素依次动画

interface StaggerChildrenProps {
  children: React.ReactNode
  stagger?: number
  className?: string
}

export function StaggerChildren({ children, stagger = 50, className = '' }: StaggerChildrenProps) {
  return (
    <div className={className}>
      {React.Children.map(children, (child, i) => (
        <FadeIn delay={i * stagger} direction="up">
          {child}
        </FadeIn>
      ))}
    </div>
  )
}

// ===== ThinkingDots =====
// Agent 思考动画：三个弹跳点

interface ThinkingDotsProps {
  text?: string
  className?: string
}

export function ThinkingDots({ text = '思考中', className = '' }: ThinkingDotsProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 bg-primary rounded-full animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
      <span className="text-sm text-muted-foreground">{text}</span>
    </div>
  )
}

// ===== PulseRing =====
// 脉冲光环动画（用于状态指示）

interface PulseRingProps {
  color?: string
  size?: number
  className?: string
}

export function PulseRing({ color = 'hsl(var(--primary))', size = 12, className = '' }: PulseRingProps) {
  return (
    <span className={`relative inline-flex ${className}`} style={{ width: size, height: size }}>
      <span
        className="absolute inset-0 rounded-full animate-ping opacity-75"
        style={{ backgroundColor: color }}
      />
      <span
        className="relative inline-flex rounded-full"
        style={{ width: size, height: size, backgroundColor: color }}
      />
    </span>
  )
}

// ===== WaveBar =====
// 波浪条动画（用于加载状态）

interface WaveBarProps {
  className?: string
  width?: string
}

export function WaveBar({ className = '', width = '60px' }: WaveBarProps) {
  return (
    <div className={`flex items-end gap-0.5 ${className}`} style={{ width, height: 20 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex-1 bg-primary rounded-t animate-wave-bar"
          style={{
            animationDelay: `${i * 100}ms`,
            height: '100%',
          }}
        />
      ))}
    </div>
  )
}

// ===== SpinLoader =====
// 旋转加载器（比默认 spinner 更精致）

interface SpinLoaderProps {
  size?: number
  className?: string
}

export function SpinLoader({ size = 20, className = '' }: SpinLoaderProps) {
  return (
    <svg
      className={`animate-spin ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12" cy="12" r="10"
        stroke="hsl(var(--muted))"
        strokeWidth="3"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="hsl(var(--primary))"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

// ===== SkeletonLine =====
// 骨架屏行

interface SkeletonLineProps {
  width?: string
  height?: string
  className?: string
}

export function SkeletonLine({ width = '100%', height = '12px', className = '' }: SkeletonLineProps) {
  return (
    <div
      className={`rounded bg-muted animate-shimmer ${className}`}
      style={{
        width,
        height,
        background: 'linear-gradient(90deg, hsl(var(--muted)) 0%, hsl(var(--muted-foreground) / 0.08) 50%, hsl(var(--muted)) 100%)',
        backgroundSize: '200% 100%',
      }}
    />
  )
}

// ===== SkeletonBlock =====
// 骨架屏块（模拟消息气泡）

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <div className={`flex gap-3 ${className}`}>
      <div className="w-8 h-8 rounded-lg bg-muted animate-pulse" />
      <div className="flex-1 space-y-2">
        <SkeletonLine width="80%" />
        <SkeletonLine width="60%" />
        <SkeletonLine width="40%" />
      </div>
    </div>
  )
}

// ===== GlowingBar =====
// 输入框上方的光点来回运动动画

interface GlowingBarProps {
  active: boolean
  className?: string
}

export function GlowingBar({ active, className = '' }: GlowingBarProps) {
  if (!active) return null

  return (
    <div className={`h-1 w-full overflow-hidden rounded-full ${className}`}>
      <div className="h-full w-1/4 animate-glow-slide rounded-full" />
    </div>
  )
}

// ===== RotatingText =====
// 文字切换过渡动画（参考 react-bits，纯 CSS transition 实现）

interface RotatingTextProps {
  text: string
  className?: string
}

export function RotatingText({ text, className = '' }: RotatingTextProps) {
  const [display, setDisplay] = useState(text)
  const [phase, setPhase] = useState<'idle' | 'exit' | 'enter'>('idle')
  const prevRef = useRef(text)

  useEffect(() => {
    if (prevRef.current === text) return
    prevRef.current = text

    // 1. 退出：旧文字向上滑出
    setPhase('exit')

    // 2. 退出动画结束后，换文字，从下方开始进入
    const timer = setTimeout(() => {
      setDisplay(text)
      setPhase('enter')
      // 3. 进入动画结束后回到 idle
      setTimeout(() => setPhase('idle'), 200)
    }, 200)

    return () => { clearTimeout(timer) }
  }, [text])

  const style: React.CSSProperties =
    phase === 'exit'
      ? { opacity: 0, transform: 'translateY(-100%)', transition: 'opacity 200ms ease, transform 200ms ease' }
      : phase === 'enter'
        ? { opacity: 0, transform: 'translateY(100%)', transition: 'none' }
        : { opacity: 1, transform: 'translateY(0)', transition: 'opacity 200ms ease, transform 200ms ease' }

  // enter 阶段：下一帧触发动画（从下方滑到原位）
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (phase === 'enter' && ref.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (ref.current) {
            ref.current.style.opacity = '1'
            ref.current.style.transform = 'translateY(0)'
          }
        })
      })
    }
  }, [phase])

  return (
    <span ref={ref} className={className} style={{ display: 'inline-block', ...style }}>
      {display}
    </span>
  )
}

// ===== InputPulse =====
// 输入框边框呼吸发光效果

interface InputPulseProps {
  active: boolean
  children: React.ReactNode
  className?: string
}

export function InputPulse({ active, children, className = '' }: InputPulseProps) {
  return (
    <div className={`relative ${className}`}>
      {active && (
        <div
          className="absolute -inset-1 rounded-xl animate-input-glow pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent, hsl(var(--primary) / 0.3), transparent)',
            filter: 'blur(6px)',
          }}
        />
      )}
      <div className="relative">
        {children}
      </div>
    </div>
  )
}

