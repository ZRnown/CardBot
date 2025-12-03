import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { ensureProductSchema } from '@/lib/services/product'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await ensureProductSchema()
    const rows = await query<Array<{
      id: number
      name: string
      price: string
      category: string
      sub_category: string
      description?: string
      is_active: 0|1
      created_at: string
      stock: number
    }>>(`
      SELECT p.id, p.name, p.price, p.category, p.sub_category, p.description, p.is_active, p.created_at,
             (SELECT COUNT(*) FROM product_keys k WHERE k.product_id = p.id AND k.is_sold = 0) AS stock
      FROM products p
      ORDER BY p.sort_order ASC, p.id ASC
    `)
    return NextResponse.json({ ok: true, data: rows })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}
