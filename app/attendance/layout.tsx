"use client"

import type { ReactNode } from "react"
import { AppStoreProvider } from "@/lib/app-store"

export default function AttendanceLayout({ children }: { children: ReactNode }) {
  return <AppStoreProvider>{children}</AppStoreProvider>
}
