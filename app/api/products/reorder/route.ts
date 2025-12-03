import { NextResponse } from 'next/server'
import { reorderProducts } from '@/lib/services/product'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as any
    const ids = Array.isArray(body?.ids) ? body.ids.map((x: any) => Number(x)).filter((n: any) => Number.isFinite(n)) : []
    if (!ids.length) {
      return NextResponse.json({ ok: false, error: 'ids required' }, { status: 400 })
    }
    const r = await reorderProducts(ids)
    return NextResponse.json({ ok: true, data: r })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}
