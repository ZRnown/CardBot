"use client"

import { useEffect, useMemo, useState } from "react"

function classNames(...xs: Array<string | false | null | undefined>) { return xs.filter(Boolean).join(" ") }

export default function PaymentOrderPage({ params }: { params: { orderId: string } }) {
  const orderId = decodeURIComponent(params.orderId || "")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<any | null>(null)

  const qrUrl = useMemo(() => {
    const url = status?.paymentUrl as string | undefined
    if (!url) return ""
    return `https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(url)}`
  }, [status])

  async function fetchStatus() {
    try {
      setError(null)
      const res = await fetch(`/api/payments/epusdt/status?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" })
      const text = await res.text()
      if (!res.ok) throw new Error(text)
      const json = JSON.parse(text)
      setStatus(json.data)
    } catch (e: any) {
      setError(e?.message || "加载失败")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!orderId) return
    fetchStatus()
    const t = setInterval(fetchStatus, 4000)
    return () => clearInterval(t)
  }, [orderId])

  const paid = status?.status === 'paid'
  const expired = status?.status === 'expired'

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-4">
        <h1 className="text-2xl font-bold">订单支付</h1>
        <div className="rounded border p-4 space-y-3">
          <div className="text-sm text-gray-600">订单号：{orderId}</div>
          {loading ? (
            <div className="text-sm text-gray-500">正在加载…</div>
          ) : error ? (
            <div className="text-sm text-red-600 break-all">{error}</div>
          ) : (
            <>
              <div className="space-y-1 text-sm">
                <div>金额：<b>{status?.amount}</b></div>
                <div>应付：<b>{status?.actualAmount ?? status?.amount}</b> {status?.token ? "USDT" : "USDT"}</div>
                {status?.blockTransactionId ? (
                  <div>区块交易号：{status.blockTransactionId}</div>
                ) : null}
                <div>状态：<b>{String(status?.status)}</b></div>
              </div>

              {!paid && !expired && (
                <div className="flex flex-col items-center gap-3">
                  {qrUrl ? (
                    <img src={qrUrl} alt="支付二维码" className="w-[260px] h-[260px] border rounded" />
                  ) : null}
                  {status?.paymentUrl ? (
                    <a className="text-blue-600 underline break-all" href={status.paymentUrl} target="_blank" rel="noreferrer">
                      打开收银台链接
                    </a>
                  ) : (
                    <div className="text-sm text-gray-500">暂无支付链接</div>
                  )}
                  <div className="text-xs text-gray-500">请在有效期内完成支付，页面会自动刷新状态</div>
                </div>
              )}

              {paid && (
                <div className={classNames("rounded p-3", "bg-green-50 text-green-700 border border-green-200")}>支付成功，您可以关闭此页面。</div>
              )}
              {expired && (
                <div className={classNames("rounded p-3", "bg-yellow-50 text-yellow-700 border border-yellow-200")}>订单已过期，请重新发起。</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
