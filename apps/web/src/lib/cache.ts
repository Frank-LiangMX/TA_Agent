/**
 * 全局数据缓存
 *
 * 避免切换页面时重复请求 API。
 * 数据在内存中缓存，刷新浏览器才清除。
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { getApiBase } from './api'
import { getConfig } from '../services/config'

// 内存缓存
const cache = {
  assets: null as any[] | null,
  reviews: null as any | null,
  stats: null as any | null,
  sessionStats: null as any | null,
  memoryStats: null as any | null,
  assetDetail: new Map<string, any>(),
}

/** 清除所有缓存 */
export function clearCache() {
  cache.assets = null
  cache.reviews = null
  cache.stats = null
  cache.sessionStats = null
  cache.memoryStats = null
  cache.assetDetail.clear()
}

/** 获取数据源 API 地址 */
export async function getDataSource(): Promise<string> {
  try {
    const config = await getConfig()
    if (config.cloud?.enabled && config.cloud.server_url) {
      return `http://${config.cloud.server_url}`
    }
  } catch {}
  return getApiBase()
}

/** 获取资产列表（带缓存） */
export function useAssets() {
  const [assets, setAssets] = useState<any[]>(cache.assets || [])
  const [loading, setLoading] = useState(!cache.assets)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (force = false) => {
    if (!force && cache.assets) {
      setAssets(cache.assets)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const dataSource = await getDataSource()
      const res = await fetch(`${dataSource}/api/assets`)
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        cache.assets = data.assets || []
        setAssets(cache.assets ?? [])
      }
    } catch {
      setError('无法连接后端')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { assets, loading, error, refresh: () => load(true) }
}

/** 获取待审核数据（带缓存） */
export function useReviews() {
  const [data, setData] = useState<any>(cache.reviews)
  const [loading, setLoading] = useState(!cache.reviews)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (force = false) => {
    if (!force && cache.reviews) {
      setData(cache.reviews)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const dataSource = await getDataSource()
      const res = await fetch(`${dataSource}/api/reviews/pending`)
      const result = await res.json()
      if (result.error) {
        setError(result.error)
      } else {
        cache.reviews = result
        setData(cache.reviews)
      }
    } catch {
      setError('无法连接后端')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { data, loading, error, refresh: () => load(true) }
}

/** 获取资产详情（带缓存） */
export function useAssetDetail(assetId: string | null) {
  const [detail, setDetail] = useState<any>(assetId ? cache.assetDetail.get(assetId) || null : null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!assetId) { setDetail(null); return }
    const cached = cache.assetDetail.get(assetId)
    if (cached) { setDetail(cached); return }

    setLoading(true)
    getDataSource().then(dataSource => {
      fetch(`${dataSource}/api/assets/${assetId}`)
        .then((res) => res.json())
        .then((data) => {
          if (!data.error) {
            cache.assetDetail.set(assetId, data)
            setDetail(data)
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    })
  }, [assetId])

  return { detail, loading }
}

/** 获取统计数据（带缓存） */
export function useStats() {
  const [stats, setStats] = useState<any>(cache.stats)
  const [loading, setLoading] = useState(!cache.stats)

  const load = useCallback(async (force = false) => {
    if (!force && cache.stats) { setStats(cache.stats); return }
    setLoading(true)
    try {
      const dataSource = await getDataSource()
      const res = await fetch(`${dataSource}/api/stats`)
      const data = await res.json()
      cache.stats = data
      setStats(data)
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  return { stats, loading, refresh: () => load(true) }
}

/** 获取会话统计（带缓存） */
export function useSessionStats() {
  const [stats, setStats] = useState<any>(cache.sessionStats)
  const [loading, setLoading] = useState(!cache.sessionStats)

  const load = useCallback(async (force = false) => {
    if (!force && cache.sessionStats) { setStats(cache.sessionStats); return }
    setLoading(true)
    try {
      const dataSource = await getDataSource()
      const res = await fetch(`${dataSource}/api/sessions/stats`)
      const data = await res.json()
      cache.sessionStats = data
      setStats(data)
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  return { stats, loading, refresh: () => load(true) }
}

/** 获取记忆系统统计（带缓存） */
export function useMemoryStats() {
  const [stats, setStats] = useState<any>(cache.memoryStats)
  const [loading, setLoading] = useState(!cache.memoryStats)

  const load = useCallback(async (force = false) => {
    if (!force && cache.memoryStats) { setStats(cache.memoryStats); return }
    setLoading(true)
    try {
      const dataSource = await getDataSource()
      const res = await fetch(`${dataSource}/api/memory/stats`)
      const data = await res.json()
      cache.memoryStats = data
      setStats(data)
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  return { stats, loading, refresh: () => load(true) }
}
