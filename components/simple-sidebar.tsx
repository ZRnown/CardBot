"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Package, Users, FileText, Menu, LogOut, Settings, Key } from "lucide-react"

const menuItems = [
  {
    title: "商品与库存管理",
    href: "/admin",
    icon: Package,
  },
  {
    title: "用户与充值管理",
    href: "/admin/users",
    icon: Users,
  },
  {
    title: "订单流水",
    href: "/admin/orders",
    icon: FileText,
  },
  {
    title: "系统设置",
    href: "/admin/settings",
    icon: Settings,
  },
  {
    title: "修改密码",
    href: "/admin/change-password",
    icon: Key,
  },
]

export function SimpleSidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = () => {
    localStorage.removeItem("isLoggedIn")
    localStorage.removeItem("adminUsername")
    router.push("/login")
  }

  return (
    <div
      className={cn(
        "flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        {!collapsed && <h1 className="text-lg font-semibold text-sidebar-foreground">管理系统</h1>}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <Menu className="h-4 w-4" />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href

          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  isActive ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground",
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {!collapsed && <span className="text-sm font-medium">{item.title}</span>}
              </div>
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-sidebar-border">
        <Button
          variant="ghost"
          onClick={handleLogout}
          className={cn(
            "w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent",
            collapsed && "justify-center",
          )}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>退出登录</span>}
        </Button>
      </div>
    </div>
  )
}
