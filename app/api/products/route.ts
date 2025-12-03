import { NextResponse } from 'next/server'
import { createProduct, listActiveProducts } from '@/lib/services/product'

export async function GET() {
  try {
    const rows = await listActiveProducts()
    return NextResponse.json({ ok: true, data: rows })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, price, category, sub_category, description, is_active } = body || {}
    if (!name || typeof price !== 'number' || !category || !String(sub_category || '').trim()) {
      return NextResponse.json({ ok: false, error: 'name, price(number), category, sub_category required' }, { status: 400 })
    }
    const row = await createProduct({ 
      name, 
      price, 
      category, 
      sub_category: typeof sub_category === 'string' ? sub_category : undefined, 
      description: typeof description === 'string' ? description : undefined,
      is_active: Boolean(is_active) 
    })
    return NextResponse.json({ ok: true, data: row })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}
