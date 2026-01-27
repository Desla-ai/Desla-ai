"use client"

import type { ReactNode } from "react"
import { IconRail } from "./icon-rail"
import { TopBar } from "./top-bar"

interface AppShellProps {
  children: ReactNode
  title: string
  sidePanel?: ReactNode
}

export function AppShell({ children, title, sidePanel }: AppShellProps) {
  // Auth is handled by the (app) route group layout
  // This component only renders when user is authenticated
  return (
    <div className="flex h-screen bg-background">
      <IconRail />
      {sidePanel && (
        <aside className="w-72 border-r border-border bg-card">
          {sidePanel}
        </aside>
      )}
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title={title} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
