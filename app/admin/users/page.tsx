"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Search, DollarSign, BadgeCheck } from "lucide-react"
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination"

type ApiUser = { id: number; telegram_id: string; username: string | null; balance: string; api_token: string; created_at: string }
type Tier = { levelLabel: 'L1'|'L2'|'L3'|'L4'; minSingleTopup: number; price: number }
type Pricing = { levelLabel: Tier['levelLabel']; price: number; maxSingleTopup: number; override?: boolean }
type ListResp = { ok: boolean; data: { items: ApiUser[]; total: number; page: number; pageSize: number } }

export default function UsersPage() {
  const fmtTime = (s: string | null | undefined) => {
    if (!s) return '-'
    const d = new Date(s)
    if (isNaN(d.getTime())) return s as string
    return d.toLocaleString()
  }
  const [users, setUsers] = useState<ApiUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedUser, setSelectedUser] = useState<ApiUser | null>(null)
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false)
  const [adjustAmount, setAdjustAmount] = useState("")
  const [remark, setRemark] = useState("")
  const [tiers, setTiers] = useState<Tier[]>([])
  const [levelDialogOpen, setLevelDialogOpen] = useState(false)
  const [userPricing, setUserPricing] = useState<Pricing | null>(null)
  const [newLevel, setNewLevel] = useState<'' | Tier['levelLabel']>('')
  const [pricingMap, setPricingMap] = useState<Record<number, Pricing>>({})

  async function loadUsers(p = page, s = searchTerm) {
    const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize), search: s })
    const res = await fetch(`/api/admin/users?${params.toString()}`)
    if (!res.ok) throw new Error(await res.text())
    const json: ListResp = await res.json()
    setUsers(json.data.items)
    setTotal(json.data.total)
    setPage(json.data.page)
    // 清空本页的定价缓存，稍后批量加载
    const nextMap: Record<number, Pricing> = {}
    setPricingMap(nextMap)
    // 并行获取每个用户的等级定价
    try {
      const results = await Promise.all(
        json.data.items.map(async (u) => {
          try {
            const r = await fetch(`/api/admin/users/level?userId=${u.id}`)
            if (!r.ok) return null
            const j = await r.json()
            return { id: u.id, pricing: j.data?.pricing as Pricing }
          } catch {
            return null
          }
        }),
      )
      const map: Record<number, Pricing> = {}
      for (const item of results) {
        if (item && item.pricing) map[item.id] = item.pricing
      }
      setPricingMap(map)
    } catch {}
  }

  useEffect(() => {
    loadUsers().catch(() => {})
    ;(async () => {
      try {
        const r = await fetch('/api/system/cid-pricing')
        if (r.ok) {
          const j = await r.json()
          setTiers(j.data.tiers)
        }
      } catch {}
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openBalanceDialog = (user: ApiUser) => {
    setSelectedUser(user)
    setBalanceDialogOpen(true)
    setAdjustAmount("")
    setRemark("")
  }

  const handleAdjustBalance = async () => {
    if (!selectedUser || !adjustAmount) return
    const amount = Number.parseFloat(adjustAmount)
    if (!Number.isFinite(amount) || amount === 0) return
    try {
      const res = await fetch('/api/admin/users/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUser.id, amount, remark: remark.trim() || undefined }),
      })
      if (!res.ok) throw new Error(await res.text())
      setBalanceDialogOpen(false)
      setSelectedUser(null)
      await loadUsers(page, searchTerm)
    } catch (e) {
      // ignore simple toast in this component to keep it light; API should return appropriate error
    }
  }

  const openLevelDialog = async (user: ApiUser) => {
    setSelectedUser(user)
    setLevelDialogOpen(true)
    setUserPricing(null)
    setNewLevel('')
    try {
      const r = await fetch(`/api/admin/users/level?userId=${user.id}`)
      if (r.ok) {
        const j = await r.json()
        setUserPricing(j.data.pricing)
      }
    } catch {}
  }

  const handleSaveLevel = async () => {
    if (!selectedUser) return
    try {
      const body: any = { userId: selectedUser.id }
      if (newLevel) body.levelLabel = newLevel
      const r = await fetch('/api/admin/users/level', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) throw new Error(await r.text())
      // refresh pricing
      const j = await (await fetch(`/api/admin/users/level?userId=${selectedUser.id}`)).json()
      setUserPricing(j.data.pricing)
      setNewLevel('')
    } catch {}
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">用户与充值管理</h2>
        <p className="text-muted-foreground">查找用户并为他们手动充值；查看与调整用户等级</p>
      </div>

      {/* 系统分级表（已按要求暂时移除展示，仅保留后端接口便于二次开发） */}

      <Card>
        <CardHeader>
          <CardTitle>用户列表</CardTitle>
          <CardDescription>通过 Telegram ID 或用户名快速找到用户</CardDescription>
        </CardHeader>
        <CardContent>
          {/* 搜索栏 */}
          <div className="flex items-center space-x-2 mb-6">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索 Telegram ID 或用户名..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button onClick={() => loadUsers(1, searchTerm)}>搜索</Button>
          </div>

          {/* 用户表格 */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Telegram ID</TableHead>
                  <TableHead>用户名</TableHead>
                  <TableHead>余额 (USDT)</TableHead>
                  <TableHead>等级</TableHead>
                  <TableHead>注册时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-mono">{user.telegram_id}</TableCell>
                    <TableCell>{user.username || user.telegram_id}</TableCell>
                    <TableCell>
                      <span className={Number(user.balance) > 0 ? "text-green-600 font-medium" : "text-muted-foreground"}>
                        {Number(user.balance).toFixed(2)} USDT
                      </span>
                    </TableCell>
                    <TableCell>
                      {pricingMap[user.id] ? (
                        <span className="font-mono">
                          {pricingMap[user.id].levelLabel}
                          <span className="text-muted-foreground">（{pricingMap[user.id].price.toFixed(3)}）</span>
                          {pricingMap[user.id].override ? <span className="ml-1 text-amber-600 text-xs">已覆盖</span> : null}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">加载中...</span>
                      )}
                    </TableCell>
                    <TableCell>{fmtTime(user.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => openBalanceDialog(user)}>
                        <DollarSign className="h-3 w-3 mr-1" />
                        调整余额
                      </Button>
                      <Button variant="outline" size="sm" className="ml-2" onClick={() => openLevelDialog(user)}>
                        <BadgeCheck className="h-3 w-3 mr-1" />
                        等级
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {users.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">没有找到匹配的用户</div>
          )}

          {/* 分页 */}
          <div className="mt-4">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); if (page > 1) loadUsers(page - 1, searchTerm) }} />
                </PaginationItem>
                {Array.from({ length: Math.max(1, Math.ceil(total / pageSize)) }).slice(0, 5).map((_, idx) => {
                  const p = idx + 1
                  return (
                    <PaginationItem key={p}>
                      <PaginationLink href="#" isActive={p === page} onClick={(e) => { e.preventDefault(); loadUsers(p, searchTerm) }}>
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  )
                })}
                <PaginationItem>
                  <PaginationNext href="#" onClick={(e) => { e.preventDefault(); const max = Math.max(1, Math.ceil(total / pageSize)); if (page < max) loadUsers(page + 1, searchTerm) }} />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </CardContent>
      </Card>

      {/* 等级查看/调整对话框 */}
      <Dialog open={levelDialogOpen} onOpenChange={setLevelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>用户等级</DialogTitle>
            <DialogDescription>
              {selectedUser ? `${selectedUser.username || '-'} (${selectedUser.telegram_id})` : '-'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm">
              当前：{userPricing ? `${userPricing.levelLabel}（${userPricing.price.toFixed(3)} USDT/次）` : '加载中...'} {userPricing?.override ? '(已手动覆盖)' : ''}
            </div>
            <div className="text-xs text-muted-foreground">历史单笔最大充值：{userPricing ? `${userPricing.maxSingleTopup.toFixed(2)} USDT` : '-'}</div>
            <div>
              <Label htmlFor="level-select">设置覆盖等级（留空为取消覆盖）</Label>
              <select id="level-select" className="border rounded px-2 py-1 w-full" value={newLevel} onChange={(e) => setNewLevel(e.target.value as any)}>
                <option value="">（不覆盖，按历史单笔最大充值决定）</option>
                {tiers.map(t => (
                  <option key={t.levelLabel} value={t.levelLabel}>{t.levelLabel} — {t.price.toFixed(3)} USDT/次</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLevelDialogOpen(false)}>关闭</Button>
            <Button onClick={handleSaveLevel}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 调整余额对话框 */}
      <Dialog open={balanceDialogOpen} onOpenChange={setBalanceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>调整余额</DialogTitle>
            <DialogDescription>
              为用户 {selectedUser?.username || '-'} ({selectedUser?.telegram_id || '-'}) 调整余额
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="current-balance">当前余额</Label>
              <Input id="current-balance" value={`${selectedUser ? Number(selectedUser.balance).toFixed(2) : "0.00"} USDT`} disabled />
            </div>
            <div>
              <Label htmlFor="adjust-amount">调整金额</Label>
              <Input
                id="adjust-amount"
                type="number"
                step="0.01"
                placeholder="输入正数充值，负数扣款"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
              />
              <div className="text-xs text-muted-foreground mt-1">正数为充值，负数为扣款</div>
            </div>
            <div>
              <Label htmlFor="remark">备注 (可选)</Label>
              <Input
                id="remark"
                placeholder="例如：USDT充值"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBalanceDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleAdjustBalance}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
