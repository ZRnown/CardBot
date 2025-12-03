import { NextResponse } from 'next/server'
import { createEpusdtTransactionForUser } from '@/lib/services/epusdt'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as any
    const userId = Number(body.userId)
    const amount = Number(body.amount)
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ ok: false, error: 'invalid userId' }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ ok: false, error: 'invalid amount' }, { status: 400 })
    }
    const trade = await createEpusdtTransactionForUser({ userId, amount })
    return NextResponse.json({ ok: true, data: trade })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Internal Error' }, { status: 500 })
  }
}
