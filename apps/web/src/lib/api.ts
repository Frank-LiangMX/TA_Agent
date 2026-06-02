/**
 * 后端 API 地址
 *
 * 自动使用当前访问的主机名，支持局域网访问。
 * 例：前端在 http://192.168.1.100:5175 → 后端在 http://192.168.1.100:8080
 */

const BACKEND_PORT = 8080

// 当前页面的主机名（localhost 或局域网 IP）
const HOST = typeof window !== 'undefined' ? window.location.hostname : 'localhost'

export const API_BASE = `http://${HOST}:${BACKEND_PORT}`
export const WS_URL = `ws://${HOST}:${BACKEND_PORT}/ws`
