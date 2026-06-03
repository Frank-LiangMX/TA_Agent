/**
 * 后端 API 地址
 *
 * - Electron 打包：优先使用 preload 注入的 runtimeEndpoint（file:// 下无 hostname）
 * - 浏览器开发：使用当前页面 hostname + 8080
 */

import type { RuntimeEndpoint } from '@/types/electron-api'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 8080

function readSyncRuntimeEndpoint(): RuntimeEndpoint | undefined {
  if (typeof window === 'undefined') return undefined
  const ep = window.electronAPI?.runtimeEndpoint
  if (!ep?.apiBase) return undefined
  return ep
}

function endpointFromParts(host: string, port: number): RuntimeEndpoint {
  const safeHost = host || DEFAULT_HOST
  return {
    host: safeHost,
    port,
    apiBase: `http://${safeHost}:${port}`,
    wsUrl: `ws://${safeHost}:${port}/ws`,
  }
}

let cachedEndpoint: RuntimeEndpoint | null = null

/** 解析本地 Runtime 地址（Electron 可异步拉取最新端口） */
export async function getResolvedRuntimeEndpoint(): Promise<RuntimeEndpoint> {
  if (cachedEndpoint) return cachedEndpoint

  const sync = readSyncRuntimeEndpoint()
  if (sync) {
    cachedEndpoint = sync
    return sync
  }

  if (typeof window !== 'undefined' && window.electronAPI?.getRuntimeEndpoint) {
    try {
      const remote = await window.electronAPI.getRuntimeEndpoint()
      if (remote?.apiBase) {
        cachedEndpoint = remote
        return remote
      }
    } catch {
      // 回退到默认本机地址
    }
  }

  const pageHost =
    typeof window !== 'undefined' && window.location.hostname
      ? window.location.hostname
      : DEFAULT_HOST
  const ep = endpointFromParts(pageHost, DEFAULT_PORT)
  cachedEndpoint = ep
  return ep
}

export async function getApiBase(): Promise<string> {
  const ep = await getResolvedRuntimeEndpoint()
  return ep.apiBase
}

export async function getWsUrl(): Promise<string> {
  const ep = await getResolvedRuntimeEndpoint()
  return ep.wsUrl
}

/** 切换 Runtime 端口后调用（例如 Electron 重启后端） */
export function resetRuntimeEndpointCache(): void {
  cachedEndpoint = null
}

/** 本地 Runtime REST（动态解析端口，新代码请用此函数） */
export async function localApiFetch(
  path: string,
  options?: RequestInit,
): Promise<Response> {
  const base = await getApiBase()
  const normalized = path.startsWith('/') ? path : `/${path}`
  return fetch(`${base}${normalized}`, options)
}

/** 本地 Runtime JSON 请求 */
export async function localApiJson<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await localApiFetch(path, options)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(
      (err as { detail?: string }).detail || `请求失败: ${res.status}`,
    )
  }
  return res.json() as Promise<T>
}

// 启动时快照，仅供 WebSocket 构造默认值；勿用于新发 REST 请求
const BOOTSTRAP = readSyncRuntimeEndpoint()
const BOOTSTRAP_HOST =
  BOOTSTRAP?.host ||
  (typeof window !== 'undefined' && window.location.hostname) ||
  DEFAULT_HOST
const BOOTSTRAP_PORT = BOOTSTRAP?.port || DEFAULT_PORT
const RESOLVED_HOST = BOOTSTRAP_HOST || DEFAULT_HOST

/** @deprecated 使用 getApiBase() 或 localApiFetch */
export const API_BASE = BOOTSTRAP?.apiBase || `http://${RESOLVED_HOST}:${BOOTSTRAP_PORT}`
/** @deprecated 使用 getWsUrl() */
export const WS_URL = BOOTSTRAP?.wsUrl || `ws://${RESOLVED_HOST}:${BOOTSTRAP_PORT}/ws`
