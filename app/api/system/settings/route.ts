import { NextResponse } from 'next/server'
import { getSetting, setSetting } from '@/lib/services/settings'

export async function GET() {
  try {
    const startTemplateHtml = (await getSetting('START_TEMPLATE_HTML')) || ''
    const paymentAddress = (await getSetting('PAYMENT_ADDRESS')) || ''
    const supportContact = (await getSetting('SUPPORT_CONTACT')) || ''
    return NextResponse.json({ ok: true, data: { startTemplateHtml, paymentAddress, supportContact } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Internal Error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const startTemplateHtml = typeof body.startTemplateHtml === 'string' ? body.startTemplateHtml : ''
    const paymentAddress = typeof body.paymentAddress === 'string' ? body.paymentAddress : ''
    const supportContact = typeof body.supportContact === 'string' ? body.supportContact : ''
    await setSetting('START_TEMPLATE_HTML', startTemplateHtml)
    await setSetting('PAYMENT_ADDRESS', paymentAddress)
    await setSetting('SUPPORT_CONTACT', supportContact)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Internal Error' }, { status: 500 })
  }
}
