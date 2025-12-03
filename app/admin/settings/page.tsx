"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { CheckCircle2, XCircle } from "lucide-react"
import { toast } from "@/components/ui/use-toast"

async function fetchJSON<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init)
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

export default function SettingsPage() {
  const [envCheck, setEnvCheck] = useState<{ [k: string]: boolean } | null>(null)
  const [sysLoading, setSysLoading] = useState(false)
  const [startTemplateHtml, setStartTemplateHtml] = useState("")
  const [paymentAddress, setPaymentAddress] = useState("")
  const [supportContact, setSupportContact] = useState("")
  
  async function loadEnv() {
    try {
      const res = await fetchJSON<{ ok: boolean; data: any }>("/api/system/env-check")
      setEnvCheck(res.data)
    } catch (_) {
      setEnvCheck(null)
    }
  }

  async function loadSystemSettings() {
    try {
      setSysLoading(true)
      const res = await fetchJSON<{ ok: boolean; data: { startTemplateHtml: string; paymentAddress: string; supportContact: string } }>(
        "/api/system/settings",
      )
      setStartTemplateHtml(res.data.startTemplateHtml || "")
      setPaymentAddress(res.data.paymentAddress || "")
      setSupportContact(res.data.supportContact || "")
    } catch (e: any) {
      toast({ title: "获取设置失败", description: e?.message || "无法读取系统设置" })
    } finally {
      setSysLoading(false)
    }
  }

  useEffect(() => {
    loadEnv()
    loadSystemSettings()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">系统设置</h2>
        <p className="text-muted-foreground">管理系统关键配置与支付参数</p>
      </div>
      {/* Telegram Bot Start 文案设置 */}
      <Card>
        <CardHeader>
          <CardTitle>Telegram Bot 设置</CardTitle>
          <CardDescription>配置 Start 页面模板（HTML），保存后立即生效。支持占位符替换，见下方说明。</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              try {
                setSysLoading(true)
                const res = await fetch("/api/system/settings", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ startTemplateHtml, paymentAddress, supportContact }),
                })
                if (!res.ok) throw new Error(await res.text())
                toast({ title: "已保存", description: "机器人设置已更新" })
              } catch (err: any) {
                toast({ title: "保存失败", description: err?.message || "请稍后再试" })
              } finally {
                setSysLoading(false)
              }
            }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="startTemplateHtml">Start 页面模板（HTML）</Label>
              <Textarea
                id="startTemplateHtml"
                value={startTemplateHtml}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setStartTemplateHtml(e.target.value)}
                rows={10}
                placeholder={"例如：\n👋 Hello, {username}!\n\n👤 <b>User ID:</b> <span class=\"tg-spoiler\"><code>{telegramId}</code></span>\n💰 <b>Balance:</b> <code>{balance} USDT</code>\n\n🧭 Menu Commands:\n\n🛒 /BuyKey — Get a new product key\n\n🤖 /getCID — Submit Installation ID & get confirmation ID\n\n🗝 /CheckKey — Validate your product key\n\n💳 /Pay — Add funds to your wallet\n\nℹ️ For questions or help, contact: {contact}"}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                可用占位符：
                <code className="mx-1">{`{username}`}</code>（用户名或用户ID）
                <code className="mx-1">{`{telegramId}`}</code>（用户ID，系统会自动加密成 spoiler）
                <code className="mx-1">{`{balance}`}</code>（账户余额，单位 USDT）
                <code className="mx-1">{`{level}`}</code>（当前折扣等级）
                <code className="mx-1">{`{cidPrice}`}</code>（当前单价，单位 USDT/次）
                <code className="mx-1">{`{maxSingleTopup}`}</code>（单笔最高充值以触发更高等级）
                <code className="mx-1">{`{contact}`}</code>（联系方式，占位，默认空）
              </p>
            </div>
            <div>
              <Label htmlFor="paymentAddress">收款地址 (USDT TRC20)</Label>
              <Input
                id="paymentAddress"
                value={paymentAddress}
                onChange={(e) => setPaymentAddress(e.target.value)}
                placeholder="例如：TAtyBe1cVLneoaPfkCC2KJFzEPFofХMU65"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                设置支付时显示的收款地址。此地址将以文字和二维码形式展示给用户。
              </p>
            </div>
            <div>
              <Label htmlFor="supportContact">客服联系方式</Label>
              <Textarea
                id="supportContact"
                value={supportContact}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSupportContact(e.target.value)}
                rows={4}
                placeholder="例如：\n📧 邮箱：support@example.com\n💬 Telegram：@CustomerService\n⏰ 工作时间：9:00-18:00"
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                设置客服联系方式，用户点击"联系客服"时显示。支持多行文本。
              </p>
            </div>
            <div>
              <Button type="submit" disabled={sysLoading}>{sysLoading ? "保存中…" : "保存设置"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 系统配置检查 */}
      <Card>
        <CardHeader>
          <CardTitle>系统配置检查</CardTitle>
          <CardDescription>检测关键环境变量与数据库连接是否就绪</CardDescription>
        </CardHeader>
        <CardContent>
          {envCheck ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(envCheck).map(([k, v]) => (
                <div key={k} className="flex items-center space-x-2">
                  {v ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  <span className="text-sm">{k}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">正在检测或加载失败…</div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
