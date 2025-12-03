import { query } from '@/lib/db'
import { env } from '@/lib/env'

export interface ProductRecord {
  id: number
  name: string
  price: string // DECIMAL as string
  category: string
  sub_category?: string
  description?: string
  is_active: 0 | 1 | boolean
  sort_order?: number
  created_at: string
}

export interface ProductKeyRecord {
  id: number
  product_id: number
  key_value: string
  is_sold: 0 | 1 | boolean
  sold_to_user_id: number | null
  sold_at: string | null
  created_at: string
}

let productKeyColumnsCache: Set<string> | null = null

async function getProductKeyColumns() {
  if (productKeyColumnsCache) return productKeyColumnsCache
  try {
    const rows = await query<Array<{ column_name: string }>>(
      `SELECT COLUMN_NAME AS column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'product_keys'`,
      [env.DB_NAME],
    )
    productKeyColumnsCache = new Set(rows.map((row) => row.column_name.toLowerCase()))
  } catch (_) {
    // 無法偵測欄位時使用空集合並緩存，後續查詢將採用保守欄位
    productKeyColumnsCache = new Set()
  }
  return productKeyColumnsCache
}

export async function ensureProductSchema() {
  // Ensure products.sort_order exists
  const rows = await query<Array<{ column_name: string }>>(
    `SELECT COLUMN_NAME AS column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'products' AND COLUMN_NAME = 'sort_order'`,
    [env.DB_NAME],
  )
  if (!rows[0]) {
    await query(`ALTER TABLE products ADD COLUMN sort_order INT NOT NULL DEFAULT 0`)
    // Best-effort backfill: set sort_order to id to preserve current ordering
    await query(`UPDATE products SET sort_order = id`)
  }
  // Ensure products.sub_category exists
  const rows2 = await query<Array<{ column_name: string }>>(
    `SELECT COLUMN_NAME AS column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'products' AND COLUMN_NAME = 'sub_category'`,
    [env.DB_NAME],
  )
  if (!rows2[0]) {
    await query(`ALTER TABLE products ADD COLUMN sub_category VARCHAR(255) NOT NULL DEFAULT ''`)
  }
  // Ensure products.description exists
  const rows3 = await query<Array<{ column_name: string }>>(
    `SELECT COLUMN_NAME AS column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'products' AND COLUMN_NAME = 'description'`,
    [env.DB_NAME],
  )
  if (!rows3[0]) {
    await query(`ALTER TABLE products ADD COLUMN description TEXT NULL`)
  }
}

export async function listActiveProducts() {
  await ensureProductSchema()
  return query<ProductRecord[]>(
    'SELECT id, name, price, category, sub_category, description, is_active, sort_order, created_at FROM products WHERE is_active = 1 ORDER BY sort_order ASC, id ASC',
  )
}

export async function getProductById(id: number) {
  await ensureProductSchema()
  const rows = await query<ProductRecord[]>(
    'SELECT id, name, price, category, sub_category, description, is_active, sort_order, created_at FROM products WHERE id = ? LIMIT 1',
    [id],
  )
  return rows[0] || null
}

export async function countAvailableKeys(productId: number) {
  const rows = await query<{ c: number }[]>(
    'SELECT COUNT(*) as c FROM product_keys WHERE product_id = ? AND is_sold = 0',
    [productId],
  )
  return rows[0]?.c ?? 0
}

export async function createProduct(params: {
  name: string
  price: number
  category: string
  sub_category?: string
  description?: string
  is_active?: boolean
}) {
  await ensureProductSchema()
  // 名称唯一检查
  const dup = await query<{ c: number }[]>(
    'SELECT COUNT(*) AS c FROM products WHERE name = ? LIMIT 1',
    [params.name],
  )
  if ((dup[0]?.c ?? 0) > 0) {
    throw new Error('Product name already exists')
  }
  // 子分类必填
  const sub = (params.sub_category ?? '').trim()
  if (!sub) {
    throw new Error('sub_category is required')
  }
  const desc = params.description ? params.description.trim() : null
  const result: any = await query(
    'INSERT INTO products (name, price, category, sub_category, description, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, 0)',
    [params.name, params.price, params.category, sub, desc, params.is_active === false ? 0 : 1],
  )
  // set sort_order = id for the new row
  if (result?.insertId) {
    await query('UPDATE products SET sort_order = ? WHERE id = ?', [result.insertId, result.insertId])
  }
  return getProductById(result?.insertId)
}

