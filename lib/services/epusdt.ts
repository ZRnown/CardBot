import crypto from 'node:crypto'
import { env } from '@/lib/env'
import { query } from '@/lib/db'
import { updateBalance } from '@/lib/services/user'

export type EpusdtTradeStatus = 'pending' | 'paid' | 'expired' | 'failed'

export interface EpusdtTradeRecord {
  id: number
  trade_id: string | null
  order_id: string
  user_id: number
  status: EpusdtTradeStatus
  amount: string
  actual_amount: string | null
  token: string | null
  payment_url: string | null
  expiration_time: number | null
  block_transaction_id: string | null
  raw_request: any | null
  raw_response: any | null
  raw_callback: any | null
  created_at: string
  updated_at: string
}

const TABLE_SQL = `CREATE TABLE IF NOT EXISTS epusdt_trades (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  trade_id VARCHAR(64) NULL,
  order_id VARCHAR(64) NOT NULL UNIQUE,
  user_id INT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  amount DECIMAL(18,2) NOT NULL,
  actual_amount DECIMAL(18,6) NULL,
  token VARCHAR(191) NULL,
  payment_url TEXT NULL,
  expiration_time BIGINT NULL,
  block_transaction_id VARCHAR(191) NULL,
  raw_request JSON NULL,
  raw_response JSON NULL,
  raw_callback JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_trade_id (trade_id),
  INDEX idx_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`

let ensured = false

async function ensureTable() {
  if (ensured) return
  await query(TABLE_SQL)
  ensured = true
}

type Signable = Record<string, string | number | boolean | null | undefined>

function buildSignSource(params: Signable) {
  const keys = Object.keys(params)
    .filter((key) => key !== 'signature' && params[key] !== '' && params[key] !== null && typeof params[key] !== 'undefined')
    .sort()
  return keys.map((key) => `${key}=${params[key]}`.trim()).join('&')
}

type SignMode = 'concat' | 'amp_token' | 'amp_key'

export function epusdtSign(params: Signable, token = env.EPUSDT_TOKEN, mode: SignMode = 'concat') {
  if (!token) {
    throw new Error('Missing EPUSDT_TOKEN configuration')
  }
  const source = buildSignSource(params)
  const md5 = crypto.createHash('md5')
  const material = mode === 'concat' ? (source + token) : mode === 'amp_token' ? (source + `&token=${token}`) : (source + `&key=${token}`)
  return md5.update(material, 'utf8').digest('hex')
}

export function verifyEpusdtSignature(payload: Signable, signature: string | null | undefined, token = env.EPUSDT_TOKEN) {
  if (!signature) return false
  const expected = epusdtSign(payload, token)
  return expected.toLowerCase() === signature.toLowerCase()
}

function normalizeAmount(amount: number) {
  return Number(amount.toFixed(2))
}

function makeOrderId(userId: number) {
  const time = Date.now()
  const rand = crypto.randomBytes(3).toString('hex')
  return `${time}-${userId}-${rand}`
}

