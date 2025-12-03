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
      
      // 首先检查 users 表是否存在
      const [tableCheck] = await db.query<any[]>(
        "SELECT COUNT(*) as c FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'",
      )
      const tableExists = (tableCheck as any)[0]?.c > 0
      
      if (!tableExists) {
        // 如果表不存在，创建完整的 users 表
        await db.query(`
          CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            telegram_id VARCHAR(191) NOT NULL UNIQUE,
            username VARCHAR(191) NULL,
            balance DECIMAL(18,2) NOT NULL DEFAULT 0.00,
            api_token VARCHAR(64) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_telegram_id (telegram_id),
            UNIQUE INDEX uniq_users_api_token (api_token)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `)
        
        // 为现有记录生成 api_token（虽然表刚创建时应该没有记录，但为了安全起见）
        await db.query(
          "UPDATE `users` SET `api_token` = SUBSTRING(REPLACE(UUID(), '-', ''), 1, 32) WHERE `api_token` IS NULL OR `api_token` = ''",
        )
      } else {
        // 表存在，检查 api_token 列是否存在
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
        
        // 确保唯一索引存在
        const [idx] = await db.query<any[]>(
          "SELECT COUNT(*) as c FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'uniq_users_api_token'",
        )
        const hasIndex = (idx as any)[0]?.c > 0
        if (!hasIndex) {
          try {
            await db.query("CREATE UNIQUE INDEX `uniq_users_api_token` ON `users` (`api_token`)")
          } catch (_) {}
        }
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
