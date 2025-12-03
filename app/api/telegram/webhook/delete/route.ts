import { NextResponse } from 'next/server'
import { env } from '@/lib/env'

export async function POST() {
  try {
    if (!env.TELEGRAM_BOT_TOKEN) return NextResponse.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN not set' }, { status: 400 })
    const api = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/deleteWebhook`
    const res = await fetch(api)
    const json = await res.json()
    if (!res.ok || json.ok !== true) {
      return NextResponse.json({ ok: false, error: json?.description || `http ${res.status}` }, { status: 500 })
    }
    return NextResponse.json({ ok: true, data: json })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}
