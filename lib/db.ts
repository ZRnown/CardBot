import mysql from 'mysql2/promise'
import { env } from './env'

let pool: mysql.Pool | null = null
let ensurePromise: Promise<void> | null = null

export function getDb() {
  if (!pool) {
    pool = mysql.createPool({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      connectionLimit: 10,
      charset: 'utf8mb4',
    })
  }
  return pool
}

async function ensureSchema() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const db = getDb()
      const [rows] = await db.query<any[]>(
        "SELECT COUNT(*) as c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'api_token'",
      )
      const exists = (rows as any)[0]?.c > 0
      if (!exists) {
        await db.query("ALTER TABLE `users` ADD COLUMN `api_token` VARCHAR(64) NULL AFTER `balance`")
        await db.query(
          "UPDATE `users` SET `api_token` = SUBSTRING(REPLACE(UUID(), '-', ''), 1, 32) WHERE `api_token` IS NULL OR `api_token` = ''",
        )
        await db.query("ALTER TABLE `users` MODIFY `api_token` VARCHAR(64) NOT NULL")
      }
      const [idx] = await db.query<any[]>(
        "SELECT COUNT(*) as c FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'uniq_users_api_token'",
      )
      const hasIndex = (idx as any)[0]?.c > 0
      if (!hasIndex) {
        try {
          await db.query("CREATE UNIQUE INDEX `uniq_users_api_token` ON `users` (`api_token`)")
        } catch (_) {}
      }
    })()
  }
  return ensurePromise
}

export async function query<T = any>(sql: string, params: any[] = []) {
  await ensureSchema()
  const [rows] = await getDb().query(sql, params)
  return rows as T
}
