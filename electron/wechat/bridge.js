/**
 * 微信 iLink Bridge
 *
 * 基于微信 iLink Bot API（官方协议）实现消息收发。
 * 核心流程：扫码登录 → 长轮询接收消息 → 路由到 Agent → 发送回复。
 */

const { EventEmitter } = require('events')
const https = require('https')
const http = require('http')
const crypto = require('crypto')
const { loadConfig, saveConfig, clearCredentials, loadSyncCursor, saveSyncCursor } = require('./config')

const BASE_URL = 'https://ilinkai.weixin.qq.com'
const POLL_TIMEOUT = 40000
const MAX_RETRY_WAIT = 60000
const INITIAL_RETRY_WAIT = 3000
const WARNING_THRESHOLD = 5

// 生成随机 X-WECHAT-UIN
function generateWechatUIN() {
  const buf = crypto.randomBytes(4)
  const n = buf.readUInt32LE()
  return Buffer.from(String(n)).toString('base64')
}

// iLink API 端点
const API = {
  GET_QR_CODE: '/ilink/bot/get_bot_qrcode',
  GET_QR_STATUS: '/ilink/bot/get_qrcode_status',
  GET_UPDATES: '/ilink/bot/getupdates',
  SEND_MESSAGE: '/ilink/bot/sendmessage',
  GET_CONFIG: '/ilink/bot/getconfig',
  SEND_TYPING: '/ilink/bot/sendtyping',
}

// 消息类型
const MSG_TYPE = {
  USER: 1,
  BOT: 2,
}

// 消息状态
const MSG_STATE = {
  NEW: 0,
  GENERATING: 1,
  FINISH: 2,
}

/**
 * iLink HTTP 客户端
 */
class ILinkClient {
  constructor(botToken, botId) {
    this.botToken = botToken
    this.botId = botId
    this.wechatUIN = generateWechatUIN()
    this.typingTicket = null
  }

