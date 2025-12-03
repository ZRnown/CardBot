import crypto from 'node:crypto'
import { query } from '@/lib/db'

export interface UserRecord {
  id: number
  telegram_id: string
  username: string | null
  balance: string // DECIMAL as string
  api_token: string
  created_at: string
}

export async function listUsersPaginated(params: { page: number; pageSize: number; search?: string }) {
  const page = Math.max(1, Math.floor(params.page || 1))
  const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize || 10)))
  const offset = (page - 1) * pageSize
  const where: string[] = []
  const values: any[] = []
  if (params.search && params.search.trim()) {
    where.push('(telegram_id LIKE ? OR username LIKE ?)')
    const s = `%${params.search.trim()}%`
    values.push(s, s)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const rows = await query<
    Array<{ id: number; telegram_id: string; username: string | null; balance: string; created_at: string }>
  >(
    `SELECT id, telegram_id, username, balance, created_at
     FROM users
     ${whereSql}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [...values, pageSize, offset],
  )
  const totalRows = await query<{ c: number }[]>(`SELECT COUNT(*) as c FROM users ${whereSql}`, values)
  const total = totalRows[0]?.c ?? 0
  return { items: rows, total, page, pageSize }
}

export async function getByTelegramId(telegramId: string) {
  const rows = await query<UserRecord[]>(
    'SELECT * FROM users WHERE telegram_id = ? LIMIT 1',
    [telegramId],
  )
  return rows[0] || null
}

export async function createUser(params: { telegramId: string; username?: string | null }) {
  const apiToken = crypto.randomBytes(16).toString('hex')
  await query(
    'INSERT INTO users (telegram_id, username, balance, api_token) VALUES (?, ?, 0.00, ?)',
    [params.telegramId, params.username ?? null, apiToken],
  )
  return getByTelegramId(params.telegramId)
}

export async function getOrCreateUser(telegramId: string, username?: string | null) {
  const existing = await getByTelegramId(telegramId)
  if (existing) return existing
  return createUser({ telegramId, username })
}

export async function getByApiToken(token: string) {
  const rows = await query<UserRecord[]>(
    'SELECT * FROM users WHERE api_token = ? LIMIT 1',
    [token],
  )
  return rows[0] || null
}

export async function ensureUsername(telegramId: string, username: string | null) {
  await query('UPDATE users SET username = ? WHERE telegram_id = ?', [username, telegramId])
}

export async function updateBalance(userId: number, delta: number, description?: string) {
  // Start transaction
  await query('START TRANSACTION')
  try {
    await query('UPDATE users SET balance = balance + ? WHERE id = ?', [delta, userId])
    await query(
      'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
      [userId, delta >= 0 ? 'recharge' : 'purchase', delta, description ?? null],
    )
    await query('COMMIT')
  } catch (e) {
    await query('ROLLBACK')
    throw e
  }
}
