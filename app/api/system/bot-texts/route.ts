import { NextResponse } from 'next/server'
import { getSetting, setSetting } from '@/lib/services/settings'

const KEY = 'BOT_TEXTS_JSON'

export async function GET() {
  try {
    const raw = (await getSetting(KEY)) || ''
    let data: any = {}
    try { data = raw ? JSON.parse(raw) : {} } catch { data = {} }
    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Internal Error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    // simple validation: ensure it's an object
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 })
    }
    await setSetting(KEY, JSON.stringify(body))
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Internal Error' }, { status: 500 })
  }
}
