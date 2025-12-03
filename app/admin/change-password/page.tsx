"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2, AlertCircle } from "lucide-react"

export default function ChangePasswordPage() {
  const [oldPassword, setOldPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSuccess(false)

    // 客户端验证
    if (newPassword.length < 6) {
      setError("新密码长度至少6个字符")
      setLoading(false)
      return
    }

    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致")
      setLoading(false)
      return
    }

    if (oldPassword === newPassword) {
      setError("新密码不能与旧密码相同")
      setLoading(false)
      return
    }

    try {
      // 从 localStorage 获取用户名
      const username = localStorage.getItem("adminUsername") || "admin"
      
      const res = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, oldPassword, newPassword }),
      })

      const data = await res.json()

      if (data.success) {
        setSuccess(true)
        // 清空表单
        setOldPassword("")
        setNewPassword("")
        setConfirmPassword("")
        
        // 3秒后返回
        setTimeout(() => {
          router.push("/admin")
        }, 2000)
      } else {
        setError(data.error || "密码修改失败")
      }
    } catch (err) {
      setError("网络错误，请稍后重试")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">修改密码</h2>
        <p className="text-muted-foreground">更新您的登录密码以保护账户安全</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>密码设置</CardTitle>
          <CardDescription>请输入旧密码和新密码</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="oldPassword">旧密码</Label>
              <Input
                id="oldPassword"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="请输入旧密码"
                required
                disabled={loading || success}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">新密码</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="请输入新密码（至少6个字符）"
                required
                disabled={loading || success}
              />
              <p className="text-xs text-muted-foreground">密码长度至少6个字符</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认新密码</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="请再次输入新密码"
                required
                disabled={loading || success}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="border-green-500 bg-green-50 text-green-900">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription>密码修改成功！即将返回...</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-4">
              <Button type="submit" disabled={loading || success}>
                {loading ? "修改中..." : "确认修改"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/admin")}
                disabled={loading}
              >
                取消
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

