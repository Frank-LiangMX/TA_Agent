export function detectIsWindows(): boolean {
  if (typeof window !== 'undefined' && window.electronAPI?.platform === 'win32') {
    return true
  }
  const platform =
    typeof navigator !== 'undefined' &&
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
  if (typeof platform === 'string' && platform.toLowerCase().includes('win')) {
    return true
  }
  return typeof navigator !== 'undefined' && /win/i.test(navigator.platform || '')
}
