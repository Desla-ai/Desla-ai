"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { type LucideIcon } from "lucide-react"

interface KpiCardProps {
  title: string
  value: string | number
  icon?: LucideIcon
  description?: string
  variant?: "default" | "success" | "warning" | "danger"
  isLoading?: boolean
}

export function KpiCard({
  title,
  value,
  icon: Icon,
  description,
  variant = "default",
  isLoading = false,
}: KpiCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="mb-2 h-4 w-24" />
          <Skeleton className="mb-1 h-8 w-32" />
          {description && <Skeleton className="h-3 w-20" />}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">{title}</span>
            <span
              className={cn(
                "text-2xl font-semibold",
                variant === "success" && "text-chart-1",
                variant === "warning" && "text-chart-3",
                variant === "danger" && "text-destructive"
              )}
            >
              {value}
            </span>
            {description && (
              <span className="text-xs text-muted-foreground">{description}</span>
            )}
          </div>
          {Icon && (
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg",
                variant === "default" && "bg-muted text-muted-foreground",
                variant === "success" && "bg-status-progress text-status-progress-foreground",
                variant === "warning" && "bg-status-waiting text-status-waiting-foreground",
                variant === "danger" && "bg-destructive/10 text-destructive"
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
