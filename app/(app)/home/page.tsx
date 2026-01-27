"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AppShell } from "@/components/layout/app-shell"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { SiteProgressCard } from "@/components/dashboard/site-progress-card"
import { SettlementAlertCard } from "@/components/dashboard/settlement-alert-card"
import { useAppStore } from "@/lib/app-store"
import { formatKoreanMoney, formatDateRange } from "@/lib/format"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Building2,
  CheckCircle,
  Users,
  Clock,
  Receipt,
  AlertCircle,
  Link2,
  Copy,
  ChevronRight,
  RotateCcw,
  CalendarDays,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const siteStatusColors: Record<string, string> = {
  미진행: "bg-muted text-muted-foreground",
  배차대기: "bg-status-waiting text-status-waiting-foreground",
  배차완료: "bg-status-progress text-status-progress-foreground",
  정산완료: "bg-status-pending text-status-pending-foreground",
}

export default function HomePage() {
  const router = useRouter()
  const { state, setSelectedSiteId, updateWorker, moveWorkerToWaiting } = useAppStore()
  const [globalRolloverDialogOpen, setGlobalRolloverDialogOpen] = useState(false)
  const [isRollingOver, setIsRollingOver] = useState(false)

  // Filter out "미진행" sites for display in Home
  const activeSites = state.sites.filter((s) => s.status !== "미진행")

  // Calculate KPI values from global state (using all sites for counts)
  const dispatchPendingSites = state.sites.filter((s) => s.status === "배차대기")
  const dispatchCompleteSites = state.sites.filter((s) => s.status === "배차완료")
  const settlementCompleteSites = state.sites.filter((s) => s.status === "정산완료")

  const waitingWorkers = state.workers.filter((w) => w.status === "미출근")
  const checkedInWorkers = state.workers.filter((w) => w.status === "출근")
  const assignedWorkers = state.workers.filter((w) => w.status === "배치")

  const pendingBillings = state.settlements
    .filter((s) => s.status === "청구대기")
    .reduce((sum, s) => sum + s.amount, 0)
  const completedBillings = state.settlements
    .filter((s) => s.status === "완료")
    .reduce((sum, s) => sum + s.amount, 0)

  // Copy canonical attendance link
  const handleCopyCheckinLink = () => {
    const link = "https://desla.ai/attendance"
    navigator.clipboard.writeText(link)
    toast.success("출근 링크를 복사했습니다.")
  }

  const handleNavigateToSite = (siteId: string) => {
    setSelectedSiteId(siteId)
    router.push("/sites")
  }

  const handleNavigateToCompletedSettlements = () => {
    router.push("/billing?status=completed")
  }

  // Global next day rollover for ALL sites
  const handleGlobalRollover = async () => {
    setIsRollingOver(true)

    try {
      // API stub: POST /api/sites/rollover-next-day
      // In production, this would be a server action
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Get all daily assigned workers across all sites and reset them
      for (const assignment of state.assignments) {
        for (const workerId of assignment.assignedWorkerIds) {
          const worker = state.workers.find((w) => w.id === workerId)
          if (worker && !worker.isFixed) {
            moveWorkerToWaiting(workerId, assignment.siteId)
            updateWorker({ ...worker, status: "미출근", assignedSiteId: undefined })
          }
        }
      }

      toast.success("전체 현장이 다음 날로 넘어갔습니다.")
      setGlobalRolloverDialogOpen(false)
    } catch {
      toast.error("롤오버 중 오류가 발생했습니다.")
    } finally {
      setIsRollingOver(false)
    }
  }

  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const formatSimpleDate = (date: Date) =>
    date.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })

  return (
    <AppShell title="홈">
      <div className="flex flex-col gap-6 p-6">
        {/* Global Action Bar */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">대시보드</h1>
            <p className="text-sm text-muted-foreground">{formatSimpleDate(today)}</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleCopyCheckinLink} className="bg-transparent">
              <Link2 className="mr-2 h-4 w-4" />
              출근 링크 복사
            </Button>
            <Button onClick={() => setGlobalRolloverDialogOpen(true)}>
              <RotateCcw className="mr-2 h-4 w-4" />
              전체 현장 다음 날로 넘기기
            </Button>
          </div>
        </div>

        {/* Top KPI Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="배차대기 현장" value={dispatchPendingSites.length} icon={Clock} variant="warning" />
          <KpiCard
            title="배차완료 현장"
            value={dispatchCompleteSites.length}
            icon={CheckCircle}
            variant="success"
          />
          <KpiCard
            title="오늘 출근 인원"
            value={`${checkedInWorkers.length + assignedWorkers.length}명`}
            icon={Users}
            variant="default"
          />
          <KpiCard
            title="정산완료 현장"
            value={`${settlementCompleteSites.length}개`}
            icon={Building2}
            variant="default"
          />
        </div>

        {/* Bottom KPI Grid - Billing focused */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="청구서 초안"
            value={`${state.settlementRecords.filter((r) => r.status === "지급대기").length}건`}
            icon={Receipt}
            variant="default"
          />
          <KpiCard
            title="발행 (미수금)"
            value={formatKoreanMoney(pendingBillings)}
            icon={AlertCircle}
            variant="warning"
          />
          <KpiCard
            title="입금완료"
            value={formatKoreanMoney(completedBillings)}
            icon={CheckCircle}
            variant="success"
          />
          <KpiCard
            title="대기 인력"
            value={`${waitingWorkers.length}명`}
            icon={Users}
            variant="default"
          />
        </div>

        {/* Content Cards - 3 columns */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Site Progress */}
          <SiteProgressCard sites={activeSites.filter((s) => s.status !== "정산완료")} />

          {/* Settlement Completed Sites - NEW */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle className="h-5 w-5" />
                정산 완료 현장
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[280px]">
                <div className="flex flex-col">
                  {settlementCompleteSites.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                      <Building2 className="mb-3 h-10 w-10 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">정산 완료된 현장이 없습니다</p>
                    </div>
                  ) : (
                    <>
                      {settlementCompleteSites.slice(0, 5).map((site) => (
                        <div
                          key={site.id}
                          className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-muted/30 transition-colors"
                        >
                          <button
                            type="button"
                            onClick={() => handleNavigateToSite(site.id)}
                            className="flex flex-1 items-center gap-3 text-left min-w-0"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate text-sm">{site.name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge className="text-xs shrink-0 bg-status-pending text-status-pending-foreground">
                                  정산완료
                                </Badge>
                                <span className="text-xs text-muted-foreground truncate">
                                  {formatDateRange(site.startDate, site.endDate)}
                                </span>
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          </button>
                        </div>
                      ))}
                      
                    </>
                  )}
                </div>
              </ScrollArea>
              {settlementCompleteSites.length > 0 && settlementCompleteSites.length <= 5 && (
                <div className="px-4 py-3 border-t border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={handleNavigateToCompletedSettlements}
                  >
                    정산 완료 현장 보기
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Settlement Alerts */}
          <SettlementAlertCard settlements={state.settlements} />
        </div>
      </div>

      {/* Global Rollover Dialog */}
      <AlertDialog open={globalRolloverDialogOpen} onOpenChange={setGlobalRolloverDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              전체 현장 다음 날로 넘기기
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                <strong>{formatSimpleDate(today)}</strong> → <strong>{formatSimpleDate(tomorrow)}</strong>
              </p>
              <p>
                모든 현장의 당일 배치 인력이 인력 풀로 이동하며, 상태가 '미출근'으로 변경됩니다. 고정 배치
                인력은 유지됩니다.
              </p>
              <p className="text-destructive">이 작업은 되돌릴 수 없습니다.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRollingOver}>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleGlobalRollover} disabled={isRollingOver}>
              {isRollingOver ? "처리 중..." : "다음 날로 넘기기"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}
