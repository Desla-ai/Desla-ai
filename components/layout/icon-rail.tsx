"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home,
  Building2,
  Users,
  Database,
  Settings,
  FileText,
  Receipt,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const navItems = [
  { href: "/home", icon: Home, label: "홈" },
  { href: "/sites", icon: Building2, label: "현장" },
  { href: "/workers", icon: Users, label: "인력" },
  { href: "/settlement", icon: Receipt, label: "정산" },
  { href: "/billing", icon: FileText, label: "청구" },
  { href: "/records", icon: Database, label: "스냅샷" },
  { href: "/settings", icon: Settings, label: "설정" },
]

export function IconRail() {
  const pathname = usePathname()

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-full w-14 flex-col items-center border-r border-border bg-sidebar py-4">
        <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
          <span className="text-sm font-bold text-primary-foreground">D</span>
        </div>
        <nav className="flex flex-1 flex-col gap-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                      isActive
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="sr-only">{item.label}</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {item.label}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </nav>
      </div>
    </TooltipProvider>
  )
}
