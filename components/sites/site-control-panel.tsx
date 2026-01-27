"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { type Site, type Worker } from "@/lib/mock-data"
import { useAppStore } from "@/lib/app-store"
import { formatPhone, formatDateRange, formatKoreanMoney } from "@/lib/format"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import {
  RotateCcw,
  AlertTriangle,
  Check,
  Edit2,
  Users,
  Settings,
  Search,
  Lock,
  Calendar,
  ChevronRight,
  ChevronDown,
  X,
  Trash2,
  Receipt,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface SiteControlPanelProps {
  site: Site | null
  isOpen: boolean
  onDeleteSite?: (siteId: string) => void
}

const siteStatuses = ["미진행", "배차대기", "배차완료", "정산완료"] as const
type SiteStatusType = (typeof siteStatuses)[number]

const statusColors: Record<SiteStatusType, string> = {
  미진행: "bg-muted text-muted-foreground",
  배차대기: "bg-status-waiting text-status-waiting-foreground",
  배차완료: "bg-status-progress text-status-progress-foreground",
  정산완료: "bg-status-pending text-status-pending-foreground",
}

export function SiteControlPanel({ site, isOpen, onDeleteSite }: SiteControlPanelProps) {
  const {
    state,
    updateSite,
    updateWorker,
    moveWorkerToWaiting,
    moveWorkerToAssigned,
    moveWorkerToFixed,
  } = useAppStore()

  const [activeTab, setActiveTab] = useState("배치")
  const [draggedWorker, setDraggedWorker] = useState<Worker | null>(null)
  const [showNextDayDialog, setShowNextDayDialog] = useState(false)
  const [poolSearch, setPoolSearch] = useState("")
  const [selectedPoolWorkerIds, setSelectedPoolWorkerIds] = useState<string[]>([])
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false)

  // Daily required headcount editing
  const [isEditingRequired, setIsEditingRequired] = useState(false)
  const [todayRequiredInput, setTodayRequiredInput] = useState("")

  // Site Settings Dialog
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [editSiteName, setEditSiteName] = useState("")
  const [editSiteAddress, setEditSiteAddress] = useState("")
  const [editSiteStartDate, setEditSiteStartDate] = useState("")
  const [editSiteEndDate, setEditSiteEndDate] = useState("")
  const [editSitePlannedWorkers, setEditSitePlannedWorkers] = useState("")
  const [editSiteTodayRequired, setEditSiteTodayRequired] = useState("")
  const [editSiteCheckInTime, setEditSiteCheckInTime] = useState("")
  const [editSiteOfficePhone, setEditSiteOfficePhone] = useState("")

  // Fixed Date Range Dialog
  const [fixedDateDialogOpen, setFixedDateDialogOpen] = useState(false)
  const [fixedDateWorkerIds, setFixedDateWorkerIds] = useState<string[]>([])
  const [fixedStartDate, setFixedStartDate] = useState("")
  const [fixedEndDate, setFixedEndDate] = useState("")

  // Worker Detail Sheet
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null)
  const [workerSheetOpen, setWorkerSheetOpen] = useState(false)

  // Edit Fixed Assignment Dialog
  const [editFixedDialogOpen, setEditFixedDialogOpen] = useState(false)
  const [editingFixedWorker, setEditingFixedWorker] = useState<Worker | null>(null)
  const [editFixedStartDate, setEditFixedStartDate] = useState("")
  const [editFixedEndDate, setEditFixedEndDate] = useState("")

  // Site Delete Dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Workforce Settlement State
  const [settlementLoading, setSettlementLoading] = useState(false)
  const [settlementError, setSettlementError] = useState<string | null>(null)
  const [settlementData, setSettlementData] = useState<{
    id: string
    workerId: string
    workerName: string
    role: string
    attendanceDays: number
    attendanceHours: number
    unitPrice: number
    calculatedAmount: number
    adjustment: number
    finalAmount: number
    status: "미정산" | "정산완료"
  }[]>([])
  const [settlementLocked, setSettlementLocked] = useState(false)
  const [editingSettlementId, setEditingSettlementId] = useState<string | null>(null)
  const [editingAmount, setEditingAmount] = useState("")
  const [savingSettlement, setSavingSettlement] = useState(false)
  const [lockDialogOpen, setLockDialogOpen] = useState(false)
  const [lockConfirmText, setLockConfirmText] = useState("")
  const [isLocking, setIsLocking] = useState(false)
  const [settlementDateRange, setSettlementDateRange] = useState({ start: "", end: "" })

  // 당일 정산: 일당 수정(draft) + 저장 상태
  const [dailyWageDraftByWorkerId, setDailyWageDraftByWorkerId] = useState<Record<string, number>>({})
  const [dailyWageSavedByWorkerId, setDailyWageSavedByWorkerId] = useState<Record<string, number>>({})
  const [savingRowId, setSavingRowId] = useState<string | null>(null)

  const getDailyWage = (workerId: string) => {
    // 우선순위: draft > saved > default(200000)
    return (
      dailyWageDraftByWorkerId[workerId] ??
      dailyWageSavedByWorkerId[workerId] ??
      200000
    )
  }

  const handleSaveDailyWageRow = async (workerId: string) => {
    const wage = getDailyWage(workerId)

    try {
      setSavingRowId(workerId)

      // TODO(Supabase): DB 연결 후 여기만 교체하면 됨
      // await supabase.from("daily_settlements").upsert({ site_id, worker_id, date, wage })

      // 저장값 확정
      setDailyWageSavedByWorkerId((prev) => ({ ...prev, [workerId]: wage }))

      // draft 제거
      setDailyWageDraftByWorkerId((prev) => {
        const next = { ...prev }
        delete next[workerId]
        return next
      })

      toast.success("일당이 저장되었습니다")
    } catch (e) {
      toast.error("저장에 실패했습니다")
    } finally {
      setSavingRowId(null)
    }
  }



  // Get global pool (workers with status "출근" and not assigned)
  const globalPoolWorkers = useMemo(() => {
    const assignedWorkerIds = new Set<string>()
    for (const a of state.assignments) {
      for (const id of a.assignedWorkerIds) assignedWorkerIds.add(id)
      for (const id of a.fixedWorkerIds) assignedWorkerIds.add(id)
    }
    // Include both 출근 workers (main pool) and optionally show 미출근 with different styling
    return state.workers.filter(
      (w) => (w.status === "출근" || w.status === "미출근") && !assignedWorkerIds.has(w.id)
    )
  }, [state.workers, state.assignments])

  // Get workers for this site
  const assignment = state.assignments.find((a) => a.siteId === site?.id)
  const dailyAssignedIds = assignment?.assignedWorkerIds || []
  const fixedAssignedIds = assignment?.fixedWorkerIds || []

  const dailyAssignedWorkers = useMemo(
    () => state.workers.filter((w) => dailyAssignedIds.includes(w.id)),
    [state.workers, dailyAssignedIds]
  )
  const fixedAssignedWorkers = useMemo(
    () => state.workers.filter((w) => fixedAssignedIds.includes(w.id)),
    [state.workers, fixedAssignedIds]
  )

  const todayWorkers = [...dailyAssignedWorkers, ...fixedAssignedWorkers]
  const uniqueWorkers = Array.from(new Map(todayWorkers.map(w => [w.id, w])).values())
  const totalDailyWage = uniqueWorkers.reduce((sum, w) => sum + getDailyWage(w.id), 0)



  // Filtered pool workers based on search
  const filteredPoolWorkers = useMemo(() => {
    if (!poolSearch.trim()) return globalPoolWorkers
    const query = poolSearch.toLowerCase()
    return globalPoolWorkers.filter(
      (w) =>
        w.name.toLowerCase().includes(query) ||
        w.phone.includes(query) ||
        w.roles.some((r) => r.name.toLowerCase().includes(query)) ||
        (w.team && w.team.toLowerCase().includes(query))
    )
  }, [globalPoolWorkers, poolSearch])

  useEffect(() => {
    if (site) {
      setTodayRequiredInput(String(site.todayRequired))
    }
  }, [site])

  const handleStatusChange = (newStatus: SiteStatusType) => {
    if (!site) return
    updateSite({ ...site, status: newStatus })
    setStatusPopoverOpen(false)
    toast.success(`현장 상태가 '${newStatus}'로 변경되었습니다.`)
  }

  const handleOpenSettings = () => {
    if (site) {
      setEditSiteName(site.name)
      setEditSiteAddress(site.address)
      setEditSiteStartDate(site.startDate)
      setEditSiteEndDate(site.endDate)
      setEditSitePlannedWorkers(String(site.plannedWorkers))
      setEditSiteTodayRequired(String(site.todayRequired))
      setEditSiteCheckInTime(site.checkInTime)
      setEditSiteOfficePhone(site.officePhone)
      setSettingsDialogOpen(true)
    }
  }

  const handleSaveSettings = () => {
    if (!site) return
    if (!editSiteName.trim() || !editSiteAddress.trim()) {
      toast.error("현장명과 주소를 입력해주세요")
      return
    }

    updateSite({
      ...site,
      name: editSiteName.trim(),
      address: editSiteAddress.trim(),
      startDate: editSiteStartDate,
      endDate: editSiteEndDate,
      plannedWorkers: Number.parseInt(editSitePlannedWorkers) || 0,
      todayRequired: Number.parseInt(editSiteTodayRequired) || 0,
      checkInTime: editSiteCheckInTime,
      officePhone: editSiteOfficePhone,
    })
    setSettingsDialogOpen(false)
    toast.success("현장 정보가 수정되었습니다")
  }

  // Site delete handler
  const handleDeleteSite = async () => {
    if (!site || !onDeleteSite) return
    if (deleteConfirmText !== site.name && deleteConfirmText !== "DELETE") {
      setDeleteError("현장명 또는 'DELETE'를 정확히 입력해주세요.")
      return
    }

    setIsDeleting(true)
    setDeleteError(null)

    try {
      // API stub: DELETE /api/sites/:siteId
      await new Promise((resolve) => setTimeout(resolve, 500))

      onDeleteSite(site.id)
      toast.success("삭제되었습니다.")
      setDeleteDialogOpen(false)
      setSettingsDialogOpen(false)
    } catch {
      setDeleteError("삭제 중 오류가 발생했습니다. 다시 시도해주세요.")
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDragStart = (worker: Worker) => {
    setDraggedWorker(worker)
  }

  const handleDragEnd = () => {
    setDraggedWorker(null)
  }

  const handleDropToDailyAssigned = () => {
    if (!site || !draggedWorker) return

    // Check if worker is "미출근" - cannot assign
    if (draggedWorker.status === "미출근") {
      toast.error("미출근 인력은 배치할 수 없습니다. 사무실 출근 처리 후 배치해 주세요.")
      setDraggedWorker(null)
      return
    }

    // If from pool (출근 status)
    if (draggedWorker.status === "출근") {
      moveWorkerToAssigned(draggedWorker.id, site.id)
      updateWorker({ ...draggedWorker, status: "배치", assignedSiteId: site.id })
      toast.success(`${draggedWorker.name}님이 당일 배치되었습니다`)
    }
    setDraggedWorker(null)
  }

  const handleDropToFixed = () => {
    if (!site || !draggedWorker) return

    // Check if worker is "미출근" - cannot assign
    if (draggedWorker.status === "미출근") {
      toast.error("미출근 인력은 배치할 수 없습니다. 사무실 출근 처리 후 배치해 주세요.")
      setDraggedWorker(null)
      return
    }

    // Open date range dialog
    setFixedDateWorkerIds([draggedWorker.id])
    setFixedStartDate(new Date().toISOString().split("T")[0])
    setFixedEndDate(
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
    )
    setFixedDateDialogOpen(true)
    setDraggedWorker(null)
  }

  const handleDropToPool = () => {
    if (!site || !draggedWorker) return
    // Can only release from daily assigned or fixed
    if (dailyAssignedIds.includes(draggedWorker.id)) {
      moveWorkerToWaiting(draggedWorker.id, site.id)
      updateWorker({ ...draggedWorker, status: "출근", assignedSiteId: undefined })
      toast.success(`${draggedWorker.name}님이 인력 풀로 이동되었습니다`)
    }
    setDraggedWorker(null)
  }

  const handleConfirmFixedDateRange = () => {
    if (!site || fixedDateWorkerIds.length === 0) return
    if (!fixedStartDate || !fixedEndDate) {
      toast.error("시작일과 종료일을 모두 입력해주세요")
      return
    }

    for (const workerId of fixedDateWorkerIds) {
      const worker = state.workers.find((w) => w.id === workerId)
      if (worker) {
        moveWorkerToFixed(workerId, site.id)
        updateWorker({
          ...worker,
          isFixed: true,
          fixedStartDate,
          fixedEndDate,
          assignedSiteId: site.id,
          status: "배치",
        })
      }
    }

    toast.success(`${fixedDateWorkerIds.length}명이 고정 배치되었습니다`)
    setFixedDateDialogOpen(false)
    setFixedDateWorkerIds([])
    setSelectedPoolWorkerIds([])
  }

  const handleBulkMoveToDailyAssigned = () => {
    if (!site || selectedPoolWorkerIds.length === 0) return

    // Check if any selected worker is "미출근"
    const miChulgeunWorkers = selectedPoolWorkerIds.filter((id) => {
      const worker = state.workers.find((w) => w.id === id)
      return worker?.status === "미출근"
    })

    if (miChulgeunWorkers.length > 0) {
      toast.error("미출근 인력은 배치할 수 없습니다. 사무실 출근 처리 후 배치해 주세요.")
      return
    }

    for (const workerId of selectedPoolWorkerIds) {
      const worker = state.workers.find((w) => w.id === workerId)
      if (worker) {
        moveWorkerToAssigned(workerId, site.id)
        updateWorker({ ...worker, status: "배치", assignedSiteId: site.id })
      }
    }
    toast.success(`${selectedPoolWorkerIds.length}명이 당일 배치되었습니다`)
    setSelectedPoolWorkerIds([])
  }

  const handleBulkMoveToFixed = () => {
    if (!site || selectedPoolWorkerIds.length === 0) return

    // Check if any selected worker is "미출근"
    const miChulgeunWorkers = selectedPoolWorkerIds.filter((id) => {
      const worker = state.workers.find((w) => w.id === id)
      return worker?.status === "미출근"
    })

    if (miChulgeunWorkers.length > 0) {
      toast.error("미출근 인력은 배치할 수 없습니다. 사무실 출근 처리 후 배치해 주세요.")
      return
    }

    setFixedDateWorkerIds(selectedPoolWorkerIds)
    setFixedStartDate(new Date().toISOString().split("T")[0])
    setFixedEndDate(
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
    )
    setFixedDateDialogOpen(true)
  }

  const handleDatePreset = (days: number) => {
    const start = new Date()
    const end = new Date()
    end.setDate(end.getDate() + days)
    setFixedStartDate(start.toISOString().split("T")[0])
    setFixedEndDate(end.toISOString().split("T")[0])
  }

  const handleEndOfMonth = () => {
    const start = new Date()
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
    setFixedStartDate(start.toISOString().split("T")[0])
    setFixedEndDate(end.toISOString().split("T")[0])
  }

  const handleNextDay = () => {
    if (!site) return
    // Reset daily assignments only - move them to pool with status "미출근"
    for (const workerId of dailyAssignedIds) {
      const worker = state.workers.find((w) => w.id === workerId)
      if (worker) {
        updateWorker({ ...worker, status: "미출근", assignedSiteId: undefined })
      }
      moveWorkerToWaiting(workerId, site.id)
    }
    setShowNextDayDialog(false)
    toast.success("오늘 배치를 마감했습니다. 내일은 출근 처리 후 다시 배치해 주세요.")
  }

  const handleSaveTodayRequired = () => {
    const value = Number.parseInt(todayRequiredInput, 10)
    if (Number.isNaN(value) || value < 0) {
      toast.error("올바른 숫자를 입력해주세요")
      return
    }
    if (site) {
      updateSite({ ...site, todayRequired: value })
      toast.success("오늘 필요 인원이 수정되었습니다")
    }
    setIsEditingRequired(false)
  }

  const handleOpenWorkerDetail = (worker: Worker) => {
    setSelectedWorker(worker)
    setWorkerSheetOpen(true)
  }

  const handleEditFixedWorker = (worker: Worker) => {
    setEditingFixedWorker(worker)
    setEditFixedStartDate(worker.fixedStartDate || "")
    setEditFixedEndDate(worker.fixedEndDate || "")
    setEditFixedDialogOpen(true)
  }

  const handleSaveEditFixed = () => {
    if (!editingFixedWorker || !site) return
    updateWorker({
      ...editingFixedWorker,
      fixedStartDate: editFixedStartDate,
      fixedEndDate: editFixedEndDate,
    })
    setEditFixedDialogOpen(false)
    setEditingFixedWorker(null)
    toast.success("고정 배치 기간이 수정되었습니다")
  }

  const handleRemoveFixed = () => {
    if (!editingFixedWorker || !site) return
    updateWorker({
      ...editingFixedWorker,
      isFixed: false,
      fixedStartDate: undefined,
      fixedEndDate: undefined,
      status: "출근",
      assignedSiteId: undefined,
    })
    moveWorkerToWaiting(editingFixedWorker.id, site.id)
    setEditFixedDialogOpen(false)
    setEditingFixedWorker(null)
    toast.success("고정 배치가 해제되었습니다")
  }

  // Get team info for selected worker
  const getTeamInfo = (worker: Worker) => {
    if (worker.team === "반장" && worker.teamMembers) {
      const members = state.workers.filter((w) => worker.teamMembers?.includes(w.id))
      return { type: "leader" as const, members }
    }
    if (worker.team === "팀원" && worker.teamLeaderId) {
      const leader = state.workers.find((w) => w.id === worker.teamLeaderId)
      const siblings = state.workers.filter(
        (w) => w.teamLeaderId === worker.teamLeaderId && w.id !== worker.id
      )
      return { type: "member" as const, leader, siblings }
    }
    return null
  }

  // Load settlement data when tab changes to settlement
  const loadSettlementData = async () => {
    if (!site) return
    setSettlementLoading(true)
    setSettlementError(null)

    try {
      // API stub: GET /api/sites/:siteId/settlements/workforce
      await new Promise((resolve) => setTimeout(resolve, 800))

      // Mock data based on assigned workers
      const allAssignedWorkers = [...dailyAssignedWorkers, ...fixedAssignedWorkers]
      const mockData = allAssignedWorkers.map((w, i) => ({
        id: `settle-${w.id}`,
        workerId: w.id,
        workerName: w.name,
        role: w.roles[0]?.name || "일반",
        attendanceDays: Math.floor(Math.random() * 10) + 5,
        attendanceHours: Math.floor(Math.random() * 80) + 40,
        unitPrice: 200000,
        calculatedAmount: (Math.floor(Math.random() * 10) + 5) * 200000,
        adjustment: 0,
        finalAmount: (Math.floor(Math.random() * 10) + 5) * 200000,
        status: (i % 3 === 0 ? "정산완료" : "미정산") as "미정산" | "정산완료",
      }))

      setSettlementData(mockData)
      setSettlementDateRange({
        start: site.startDate,
        end: new Date().toISOString().split("T")[0],
      })
      // Check if locked
      setSettlementLocked(site.status === "정산완료")
    } catch {
      setSettlementError("정산 데이터를 불러오는 데 실패했습니다.")
    } finally {
      setSettlementLoading(false)
    }
  }

  // Handle amount edit
  const handleStartEditAmount = (settlementId: string, currentAmount: number) => {
    if (settlementLocked) return
    setEditingSettlementId(settlementId)
    setEditingAmount(String(currentAmount))
  }

  const handleSaveAmount = async () => {
    if (!editingSettlementId) return
    const value = Number.parseInt(editingAmount, 10)
    if (Number.isNaN(value) || value < 0) {
      toast.error("올바른 금액을 입력해주세요 (0 이상)")
      return
    }

    setSavingSettlement(true)
    try {
      // API stub: PATCH /api/sites/:siteId/settlements/workforce
      await new Promise((resolve) => setTimeout(resolve, 500))

      setSettlementData((prev) =>
        prev.map((s) =>
          s.id === editingSettlementId
            ? { ...s, adjustment: value - s.calculatedAmount, finalAmount: value }
            : s
        )
      )
      toast.success("금액이 수정되었습니다.")
    } catch {
      toast.error("금액 수정에 실패했습니다.")
    } finally {
      setSavingSettlement(false)
      setEditingSettlementId(null)
      setEditingAmount("")
    }
  }

  const handleCancelEdit = () => {
    setEditingSettlementId(null)
    setEditingAmount("")
  }

  // Handle lock/finalize
  const handleLockSettlement = async () => {
    if (lockConfirmText !== "LOCK" && lockConfirmText !== site?.name) {
      toast.error("'LOCK' 또는 현장명을 정확히 입력해주세요.")
      return
    }

    setIsLocking(true)
    try {
      // API stub: POST /api/sites/:siteId/settlements/workforce/lock
      await new Promise((resolve) => setTimeout(resolve, 500))

      setSettlementLocked(true)
      setSettlementData((prev) => prev.map((s) => ({ ...s, status: "정산완료" as const })))
      if (site) {
        updateSite({ ...site, status: "정산완료" })
      }
      toast.success("정산이 확정되었습니다.")
      setLockDialogOpen(false)
      setLockConfirmText("")
    } catch {
      toast.error("정산 확정에 실패했습니다.")
    } finally {
      setIsLocking(false)
    }
  }

  // Load settlement when switching to that tab
  useEffect(() => {
    if (activeTab === "정산" && site) {
      loadSettlementData()
    }
  }, [activeTab, site])



  if (!isOpen || !site) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <div className="mb-4 rounded-full bg-muted p-4">
              <AlertTriangle className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">현장을 선택하세요</h3>
            <p className="text-sm text-muted-foreground">
              현장을 선택하면 제어판이 열립니다
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const totalAssigned = dailyAssignedWorkers.length + fixedAssignedWorkers.length

  return (
    <div
      className={cn(
        "flex flex-1 flex-col overflow-hidden transition-all duration-300",
        isOpen ? "translate-x-0 opacity-100" : "-translate-x-4 opacity-0"
      )}
    >
      {/* Header */}
      <div className="shrink-0 flex flex-col gap-3 border-b border-border bg-card p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold truncate">{site.name}</h2>
              <Popover open={statusPopoverOpen} onOpenChange={setStatusPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-2">
                    <Badge className={cn("text-xs", statusColors[site.status as SiteStatusType])}>
                      {site.status}
                    </Badge>
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2" align="start">
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-medium text-muted-foreground mb-1 px-2">현장 상태 변경</p>
                    {siteStatuses.map((status) => (
                      <Button
                        key={status}
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "justify-start",
                          site.status === status && "bg-accent"
                        )}
                        onClick={() => handleStatusChange(status)}
                      >
                        <Badge className={cn("mr-2 text-xs", statusColors[status])}>
                          {status}
                        </Badge>
                        {site.status === status && <Check className="ml-auto h-4 w-4" />}
                      </Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <p className="text-sm text-muted-foreground truncate">{site.address}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={handleOpenSettings}>
              <Settings className="mr-2 h-4 w-4" />
              설정
            </Button>
          </div>
        </div>

        {/* Today Required Headcount Editor */}
        <div className="flex items-center gap-4 rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">오늘 필요 인원:</span>
          </div>
          {isEditingRequired ? (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={todayRequiredInput}
                onChange={(e) => setTodayRequiredInput(e.target.value)}
                className="h-8 w-20"
                min={0}
              />
              <span className="text-sm">명</span>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={handleSaveTodayRequired}>
                <Check className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() => {
                  setIsEditingRequired(false)
                  setTodayRequiredInput(String(site.todayRequired))
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-base font-semibold">
                {site.todayRequired}명
              </Badge>
              <span className="text-sm text-muted-foreground">
                (배치 {totalAssigned}명)
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() => setIsEditingRequired(true)}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border bg-card px-4">
          <TabsList className="h-12 w-full justify-start bg-transparent p-0">
            <TabsTrigger value="배치" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4">
              인력 배치
            </TabsTrigger>
            <TabsTrigger value="당일정산" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4">
              당일 정산
            </TabsTrigger>
            <TabsTrigger value="누적정산" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4">
              <Receipt className="mr-1.5 h-4 w-4" />
              누적 정산
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 배치 Tab Content - 3 Column Layout */}
        <TabsContent value="배치" className="flex-1 m-0 overflow-hidden">
          <div className="flex h-full">
            {/* Left Column: 인력 풀 */}
            <div className="flex w-1/3 flex-col border-r border-border">
              <div className="shrink-0 p-3 border-b border-border bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-sm">인력 풀</h3>
                  <Badge variant="secondary">{filteredPoolWorkers.length}명</Badge>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="검색..."
                    value={poolSearch}
                    onChange={(e) => setPoolSearch(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                {selectedPoolWorkerIds.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs bg-transparent" onClick={handleBulkMoveToDailyAssigned}>
                      당일 배치
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs bg-transparent" onClick={handleBulkMoveToFixed}>
                      고정 배치
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedPoolWorkerIds([])}>
                      선택 해제
                    </Button>
                  </div>
                )}
              </div>
              <ScrollArea className="flex-1">
                <div
                  className={cn(
                    "min-h-full p-2",
                    draggedWorker && "bg-accent/30"
                  )}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDropToPool}
                >
                  {filteredPoolWorkers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Users className="mb-2 h-8 w-8 text-muted-foreground/50" />
                      <p className="text-xs text-muted-foreground">대기 인력 없음</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {filteredPoolWorkers.map((worker) => {
                        const isSelected = selectedPoolWorkerIds.includes(worker.id)
                        const isMichulgeun = worker.status === "미출근"
                        return (
                          <div
                            key={worker.id}
                            draggable={!isMichulgeun}
                            onDragStart={() => handleDragStart(worker)}
                            onDragEnd={handleDragEnd}
                            className={cn(
                              "flex items-center gap-2 rounded-md border border-border bg-card p-2 text-sm transition-all",
                              !isMichulgeun && "cursor-grab hover:border-primary/50 hover:shadow-sm",
                              isMichulgeun && "opacity-60 cursor-not-allowed",
                              isSelected && "border-primary bg-accent"
                            )}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedPoolWorkerIds((prev) => [...prev, worker.id])
                                } else {
                                  setSelectedPoolWorkerIds((prev) => prev.filter((id) => id !== worker.id))
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="shrink-0"
                              disabled={isMichulgeun}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium truncate">{worker.name}</span>
                                {worker.team === "반장" && (
                                  <Badge variant="secondary" className="text-[10px] px-1 h-4">반장</Badge>
                                )}
                                {isMichulgeun && (
                                  <Badge variant="outline" className="text-[10px] px-1 h-4 text-muted-foreground">미출근</Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {worker.roles.slice(0, 2).map((role) => (
                                  <span
                                    key={role.id}
                                    className="text-[10px] px-1 rounded"
                                    style={{ backgroundColor: `${role.color}20`, color: role.color }}
                                  >
                                    {role.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Middle Column: 당일 배치 */}
            <div className="flex w-1/3 flex-col border-r border-border">
              <div className="shrink-0 p-3 border-b border-border bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-sm">당일 배치</h3>
                  <Badge variant="secondary">{dailyAssignedWorkers.length}명</Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-7 text-xs bg-transparent"
                  onClick={() => setShowNextDayDialog(true)}
                  disabled={dailyAssignedWorkers.length === 0}
                >
                  <RotateCcw className="mr-1.5 h-3 w-3" />
                  다음 날로 넘기기
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div
                  className={cn(
                    "min-h-full p-2",
                    draggedWorker && "bg-status-progress/10"
                  )}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDropToDailyAssigned}
                >
                  {dailyAssignedWorkers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Users className="mb-2 h-8 w-8 text-muted-foreground/50" />
                      <p className="text-xs text-muted-foreground">배치된 인력 없음</p>
                      <p className="text-[10px] text-muted-foreground mt-1">인력 풀에서 드래그하세요</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {dailyAssignedWorkers.map((worker) => (
                        <div
                          key={worker.id}
                          draggable
                          onDragStart={() => handleDragStart(worker)}
                          onDragEnd={handleDragEnd}
                          onClick={() => handleOpenWorkerDetail(worker)}
                          className="flex items-center gap-2 rounded-md border border-border bg-card p-2 text-sm cursor-grab hover:border-primary/50 hover:shadow-sm transition-all"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium truncate">{worker.name}</span>
                              {worker.team === "반장" && (
                                <Badge variant="secondary" className="text-[10px] px-1 h-4">반장</Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {worker.roles.slice(0, 2).map((role) => (
                                <span
                                  key={role.id}
                                  className="text-[10px] px-1 rounded"
                                  style={{ backgroundColor: `${role.color}20`, color: role.color }}
                                >
                                  {role.name}
                                </span>
                              ))}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Right Column: 고정 배치 */}
            <div className="flex w-1/3 flex-col">
              <div className="shrink-0 p-3 border-b border-border bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-medium text-sm">고정 배치</h3>
                  </div>
                  <Badge variant="secondary">{fixedAssignedWorkers.length}명</Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">기간 동안 자동 배치됩니다</p>
              </div>
              <ScrollArea className="flex-1">
                <div
                  className={cn(
                    "min-h-full p-2",
                    draggedWorker && "bg-status-pending/10"
                  )}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDropToFixed}
                >
                  {fixedAssignedWorkers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Lock className="mb-2 h-8 w-8 text-muted-foreground/50" />
                      <p className="text-xs text-muted-foreground">고정 배치 없음</p>
                      <p className="text-[10px] text-muted-foreground mt-1">인력 풀에서 드래그하세요</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {fixedAssignedWorkers.map((worker) => (
                        <div
                          key={worker.id}
                          onClick={() => handleEditFixedWorker(worker)}
                          className="flex items-center gap-2 rounded-md border border-border bg-card p-2 text-sm cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium truncate">{worker.name}</span>
                              {worker.team === "반장" && (
                                <Badge variant="secondary" className="text-[10px] px-1 h-4">반장</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground">
                                {worker.fixedStartDate && worker.fixedEndDate
                                  ? formatDateRange(worker.fixedStartDate, worker.fixedEndDate)
                                  : "기간 미설정"}
                              </span>
                            </div>
                          </div>
                          <Edit2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </TabsContent>

        

        {/* 당일 정산 Tab Content - Today's wages */}
        <TabsContent value="당일정산" className="flex-1 m-0 overflow-hidden">
          <div className="flex h-full flex-col">
            <div className="shrink-0 flex items-center justify-between gap-4 border-b border-border bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-3">
                <h3 className="font-medium text-sm">오늘 출근 인력 급여</h3>
                <Badge variant="secondary">
                  {dailyAssignedWorkers.length + fixedAssignedWorkers.length}명
                </Badge>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="bg-transparent"
              >
                <RotateCcw className="mr-1.5 h-4 w-4" />
                새로고침
              </Button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {(dailyAssignedWorkers.length + fixedAssignedWorkers.length) === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Receipt className="mb-3 h-10 w-10 text-muted-foreground/50" />
                  <h3 className="mb-1 font-semibold">오늘 출근한 인력이 없습니다</h3>
                  <p className="text-sm text-muted-foreground">
                    배치 탭에서 인력을 배치하세요.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="min-w-[100px]">이름</TableHead>
                      <TableHead className="min-w-[80px]">역할</TableHead>
                      <TableHead className="min-w-[80px]">배치 유형</TableHead>
                      <TableHead className="min-w-[100px] text-right">일당</TableHead>
                      <TableHead className="w-[90px] text-right">저장</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...dailyAssignedWorkers, ...fixedAssignedWorkers].map((worker) => (
                      <TableRow key={worker.id}>
                        <TableCell className="font-medium">{worker.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{worker.roles[0]?.name || "일반"}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={dailyAssignedWorkers.some(w => w.id === worker.id) ? "secondary" : "default"}>
                            {dailyAssignedWorkers.some(w => w.id === worker.id) ? "당일" : "고정"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            inputMode="numeric"
                            className="h-8 w-[120px] text-right"
                            value={getDailyWage(worker.id)}
                            onChange={(e) => {
                              const next = Number(e.target.value || 0)
                              setDailyWageDraftByWorkerId((prev) => ({ ...prev, [worker.id]: next }))
                            }}
                          />
                        </TableCell>

                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 bg-transparent"
                            disabled={savingRowId === worker.id}
                            onClick={() => handleSaveDailyWageRow(worker.id)}
                          >
                            {savingRowId === worker.id ? "저장중" : "저장"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            {(dailyAssignedWorkers.length + fixedAssignedWorkers.length) > 0 && (
              <div className="shrink-0 border-t border-border bg-muted/30 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    총 {dailyAssignedWorkers.length + fixedAssignedWorkers.length}명
                  </span>
                  <span className="text-sm font-semibold">
                    합계: {formatKoreanMoney(totalDailyWage)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* 누적 정산 Tab Content - Accumulated Workforce Settlement */}
        <TabsContent value="누적정산" className="flex-1 m-0 overflow-hidden">
          <div className="flex h-full flex-col">
            {/* Settlement Header */}
            <div className="shrink-0 flex items-center justify-between gap-4 border-b border-border bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-muted-foreground">기간:</Label>
                  <Input
                    type="date"
                    value={settlementDateRange.start}
                    onChange={(e) =>
                      setSettlementDateRange((prev) => ({ ...prev, start: e.target.value }))
                    }
                    className="h-8 w-32"
                    disabled={settlementLocked}
                  />
                  <span className="text-muted-foreground">~</span>
                  <Input
                    type="date"
                    value={settlementDateRange.end}
                    onChange={(e) =>
                      setSettlementDateRange((prev) => ({ ...prev, end: e.target.value }))
                    }
                    className="h-8 w-32"
                    disabled={settlementLocked}
                  />
                </div>
                {settlementLocked && (
                  <Badge className="bg-status-pending text-status-pending-foreground gap-1">
                    <Lock className="h-3 w-3" />
                    확정됨
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadSettlementData}
                  disabled={settlementLoading}
                  className="bg-transparent"
                >
                  {settlementLoading ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="mr-1.5 h-4 w-4" />
                  )}
                  새로고침
                </Button>
                {!settlementLocked && settlementData.length > 0 && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setLockConfirmText("")
                      setLockDialogOpen(true)
                    }}
                  >
                    <Lock className="mr-1.5 h-4 w-4" />
                    정산 확정 (락)
                  </Button>
                )}
              </div>
            </div>

            {/* Settlement Table */}
            <div className="flex-1 min-h-0 overflow-auto">
              {settlementLoading ? (
                // Loading State
                <div className="p-4 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-10 w-24" />
                      <Skeleton className="h-10 w-20" />
                      <Skeleton className="h-10 w-16" />
                      <Skeleton className="h-10 w-16" />
                      <Skeleton className="h-10 w-24" />
                      <Skeleton className="h-10 w-24" />
                      <Skeleton className="h-10 w-24" />
                      <Skeleton className="h-10 w-20" />
                    </div>
                  ))}
                </div>
              ) : settlementError ? (
                // Error State
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <AlertTriangle className="mb-3 h-10 w-10 text-destructive/50" />
                  <p className="text-sm text-destructive mb-3">{settlementError}</p>
                  <Button variant="outline" size="sm" onClick={loadSettlementData} className="bg-transparent">
                    다시 시도
                  </Button>
                </div>
              ) : settlementData.length === 0 ? (
                // Empty State
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Receipt className="mb-3 h-10 w-10 text-muted-foreground/50" />
                  <h3 className="mb-1 font-semibold">정산 데이터가 없습니다</h3>
                  <p className="text-sm text-muted-foreground">
                    해당 기간에 배치된 인력이 없습니다.
                  </p>
                </div>
              ) : (
                // Data Table
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="min-w-[100px]">이름</TableHead>
                      <TableHead className="min-w-[80px]">역할</TableHead>
                      <TableHead className="min-w-[60px] text-center">출근일</TableHead>
                      <TableHead className="min-w-[60px] text-center">시간</TableHead>
                      <TableHead className="min-w-[100px] text-right">단가</TableHead>
                      <TableHead className="min-w-[100px] text-right">계산금액</TableHead>
                      <TableHead className="min-w-[120px] text-right">최종금액</TableHead>
                      <TableHead className="min-w-[80px]">상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settlementData.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.workerName}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{row.role}</Badge>
                        </TableCell>
                        <TableCell className="text-center">{row.attendanceDays}일</TableCell>
                        <TableCell className="text-center">{row.attendanceHours}h</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatKoreanMoney(row.unitPrice)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatKoreanMoney(row.calculatedAmount)}
                        </TableCell>
                        <TableCell className="text-right">
                          {editingSettlementId === row.id ? (
                            <div className="flex items-center gap-1 justify-end">
                              <Input
                                type="number"
                                value={editingAmount}
                                onChange={(e) => setEditingAmount(e.target.value)}
                                className="h-8 w-24 text-right"
                                min={0}
                                autoFocus
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={handleSaveAmount}
                                disabled={savingSettlement}
                              >
                                {savingSettlement ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={handleCancelEdit}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleStartEditAmount(row.id, row.finalAmount)}
                              disabled={settlementLocked}
                              className={cn(
                                "inline-flex items-center gap-1 tabular-nums font-semibold",
                                !settlementLocked && "hover:text-primary cursor-pointer",
                                settlementLocked && "cursor-not-allowed"
                              )}
                            >
                              {formatKoreanMoney(row.finalAmount)}
                              {!settlementLocked && (
                                <Edit2 className="h-3 w-3 text-muted-foreground" />
                              )}
                              {row.adjustment !== 0 && (
                                <span
                                  className={cn(
                                    "text-xs ml-1",
                                    row.adjustment > 0
                                      ? "text-green-600"
                                      : "text-destructive"
                                  )}
                                >
                                  ({row.adjustment > 0 ? "+" : ""}
                                  {formatKoreanMoney(row.adjustment)})
                                </span>
                              )}
                            </button>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={cn(
                              row.status === "정산완료"
                                ? "bg-status-progress text-status-progress-foreground"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {row.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Settlement Summary */}
            {!settlementLoading && !settlementError && settlementData.length > 0 && (
              <div className="shrink-0 border-t border-border bg-muted/30 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    총 {settlementData.length}명
                  </span>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">
                      계산 합계:{" "}
                      <span className="font-medium text-foreground">
                        {formatKoreanMoney(
                          settlementData.reduce((sum, s) => sum + s.calculatedAmount, 0)
                        )}
                      </span>
                    </span>
                    <span className="text-sm text-muted-foreground">
                      최종 합계:{" "}
                      <span className="font-semibold text-foreground">
                        {formatKoreanMoney(
                          settlementData.reduce((sum, s) => sum + s.finalAmount, 0)
                        )}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

      </Tabs>

      {/* Dialogs */}
      {/* Next Day Dialog */}
      <AlertDialog open={showNextDayDialog} onOpenChange={setShowNextDayDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>다음 날로 넘기기</AlertDialogTitle>
            <AlertDialogDescription>
              당일 배치된 인력 {dailyAssignedWorkers.length}명이 미출근 상태로 변경됩니다.
              고정 배치 인력은 유지됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleNextDay}>확인</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Fixed Date Range Dialog */}
      <Dialog open={fixedDateDialogOpen} onOpenChange={setFixedDateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>고정 배치 기간 설정</DialogTitle>
            <DialogDescription>
              {fixedDateWorkerIds.length}명을 고정 배치합니다. 기간을 설정해주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => handleDatePreset(7)}>1주</Button>
              <Button variant="outline" size="sm" onClick={() => handleDatePreset(14)}>2주</Button>
              <Button variant="outline" size="sm" onClick={() => handleDatePreset(30)}>1달</Button>
              <Button variant="outline" size="sm" onClick={handleEndOfMonth}>이번 달 말까지</Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>시작일</Label>
                <Input
                  type="date"
                  value={fixedStartDate}
                  onChange={(e) => setFixedStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label>종료일</Label>
                <Input
                  type="date"
                  value={fixedEndDate}
                  onChange={(e) => setFixedEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFixedDateDialogOpen(false)}>취소</Button>
            <Button onClick={handleConfirmFixedDateRange}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Fixed Dialog */}
      <Dialog open={editFixedDialogOpen} onOpenChange={setEditFixedDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>고정 배치 수정</DialogTitle>
            <DialogDescription>
              {editingFixedWorker?.name}님의 고정 배치 기간을 수정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>시작일</Label>
                <Input
                  type="date"
                  value={editFixedStartDate}
                  onChange={(e) => setEditFixedStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label>종료일</Label>
                <Input
                  type="date"
                  value={editFixedEndDate}
                  onChange={(e) => setEditFixedEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="destructive" onClick={handleRemoveFixed} className="mr-auto">
              배치 해제
            </Button>
            <Button variant="outline" onClick={() => setEditFixedDialogOpen(false)}>취소</Button>
            <Button onClick={handleSaveEditFixed}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>현장 설정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>현장명</Label>
              <Input value={editSiteName} onChange={(e) => setEditSiteName(e.target.value)} />
            </div>
            <div>
              <Label>주소</Label>
              <Input value={editSiteAddress} onChange={(e) => setEditSiteAddress(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>시작일</Label>
                <Input type="date" value={editSiteStartDate} onChange={(e) => setEditSiteStartDate(e.target.value)} />
              </div>
              <div>
                <Label>종료일</Label>
                <Input type="date" value={editSiteEndDate} onChange={(e) => setEditSiteEndDate(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>계획 인원</Label>
                <Input type="number" value={editSitePlannedWorkers} onChange={(e) => setEditSitePlannedWorkers(e.target.value)} />
              </div>
              <div>
                <Label>오늘 필요 인원</Label>
                <Input type="number" value={editSiteTodayRequired} onChange={(e) => setEditSiteTodayRequired(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>출근 시간</Label>
                <Input type="time" value={editSiteCheckInTime} onChange={(e) => setEditSiteCheckInTime(e.target.value)} />
              </div>
              <div>
                <Label>사무소 전화</Label>
                <Input value={editSiteOfficePhone} onChange={(e) => setEditSiteOfficePhone(e.target.value)} />
              </div>
            </div>

            {/* Danger Zone */}
            {onDeleteSite && (
              <div className="border-t border-destructive/30 pt-4 mt-4">
                <Label className="text-destructive font-medium">위험 구역</Label>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  현장을 삭제하면 모든 배치 정보가 함께 삭제됩니다.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setDeleteConfirmText("")
                    setDeleteError(null)
                    setDeleteDialogOpen(true)
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  현장 삭제
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsDialogOpen(false)} className="bg-transparent">취소</Button>
            <Button onClick={handleSaveSettings}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              현장을 삭제할까요?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                <strong>{site?.name}</strong> 현장의 모든 정보가 영구적으로 삭제됩니다.
              </p>
              <p className="text-destructive font-medium">삭제 후 복구할 수 없습니다.</p>
              <div className="pt-2">
                <Label htmlFor="site-delete-confirm">
                  확인을 위해 현장명 또는 'DELETE'를 입력하세요
                </Label>
                <Input
                  id="site-delete-confirm"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={site?.name || "DELETE"}
                  className="mt-2"
                />
              </div>
              {deleteError && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{deleteError}</AlertDescription>
                </Alert>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSite}
              disabled={isDeleting || !deleteConfirmText}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Settlement Lock Confirmation Dialog */}
      <AlertDialog open={lockDialogOpen} onOpenChange={setLockDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              정산을 확정할까요?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                <strong>{site?.name}</strong> 현장의 인력별 정산을 확정합니다.
              </p>
              <p className="text-destructive font-medium">
                확정 후에는 금액을 수정할 수 없습니다.
              </p>
              <div className="pt-2">
                <Label htmlFor="lock-confirm">
                  확인을 위해 'LOCK' 또는 현장명을 입력하세요
                </Label>
                <Input
                  id="lock-confirm"
                  value={lockConfirmText}
                  onChange={(e) => setLockConfirmText(e.target.value)}
                  placeholder="LOCK"
                  className="mt-2"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLocking}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLockSettlement}
              disabled={isLocking || !lockConfirmText}
            >
              {isLocking ? "확정 중..." : "정산 확정"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Worker Detail Sheet */}
      <Sheet open={workerSheetOpen} onOpenChange={setWorkerSheetOpen}>
        <SheetContent className="w-[400px] sm:w-[540px] h-full overflow-hidden flex flex-col">
          <SheetHeader className="shrink-0">
            <SheetTitle>{selectedWorker?.name}</SheetTitle>
            <SheetDescription>{selectedWorker && formatPhone(selectedWorker.phone)}</SheetDescription>
          </SheetHeader>
          <ScrollArea className="flex-1 mt-4">
            {selectedWorker && (
              <div className="space-y-4 pr-4">
                <div>
                  <Label className="text-xs text-muted-foreground">역할</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedWorker.roles.map((role) => (
                      <Badge
                        key={role.id}
                        style={{ backgroundColor: `${role.color}20`, color: role.color }}
                      >
                        {role.name}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">팀</Label>
                  <p className="text-sm mt-1">
                    {selectedWorker.team === "반장"
                      ? `반장 (팀원 ${selectedWorker.teamMembers?.length || 0}명)`
                      : selectedWorker.team === "팀원"
                        ? `팀원`
                        : "소속 팀 없음"}
                  </p>
                </div>
                {selectedWorker.isFixed && (
                  <div>
                    <Label className="text-xs text-muted-foreground">고정 배치 기간</Label>
                    <p className="text-sm mt-1">
                      {formatDateRange(selectedWorker.fixedStartDate || "", selectedWorker.fixedEndDate || "")}
                    </p>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  )
}
