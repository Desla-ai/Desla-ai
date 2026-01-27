"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatKoreanMoney } from "@/lib/format"
import { Users, Receipt, Clock, AlertCircle } from "lucide-react"

interface SitesKpiPanelProps {
  workersPending: number
  siteBillingPending: number
  supplyPending: number
  unresolvedIssues: number
}

export function SitesKpiPanel({
  workersPending,
  siteBillingPending,
  supplyPending,
  unresolvedIssues,
}: SitesKpiPanelProps) {
  const kpiItems = [
    {
      title: "배치된 인력",
      value: `${workersPending}명`,
      icon: Users,
      color: "text-chart-2",
    },
    {
      title: "미수금 (발행)",
      value: formatKoreanMoney(siteBillingPending),
      icon: Receipt,
      color: "text-chart-3",
    },
    {
      title: "입금완료",
      value: formatKoreanMoney(supplyPending),
      icon: Clock,
      color: "text-status-progress-foreground",
    },
    {
      title: "미해결 이슈",
      value: `${unresolvedIssues}건`,
      icon: AlertCircle,
      color: "text-destructive",
    },
  ]

  return (
    <div className="flex h-full w-72 flex-col border-l border-border bg-card">
      <div className="border-b border-border p-4">
        <h2 className="text-lg font-semibold">청구 요약</h2>
      </div>
      <div className="flex flex-col gap-4 p-4">
        {kpiItems.map((item) => (
          <Card key={item.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {item.title}
              </CardTitle>
              <item.icon className={`h-4 w-4 ${item.color}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-xl font-bold ${item.color}`}>{item.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
