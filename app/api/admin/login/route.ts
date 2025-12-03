import { NextResponse } from 'next/server'
import { verifyAdminLogin } from '@/lib/services/admin'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { username, password } = body
    
    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: '用户名和密码不能为空' },
        { status: 400 }
      )
    }
    
    const isValid = await verifyAdminLogin(username, password)
    
    if (isValid) {
      return NextResponse.json({ success: true, username })
    } else {
      return NextResponse.json(
        { success: false, error: '用户名或密码错误' },
        { status: 401 }
      )
    }
  } catch (error: any) {
    console.error('Login error:', error)
    return NextResponse.json(
      { success: false, error: '登录失败，请稍后重试' },
      { status: 500 }
    )
  }
}