function mapRow(row: any): EpusdtTradeRecord {
  return {
    id: row.id,
    trade_id: row.trade_id ?? null,
    order_id: row.order_id,
    user_id: row.user_id,
    status: (row.status as EpusdtTradeStatus) ?? 'pending',
    amount: row.amount,
    actual_amount: row.actual_amount ?? null,
    token: row.token ?? null,
    payment_url: row.payment_url ?? null,
    expiration_time: row.expiration_time !== null ? Number(row.expiration_time) : null,
    block_transaction_id: row.block_transaction_id ?? null,
    raw_request: (() => {
      const v = row.raw_request
      if (!v) return null
      if (typeof v === 'string') { try { return JSON.parse(v) } catch { return v } }
      if (typeof v === 'object') return v
      return null
    })(),
    raw_response: (() => {
      const v = row.raw_response
      if (!v) return null
      if (typeof v === 'string') { try { return JSON.parse(v) } catch { return v } }
      if (typeof v === 'object') return v
      return null
    })(),
    raw_callback: (() => {
      const v = row.raw_callback
      if (!v) return null
      if (typeof v === 'string') { try { return JSON.parse(v) } catch { return v } }
      if (typeof v === 'object') return v
      return null
    })(),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function createEpusdtTransactionForUser(params: { userId: number; amount: number; notifyUrl?: string; redirectUrl?: string; orderId?: string; amountIsUsdt?: boolean }) {
  const { userId } = params
  let { amount } = params
  amount = Number(amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('invalid amount')
  }
  await ensureTable()

  const baseUrl = (env.EPUSDT_BASE_URL || '').replace(/\/$/, '')
  if (!baseUrl) throw new Error('Missing EPUSDT_BASE_URL configuration')
  const notifyUrl = (() => {
    if (params.notifyUrl) return params.notifyUrl
    if (env.EPUSDT_NOTIFY_URL && env.EPUSDT_NOTIFY_URL.trim()) return env.EPUSDT_NOTIFY_URL.trim()
    const appBase = (env.BASE_URL || '').trim().replace(/\/$/, '')
    if (appBase) {
      return `${appBase}/api/payments/epusdt/webhook`
    }
    return ''
  })()
  if (!notifyUrl) throw new Error('Missing EPUSDT_NOTIFY_URL configuration')
  const redirectUrl = (() => {
    if (params.redirectUrl) return params.redirectUrl
    if (env.EPUSDT_REDIRECT_URL && env.EPUSDT_REDIRECT_URL.trim()) return env.EPUSDT_REDIRECT_URL.trim()
    const appBase = (env.BASE_URL || '').trim().replace(/\/$/, '')
    if (appBase) {
      return `${appBase}/payments/order`
    }
    return undefined
  })()
  const orderId = params.orderId || makeOrderId(userId)

  // If the caller says amount is USDT, convert to CNY with a forced rate when available
  // Epusdt API expects amount in CNY and returns actual_amount in USDT
  if (params.amountIsUsdt) {
    // 优先使用环境变量设置的汇率；未设置时，默认按 1:1（CNY=USDT）处理，保证功能不报错
    const rateRaw = env.EPUSDT_FORCED_RATE
    const rate = Number.isFinite(Number(rateRaw)) && Number(rateRaw) > 0 ? Number(rateRaw) : 1
    // amount(CNY) = usdt * rate
    amount = Number((Number(params.amount) * rate).toFixed(2))
  }

  const requestPayload: Signable = {
    order_id: orderId,
    amount: normalizeAmount(amount),
    notify_url: notifyUrl,
    redirect_url: redirectUrl || '',
  }
  const signSource = buildSignSource(requestPayload)
  const primarySig = epusdtSign(requestPayload)
  const altSigToken = epusdtSign(requestPayload, env.EPUSDT_TOKEN, 'amp_token')
  const altSigKey = epusdtSign(requestPayload, env.EPUSDT_TOKEN, 'amp_key')
  let body = {
    order_id: requestPayload.order_id,
    amount: requestPayload.amount,
    notify_url: requestPayload.notify_url,
    redirect_url: redirectUrl,
    signature: primarySig,
  }

  try {
    console.info('[epusdt:create] preflight', {
      baseUrl,
      orderId,
      amount: body.amount,
      notify_url: body.notify_url,
      redirect_url: body.redirect_url,
    })
  } catch (_) {}

  const doRequest = async () => {
    try {
      console.info('[epusdt:create] request start', { url: `${baseUrl}/api/v1/order/create-transaction` })
      const ac = new AbortController()
      const t = setTimeout(() => {
        try { ac.abort() } catch (_) {}
      }, 10000)
      try {
        const res = await fetch(`${baseUrl}/api/v1/order/create-transaction`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
          signal: ac.signal,
        })
        clearTimeout(t)
        return res
      } catch (err: any) {
        if (err && (err.name === 'AbortError' || String(err?.message || '').includes('aborted'))) {
          console.error('[epusdt:create] timeout', { url: `${baseUrl}/api/v1/order/create-transaction`, timeoutMs: 10000 })
          throw new Error('请求超时（10s）')
        }
        throw err
      }
    } catch (e: any) {
      console.error('[epusdt:create] request failed', {
        error: String(e?.message || e),
        baseUrl,
        orderId,
        amount: body.amount,
        notify_url: body.notify_url,
        redirect_url: body.redirect_url,
      })
      throw new Error(`Epusdt 请求失败：${e?.message || e}`)
    }
  }
  let response = await doRequest()

  const rawText = await response.text().catch(() => '')
  const responseHeaders = (() => {
    try {
      return Object.fromEntries(response.headers.entries())
    } catch (_) {
      return {}
    }
  })()
  let debugContext: any = {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
    rawText,
    requestPayload: {
      orderId,
      amount: body.amount,
      notify_url: body.notify_url,
      redirect_url: body.redirect_url,
    },
    sign: {
      mode: 'concat',
      source: signSource,
      signature: body.signature,
    },
  }
  if (!response.ok) {
    console.error('[epusdt:create] HTTP error', debugContext)
    throw new Error(`Epusdt HTTP ${response.status} ${rawText}`)
  }
  let json: any = null
  if (rawText && rawText.trim()) {
    try {
      json = JSON.parse(rawText)
    } catch (_) {
      console.error('[epusdt:create] invalid JSON response', debugContext)
      const preview = rawText.length > 500 ? rawText.slice(0, 500) + '…' : rawText
      throw new Error(`Epusdt 响应格式错误，原始内容预览：${preview}`)
    }
  }
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid Epusdt response')
  }
  if (json.status_code !== 200) {
    // 若是签名错误，尝试备用签名模式重试
    const msg = String(json.message || '').toLowerCase()
    const isSignError = json.status_code === 401 || json.status_code === 403 || /签名|sign/i.test(msg)
    if (isSignError) {
      // 尝试 &token= 拼接
      body = { ...body, signature: altSigToken }
      response = await doRequest()
      const raw2 = await response.text().catch(() => '')
      const headers2 = (() => { try { return Object.fromEntries(response.headers.entries()) } catch { return {} as any } })()
      debugContext = { ...debugContext, retry: { mode: 'amp_token', raw: raw2, headers: headers2, signature: body.signature } }
      if (!response.ok) {
        console.error('[epusdt:create] retry amp_token HTTP error', debugContext)
        throw new Error(`Epusdt HTTP ${response.status} ${raw2}`)
      }
      let json2: any = null
      if (raw2 && raw2.trim()) {
        try { json2 = JSON.parse(raw2) } catch { console.error('[epusdt:create] retry amp_token invalid JSON', debugContext); const preview = raw2.length > 500 ? raw2.slice(0, 500) + '…' : raw2; throw new Error(`Epusdt 响应格式错误，原始内容预览：${preview}`) }
      }
      if (json2 && json2.status_code === 200) {
        json = json2
      } else if (json2 && (json2.status_code === 401 || json2.status_code === 403 || /签名|sign/i.test(String(json2.message || '')))) {
        // 再试 &key=
        body = { ...body, signature: altSigKey }
        response = await doRequest()
        const raw3 = await response.text().catch(() => '')
        const headers3 = (() => { try { return Object.fromEntries(response.headers.entries()) } catch { return {} as any } })()
        debugContext = { ...debugContext, retry2: { mode: 'amp_key', raw: raw3, headers: headers3, signature: body.signature } }
        if (!response.ok) { console.error('[epusdt:create] retry amp_key HTTP error', debugContext); throw new Error(`Epusdt HTTP ${response.status} ${raw3}`) }
        let json3: any = null
        if (raw3 && raw3.trim()) { try { json3 = JSON.parse(raw3) } catch { console.error('[epusdt:create] retry amp_key invalid JSON', debugContext); const preview = raw3.length > 500 ? raw3.slice(0, 500) + '…' : raw3; throw new Error(`Epusdt 响应格式错误，原始内容预览：${preview}`) } }
        if (json3 && json3.status_code === 200) {
          json = json3
        } else {
          console.error('[epusdt:create] all signature modes failed', { first: debugContext, json, json2, json3 })
          const errMsg = String(json3?.message || json2?.message || json?.message || json?.status_code || 'Unknown')
          throw new Error(`Epusdt 签名错误（已尝试3种模式）: ${errMsg}\n签名原串: ${signSource}`)
        }
      } else {
        const errMsg = String(json2?.message || json2?.status_code || 'Unknown')
        throw new Error(`Epusdt 签名错误（已尝试2种模式）: ${errMsg}\n签名原串: ${signSource}`)
      }
    } else {
      const errMsg = String(json.message || json.status_code || 'Unknown')
      throw new Error(`Epusdt 业务错误: ${errMsg}\n签名原串: ${signSource}`)
    }
  }
  const data = json.data || {}

  await query(
    `INSERT INTO epusdt_trades (trade_id, order_id, user_id, status, amount, actual_amount, token, payment_url, expiration_time, raw_request, raw_response)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE trade_id = VALUES(trade_id), status = VALUES(status), amount = VALUES(amount), actual_amount = VALUES(actual_amount), token = VALUES(token), payment_url = VALUES(payment_url), expiration_time = VALUES(expiration_time), raw_request = VALUES(raw_request), raw_response = VALUES(raw_response)` ,
    [
      data.trade_id ?? null,
      orderId,
      userId,
      normalizeAmount(amount),
      data.actual_amount ?? null,
      data.token ?? null,
      data.payment_url ?? null,
      data.expiration_time ?? null,
      JSON.stringify(body),
      JSON.stringify(json),
    ],
  )

  const [row] = await query<any[]>(`SELECT * FROM epusdt_trades WHERE order_id = ? LIMIT 1`, [orderId])
  return mapRow(row)
}

