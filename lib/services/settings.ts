import { query } from '@/lib/db'

interface SettingRecord {
  value: string
}

let ensured = false

async function ensureTable() {
  if (ensured) return
  await query(
    `CREATE TABLE IF NOT EXISTS settings (
      setting_key VARCHAR(191) NOT NULL PRIMARY KEY,
      setting_value TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  )
  ensured = true
}

export async function getSetting(key: string) {
  await ensureTable()
  const rows = await query<SettingRecord[]>(
    'SELECT setting_value AS value FROM settings WHERE setting_key = ? LIMIT 1',
    [key],
  )
  return rows[0]?.value ?? null
}

export async function setSetting(key: string, value: string | null) {
  await ensureTable()
  if (value === null) {
    await query('DELETE FROM settings WHERE setting_key = ?', [key])
    return
  }
  await query(
    'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
    [key, value],
  )
}
