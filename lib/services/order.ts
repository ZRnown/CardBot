import { query } from '@/lib/db'
import { getProductById, countAvailableKeys } from './product'

export interface OrderRecord {
  id: number
  user_id: number
  product_key_id: number
  amount: string
  created_at: string
}

export async function listOrdersPaginated(params: { page: number; pageSize: number; search?: string }) {
  const page = Math.max(1, Math.floor(params.page || 1))
  const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize || 10)))
  const offset = (page - 1) * pageSize
  const where: string[] = []
  const values: any[] = []
  if (params.search && params.search.trim()) {
    where.push('(u.username LIKE ? OR p.name LIKE ? OR u.telegram_id LIKE ?)')
    const s = `%${params.search.trim()}%`
    values.push(s, s, s)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const rows = await query<
    Array<{
      id: number
      created_at: string
      amount: string
      username: string | null
      telegram_id: string
      product_id: number
      product_name: string
      product_category: string
      product_sub_category: string
      product_key_value: string
    }>
  >(
    `SELECT o.id, o.created_at, o.amount, u.username, u.telegram_id,
            p.id AS product_id, p.name AS product_name, p.category AS product_category, p.sub_category AS product_sub_category,
            pk.key_value AS product_key_value
     FROM orders o
     INNER JOIN users u ON o.user_id = u.id
     INNER JOIN product_keys pk ON o.product_key_id = pk.id
     INNER JOIN products p ON pk.product_id = p.id
     ${whereSql}
     ORDER BY o.id DESC
     LIMIT ? OFFSET ?`,
    [...values, pageSize, offset],
  )
  const totalRows = await query<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM orders o INNER JOIN users u ON o.user_id = u.id INNER JOIN product_keys pk ON o.product_key_id = pk.id INNER JOIN products p ON pk.product_id = p.id ${whereSql}`,
    values,
  )
  const total = totalRows[0]?.c ?? 0
  return { items: rows, total, page, pageSize }
}

// Try to purchase one key for a product. Atomic with transaction.
export async function buyProductKey(params: { userId: number; productId: number }) {
  // Start transaction
  await query('START TRANSACTION')
  try {
    const product = await getProductById(params.productId)
    if (!product || Number(product.is_active) !== 1) {
      throw new Error('Product not available')
    }

    // Check available balance and fetch user row FOR UPDATE
    const [user] = (await query<{ id: number; balance: string }[]>(
      'SELECT id, balance FROM users WHERE id = ? FOR UPDATE',
      [params.userId],
    ))
    if (!user) throw new Error('User not found')

    const price = Number(product.price)
    const balance = Number(user.balance)
    if (balance < price) throw new Error('Insufficient balance')

    // Lock one available key
    const keyRow = (await query<{ id: number; key_value: string }[]>(
      'SELECT id, key_value FROM product_keys WHERE product_id = ? AND is_sold = 0 ORDER BY id ASC LIMIT 1 FOR UPDATE',
      [params.productId],
    ))[0]
    if (!keyRow) throw new Error('No stock')

    // Deduct balance
    await query('UPDATE users SET balance = balance - ? WHERE id = ?', [price, params.userId])

    // Mark key sold
    await query(
      'UPDATE product_keys SET is_sold = 1, sold_to_user_id = ?, sold_at = CURRENT_TIMESTAMP WHERE id = ? AND is_sold = 0',
      [params.userId, keyRow.id],
    )

    // Create order
    const result: any = await query(
      'INSERT INTO orders (user_id, product_key_id, amount) VALUES (?, ?, ?)',
      [params.userId, keyRow.id, price],
    )

    // Write transaction ledger
    await query(
      "INSERT INTO transactions (user_id, type, amount, description) VALUES (?, 'purchase', ?, ?)",
      [params.userId, -price, `Buy product ${params.productId} key#${keyRow.id}`],
    )

    await query('COMMIT')

    return {
      orderId: result?.insertId as number,
      key: keyRow.key_value,
      amount: price,
      productId: params.productId,
      productName: product.name,
    }
  } catch (e) {
    await query('ROLLBACK')
    throw e
  }
}

export async function listUserOrders(userId: number, limit = 10) {
  return query<
    Array<{
      id: number
      amount: string
      created_at: string
      product_key_id: number
      product_name: string
      product_key_value: string
    }>
  >(
    `SELECT o.id, o.product_key_id, o.amount, o.created_at, p.name AS product_name, pk.key_value AS product_key_value
     FROM orders o
     INNER JOIN product_keys pk ON o.product_key_id = pk.id
     INNER JOIN products p ON pk.product_id = p.id
     WHERE o.user_id = ?
     ORDER BY o.id DESC
     LIMIT ?`,
    [userId, limit],
  )
}