export function getEpusdtPaymentUrl(record: Pick<EpusdtTradeRecord, 'payment_url' | 'trade_id'>) {
  if (record.payment_url) return record.payment_url
  if (record.trade_id) {
    const baseUrl = (env.EPUSDT_BASE_URL || '').replace(/\/$/, '')
    if (baseUrl) {
      // 检查 baseUrl 是否已经包含端口，如果没有才添加 :8000
      const hasPort = /:\d+$/.test(baseUrl)
      const fullUrl = hasPort ? baseUrl : `${baseUrl}:8001`
      return `${fullUrl}/pay/checkout-counter/${record.trade_id}`
    }
  }
  return ''
}

export function getEpusdtLocalCheckoutUrl(record: Pick<EpusdtTradeRecord, 'order_id' | 'trade_id'>) {
  const baseUrl = (env.BASE_URL || '').trim().replace(/\/$/, '')
  if (!baseUrl) return ''
  const orderId = record.order_id
  if (!orderId) return ''
  return `${baseUrl}/payments/order/${encodeURIComponent(orderId)}`
}

export async function getTradeByTradeId(tradeId: string) {
  await ensureTable()
  const [row] = await query<any[]>(`SELECT * FROM epusdt_trades WHERE trade_id = ? LIMIT 1`, [tradeId])
  return row ? mapRow(row) : null
}

