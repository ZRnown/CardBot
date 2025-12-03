// External API wrappers based on your docs
// Base endpoints (can be overridden by env):
// - CID: default http://getcid.site:8085
// - Key check and OCR: default http://pid.best:8000

export type ApiStatus = 'success' | 'failed'

export interface BaseApiResponse {
  status: ApiStatus
  errorcode?: string
  errormsg?: string
  [k: string]: any
}

const CID_BASE = process.env.CID_BASE || 'http://getcid.site:8085'
const PID_BASE = process.env.PID_BASE || 'http://pid.best:8000'

import { ProxyAgent, type Dispatcher } from 'undici'

function getProxyDispatcherFor(url: string): Dispatcher | undefined {
  try {
    const httpProxy = process.env.HTTP_PROXY
    const httpsProxy = process.env.HTTPS_PROXY
    const isHttps = /^https:/i.test(url)
    const proxy = isHttps ? (httpsProxy || httpProxy) : (httpProxy || httpsProxy)
    if (!proxy) return undefined
    return new ProxyAgent(proxy)
  } catch {
    return undefined
  }
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 15000) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const dispatcher = getProxyDispatcherFor(url)
    const res = await fetch(url, { ...(init || {}), signal: ac.signal, ...(dispatcher ? { dispatcher } : {}) })
    if (!res.ok) {
      throw new Error(`${init?.method || 'GET'} ${url} http ${res.status}`)
    }
    return (await res.json()) as BaseApiResponse
  } catch (e: any) {
    // Surface clearer error for network/DNS/timeout
    const msg = e?.name === 'AbortError' ? `timeout ${timeoutMs}ms` : (e?.message || 'fetch failed')
    throw new Error(`fetch failed: ${msg}`)
  } finally {
    clearTimeout(timer)
  }
}

export async function getCid(params: { token: string; iid: string }) {
  const url = `${CID_BASE}/getcid?token=${encodeURIComponent(params.token)}&iid=${encodeURIComponent(params.iid)}`
  return fetchJson(url)
}

export async function getBalance(params: { token: string }) {
  const url = `${CID_BASE}/balance?token=${encodeURIComponent(params.token)}`
  return fetchJson(url)
}

export async function checkKey(params: { key: string; token: string }) {
  const url = `${PID_BASE}/checkkey?key=${encodeURIComponent(params.key)}&token=${encodeURIComponent(params.token)}`
  return fetchJson(url)
}

export async function ocrImage(params: { base64: string; token: string }) {
  return fetchJson(
    PID_BASE,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'startocr', user: params.token, base64: params.base64 }),
    },
  )
}
