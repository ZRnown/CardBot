import { NextResponse } from 'next/server'
import { listUserTransactions } from '@/lib/services/transaction'
import { getByTelegramId } from '@/lib/services/user'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const userIdParam = searchParams.get('userId')
    const tgId = searchParams.get('telegramId')
    const limitParam = searchParams.get('limit')

    let userId: number | null = null
    if (userIdParam) {
      const n = Number(userIdParam)
      if (!Number.isFinite(n)) return NextResponse.json({ ok: false, error: 'invalid userId' }, { status: 400 })
      userId = n
    } else if (tgId) {
      const u = await getByTelegramId(tgId)
      if (!u) return NextResponse.json({ ok: false, error: 'user not found' }, { status: 404 })
      userId = u.id
    } else {
      return NextResponse.json({ ok: false, error: 'userId or telegramId required' }, { status: 400 })
    }

    const limit = limitParam ? Math.min(Math.max(Number(limitParam) || 10, 1), 100) : 10
    const rows = await listUserTransactions(userId, limit)
    return NextResponse.json({ ok: true, data: rows })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}
