"use client"

import { Badge } from "@/components/ui/badge"
import { type Worker } from "@/lib/mock-data"
import { formatPhone } from "@/lib/format"
import { GripVertical, Lock, Users } from "lucide-react"
import { cn } from "@/lib/utils"

interface WorkerCardProps {
  worker: Worker
  isDragging?: boolean
  onClick?: () => void
  draggable?: boolean
  compact?: boolean
}

const statusColors = {
  미출근: "bg-muted text-muted-foreground",
  출근: "bg-chart-1/20 text-chart-1",
  배치: "bg-chart-2/20 text-chart-2",
}

export function WorkerCard({ worker, isDragging, onClick, draggable = true, compact = false }: WorkerCardProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-card transition-all min-w-0",
        compact ? "p-2" : "p-3",
        isDragging && "shadow-lg ring-2 ring-primary",
        draggable && "cursor-grab active:cursor-grabbing",
        onClick && "cursor-pointer hover:bg-accent"
      )}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault()
          onClick()
        }
      }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {draggable && !compact && (
        <div className="flex h-8 w-6 shrink-0 items-center justify-center text-muted-foreground">
          <GripVertical className="h-4 w-4" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("font-medium truncate", compact && "text-sm")}>{worker.name}</span>
          {worker.isFixed && (
            <Lock className="h-3 w-3 shrink-0 text-chart-2" />
          )}
          {worker.team && (
            <Badge variant={worker.team === "반장" ? "default" : "secondary"} className="text-xs shrink-0">
              {worker.team === "반장" && <Users className="mr-1 h-3 w-3" />}
              {worker.team}
            </Badge>
          )}
          <Badge className={cn("text-xs shrink-0 ml-auto", statusColors[worker.status])}>
            {worker.status}
          </Badge>
        </div>
        {!compact && (
          <p className="text-xs text-muted-foreground truncate">{formatPhone(worker.phone)}</p>
        )}
        <div className="flex flex-wrap gap-1">
          {worker.roles.slice(0, compact ? 2 : undefined).map((role) => (
            <Badge
              key={role.id}
              style={{ backgroundColor: role.color, color: "#fff" }}
              className="text-xs"
            >
              {role.name}
            </Badge>
          ))}
          {compact && worker.roles.length > 2 && (
            <Badge variant="outline" className="text-xs">
              +{worker.roles.length - 2}
            </Badge>
          )}
        </div>
      </div>
    </div>
  )
}
