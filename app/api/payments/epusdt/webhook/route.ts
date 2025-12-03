import { NextResponse } from 'next/server'
import { handleEpusdtCallback } from '@/lib/services/epusdt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REQUIRED_FIELDS = [
  'trade_id',
  'order_id',
  'amount',
  'actual_amount',
  'token',
  'block_transaction_id',
  'signature',
  'status',
] as const

type RequiredField = typeof REQUIRED_FIELDS[number]

function ensurePayloadField(name: RequiredField, payload: Record<string, unknown>) {
  if (!(name in payload)) {
    throw new Error(`missing field: ${name}`)
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 })
    }

    for (const field of REQUIRED_FIELDS) {
      ensurePayloadField(field, body as Record<string, unknown>)
    }

    const payload = {
      trade_id: String((body as any).trade_id || ''),
      order_id: String((body as any).order_id || ''),
      amount: Number((body as any).amount),
      actual_amount: Number((body as any).actual_amount),
      token: String((body as any).token || ''),
      block_transaction_id: String((body as any).block_transaction_id || ''),
      signature: String((body as any).signature || ''),
      status: Number((body as any).status),
    }

    if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
      throw new Error('invalid amount')
    }
    if (!Number.isFinite(payload.actual_amount) || payload.actual_amount < 0) {
      throw new Error('invalid actual_amount')
    }
    if (!Number.isInteger(payload.status)) {
      throw new Error('invalid status')
    }

    const result = await handleEpusdtCallback(payload)

    return NextResponse.json({ ok: true, data: result })
  } catch (e: any) {
    console.error('[epusdt webhook] error', e)
    return NextResponse.json({ ok: false, error: e?.message || 'Internal Error' }, { status: 500 })
  }
}
