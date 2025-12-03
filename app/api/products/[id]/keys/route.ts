import { NextResponse } from 'next/server'
import { listProductKeys, deleteProductKeys, updateProductKeyValue } from '@/lib/services/product'

export async function GET(req: Request, ctx: { params: { id: string } }) {
  try {
    const productId = Number(ctx.params.id)
    if (!Number.isFinite(productId)) {
      return NextResponse.json({ ok: false, error: 'invalid product id' }, { status: 400 })
    }
    const { searchParams } = new URL(req.url)
    const page = Number(searchParams.get('page') || '1')
    const pageSize = Number(searchParams.get('pageSize') || '20')
    const statusParam = searchParams.get('status')
    const status = statusParam === 'available' || statusParam === 'sold' ? statusParam : 'all'
    const search = searchParams.get('search') || undefined
    const data = await listProductKeys({ productId, page, pageSize, status, search })
    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}

export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  try {
    const productId = Number(ctx.params.id)
    if (!Number.isFinite(productId)) {
      return NextResponse.json({ ok: false, error: 'invalid product id' }, { status: 400 })
    }
    const body = await req.json().catch(() => null)
    const idsRaw = body?.ids
    if (!Array.isArray(idsRaw)) {
      return NextResponse.json({ ok: false, error: 'ids must be an array' }, { status: 400 })
    }
    const ids = idsRaw.map((id: any) => Number(id)).filter((n) => Number.isFinite(n))
    if (!ids.length) {
      return NextResponse.json({ ok: false, error: 'no valid ids provided' }, { status: 400 })
    }
    const result = await deleteProductKeys(productId, ids)
    return NextResponse.json({ ok: true, data: result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  try {
    const productId = Number(ctx.params.id)
    if (!Number.isFinite(productId)) {
      return NextResponse.json({ ok: false, error: 'invalid product id' }, { status: 400 })
    }
    const body = await req.json().catch(() => null)
    const keyId = Number(body?.id)
    const newValue = String(body?.key_value ?? '')
    if (!Number.isFinite(keyId) || !newValue.trim()) {
      return NextResponse.json({ ok: false, error: 'id(number) & key_value(required)' }, { status: 400 })
    }
    const result = await updateProductKeyValue(productId, keyId, newValue)
    return NextResponse.json({ ok: true, data: result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}
