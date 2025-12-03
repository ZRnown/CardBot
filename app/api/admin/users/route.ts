import { NextResponse } from 'next/server'
import { listUsersPaginated } from '@/lib/services/user'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const page = Number(searchParams.get('page') || '1')
    const pageSize = Number(searchParams.get('pageSize') || '10')
    const search = searchParams.get('search') || undefined
    const data = await listUsersPaginated({ page, pageSize, search })
    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    // Temporary detailed logging for debugging
    // eslint-disable-next-line no-console
    console.error('[api/admin/users] GET error:', e)
    return NextResponse.json({ ok: false, error: e?.message || 'Internal Error' }, { status: 500 })
  }
}
