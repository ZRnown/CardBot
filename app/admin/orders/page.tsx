"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search } from "lucide-react"
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination"

type ApiOrder = {
  id: number
  created_at: string
  amount: string
  username: string | null
  telegram_id: string
  product_id: number
  product_name: string
  product_category: string
  product_sub_category: string
  product_key_value: string
}

type ListResp = { ok: boolean; data: { items: ApiOrder[]; total: number; page: number; pageSize: number } }

export default function AdminOrdersPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [timeFilter, setTimeFilter] = useState("all")
  const [orders, setOrders] = useState<ApiOrder[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 10
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailOrder, setDetailOrder] = useState<ApiOrder | null>(null)

  const fmtTime = (s: string | null | undefined) => {
    if (!s) return '-'
    const d = new Date(s)
    if (isNaN(d.getTime())) return s as string
    return d.toLocaleString()
  }

  async function loadOrders(p = page, s = searchTerm) {
    const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize), search: s })
    const res = await fetch(`/api/admin/orders?${params.toString()}`)
    if (!res.ok) throw new Error(await res.text())
    const json: ListResp = await res.json()
    setOrders(json.data.items)
    setTotal(json.data.total)
    setPage(json.data.page)
  }

  useEffect(() => {
    loadOrders().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalAmount = useMemo(() => orders.reduce((sum, o) => sum + Number(o.amount), 0), [orders])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">订单流水</h2>
        <p className="text-muted-foreground">查看所有销售记录，方便对账</p>
      </div>

      {/* 简单统计 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{total}</div>
            <p className="text-xs text-muted-foreground">总订单数</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{totalAmount.toFixed(2)} USDT</div>
            <p className="text-xs text-muted-foreground">总销售额</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{(total ? totalAmount / total : 0).toFixed(2)} USDT</div>
            <p className="text-xs text-muted-foreground">平均订单金额</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>订单记录</CardTitle>
          <CardDescription>所有成功的销售记录</CardDescription>
        </CardHeader>
        <CardContent>
          {/* 搜索和筛选 */}
          <div className="flex items-center space-x-4 mb-6">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索用户或商品..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <button className="px-3 py-2 border rounded" onClick={() => loadOrders(1, searchTerm)}>搜索</button>
            <Select value={timeFilter} onValueChange={setTimeFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="时间筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部时间</SelectItem>
                <SelectItem value="today">今天</SelectItem>
                <SelectItem value="week">本周</SelectItem>
                <SelectItem value="month">本月</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 订单表格 */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>订单时间</TableHead>
                  <TableHead>用户 (ID/用户名)</TableHead>
                  <TableHead>售出商品</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => {
                  const telegramId = order.telegram_id ? String(order.telegram_id) : ""
                  const telegramPreview = telegramId ? `${telegramId.slice(0, 6)}${telegramId.length > 6 ? "..." : ""}` : "-"
                  return (
                    <TableRow key={order.id}>
                      <TableCell>{fmtTime(order.created_at)}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{order.username || '-'}</div>
                          <div className="text-sm text-muted-foreground font-mono">({telegramPreview})</div>
                        </div>
                      </TableCell>
                      <TableCell>{order.product_name}</TableCell>
                      <TableCell className="font-medium text-green-600">{Number(order.amount).toFixed(2)} USDT</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setDetailOrder(order); setDetailOpen(true) }}
                        >详情</Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {orders.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">没有找到匹配的订单记录</div>
          )}

          {/* 分页 */}
          <div className="mt-4">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); if (page > 1) loadOrders(page - 1, searchTerm) }} />
                </PaginationItem>
                {Array.from({ length: Math.max(1, Math.ceil(total / pageSize)) }).slice(0, 5).map((_, idx) => {
                  const p = idx + 1
                  return (
                    <PaginationItem key={p}>
                      <PaginationLink href="#" isActive={p === page} onClick={(e) => { e.preventDefault(); loadOrders(p, searchTerm) }}>
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  )
                })}
                <PaginationItem>
                  <PaginationNext href="#" onClick={(e) => { e.preventDefault(); const max = Math.max(1, Math.ceil(total / pageSize)); if (page < max) loadOrders(page + 1, searchTerm) }} />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </CardContent>
      </Card>

      {/* 订单详情对话框 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>订单详情</DialogTitle>
            <DialogDescription>查看该订单的商品与卡密信息</DialogDescription>
          </DialogHeader>
          {detailOrder ? (
            <div className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">订单时间：</span>{fmtTime(detailOrder.created_at)}</div>
              <div><span className="text-muted-foreground">用户：</span>{detailOrder.username || '-'} <span className="text-muted-foreground">(ID: {detailOrder.telegram_id})</span></div>
              <div><span className="text-muted-foreground">商品：</span>{detailOrder.product_name}</div>
              <div><span className="text-muted-foreground">分类：</span>{detailOrder.product_category || '-'}</div>
              <div><span className="text-muted-foreground">子分类：</span>{detailOrder.product_sub_category || '-'}</div>
              <div><span className="text-muted-foreground">金额：</span>{Number(detailOrder.amount).toFixed(2)} USDT</div>
              <div>
                <div className="text-muted-foreground">售出卡密：</div>
                <div className="font-mono break-all border rounded p-2 bg-muted/20">{detailOrder.product_key_value}</div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