export async function getTradeByOrderId(orderId: string) {
  await ensureTable()
  const [row] = await query<any[]>(`SELECT * FROM epusdt_trades WHERE order_id = ? LIMIT 1`, [orderId])
  return row ? mapRow(row) : null
}

export function mapTradeToStatus(trade: EpusdtTradeRecord) {
  return {
    tradeId: trade.trade_id,
    orderId: trade.order_id,
    status: trade.status,
    amount: trade.amount,
    actualAmount: trade.actual_amount,
    token: trade.token,
    paymentUrl: getEpusdtPaymentUrl(trade),
    checkoutPageUrl: getEpusdtLocalCheckoutUrl(trade),
    blockTransactionId: trade.block_transaction_id,
    updatedAt: trade.updated_at,
  }
}

export interface EpusdtCallbackPayload {
  trade_id: string
  order_id: string
  amount: number
  actual_amount: number
  token: string
  block_transaction_id: string
  signature: string
  status: number
}

function deriveStatus(status: number): EpusdtTradeStatus {
  if (status === 2) return 'paid'
  if (status === 3) return 'expired'
  return 'pending'
}

export async function handleEpusdtCallback(payload: EpusdtCallbackPayload) {
  await ensureTable()
  if (!verifyEpusdtSignature({
    trade_id: payload.trade_id,
    order_id: payload.order_id,
    amount: payload.amount,
    actual_amount: payload.actual_amount,
    token: payload.token,
    block_transaction_id: payload.block_transaction_id,
    status: payload.status,
  }, payload.signature)) {
    throw new Error('invalid signature')
  }
  const trade = await getTradeByOrderId(payload.order_id)
  if (!trade) throw new Error('trade not found')

  const status = deriveStatus(payload.status)
  const rawCallback = JSON.stringify(payload)

  if (status === 'paid' && trade.status !== 'paid') {
    await query('START TRANSACTION')
    try {
      await query(
        `UPDATE epusdt_trades SET status = ?, trade_id = ?, actual_amount = ?, token = ?, block_transaction_id = ?, raw_callback = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?`,
        [status, payload.trade_id, payload.actual_amount, payload.token, payload.block_transaction_id, rawCallback, payload.order_id],
      )
      await updateBalance(trade.user_id, Number(payload.actual_amount), `Epusdt deposit ${payload.trade_id}`)
      await query('COMMIT')
    } catch (e) {
      await query('ROLLBACK')
      throw e
    }
  } else {
    await query(
      `UPDATE epusdt_trades SET status = ?, trade_id = ?, actual_amount = ?, token = ?, block_transaction_id = ?, raw_callback = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?`,
      [status, payload.trade_id, payload.actual_amount, payload.token, payload.block_transaction_id, rawCallback, payload.order_id],
    )
  }

  return getTradeByOrderId(payload.order_id)
}

export async function markTradeExpired(tradeId: string) {
  await ensureTable()
  await query(`UPDATE epusdt_trades SET status = 'expired' WHERE trade_id = ?`, [tradeId])
}

export async function getTradeStatus(tradeId: string) {
  const trade = await getTradeByTradeId(tradeId)
  if (!trade) return null
  return mapTradeToStatus(trade)
}

export async function getTradeStatusByOrderId(orderId: string) {
  const trade = await getTradeByOrderId(orderId)
  if (!trade) return null
  return mapTradeToStatus(trade)
}

export function getEpusdtEnvStatus() {
  const baseUrl = (env.EPUSDT_BASE_URL || '').trim()
  const notifyUrl = (env.EPUSDT_NOTIFY_URL || '').trim()
  const redirectUrl = (env.EPUSDT_REDIRECT_URL || '').trim()
  const appBase = (env.BASE_URL || '').trim()
  return {
    EPUSDT_BASE_URL: Boolean(baseUrl),
    EPUSDT_TOKEN: Boolean((env.EPUSDT_TOKEN || '').trim()),
    EPUSDT_NOTIFY_URL: Boolean(notifyUrl || appBase),
    EPUSDT_REDIRECT_URL: Boolean(redirectUrl || appBase),
  }
}