export async function updateProduct(
  id: number,
  patch: Partial<{ name: string; price: number; category: string; sub_category: string; description: string; is_active: boolean }>,
) {
  await ensureProductSchema()
  // 若更新名称，做唯一性检查（仅当名称确实变更且非空时）
  if (typeof patch.name === 'string' && patch.name.trim()) {
    const current = await getProductById(id)
    if (current && current.name === patch.name) {
      // 名称未变更则跳过唯一性检查
    } else {
      const dup = await query<{ c: number }[]>(
        'SELECT COUNT(*) AS c FROM products WHERE name = ? AND id <> ? LIMIT 1',
        [patch.name, id],
      )
      if ((dup[0]?.c ?? 0) > 0) {
        throw new Error('Product name already exists')
      }
    }
  }
  // 若更新子分类，要求非空
  if (typeof patch.sub_category === 'string' && !patch.sub_category.trim()) {
    throw new Error('sub_category is required')
  }
  const fields: string[] = []
  const values: any[] = []
  if (typeof patch.name === 'string') {
    fields.push('name = ?')
    values.push(patch.name)
  }
  if (typeof patch.price === 'number') {
    fields.push('price = ?')
    values.push(patch.price)
  }
  if (typeof patch.category === 'string') {
    fields.push('category = ?')
    values.push(patch.category)
  }
  if (typeof patch.sub_category === 'string') {
    fields.push('sub_category = ?')
    values.push(patch.sub_category)
  }
  if (typeof patch.description === 'string') {
    fields.push('description = ?')
    values.push(patch.description.trim() || null)
  }
  if (typeof patch.is_active === 'boolean') {
    fields.push('is_active = ?')
    values.push(patch.is_active ? 1 : 0)
  }
  if (!fields.length) return getProductById(id)
  values.push(id)
  await query(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, values)
  return getProductById(id)
}

export async function reorderProducts(ids: number[]) {
  await ensureProductSchema()
  const list = ids.filter((id) => Number.isFinite(id))
  if (!list.length) return { updated: 0 }
  // Build CASE expression for batch update
  const cases: string[] = []
  const params: any[] = []
  list.forEach((id, idx) => {
    cases.push('WHEN ? THEN ?')
    params.push(id, idx)
  })
  const inPlaceholders = list.map(() => '?').join(',')
  const sql = `UPDATE products SET sort_order = CASE id ${cases.join(' ')} ELSE sort_order END WHERE id IN (${inPlaceholders})`
  const res: any = await query(sql, [...params, ...list])
  return { updated: res?.affectedRows ?? 0 }
}

export async function deleteProductSafe(id: number, force = false) {
  await ensureProductSchema()
  // Only allow delete when inactive
  const rows = await query<ProductRecord[]>(
    'SELECT id, is_active FROM products WHERE id = ? LIMIT 1',
    [id],
  )
  const prod = rows[0]
  if (!prod) throw new Error('not found')
  if (Number(prod.is_active) === 1) throw new Error('product must be deactivated before delete')
  
  // 检查是否有密钥
  const keyCnt = await query<{ c: number }[]>(
    'SELECT COUNT(*) AS c FROM product_keys WHERE product_id = ? LIMIT 1',
    [id],
  )
  const hasKeys = (keyCnt[0]?.c ?? 0) > 0
  
  if (hasKeys && !force) {
    throw new Error('has_keys')
  }
  
  // 如果force=true，删除所有未售出的密钥，保留已售出的密钥
  if (force && hasKeys) {
    await query('DELETE FROM product_keys WHERE product_id = ? AND is_sold = 0', [id])
  }
  
  // 删除商品记录
  const res: any = await query('DELETE FROM products WHERE id = ? AND is_active = 0', [id])
  return { deleted: res?.affectedRows ?? 0 }
}

