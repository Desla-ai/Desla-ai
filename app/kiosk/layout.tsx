"use client"

import type { ReactNode } from "react"
import { AppStoreProvider } from "@/lib/app-store"

export default function KioskLayout({ children }: { children: ReactNode }) {
  return <AppStoreProvider>{children}</AppStoreProvider>
}
