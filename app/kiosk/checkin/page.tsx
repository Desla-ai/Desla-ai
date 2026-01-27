"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// Legacy route - redirects to canonical /attendance
export default function KioskCheckinRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/attendance")
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-muted-foreground">출근 페이지로 이동 중...</p>
    </div>
  )
}