export async function importProductKeys(params: { productId: number; keys: string[] }) {
  if (!params.keys.length) return { inserted: 0 }
  // Start transaction
  await query('START TRANSACTION')
  try {
    let inserted = 0
    for (const key of params.keys) {
      const value = key.trim()
      if (!value) continue
      await query(
        'INSERT INTO product_keys (product_id, key_value, is_sold) VALUES (?, ?, 0)',
        [params.productId, value],
      )
      inserted++
    }
    await query('COMMIT')
    return { inserted }
  } catch (e) {
    await query('ROLLBACK')
    throw e
  }
}

export async function listProductKeys(options: {
  productId: number
  page?: number
  pageSize?: number
  status?: 'all' | 'available' | 'sold'
  search?: string
}) {
  const rawPage = Number(options.page ?? 1)
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1
  const rawPageSize = Number(options.pageSize ?? 20)
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(200, Math.floor(rawPageSize)) : 20
  const offset = (page - 1) * pageSize
  const where: string[] = ['pk.product_id = ?']
  const values: any[] = [options.productId]
  if (options.status === 'available') {
    where.push('pk.is_sold = 0')
  } else if (options.status === 'sold') {
    where.push('pk.is_sold = 1')
  }
  if (options.search && options.search.trim()) {
    where.push('pk.key_value LIKE ?')
    values.push(`%${options.search.trim()}%`)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const columns = await getProductKeyColumns()
  const hasSoldUserId = columns.has('sold_to_user_id')
  const hasSoldAt = columns.has('sold_at')
  const hasCreatedAt = columns.has('created_at')

  const soldUserExpr = hasSoldUserId
    ? 'COALESCE(pk.sold_to_user_id, o.user_id) AS sold_to_user_id'
    : 'o.user_id AS sold_to_user_id'
  const soldAtExpr = hasSoldAt
    ? 'COALESCE(pk.sold_at, o.created_at) AS sold_at'
    : 'o.created_at AS sold_at'
  const createdAtExpr = hasCreatedAt ? 'pk.created_at AS created_at' : 'NULL AS created_at'

  const rows = await query<ProductKeyRecord[]>(
    `SELECT
        pk.id,
        pk.product_id,
        pk.key_value,
        pk.is_sold,
        ${soldUserExpr},
        ${soldAtExpr},
        ${createdAtExpr}
     FROM product_keys pk
     LEFT JOIN orders o ON o.product_key_id = pk.id
     ${whereSql}
     GROUP BY pk.id
     ORDER BY pk.id DESC
     LIMIT ? OFFSET ?`,
    [...values, pageSize, offset],
  )
  const totalRows = await query<{ c: number }[]>(
    `SELECT COUNT(*) AS c FROM product_keys pk ${whereSql}`,
    values,
  )
  const total = totalRows[0]?.c ?? 0
  return { items: rows, total, page, pageSize }
}

export async function deleteProductKeys(productId: number, keyIds: number[]) {
  const ids = keyIds.filter((id) => Number.isFinite(id))
  if (!ids.length) return { deleted: 0 }
  const placeholders = ids.map(() => '?').join(',')
  const result: any = await query(
    `DELETE FROM product_keys WHERE product_id = ? AND is_sold = 0 AND id IN (${placeholders})`,
    [productId, ...ids],
  )
  return { deleted: result?.affectedRows ?? 0 }
}

export async function updateProductKeyValue(productId: number, keyId: number, newValue: string) {
  const value = String(newValue).trim()
  if (!value) return { updated: 0 }
  const result: any = await query(
    'UPDATE product_keys SET key_value = ? WHERE id = ? AND product_id = ? AND is_sold = 0',
    [value, keyId, productId],
  )
  return { updated: result?.affectedRows ?? 0 }
}
