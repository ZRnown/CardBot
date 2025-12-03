"use client"

import { FormEvent, useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/ui/use-toast"
import { Plus, Package, Edit, Trash2, CheckCircle2, XCircle, ArrowUp, ArrowDown } from "lucide-react"

type ApiProduct = { id: number; name: string; price: string; category: string; sub_category: string; description?: string; is_active: 0|1|boolean; created_at: string }
type ApiProductKey = {
  id: number
  key_value: string
  is_sold: 0 | 1 | boolean
  sold_to_user_id: number | null
  sold_at: string | null
  created_at: string
}

async function fetchJSON<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init)
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Array<ApiProduct & { stock: number }>>([])
  const [newProductOpen, setNewProductOpen] = useState(false)
  const [stockDialogOpen, setStockDialogOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<ApiProduct | null>(null)
  const [newKeys, setNewKeys] = useState("")
  const [loading, setLoading] = useState(false)
  const [envCheck, setEnvCheck] = useState<{[k: string]: boolean} | null>(null)
  // 已按你的要求移除管理员余额调整相关状态与界面
  const [editOpen, setEditOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<ApiProduct | null>(null)
  const [editName, setEditName] = useState("")
  const [editPrice, setEditPrice] = useState("")
  const [editCategory, setEditCategory] = useState("")
  const [editSubCategory, setEditSubCategory] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [inventoryDialogOpen, setInventoryDialogOpen] = useState(false)
  const [inventoryProduct, setInventoryProduct] = useState<ApiProduct | null>(null)
  const [inventoryKeys, setInventoryKeys] = useState<ApiProductKey[]>([])
  const [inventoryTotal, setInventoryTotal] = useState(0)
  const [inventoryPage, setInventoryPage] = useState(1)
  const [inventoryStatus, setInventoryStatus] = useState<'all' | 'available' | 'sold'>('all')
  const [inventorySearch, setInventorySearch] = useState("")
  const inventoryPageSize = 20
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [inventorySelected, setInventorySelected] = useState<number[]>([])
  const [editingKeyId, setEditingKeyId] = useState<number | null>(null)
  const [editingKeyValue, setEditingKeyValue] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("")
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>("")

  async function loadProducts() {
    setLoading(true)
    try {
      const data = await fetchJSON<{ ok: boolean; data: Array<ApiProduct & { stock: number }> }>("/api/products/with-stock")
      setProducts(data.data)
    } finally {
      setLoading(false)
    }
  }

  // 分类与过滤
  const categories = Array.from(new Set(products.map(p => String(p.category || '').trim()).filter(Boolean))).sort()
  const subCategories = Array.from(new Set(products
    .filter(p => !selectedCategory || String(p.category || '') === selectedCategory)
    .map(p => String(p.sub_category || '').trim())
    .filter(Boolean)
  )).sort()
  const filteredProducts = products.filter(p => {
    if (selectedCategory && String(p.category || '') !== selectedCategory) return false
    if (selectedSubCategory && String(p.sub_category || '') !== selectedSubCategory) return false
    return true
  })

  // 保存排序
  const saveOrder = async (list: Array<ApiProduct & { stock: number }>) => {
    const ids = list.map(p => p.id)
    try {
      const res = await fetch('/api/products/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error(await res.text())
      toast({ title: '排序已保存', description: '产品顺序已更新' })
      await loadProducts()
    } catch (e: any) {
      toast({ title: '排序保存失败', description: e?.message || '网络错误' })
    }
  }

  const moveUp = async (product: ApiProduct) => {
    const idx = products.findIndex(p => p.id === product.id)
    if (idx <= 0) return
    const next = products.slice()
    const tmp = next[idx - 1]
    next[idx - 1] = next[idx]
    next[idx] = tmp
    setProducts(next)
    await saveOrder(next)
  }

  const moveDown = async (product: ApiProduct) => {
    const idx = products.findIndex(p => p.id === product.id)
    if (idx < 0 || idx >= products.length - 1) return
    const next = products.slice()
    const tmp = next[idx + 1]
    next[idx + 1] = next[idx]
    next[idx] = tmp
    setProducts(next)
    await saveOrder(next)
  }

  const handleDeleteProduct = async (product: ApiProduct) => {
    if (Number(product.is_active) === 1) {
      toast({ title: '无法删除', description: '请先下架该商品后再删除' })
      return
    }
    if (!confirm(`确认删除商品「${product.name}」吗？该操作不可恢复。`)) return
    try {
      let res = await fetch(`/api/products/${product.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const text = await res.text()
        try {
          const json = JSON.parse(text)
          if (json?.error === 'has_keys') {
            const sure = confirm('该商品存在关联的密钥（可能包含已售出）。\n\n是否继续删除所有未售密钥并删除商品？（已售出密钥与订单将保留）')
            if (!sure) return
            res = await fetch(`/api/products/${product.id}?force=true`, { method: 'DELETE' })
          } else {
            throw new Error(text)
          }
        } catch (_) {
          throw new Error(text)
        }
      }
      if (!res.ok) throw new Error(await res.text())
      toast({ title: '删除成功', description: `${product.name} 已删除` })
      await loadProducts()
    } catch (e: any) {
      toast({ title: '删除失败', description: e?.message || '网络错误' })
    }
  }

  const startEditKey = (id: number, value: string) => {
    setEditingKeyId(id)
    setEditingKeyValue(value)
  }

  const cancelEditKey = () => {
    setEditingKeyId(null)
    setEditingKeyValue("")
  }

  const saveEditKey = async () => {
    if (!inventoryProduct || editingKeyId === null) return
    const payload = { id: editingKeyId, key_value: editingKeyValue.trim() }
    if (!payload.key_value) {
      toast({ title: '保存失败', description: '密钥不能为空' })
      return
    }
    try {
      const res = await fetch(`/api/products/${inventoryProduct.id}/keys`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      toast({ title: '保存成功', description: '密钥已更新' })
      setEditingKeyId(null)
      setEditingKeyValue("")
      await loadInventory()
    } catch (e: any) {
      toast({ title: '保存失败', description: e?.message || '网络错误' })
    }
  }

  const fmtTime = (s: string | null | undefined) => {
    if (!s) return '-'
    const d = new Date(s)
    if (isNaN(d.getTime())) return s
    return d.toLocaleString()
  }

  async function loadEnv() {
    try {
      const res = await fetchJSON<{ ok: boolean; data: any }>("/api/system/env-check")
      setEnvCheck(res.data)
    } catch (_) {
      setEnvCheck(null)
    }
  }


  useEffect(() => {
    loadProducts()
    loadEnv()
  }, [])

  const handleAddProduct = async (formData: FormData) => {
    const name = String(formData.get("name") || "").trim()
    const price = Number(String(formData.get("price") || "0"))
    const category = String(formData.get("category") || "").trim()
    const sub_category = String(formData.get("sub_category") || "").trim()
    const description = String(formData.get("description") || "").trim()
    if (!name || !Number.isFinite(price) || !category) return
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, price, category, sub_category: sub_category || undefined, description: description || undefined, is_active: true }),
      })
      if (!res.ok) throw new Error(await res.text())
      toast({ title: "创建成功", description: `${name} 已创建` })
      setNewProductOpen(false)
      await loadProducts()
    } catch (e: any) {
      toast({ title: "创建失败", description: e?.message || "网络错误" })
    }
  }

  const handleAddStock = async () => {
    if (!selectedProduct) return
    const rawLines = newKeys.split("\n").map((s) => s.trim()).filter(Boolean)
    // 基本校验：去重、限制数量（不限制长度）
    const uniq = Array.from(new Set(rawLines))
    const MAX = 1000
    if (uniq.length === 0) {
      toast({ title: "导入失败", description: "没有有效的密钥行" })
      return
    }
    if (uniq.length > MAX) {
      toast({ title: "导入失败", description: `一次最多导入 ${MAX} 条` })
      return
    }
    try {
      const res = await fetch(`/api/products/${selectedProduct.id}/keys/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: uniq }),
      })
      if (!res.ok) throw new Error(await res.text())
      toast({ title: "导入成功", description: `已导入 ${uniq.length} 条密钥（已去重）` })
      setNewKeys("")
      setStockDialogOpen(false)
      setSelectedProduct(null)
      await loadProducts()
    } catch (e: any) {
      toast({ title: "导入失败", description: e?.message || "网络错误" })
    }
  }

  const openStockDialog = (product: ApiProduct) => {
    setSelectedProduct(product)
    setStockDialogOpen(true)
  }

  const openEditDialog = (product: ApiProduct) => {
    setEditProduct(product)
    setEditName(product.name)
    setEditPrice(String(product.price))
    setEditCategory(product.category)
    setEditSubCategory(product.sub_category || "")
    setEditDescription(product.description || "")
    setEditOpen(true)
  }

  const openInventoryDialog = (product: ApiProduct) => {
    setInventoryProduct(product)
    setInventoryDialogOpen(true)
    setInventoryPage(1)
    setInventoryStatus('all')
    setInventorySearch("")
    setInventorySelected([])
  }

  const loadInventory = async (params?: { page?: number; status?: 'all' | 'available' | 'sold'; search?: string }) => {
    if (!inventoryProduct) return
    const targetPage = params?.page ?? inventoryPage
    const targetStatus = params?.status ?? inventoryStatus
    const targetSearch = params?.search ?? inventorySearch
    setInventoryLoading(true)
    try {
      const queryParams = new URLSearchParams({
        page: String(targetPage),
        pageSize: String(inventoryPageSize),
        status: targetStatus,
      })
      if (targetSearch.trim()) {
        queryParams.set('search', targetSearch.trim())
      }
      const data = await fetchJSON<{ ok: boolean; data: { items: ApiProductKey[]; total: number; page: number; pageSize: number } }>(
        `/api/products/${inventoryProduct.id}/keys?${queryParams.toString()}`,
      )
      setInventoryKeys(data.data.items)
      setInventoryTotal(data.data.total)
      setInventoryPage(data.data.page)
    } catch (e: any) {
      toast({ title: '加载失败', description: e?.message || '无法加载库存密钥' })
    } finally {
      setInventoryLoading(false)
    }
  }

  const handleDeleteInventoryKeys = async () => {
    if (!inventoryProduct || inventorySelected.length === 0) {
      toast({ title: '操作提示', description: '请选择要删除的未售出密钥' })
      return
    }
    if (!confirm('确认删除选中的未售出密钥吗？该操作不可恢复。')) return
    try {
      const res = await fetch(`/api/products/${inventoryProduct.id}/keys`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: inventorySelected }),
      })
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      toast({ title: '删除成功', description: `已删除 ${json.data?.deleted ?? inventorySelected.length} 条密钥` })
      setInventorySelected([])
      await loadInventory({ page: 1 })
    } catch (e: any) {
      toast({ title: '删除失败', description: e?.message || '无法删除密钥' })
    }
  }

  const toggleInventorySelection = (id: number, checked: boolean) => {
    setInventorySelected((prev) => {
      if (checked) {
        if (prev.includes(id)) return prev
        return [...prev, id]
      }
      return prev.filter((item) => item !== id)
    })
  }

  useEffect(() => {
    if (inventoryDialogOpen && inventoryProduct) {
      loadInventory({ page: 1, status: 'all', search: '' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryDialogOpen, inventoryProduct])

  const handleDeactivate = async (product: ApiProduct) => {
    if (!product) return
    if (!confirm(`确定要下架商品「${product.name}」吗？`)) return
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      })
      if (!res.ok) throw new Error(await res.text())
      toast({ title: '下架成功', description: `${product.name} 已下架` })
      await loadProducts()
    } catch (e: any) {
      toast({ title: '下架失败', description: e?.message || '网络错误' })
    }
  }

  const handleActivate = async (product: ApiProduct) => {
    if (!product) return
    if (!confirm(`确定要上架商品「${product.name}」吗？`)) return
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      })
      if (!res.ok) throw new Error(await res.text())
      toast({ title: '上架成功', description: `${product.name} 已上架` })
      await loadProducts()
    } catch (e: any) {
      toast({ title: '上架失败', description: e?.message || '网络错误' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">商品与库存管理</h2>
          <p className="text-muted-foreground">管理您的商品和密钥库存</p>
        </div>

        <div className="flex items-center gap-2">
          <Dialog open={newProductOpen} onOpenChange={setNewProductOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              新增商品
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新增商品</DialogTitle>
              <DialogDescription>添加新的商品到您的库存中</DialogDescription>
            </DialogHeader>
            <form action={handleAddProduct}>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">商品名称</Label>
                  <Input id="name" name="name" placeholder="请输入商品名称" required />
                </div>
                <div>
                  <Label htmlFor="price">价格</Label>
                  <Input id="price" name="price" type="number" step="0.01" placeholder="0.00" required />
                </div>
                <div>
                  <Label htmlFor="category">分类</Label>
                  <Input id="category" name="category" placeholder="请输入分类" required />
                </div>
                <div>
                  <Label htmlFor="sub_category">子分类（可选）</Label>
                  <Input id="sub_category" name="sub_category" placeholder="请输入子分类" />
                </div>
                <div>
                  <Label htmlFor="description">商品说明（可选）</Label>
                  <Textarea id="description" name="description" placeholder="请输入商品说明，将在结账时显示给用户" rows={3} />
                </div>
              </div>
              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={() => setNewProductOpen(false)}>
                  取消
                </Button>
                <Button type="submit">确定</Button>
              </DialogFooter>
            </form>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>商品列表</CardTitle>
          <CardDescription>管理您的所有商品和库存</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">按分类筛选</label>
              <select
                className="h-9 rounded border px-3 text-sm"
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value)
                  setSelectedSubCategory("")
                }}
              >
                <option value="">全部</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">按子分类筛选</label>
              <select
                className="h-9 rounded border px-3 text-sm"
                value={selectedSubCategory}
                onChange={(e) => setSelectedSubCategory(e.target.value)}
                disabled={subCategories.length === 0}
              >
                <option value="">全部</option>
                {subCategories.map(sc => (
                  <option key={sc} value={sc}>{sc}</option>
                ))}
              </select>
            </div>
            {(selectedCategory || selectedSubCategory) && (
              <Button variant="outline" size="sm" onClick={() => { setSelectedCategory(""); setSelectedSubCategory("") }}>清除筛选</Button>
            )}
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>商品名称</TableHead>
                  <TableHead>价格 (USDT)</TableHead>
                  <TableHead>分类</TableHead>
                  <TableHead>子分类</TableHead>
                  <TableHead>可用库存</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product, idx) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>{Number(product.price).toFixed(2)} USDT</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{product.category}</Badge>
                    </TableCell>
                    <TableCell>
                      {product.sub_category ? (
                        <Badge variant="outline">{product.sub_category}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={Number(product.stock) < 10 ? "text-red-500 font-medium" : "text-green-600"}>
                        {product.stock}
                      </span>
                      {Number(product.stock) < 10 && (
                        <Badge variant="destructive" className="ml-2 text-xs">库存不足</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end space-x-2">
                        <Button variant="outline" size="sm" onClick={() => moveUp(product)} disabled={idx === 0}>
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => moveDown(product)} disabled={idx === filteredProducts.length - 1}>
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openStockDialog(product)}>
                          <Package className="h-3 w-3 mr-1" />
                          补充库存
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openInventoryDialog(product)}>
                          库存详情
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openEditDialog(product)}>
                          <Edit className="h-3 w-3 mr-1" />
                          编辑
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDeactivate(product)} disabled={Number(product.is_active) !== 1}>
                          <Trash2 className="h-3 w-3 mr-1" />
                          下架
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleActivate(product)}
                          disabled={Number(product.is_active) === 1}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          上架
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={Number(product.is_active) === 1}
                          onClick={() => handleDeleteProduct(product)}
                        >
                          删除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 补充库存对话框 */}
      <Dialog open={stockDialogOpen} onOpenChange={setStockDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>补充库存 - {selectedProduct?.name}</DialogTitle>
            <DialogDescription>请将密钥粘贴到下方文本框中，每行一个密钥</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col min-h-0">
            <Textarea
              placeholder="请粘贴密钥，每行一个&#10;例如：&#10;XXXXX-XXXXX-XXXXX-XXXXX&#10;YYYYY-YYYYY-YYYYY-YYYYY"
              value={newKeys}
              onChange={(e) => setNewKeys(e.target.value)}
              rows={10}
              className="font-mono text-sm resize-none max-h-[400px] overflow-y-auto"
            />
            <div className="text-sm text-muted-foreground flex-shrink-0">
              将导入{" "}
              {
                newKeys
                  .trim()
                  .split("\n")
                  .filter((line) => line.trim()).length
              }{" "}
              个密钥
            </div>
          </div>
          <DialogFooter className="flex-shrink-0">
            <Button variant="outline" onClick={() => setStockDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleAddStock}>导入</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 库存详情对话框 */}
      <Dialog open={inventoryDialogOpen} onOpenChange={setInventoryDialogOpen}>
        <DialogContent className="max-w-[1280px] w-[90vw] h-[86vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>库存详情 - {inventoryProduct?.name}</DialogTitle>
            <DialogDescription>查看并管理该商品的密钥库存</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <label className="text-sm text-muted-foreground">密钥状态</label>
                  <select
                    className="mt-1 h-9 rounded border px-3 text-sm"
                    value={inventoryStatus}
                    onChange={async (e) => {
                      const value = e.target.value as 'all' | 'available' | 'sold'
                      setInventoryStatus(value)
                      await loadInventory({ page: 1, status: value })
                      setInventorySelected([])
                    }}
                  >
                    <option value="all">全部</option>
                    <option value="available">未售出</option>
                    <option value="sold">已售出</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">搜索密钥</label>
                  <div className="mt-1 flex items-center gap-2">
                    <Input
                      placeholder="输入关键词"
                      value={inventorySearch}
                      onChange={(e) => setInventorySearch(e.target.value)}
                      className="w-48"
                    />
                    <Button
                      variant="outline"
                      onClick={async () => {
                        await loadInventory({ page: 1, search: inventorySearch })
                      }}
                    >
                      搜索
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => loadInventory()}>刷新</Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteInventoryKeys}
                  disabled={inventorySelected.length === 0}
                >
                  删除选中
                </Button>
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">选择</TableHead>
                    <TableHead>密钥</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead>售出信息</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                        正在加载...
                      </TableCell>
                    </TableRow>
                  ) : inventoryKeys.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                        暂无密钥数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    inventoryKeys.map((key) => {
                      const sold = Number(key.is_sold) === 1
                      const checked = inventorySelected.includes(key.id)
                      return (
                        <TableRow key={key.id}>
                          <TableCell>
                            {sold ? (
                              <span className="text-muted-foreground text-xs">-</span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => toggleInventorySelection(key.id, e.target.checked)}
                              />
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-sm break-all">
                            {sold ? (
                              key.key_value
                            ) : editingKeyId === key.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editingKeyValue}
                                  onChange={(e) => setEditingKeyValue(e.target.value)}
                                  className="font-mono text-sm"
                                />
                                <Button size="sm" onClick={saveEditKey}>保存</Button>
                                <Button size="sm" variant="outline" onClick={cancelEditKey}>取消</Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span>{key.key_value}</span>
                                <Button size="sm" variant="outline" onClick={() => startEditKey(key.id, key.key_value)}>编辑</Button>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {sold ? (
                              <Badge variant="secondary" className="bg-green-600 text-white">已售出</Badge>
                            ) : (
                              <Badge variant="outline" className="text-blue-600 border-blue-600">未售出</Badge>
                            )}
                          </TableCell>
                          <TableCell>{fmtTime(key.created_at)}</TableCell>
                          <TableCell>
                            {sold ? (
                              <div className="text-sm text-muted-foreground">
                                <div>用户ID: {key.sold_to_user_id ?? '-'}</div>
                                <div>售出时间: {fmtTime(key.sold_at)}</div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div>共 {inventoryTotal} 条记录</div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={inventoryPage <= 1}
                  onClick={() => loadInventory({ page: inventoryPage - 1 })}
                >
                  上一页
                </Button>
                <span>
                  第 {inventoryPage} / {Math.max(1, Math.ceil(inventoryTotal / inventoryPageSize))} 页
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={inventoryPage >= Math.max(1, Math.ceil(inventoryTotal / inventoryPageSize))}
                  onClick={() => loadInventory({ page: inventoryPage + 1 })}
                >
                  下一页
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 编辑商品对话框 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑商品</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="editName">商品名称</Label>
              <Input id="editName" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="editPrice">价格</Label>
              <Input id="editPrice" type="number" step="0.01" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="editCategory">分类</Label>
              <Input id="editCategory" value={editCategory} onChange={(e) => setEditCategory(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="editSubCategory">子分类（可选）</Label>
              <Input id="editSubCategory" value={editSubCategory} onChange={(e) => setEditSubCategory(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="editDescription">商品说明（可选）</Label>
              <Textarea id="editDescription" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="请输入商品说明，将在结账时显示给用户" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>取消</Button>
            <Button
              onClick={async () => {
                if (!editProduct) return
                const payload: any = {}
                if (editName.trim()) payload.name = editName.trim()
                const nprice = Number(editPrice)
                if (Number.isFinite(nprice)) payload.price = nprice
                if (editCategory.trim()) payload.category = editCategory.trim()
                if (editSubCategory.trim()) payload.sub_category = editSubCategory.trim()
                payload.description = editDescription.trim()
                try {
                  const res = await fetch(`/api/products/${editProduct.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                  })
                  if (!res.ok) throw new Error(await res.text())
                  toast({ title: '保存成功', description: `${editName} 已更新` })
                  setEditOpen(false)
                  await loadProducts()
                } catch (e: any) {
                  toast({ title: '保存失败', description: e?.message || '网络错误' })
                }
              }}
            >保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 已根据你的要求移除 管理员余额调整 区块 */}
    </div>
  )
}