  async request(method, path, body = null) {
    const url = new URL(path, BASE_URL)
    const isGet = method === 'GET'

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.botToken ? {
          'AuthorizationType': 'ilink_bot_token',
          'Authorization': `Bearer ${this.botToken}`,
          'X-WECHAT-UIN': this.wechatUIN,
        } : {}),
      },
      timeout: isGet ? POLL_TIMEOUT : 10000,
    }

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          console.log(`[WeChat] ${method} ${path} → ${res.statusCode}`)
          if (data.length < 500) {
            console.log(`[WeChat] Response: ${data}`)
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`))
            return
          }
          try {
            resolve(JSON.parse(data))
          } catch {
            reject(new Error(`JSON parse error (status ${res.statusCode}): ${data.slice(0, 300)}`))
          }
        })
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
      if (body) req.write(JSON.stringify(body))
      req.end()
    })
  }

  async getQRCode() {
    return this.request('GET', `${API.GET_QR_CODE}?bot_type=3`)
  }

  async getQRStatus(qrcode) {
    return this.request('GET', `${API.GET_QR_STATUS}?qrcode=${qrcode}`)
  }

  async getUpdates(syncKey) {
    const body = {
      get_updates_buf: syncKey || '',
      base_info: { channel_version: '1.0.0' },
    }
    return this.request('POST', API.GET_UPDATES, body)
  }

  async sendText(content, toUin, contextToken = '') {
    return this.request('POST', API.SEND_MESSAGE, {
      msg: {
        from_user_id: this.botId,
        to_user_id: toUin,
        client_id: `tagent_${Date.now()}`,
        message_type: MSG_TYPE.BOT,
        message_state: MSG_STATE.FINISH,
        item_list: [{
          type: 'text',
          text_item: { text: content },
        }],
        context_token: contextToken,
      },
      base_info: {},
    })
  }

  async getConfig() {
    return this.request('POST', API.GET_CONFIG, {})
  }

  async sendTyping(toUin) {
    if (!this.typingTicket) {
      try {
        const config = await this.getConfig()
        this.typingTicket = config.data?.typing_ticket
      } catch { /* 忽略 */ }
    }
    if (!this.typingTicket) return
    return this.request('POST', API.SEND_TYPING, {
      to_user: toUin,
      typing_ticket: this.typingTicket,
    })
  }
}

/**
 * WeChat Bridge 状态机
 *
 * 状态：idle → scanning → connected → disconnected
 */
class WeChatBridge extends EventEmitter {
  constructor(app) {
    super()
    this.app = app
    this.client = null
    this.state = 'idle'  // idle | scanning | connected | disconnected
    this.syncKey = null
    this.pollTimer = null
    this.retryCount = 0
    this.onMessage = null  // 外部注入的消息处理回调
  }

  getState() {
    return {
      state: this.state,
      botId: this.client?.botId || null,
    }
  }

  emitStatus() {
    this.emit('status-changed', this.getState())
  }

  // === 登录流程 ===

  async startLogin() {
    this.state = 'scanning'
    this.emitStatus()

    const client = new ILinkClient('', '')
    const res = await client.getQRCode()

    const qrcode = res.qrcode
    const scanUrl = res.qrcode_img_content

    if (!qrcode || !scanUrl) {
      this.state = 'idle'
      this.emitStatus()
      throw new Error(res.errmsg || res.message || '获取 QR 码失败：响应缺少 qrcode 字段')
    }

    // 生成 QR 码 data URL
    let qrDataUrl = null
    if (scanUrl) {
      try {
        const QRCode = require('qrcode')
        qrDataUrl = await QRCode.toDataURL(scanUrl, { width: 280, margin: 2 })
        console.log(`[WeChat] QR 码生成成功，长度: ${qrDataUrl.length}`)
      } catch (err) {
        console.error(`[WeChat] QR 码生成失败:`, err.message)
        qrDataUrl = scanUrl
      }
    }

    console.log(`[WeChat] startLogin 返回: qrDataUrl=${qrDataUrl ? '有' : '无'}`)

    // 轮询 QR 码状态
    const pollQRStatus = async () => {
      for (let i = 0; i < 120; i++) {  // 最多等 2 分钟
        if (this.state !== 'scanning') return

        const status = await client.getQRStatus(qrcode)
        console.log(`[WeChat] QR 状态:`, JSON.stringify(status))

        if (status.ret === 0 && status.status === 'confirmed') {
          const bot_token = status.bot_token
          const bot_id = status.ilink_bot_id
          if (bot_token && bot_id) {
            // 登录成功
            this.client = new ILinkClient(bot_token, bot_id)
            this.syncKey = loadSyncCursor(this.app)?.get_updates_buf || null
            this.state = 'connected'
            this.retryCount = 0
            this.emitStatus()

            // 保存凭证
            saveConfig(this.app, {
              enabled: true,
              credentials: { bot_token, bot_id, base_url: status.baseurl },
            })

            // 开始消息轮询
            this.startPolling()
            return
          }
        }

        await new Promise(r => setTimeout(r, 1000))
      }

      // 超时
      this.state = 'idle'
      this.emitStatus()
    }

    // 异步轮询，不阻塞返回 QR 码
    pollQRStatus().catch(() => {
      if (this.state === 'scanning') {
        this.state = 'idle'
        this.emitStatus()
      }
    })

    return { qrDataUrl }
  }

  // === Bridge 控制 ===

  async startBridge() {
    const config = loadConfig(this.app)
    if (!config.credentials?.bot_token || !config.credentials?.bot_id) {
      throw new Error('未登录，请先扫码登录')
    }

    this.client = new ILinkClient(config.credentials.bot_token, config.credentials.bot_id)
    this.syncKey = loadSyncCursor(this.app)?.get_updates_buf || null
    this.state = 'connected'
    this.retryCount = 0
    this.emitStatus()
    this.startPolling()
  }

  stopBridge() {
    this.state = 'idle'
    if (this.pollTimer) {
      clearTimeout(this.pollTimer)
      this.pollTimer = null
    }
    this.emitStatus()
  }

  async logout() {
    this.stopBridge()
    this.client = null
    this.syncKey = null
    clearCredentials(this.app)
    this.state = 'idle'
    this.emitStatus()
  }

  // === 消息轮询 ===

  startPolling() {
    if (this.pollTimer) clearTimeout(this.pollTimer)
    this.pollLoop()
  }

  async pollLoop() {
    if (this.state !== 'connected' || !this.client) return

    try {
      const res = await this.client.getUpdates(this.syncKey)

      if (res.ret !== 0 && res.ret !== undefined) {
        if (res.ret === -14) {
          // Session 过期
          console.log('[WeChat] Session 过期，重新登录')
          this.state = 'disconnected'
          this.emitStatus()
          return
        }
        throw new Error(res.errmsg || res.message || `ret: ${res.ret}`)
      }

      // 处理消息
      const items = res.data?.item_list || []
      for (const item of items) {
        await this.handleMessage(item)
      }

      // 更新同步游标
      if (res.get_updates_buf) {
        this.syncKey = res.get_updates_buf
        saveSyncCursor(this.app, { get_updates_buf: this.syncKey })
      }

      this.retryCount = 0
      // 立即再次轮询（长轮询会在服务端等待）
      this.pollTimer = setTimeout(() => this.pollLoop(), 100)

    } catch (err) {
      console.error('[WeChat] 轮询错误:', err.message)
      this.retryCount++

      if (this.retryCount > WARNING_THRESHOLD) {
        console.warn('[WeChat] 连续失败多次，可能需要重新登录')
      }

      // 指数退避
      const wait = Math.min(INITIAL_RETRY_WAIT * Math.pow(2, this.retryCount - 1), MAX_RETRY_WAIT)
      this.pollTimer = setTimeout(() => this.pollLoop(), wait)
    }
  }

  // === 消息处理 ===

  async handleMessage(item) {
    // 只处理用户发来的已完成消息（message_type=1 是 USER，message_state=2 是 FINISH）
    if (item.message_type !== 1 || item.message_state !== 2) return

    const fromUin = item.from_user
    const contextToken = item.context_token || ''
    if (!fromUin) return

    // 提取文本内容
    let text = ''
    const images = []
    const files = []

    for (const msg of (item.item_list || [])) {
      if (msg.type === 1 && msg.text_item) {
        text += msg.text_item.text || ''
      } else if (msg.type === 2) {
        images.push(msg)
      } else if (msg.type === 3) {
        files.push(msg)
      }
    }

    if (!text && images.length === 0 && files.length === 0) return

    // 发送"正在输入"状态
    this.client.sendTyping(fromUin).catch(() => {})

    // 调用外部消息处理回调
    if (this.onMessage) {
      try {
        const reply = await this.onMessage({
          from: fromUin,
          text,
          images,
          files,
        })

        if (reply) {
          // 分段发送（每段最多 4000 字符）
          const segments = this.splitMessage(reply, 4000)
          for (const segment of segments) {
            await this.client.sendText(segment, fromUin, contextToken)
            if (segments.length > 1) {
              await new Promise(r => setTimeout(r, 500))
            }
          }
        }
      } catch (err) {
        console.error('[WeChat] 消息处理失败:', err.message)
        await this.client.sendText(`处理消息时出错: ${err.message}`, fromUin, contextToken).catch(() => {})
      }
    }
  }

  splitMessage(text, maxLen) {
    if (text.length <= maxLen) return [text]
    const segments = []
    let remaining = text
    while (remaining.length > 0) {
      segments.push(remaining.slice(0, maxLen))
      remaining = remaining.slice(maxLen)
    }
    return segments
  }
}

module.exports = { WeChatBridge, ILinkClient }
