import { NextResponse } from 'next/server'
import { changeAdminPassword } from '@/lib/services/admin'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { username, oldPassword, newPassword } = body
    
    if (!username || !oldPassword || !newPassword) {
      return NextResponse.json(
        { success: false, error: '所有字段都不能为空' },
        { status: 400 }
      )
    }
    
    const result = await changeAdminPassword(username, oldPassword, newPassword)
    
    if (result.success) {
      return NextResponse.json({ success: true, message: '密码修改成功' })
    } else {
      return NextResponse.json(
        { success: false, error: result.error || '密码修改失败' },
        { status: 400 }
      )
    }
  } catch (error: any) {
    console.error('Change password error:', error)
    return NextResponse.json(
      { success: false, error: '密码修改失败，请稍后重试' },
      { status: 500 }
    )
  }
}

