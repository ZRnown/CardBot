import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { handleUpdate } from '@/lib/bot'

export async function POST(req: Request) {
  try {
    const hdrs = await headers()
    // Telegram sends the secret as 'X-Telegram-Bot-Api-Secret-Token'
    const secret =
      hdrs.get('x-telegram-bot-api-secret-token') ||
      hdrs.get('X-Telegram-Bot-Api-Secret-Token') ||
      hdrs.get('x-telegram-bot-secret-token') ||
      hdrs.get('X-Telegram-Bot-Secret-Token')
    if (env.WEBHOOK_SECRET && secret !== env.WEBHOOK_SECRET) {
      return NextResponse.json({ ok: false, error: 'invalid secret' }, { status: 401 })
    }

    const update = await req.json()
    await handleUpdate(update)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true })
}
