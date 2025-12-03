"use client"

import type React from "react"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { SimpleSidebar } from "@/components/simple-sidebar"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()

  useEffect(() => {
    const isLoggedIn = localStorage.getItem("isLoggedIn")
    if (isLoggedIn !== "true") {
      router.push("/login")
    }
  }, [router])

  return (
    <div className="flex h-screen bg-background">
      <SimpleSidebar />
      <div className="flex-1 overflow-hidden">
        <main className="h-full overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
