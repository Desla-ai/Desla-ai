"use client"

import { useTheme } from "next-themes"
import { useAuth } from "@/lib/auth-context"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { LogOut, Sun, Moon } from "lucide-react"

interface TopBarProps {
  title?: string
}

export function TopBar({ title }: TopBarProps) {
  const { theme, setTheme } = useTheme()
  const { user, logout } = useAuth()

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4">
      <div className="min-w-0">
        {title ? <h1 className="truncate text-base font-semibold">{title}</h1> : null}
      </div>

      <div className="flex items-center gap-2">
        {/* theme toggle */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="테마 변경"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {/* user dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="secondary" className="max-w-[220px] truncate">
              {user?.username ?? "계정"}
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            {user ? (
              <>
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user.username}</p>
                  <p className="text-xs text-muted-foreground">
                    office: {user.officeId}
                  </p>
                </div>
                <DropdownMenuSeparator />
              </>
            ) : null}

            <DropdownMenuItem
              onClick={() => {
                void logout()
              }}
              className="cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />
              로그아웃
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
