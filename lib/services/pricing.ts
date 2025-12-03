import { query } from '@/lib/db'

export const CID_PRICING_TIERS = [
  { levelLabel: 'L0', minSingleTopup: 0, price: 0.09 },
  { levelLabel: 'L1', minSingleTopup: 100, price: 0.085 },
  { levelLabel: 'L2', minSingleTopup: 300, price: 0.077 },
  { levelLabel: 'L3', minSingleTopup: 500, price: 0.07 },
  { levelLabel: 'L4', minSingleTopup: 800, price: 0.063 },
  { levelLabel: 'L5', minSingleTopup: 1000, price: 0.056 },
] as const

let ensuredOverrideTable = false

async function ensureOverrideTable() {
  if (ensuredOverrideTable) return
  await query(`CREATE TABLE IF NOT EXISTS user_level_overrides (
    user_id INT NOT NULL PRIMARY KEY,
    level_label VARCHAR(8) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  ensuredOverrideTable = true
}

export async function getCidPricingForUser(userId: number) {
  await ensureOverrideTable()
  const rows = await query<Array<{ level_label: string }>>(
    'SELECT level_label FROM user_level_overrides WHERE user_id = ? LIMIT 1',
    [userId],
  )
  const overrideLabel = rows[0]?.level_label
  if (overrideLabel) {
    const tier = CID_PRICING_TIERS.find((t) => t.levelLabel === overrideLabel)
    if (tier) {
      return { ...tier, maxSingleTopup: tier.minSingleTopup, override: true }
    }
  }
  const base = CID_PRICING_TIERS[0]
  // 默认用户最大单笔充值限额为 10000 USDT
  return { ...base, maxSingleTopup: 10000, override: false }
}
