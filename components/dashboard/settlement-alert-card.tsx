"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatKoreanMoney } from "@/lib/format"
import { FileText, Send, CheckCircle2 } from "lucide-react"

// Simplified Invoice type for dashboard
interface DashboardInvoice {
  id: string
  invoiceNumber: string
  siteName: string
  contractorName: string
  status: "초안" | "발행" | "입금완료"
  total: number
}

interface BillingAlertCardProps {
  invoices?: DashboardInvoice[]
  isLoading?: boolean
}

const statusConfig = {
  초안: { color: "bg-muted text-muted-foreground", icon: FileText },
  발행: { color: "bg-status-waiting text-status-waiting-foreground", icon: Send },
  입금완료: { color: "bg-status-progress text-status-progress-foreground", icon: CheckCircle2 },
}

// Demo data for now - in production this would come from global state
const demoInvoices: DashboardInvoice[] = [
  { id: "1", invoiceNumber: "INV-2025-001", siteName: "강남 오피스텔", contractorName: "대림건설", status: "발행", total: 3850000 },
  { id: "2", invoiceNumber: "INV-2025-002", siteName: "판교 테크노밸리", contractorName: "GS건설", status: "초안", total: 4400000 },
]

export function SettlementAlertCard({ invoices = demoInvoices, isLoading }: BillingAlertCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  // Filter to show only pending invoices (drafts and issued)
  const pendingInvoices = invoices.filter(
    (inv) => inv.status === "초안" || inv.status === "발행"
  )

  if (pendingInvoices.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">청구 현황</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FileText className="mb-2 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">대기 중인 청구서가 없습니다</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">청구 현황</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {pendingInvoices.slice(0, 5).map((invoice) => {
          const config = statusConfig[invoice.status]
          const StatusIcon = config.icon
          return (
            <div key={invoice.id} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge className={`text-xs shrink-0 gap-1 ${config.color}`}>
                    <StatusIcon className="h-3 w-3" />
                    {invoice.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono truncate">
                    {invoice.invoiceNumber}
                  </span>
                </div>
                <span className="text-sm font-medium truncate">{invoice.contractorName}</span>
                <span className="text-xs text-muted-foreground truncate">{invoice.siteName}</span>
              </div>
              <span className="text-sm font-semibold tabular-nums shrink-0 ml-2">
                {formatKoreanMoney(invoice.total)}
              </span>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
