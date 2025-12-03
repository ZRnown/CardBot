import { NextResponse } from 'next/server'
import { updateBalance } from '@/lib/services/user'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const userId = Number(body.userId)
    const amount = Number(body.amount)
    const remark = typeof body.remark === 'string' ? body.remark : undefined
    if (!Number.isFinite(userId) || !Number.isFinite(amount) || amount === 0) {
      return NextResponse.json({ ok: false, error: 'Invalid params' }, { status: 400 })
    }
    await updateBalance(userId, amount, remark)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Internal Error' }, { status: 500 })
  }
}
