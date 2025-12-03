import { NextResponse } from 'next/server'
import { getByTelegramId } from '@/lib/services/user'

export async function GET(
  _req: Request,
  ctx: { params: { telegramId: string } }
) {
  try {
    const tgId = ctx.params.telegramId
    if (!tgId) return NextResponse.json({ ok: false, error: 'invalid telegramId' }, { status: 400 })
    const user = await getByTelegramId(tgId)
    if (!user) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true, data: user })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}
