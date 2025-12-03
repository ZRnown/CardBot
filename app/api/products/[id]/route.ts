import { NextResponse } from 'next/server'
import { getProductById, updateProduct, deleteProductSafe } from '@/lib/services/product'

export async function GET(
  _req: Request,
  ctx: { params: { id: string } }
) {
  try {
    const id = Number(ctx.params.id)
    if (!Number.isFinite(id)) return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 })
    const row = await getProductById(id)
    if (!row) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true, data: row })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: { id: string } }
) {
  try {
    const id = Number(ctx.params.id)
    if (!Number.isFinite(id)) return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 })
    const prod = await getProductById(id)
    if (!prod) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    if (Number(prod.is_active) === 1) {
      return NextResponse.json({ ok: false, error: 'product must be deactivated before delete' }, { status: 400 })
    }
    
    // 检查是否有force参数
    const url = new URL(req.url)
    const force = url.searchParams.get('force') === 'true'
    
    const r = await deleteProductSafe(id, force)
    if ((r.deleted || 0) <= 0) {
      return NextResponse.json({ ok: false, error: 'delete failed (ensure product is inactive)' }, { status: 400 })
    }
    return NextResponse.json({ ok: true, data: { deleted: r.deleted } })
  } catch (e: any) {
    if (e?.message === 'has_keys') {
      return NextResponse.json({ ok: false, error: 'has_keys' }, { status: 400 })
    }
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: { id: string } }
) {
  try {
    const id = Number(ctx.params.id)
    if (!Number.isFinite(id)) return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 })
    const body = await req.json()
    const { name, price, category, sub_category, description, is_active } = body || {}
    if (typeof sub_category === 'string' && !sub_category.trim()) {
      return NextResponse.json({ ok: false, error: 'sub_category required' }, { status: 400 })
    }
    const row = await updateProduct(id, {
      name,
      price: typeof price === 'number' ? price : undefined,
      category,
      sub_category: typeof sub_category === 'string' ? sub_category : undefined,
      description: typeof description === 'string' ? description : undefined,
      is_active: typeof is_active === 'boolean' ? is_active : undefined,
    })
    return NextResponse.json({ ok: true, data: row })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}
