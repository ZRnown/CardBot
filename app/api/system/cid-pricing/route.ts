import { NextResponse } from 'next/server'
import { CID_PRICING_TIERS } from '@/lib/services/pricing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const tiers = CID_PRICING_TIERS.filter(t => t.levelLabel !== 'L0')
    return NextResponse.json({ ok: true, data: { tiers } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Internal Error' }, { status: 500 })
  }
}
