import { NextResponse } from 'next/server'
import { env } from '@/lib/env'

export async function POST() {
  try {
    if (!env.TELEGRAM_BOT_TOKEN) return NextResponse.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN not set' }, { status: 400 })
    if (!env.BASE_URL) return NextResponse.json({ ok: false, error: 'BASE_URL not set' }, { status: 400 })
    if (!env.WEBHOOK_SECRET) return NextResponse.json({ ok: false, error: 'WEBHOOK_SECRET not set' }, { status: 400 })

    const url = `${env.BASE_URL}/api/telegram/webhook`
    const api = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`

    const res = await fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ url, secret_token: env.WEBHOOK_SECRET })
    })
    const json = await res.json()
    if (!res.ok || json.ok !== true) {
      return NextResponse.json({ ok: false, error: json?.description || `http ${res.status}` }, { status: 500 })
    }
    return NextResponse.json({ ok: true, data: json })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}
