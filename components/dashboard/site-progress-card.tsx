"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Site, Worker } from "@/lib/mock-data"
import { Building2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface SiteProgressCardProps {
  sites: Site[]
  workers: Worker[]
  isLoading?: boolean
}

const statusColors: Record<string, string> = {
  미진행: "bg-muted text-muted-foreground",
  배차대기: "bg-status-waiting text-status-waiting-foreground",
  배차완료: "bg-status-progress text-status-progress-foreground",
  금액확정: "bg-status-pending text-status-pending-foreground",
}

export function SiteProgressCard({ sites, workers, isLoading }: SiteProgressCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  if (sites.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">오늘 현장 진행</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Building2 className="mb-2 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">진행 중인 현장이 없습니다</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">오늘 현장 진행</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[280px]">
          <div className="flex flex-col gap-3 px-6 pb-4">
            {sites.slice(0, 8).map((site) => {
              // ✅ 고정+당일 합산: assignedSiteId(또는 assigned_site_id)로만 필터
              const assignedCount = workers.filter((w) => {
                const assigned = (w as any).assignedSiteId ?? (w as any).assigned_site_id ?? null
                return assigned === site.id
              }).length

              const required = Number(site.todayRequired ?? 0)
              const progress = required > 0 ? Math.round((assignedCount / required) * 100) : 0

              return (
                <div key={site.id} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium truncate">{site.name}</span>
                      <Badge
                        variant="secondary"
                        className={cn("text-[10px] shrink-0", statusColors[site.status])}
                      >
                        {site.status}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">
                      {assignedCount} / {required}명
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Progress value={progress} className="h-2 flex-1" />
                    <span className="text-xs text-muted-foreground w-9 text-right">{progress}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
