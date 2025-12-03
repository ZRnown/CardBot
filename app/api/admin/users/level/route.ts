import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { CID_PRICING_TIERS, getCidPricingForUser } from '@/lib/services/pricing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = Number(searchParams.get('userId') || '0')
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ ok: false, error: 'invalid userId' }, { status: 400 })
    }
    const pricing = await getCidPricingForUser(userId)
    return NextResponse.json({ ok: true, data: { pricing, tiers: CID_PRICING_TIERS } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Internal Error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as any
    const userId = Number(body.userId)
    const levelLabel = typeof body.levelLabel === 'string' ? body.levelLabel.trim() : undefined
    if (!Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ ok: false, error: 'invalid userId' }, { status: 400 })
    }

    // ensure table exists
    await query(`CREATE TABLE IF NOT EXISTS user_level_overrides (
      user_id INT NOT NULL PRIMARY KEY,
      level_label VARCHAR(8) NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`)

    if (!levelLabel) {
      await query('DELETE FROM user_level_overrides WHERE user_id = ?', [userId])
      return NextResponse.json({ ok: true, data: { userId, levelLabel: null } })
    }

    const valid = CID_PRICING_TIERS.some(t => t.levelLabel === levelLabel)
    if (!valid) {
      return NextResponse.json({ ok: false, error: 'invalid levelLabel' }, { status: 400 })
    }

    await query('INSERT INTO user_level_overrides (user_id, level_label) VALUES (?, ?) ON DUPLICATE KEY UPDATE level_label = VALUES(level_label)', [userId, levelLabel])
    return NextResponse.json({ ok: true, data: { userId, levelLabel } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Internal Error' }, { status: 500 })
  }
}
