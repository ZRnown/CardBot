import { query } from '@/lib/db'
import crypto from 'crypto'

interface AdminRecord {
  id: number
  username: string
  password_hash: string
  created_at: string
  updated_at: string
}

// 确保管理员表存在
async function ensureAdminTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS admins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  
  // 检查是否有默认管理员，如果没有则创建
  const rows = await query<AdminRecord[]>('SELECT COUNT(*) as count FROM admins')
  const count = (rows[0] as any).count || 0
  
  if (count === 0) {
    // 创建默认管理员 admin / admin123
    const defaultPasswordHash = hashPassword('admin123')
    await query(
      'INSERT INTO admins (username, password_hash) VALUES (?, ?)',
      ['admin', defaultPasswordHash]
    )
  }
}

// 密码哈希函数
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex')
}

// 验证管理员登录
export async function verifyAdminLogin(username: string, password: string): Promise<boolean> {
  await ensureAdminTable()
  
  const passwordHash = hashPassword(password)
  const rows = await query<AdminRecord[]>(
    'SELECT id FROM admins WHERE username = ? AND password_hash = ? LIMIT 1',
    [username, passwordHash]
  )
  
  return rows.length > 0
}

// 修改管理员密码
export async function changeAdminPassword(username: string, oldPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  await ensureAdminTable()
  
  // 验证旧密码
  const isValid = await verifyAdminLogin(username, oldPassword)
  if (!isValid) {
    return { success: false, error: '旧密码错误' }
  }
  
  // 密码强度检查
  if (newPassword.length < 6) {
    return { success: false, error: '新密码长度至少6个字符' }
  }
  
  // 更新密码
  const newPasswordHash = hashPassword(newPassword)
  await query(
    'UPDATE admins SET password_hash = ? WHERE username = ?',
    [newPasswordHash, username]
  )
  
  return { success: true }
}

// 获取管理员信息
export async function getAdminByUsername(username: string): Promise<AdminRecord | null> {
  await ensureAdminTable()
  
  const rows = await query<AdminRecord[]>(
    'SELECT id, username, created_at, updated_at FROM admins WHERE username = ? LIMIT 1',
    [username]
  )
  
  return rows[0] || null
}

