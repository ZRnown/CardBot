import { query } from '@/lib/db'
import { getByApiToken, getByTelegramId } from './user'
import { getBalance } from './external-api'

export interface TransactionRecord {
  id: number
  user_id: number
  type: 'recharge' | 'purchase' | 'get_cid' | 'admin_adjustment'
  amount: string // DECIMAL as string
  description: string | null
  created_at: string
}

export async function addTransaction(params: {
  userId: number
  type: TransactionRecord['type']
  amount: number
  description?: string | null
}) {
  await query(
    'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
    [params.userId, params.type, params.amount, params.description ?? null],
  )
}

export async function listUserTransactions(userId: number, limit = 50) {
  return query<TransactionRecord[]>(
    'SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT ?',
    [userId, limit],
  )
}

// Active Code Item: queryBalance
// Query external balance by api_token through the external API service
export async function queryBalance(token: string) {
  return getBalance({ token })
}

export async function queryBalanceByUserToken(apiToken: string) {
  return queryBalance(apiToken)
}

export async function queryBalanceByTelegramId(telegramId: string) {
  const user = await getByTelegramId(telegramId)
  if (!user) throw new Error('User not found')
  return queryBalance(user.api_token)
}
