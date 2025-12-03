import { NextResponse } from 'next/server'
import { importProductKeys } from '@/lib/services/product'

export async function POST(
  req: Request,
  ctx: { params: { id: string } }
) {
  try {
    const id = Number(ctx.params.id)
    if (!Number.isFinite(id)) return NextResponse.json({ ok: false, error: 'invalid product id' }, { status: 400 })
    const body = await req.json()
    const { keys } = body || {}
    if (!Array.isArray(keys)) {
      return NextResponse.json({ ok: false, error: 'keys must be an array of strings' }, { status: 400 })
    }
    const cleanKeys = keys.map((k: any) => String(k)).map((s: string) => s.trim()).filter(Boolean)
    const res = await importProductKeys({ productId: id, keys: cleanKeys })
    return NextResponse.json({ ok: true, data: res })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}
