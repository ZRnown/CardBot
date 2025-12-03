import { NextResponse } from 'next/server'
import { listOrdersPaginated } from '@/lib/services/order'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const page = Number(searchParams.get('page') || '1')
    const pageSize = Number(searchParams.get('pageSize') || '10')
    const search = searchParams.get('search') || undefined
    const data = await listOrdersPaginated({ page, pageSize, search })
    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Internal Error' }, { status: 500 })
  }
}
