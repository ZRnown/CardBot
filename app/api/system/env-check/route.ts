import { NextResponse } from 'next/server'
import { getEpusdtEnvStatus } from '@/lib/services/epusdt'

export async function GET() {
  try {
    const status = getEpusdtEnvStatus()
    const data = {
      EPUSDT_BASE_URL: status.EPUSDT_BASE_URL,
      EPUSDT_TOKEN: status.EPUSDT_TOKEN,
      EPUSDT_NOTIFY_URL: status.EPUSDT_NOTIFY_URL,
      EPUSDT_REDIRECT_URL: status.EPUSDT_REDIRECT_URL,
    }
    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}
