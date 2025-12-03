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

async function tableExists(db: mysql.Pool, tableName: string): Promise<boolean> {
  const [rows] = await db.query<any[]>(
    "SELECT COUNT(*) as c FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
    [tableName],
  )
  return (rows as any)[0]?.c > 0
}

async function ensureSchema() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const db = getDb()
      
      // 确保 users 表存在
      const usersExists = await tableExists(db, 'users')
      if (!usersExists) {
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
      
      // 确保 products 表存在
      const productsExists = await tableExists(db, 'products')
      if (!productsExists) {
        await db.query(`
          CREATE TABLE IF NOT EXISTS products (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(191) NOT NULL UNIQUE,
            price DECIMAL(18,2) NOT NULL,
            category VARCHAR(191) NOT NULL,
            sub_category VARCHAR(255) NOT NULL DEFAULT '',
            description TEXT NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            sort_order INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_category (category),
            INDEX idx_is_active (is_active)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `)
      }
      
      // 确保 product_keys 表存在
      const productKeysExists = await tableExists(db, 'product_keys')
      if (!productKeysExists) {
        await db.query(`
          CREATE TABLE IF NOT EXISTS product_keys (
            id INT AUTO_INCREMENT PRIMARY KEY,
            product_id INT NOT NULL,
            key_value TEXT NOT NULL,
            is_sold TINYINT(1) NOT NULL DEFAULT 0,
            sold_to_user_id INT NULL,
            sold_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_product_id (product_id),
            INDEX idx_is_sold (is_sold),
            INDEX idx_product_sold (product_id, is_sold)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `)
      }
      
      // 确保 orders 表存在
      const ordersExists = await tableExists(db, 'orders')
      if (!ordersExists) {
        await db.query(`
          CREATE TABLE IF NOT EXISTS orders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            product_key_id INT NOT NULL,
            amount DECIMAL(18,2) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_user_id (user_id),
            INDEX idx_product_key_id (product_key_id),
            INDEX idx_created_at (created_at)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `)
      }
      
      // 确保 transactions 表存在
      const transactionsExists = await tableExists(db, 'transactions')
      if (!transactionsExists) {
        await db.query(`
          CREATE TABLE IF NOT EXISTS transactions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            type VARCHAR(50) NOT NULL,
            amount DECIMAL(18,2) NOT NULL,
            description TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_user_id (user_id),
            INDEX idx_type (type),
            INDEX idx_created_at (created_at)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `)
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
