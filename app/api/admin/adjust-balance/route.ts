import { NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { getByTelegramId, updateBalance } from '@/lib/services/user'

// Simple admin auth: require header X-Admin-Telegram-Id to be in env.ADMIN_TELEGRAM_IDS
function isAdminFromHeaders(req: Request) {
  const id = req.headers.get('x-admin-telegram-id') || req.headers.get('X-Admin-Telegram-Id')
  return id && env.ADMIN_TELEGRAM_IDS.includes(id)
}

export async function POST(req: Request) {
  try {
    if (!isAdminFromHeaders(req)) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }
    const body = await req.json()
    const { telegramId, amount, note } = body || {}
    if (!telegramId || typeof amount !== 'number' || amount === 0) {
      return NextResponse.json({ ok: false, error: 'telegramId and non-zero amount required' }, { status: 400 })
    }
    const user = await getByTelegramId(String(telegramId))
    if (!user) return NextResponse.json({ ok: false, error: 'user not found' }, { status: 404 })
    await updateBalance(user.id, amount, note ? String(note) : undefined)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}
