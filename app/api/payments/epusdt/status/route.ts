import { NextResponse } from 'next/server'
import { getTradeStatus } from '@/lib/services/epusdt'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const tradeId = searchParams.get('tradeId')
    const orderId = searchParams.get('orderId')
    if (!tradeId && !orderId) {
      return NextResponse.json({ ok: false, error: 'missing tradeId or orderId' }, { status: 400 })
    }
    const status = tradeId ? await getTradeStatus(tradeId) : await getTradeStatusByOrderId(orderId!)
    if (!status) {
      return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, data: status })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Internal Error' }, { status: 500 })
  }
}

async function getTradeStatusByOrderId(orderId: string) {
  const status = await getTradeStatusBy('orderId', orderId)
  return status
}

async function getTradeStatusBy(type: 'orderId', value: string) {
  const { getTradeByOrderId } = await import('@/lib/services/epusdt')
  const trade = await getTradeByOrderId(value)
  if (!trade) return null
  return {
    tradeId: trade.trade_id,
    orderId: trade.order_id,
    status: trade.status,
    amount: trade.amount,
    actualAmount: trade.actual_amount,
    token: trade.token,
    paymentUrl: trade.payment_url,
    blockTransactionId: trade.block_transaction_id,
    updatedAt: trade.updated_at,
  }
}
