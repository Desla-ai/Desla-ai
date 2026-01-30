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

const siteStatuses = ["미진행", "배차대기", "배차완료", "금액확정"] as const
type SiteStatusType = (typeof siteStatuses)[number]

const statusColors: Record<SiteStatusType, string> = {
  미진행: "bg-muted text-muted-foreground",
  배차대기: "bg-status-waiting text-status-waiting-foreground",
  배차완료: "bg-status-progress text-status-progress-foreground",
  금액확정: "bg-status-pending text-status-pending-foreground",
}

export function SiteControlPanel({ site, isOpen, onDeleteSite }: SiteControlPanelProps) {
  const {
    state,
    updateSite,
    updateWorker,
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
    unitPrice: number
    calculatedAmount: number
    adjustment: number
    finalAmount: number
    status: "확정대기" | "금액확정"
  }[]>([])
  const [settlementDateRange, setSettlementDateRange] = useState({ start: "", end: "" })

  // 당일 정산: 공수당(단가) 수정(draft) + 저장 상태
  const [dailyWageDraftByWorkerId, setDailyWageDraftByWorkerId] = useState<Record<string, number>>({})
  const [dailyWageSavedByWorkerId, setDailyWageSavedByWorkerId] = useState<Record<string, number>>({})
  const [savingRowId, setSavingRowId] = useState<string | null>(null)

  // ✅ 당일 정산: 자동 저장 상태(행별)
  const [autoSavingRowIds, setAutoSavingRowIds] = useState<Record<string, boolean>>({})
  const [autoSaveErrorByWorkerId, setAutoSaveErrorByWorkerId] = useState<Record<string, string>>({})

  // ✅ 금액확정(locked) 상태: workerId -> locked
  const [dailyLockedByWorkerId, setDailyLockedByWorkerId] = useState<Record<string, boolean>>({})

  // ✅ 선택한 workDate에 daily_settlements 기록이 있는 인력(과거 날짜에서도 표시용)
  const [recordedWorkerIdsForDate, setRecordedWorkerIdsForDate] = useState<string[]>([])

  // ✅ 확정 해제(Unlock) 모달
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false)
  const [unlockTargetWorkerId, setUnlockTargetWorkerId] = useState<string | null>(null)
  const [unlockAcknowledge, setUnlockAcknowledge] = useState(false)
  const [unlockReason, setUnlockReason] = useState("")

  // ✅ 오늘 전체 금액확정 모달
  const [bulkConfirmDialogOpen, setBulkConfirmDialogOpen] = useState(false)
  const [bulkConfirmRunning, setBulkConfirmRunning] = useState(false)

  // ✅ 디바운스 타이머(행별)
  const wageDebounceRef = useMemo(() => new Map<string, any>(), [])

  useEffect(() => {
    return () => {
      wageDebounceRef.forEach((t) => clearTimeout(t))
      wageDebounceRef.clear()
    }
  }, [wageDebounceRef])

  const getTodayLocalStr = () => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }

  // 당일 정산 날짜: 기본은 오늘, 편집 모드에서만 변경
  const [workDate, setWorkDate] = useState<string>(() => getTodayLocalStr())

  const [workUnitsDraftByWorkerId, setWorkUnitsDraftByWorkerId] = useState<Record<string, number>>({})
  const [workUnitsSavedByWorkerId, setWorkUnitsSavedByWorkerId] = useState<Record<string, number>>({})

  // ✅ 당일정산 rows 강제 재조회 트리거
  const [dailyRowsReloadKey, setDailyRowsReloadKey] = useState(0)
  const [isEditDateMode, setIsEditDateMode] = useState(false)
  const [dailyRowsLoading, setDailyRowsLoading] = useState(false)

  function isWithinLastNDays(dateStr: string, n: number) {
    const [y, m, d] = dateStr.split("-").map(Number)
    if (!y || !m || !d) return false

    const target = new Date(y, m - 1, d) // ✅ local midnight
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()) // ✅ local midnight

    const diffDays = Math.floor((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24))
    return diffDays >= 0 && diffDays <= n
  }

  function kstDateString(d: Date = new Date()) {
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
    return kst.toISOString().slice(0, 10) // YYYY-MM-DD
  }



  const getWorkUnits = (workerId: string) => {
    return (
      workUnitsDraftByWorkerId[workerId] ??
      workUnitsSavedByWorkerId[workerId] ??
      1.0
    )
  }



  const getDailyWage = (workerId: string) => {
    // 우선순위: draft > saved > default(200000)
    return (
      dailyWageDraftByWorkerId[workerId] ??
      dailyWageSavedByWorkerId[workerId] ??
      200000
    )
  }

  type DailySettlementRow = {
    id: string
    site_id: string
    worker_id: string
    work_date: string
    daily_wage: number
    work_units: number | null
    locked: boolean
    created_at: string
    updated_at: string
  }

  const applyDailySettlementRow = (row: DailySettlementRow) => {
    const workerId = String(row.worker_id)
    setDailyWageSavedByWorkerId((p) => ({ ...p, [workerId]: Number(row.daily_wage ?? 0) }))
    setWorkUnitsSavedByWorkerId((p) => ({ ...p, [workerId]: Number(row.work_units ?? 1.0) }))
    setDailyLockedByWorkerId((p) => ({ ...p, [workerId]: Boolean(row.locked) }))

    // 서버 진실 row를 반영했으니 draft는 제거(안전)
    setDailyWageDraftByWorkerId((p) => {
      if (!(workerId in p)) return p
      const n = { ...p }
      delete n[workerId]
      return n
    })
    setWorkUnitsDraftByWorkerId((p) => {
      if (!(workerId in p)) return p
      const n = { ...p }
      delete n[workerId]
      return n
    })
  }

  const putDailySettlement = async (payload: {
    siteId: string
    workerId: string
    workDate: string
    dailyWage?: number
    workUnits?: number
    locked?: boolean
  }) => {
    const res = await fetch("/api/daily-settlements", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    const json = await res.json().catch(() => ({} as any))
    if (!res.ok) throw new Error(json?.error ?? "저장 실패")

    const row = json?.row as DailySettlementRow | undefined
    if (!row) throw new Error("서버 응답(row)이 없습니다.")
    return row
  }

  // Get global pool (workers with status "출근" and not assigned)
  const globalPoolWorkers = useMemo(() => {
    return state.workers.filter((w) => {
      const assigned = (w as any).assignedSiteId ?? (w as any).assigned_site_id ?? null
      return (w.status === "출근" || w.status === "미출근") && !assigned
    })
  }, [state.workers])

  // Get workers for this site
  const siteId = site?.id

  const dailyAssignedWorkers = useMemo(() => {
    if (!siteId) return []
    return state.workers.filter((w) => {
      const assigned = (w as any).assignedSiteId ?? (w as any).assigned_site_id ?? null
      const isFixed = (w as any).isFixed ?? (w as any).is_fixed ?? false
      return assigned === siteId && !isFixed
    })
  }, [state.workers, siteId])

  const fixedAssignedWorkers = useMemo(() => {
    if (!siteId) return []
    return state.workers.filter((w) => {
      const assigned = (w as any).assignedSiteId ?? (w as any).assigned_site_id ?? null
      const isFixed = (w as any).isFixed ?? (w as any).is_fixed ?? false
      return assigned === siteId && isFixed
    })
  }, [state.workers, siteId])

  const todayWorkers = [...dailyAssignedWorkers, ...fixedAssignedWorkers]
  const uniqueWorkers = Array.from(new Map(todayWorkers.map(w => [w.id, w])).values())


  // ✅ 당일정산 표시용 인력: "현재 배치 인력" + "선택한 날짜에 기록이 있는 인력" 합집합
  const displayWorkers = useMemo(() => {
    const currentlyAssigned = [...dailyAssignedWorkers, ...fixedAssignedWorkers]
    const currentMap = new Map(currentlyAssigned.map((w) => [w.id, w]))

    // 과거 날짜 기록에만 있고 현재 배치에는 없는 인력들
    const recordedOnly = state.workers.filter((w) => {
      if (!recordedWorkerIdsForDate.includes(w.id)) return false
      return !currentMap.has(w.id)
    })

    // 합치고 중복 제거
    const merged = [...currentlyAssigned, ...recordedOnly]
    return Array.from(new Map(merged.map((w) => [w.id, w])).values())
  }, [
    dailyAssignedWorkers,
    fixedAssignedWorkers,
    recordedWorkerIdsForDate,
    state.workers,
  ])


  const totalAmount = displayWorkers.reduce(
    (sum, w) => sum + getDailyWage(w.id) * getWorkUnits(w.id),
    0
  )



  // Filtered pool workers based on search
  const filteredPoolWorkers = useMemo(() => {
    if (!poolSearch.trim()) return globalPoolWorkers
    const query = poolSearch.toLowerCase()
    return globalPoolWorkers.filter((w) => {
      const nameOk = (w.name ?? "").toLowerCase().includes(query)
      const phoneOk = (w.phone ?? "").includes(query)
      const rolesOk = (w.roles ?? []).some((r) => (r.name ?? "").toLowerCase().includes(query))
      const teamOk = (w.team ?? "").toLowerCase().includes(query)
      return nameOk || phoneOk || rolesOk || teamOk
    })
  }, [globalPoolWorkers, poolSearch])

  useEffect(() => {
    if (site) {
      setTodayRequiredInput(String(site.todayRequired))
    }
  }, [site])

  useEffect(() => {
    const loadDailyRows = async () => {
      if (!site?.id) return
      if (!isWithinLastNDays(workDate, 30)) return

      setDailyRowsLoading(true)
      try {
        const res = await fetch(`/api/daily-settlements?siteId=${site.id}&date=${workDate}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error ?? "당일 정산 로드 실패")

        const rows = json.rows ?? []
        const wageMap: Record<string, number> = {}
        const lockedMap: Record<string, boolean> = {}

        const unitsMap: Record<string, number> = {}

        for (const r of rows) {
          wageMap[r.worker_id] = r.daily_wage
          unitsMap[r.worker_id] = Number(r.work_units ?? 1.0)
          lockedMap[r.worker_id] = Boolean(r.locked)
        }

        setWorkUnitsSavedByWorkerId(unitsMap)
        setWorkUnitsDraftByWorkerId({})
        setDailyWageSavedByWorkerId(wageMap)
        setDailyLockedByWorkerId(lockedMap)
        setRecordedWorkerIdsForDate(
          Array.from(new Set((rows ?? []).map((r: any) => String(r.worker_id))))
        )

        // draft는 날짜 바뀌면 초기화(편집 UX 안전)
        setDailyWageDraftByWorkerId({})
        setAutoSaveErrorByWorkerId({})
      } catch (e: any) {
        toast.error(e?.message ?? "당일 정산을 불러오지 못했습니다")
        setDailyWageSavedByWorkerId({})
      } finally {
        setDailyRowsLoading(false)
      }
    }

    loadDailyRows()
  }, [site?.id, workDate, dailyRowsReloadKey])



  const handleStatusChange = (newStatus: SiteStatusType) => {
    if (!site) return
    updateSite({ ...site, status: newStatus })
    setStatusPopoverOpen(false)
    toast.success(`현장 상태가 '${newStatus}'로 변경되었습니다.`)
  }

  const handleOpenSettings = () => {
    if (site) {
      setEditSiteName(site.name)
      setEditSiteAddress(site.address ?? "")
      setEditSiteStartDate(site.startDate ?? "")
      setEditSiteEndDate(site.endDate ?? "")
      setEditSitePlannedWorkers(String(site.plannedWorkers))
      setEditSiteTodayRequired(String(site.todayRequired))
      setEditSiteCheckInTime(site.checkInTime ?? "")
      setEditSiteOfficePhone(site.officePhone ?? "")
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

  const handleDropToDailyAssigned = async () => {
    if (!site || !draggedWorker) return

    if (draggedWorker.status === "미출근") {
      toast.error("미출근 인력은 배치할 수 없습니다. 사무실 출근 처리 후 배치해 주세요.")
      setDraggedWorker(null)
      return
    }

    if (draggedWorker.status === "출근") {
      await updateWorker({ ...draggedWorker, status: "배치", assignedSiteId: site.id, isFixed: false } as any)
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
    setFixedStartDate(kstDateString())
    const end = new Date()
    end.setDate(end.getDate() + 30)
    setFixedEndDate(kstDateString(end))
    setFixedDateDialogOpen(true)
    setDraggedWorker(null)
  }

  const handleDropToPool = async () => {
    if (!site || !draggedWorker) return

    const assigned = (draggedWorker as any).assignedSiteId ?? (draggedWorker as any).assigned_site_id ?? null
    const isFixed = (draggedWorker as any).isFixed ?? (draggedWorker as any).is_fixed ?? false

    // 이 현장의 "당일 배치"에서만 풀로 해제 허용(원래 의도 유지)
    if (assigned === site.id && !isFixed) {
      await updateWorker({ ...draggedWorker, status: "출근", assignedSiteId: undefined, isFixed: false } as any)
      toast.success(`${draggedWorker.name}님이 인력 풀로 이동되었습니다`)
    }

    setDraggedWorker(null)
  }

  const handleConfirmFixedDateRange = async () => {
    if (!site || fixedDateWorkerIds.length === 0) return
    if (!fixedStartDate || !fixedEndDate) {
      toast.error("시작일과 종료일을 모두 입력해주세요")
      return
    }

    for (const workerId of fixedDateWorkerIds) {
      const worker = state.workers.find((w) => w.id === workerId)
      if (worker) {
        await updateWorker({
          ...worker,
          isFixed: true,
          fixedStartDate,
          fixedEndDate,
          assignedSiteId: site.id,
          status: "배치",
        } as any)
      }
    }

    toast.success(`${fixedDateWorkerIds.length}명이 고정 배치되었습니다`)
    setFixedDateDialogOpen(false)
    setFixedDateWorkerIds([])
    setSelectedPoolWorkerIds([])
  }


  const handleBulkMoveToDailyAssigned = async () => {
    if (!site || selectedPoolWorkerIds.length === 0) return

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
        await updateWorker({ ...worker, status: "배치", assignedSiteId: site.id, isFixed: false } as any)
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
    setFixedStartDate(kstDateString())
    const end = new Date()
    end.setDate(end.getDate() + 30)
    setFixedEndDate(kstDateString(end))
    setFixedDateDialogOpen(true)
  }

  const handleDatePreset = (days: number) => {
    const start = new Date()
    const end = new Date()
    end.setDate(end.getDate() + days)
    setFixedStartDate(kstDateString(start))
    setFixedEndDate(kstDateString(end))
  }

  const handleEndOfMonth = () => {
    const start = new Date()
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
    setFixedStartDate(kstDateString(start))
    setFixedEndDate(kstDateString(end))
  }

  const handleNextDay = async () => {
    if (!site) return

    for (const worker of dailyAssignedWorkers) {
      await updateWorker({ ...worker, status: "미출근", assignedSiteId: undefined, isFixed: false } as any)
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

  const handleRemoveFixed = async () => {
    if (!editingFixedWorker || !site) return
    await updateWorker({
      ...editingFixedWorker,
      isFixed: false,
      fixedStartDate: undefined,
      fixedEndDate: undefined,
      status: "출근",
      assignedSiteId: undefined,
    } as any)

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
      const start = settlementDateRange?.start || site.startDate
      const end = settlementDateRange?.end || kstDateString()

      const res = await fetch(
        `/api/settlements/accumulated?siteId=${encodeURIComponent(site.id)}&start=${encodeURIComponent(
          start
        )}&end=${encodeURIComponent(end)}`
      )

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `누적 정산 조회 실패 (${res.status})`)
      }

      const body = await res.json()
      setSettlementData(body.items ?? [])
      setSettlementDateRange({ start, end })
    } catch (e: any) {
      setSettlementError(e?.message ?? "누적 정산을 불러오지 못했습니다")
    } finally {
      setSettlementLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === "누적정산" && site) {
      loadSettlementData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, site?.id])

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
                                {(worker.roles ?? []).slice(0, 2).map((role) => (
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
                {false && (
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
                )}
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
                              {(worker.roles ?? []).slice(0, 2).map((role) => (
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
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">기준일</Label>
                  {isEditDateMode ? (
                    <>
                      <Input
                        type="date"
                        value={workDate}
                        onChange={(e) => {
                          const next = e.target.value
                          if (!isWithinLastNDays(next, 30)) {
                            toast.error("최근 30일 이내만 수정할 수 있습니다.")
                            return
                          }
                          setWorkDate(next)
                        }}
                        className="h-8 w-32"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 bg-transparent"
                        onClick={() => {
                          setIsEditDateMode(false)
                          setWorkDate(getTodayLocalStr())
                        }}

                      >
                        편집 종료
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => setWorkDate(getTodayLocalStr())}
                      >
                        오늘
                      </Button>
                    </>
                  ) : (
                    <>
                      <Badge variant="outline" className="h-8">
                        {workDate}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 bg-transparent"
                        onClick={() => setIsEditDateMode(true)}
                      >
                        날짜 편집
                      </Button>
                    </>
                  )}
                </div>
                <Badge variant="secondary">
                  {displayWorkers.length}명
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => setBulkConfirmDialogOpen(true)}
                  disabled={bulkConfirmRunning || dailyRowsLoading || displayWorkers.length === 0}
                >
                  <Lock className="mr-1.5 h-4 w-4" />
                  오늘 전체 금액확정
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="bg-transparent"
                  onClick={() => {
                    setDailyRowsReloadKey((k) => k + 1)
                    toast.message("새로고침")
                  }}

                >
                  <RotateCcw className="mr-1.5 h-4 w-4" />
                  새로고침
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {displayWorkers.length === 0 ? (
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
                      <TableHead className="min-w-[140px] text-right">공수</TableHead>
                      <TableHead className="min-w-[100px] text-right">공수당(단가)</TableHead>
                      <TableHead className="w-[120px] text-right">금액확정</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayWorkers.map((worker) => (
                      <TableRow key={worker.id}>
                        <TableCell className="font-medium">{worker.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{worker.roles[0]?.name || "일반"}</Badge>
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const isDaily = dailyAssignedWorkers.some((w) => w.id === worker.id)
                            const isFixed = fixedAssignedWorkers.some((w) => w.id === worker.id)
                            const isRecordedOnly =
                              recordedWorkerIdsForDate.includes(worker.id) && !isDaily && !isFixed

                            const label = isDaily ? "당일" : isFixed ? "고정" : isRecordedOnly ? "기록" : "기타"

                            return (
                              <Badge variant={isRecordedOnly ? "outline" : isDaily ? "secondary" : "default"}>
                                {label}
                              </Badge>
                            )
                          })()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 bg-transparent"
                              disabled={Boolean(dailyLockedByWorkerId[worker.id])}
                              onClick={async () => {
                                if (dailyLockedByWorkerId[worker.id]) return
                                const next = Math.max(0, getWorkUnits(worker.id) - 0.5)

                                // draft 반영(즉시 UI 반영)
                                setWorkUnitsDraftByWorkerId((p) => ({ ...p, [worker.id]: next }))

                                // ✅ 즉시 저장
                                try {
                                  setAutoSavingRowIds((p) => ({ ...p, [worker.id]: true }))
                                  setAutoSaveErrorByWorkerId((p) => {
                                    const n = { ...p }; delete n[worker.id]; return n
                                  })

                                  const row = await putDailySettlement({
                                    siteId: site!.id,
                                    workerId: worker.id,
                                    workDate,
                                    dailyWage: getDailyWage(worker.id),
                                    workUnits: next,
                                  })
                                  applyDailySettlementRow(row)

                                } catch (e: any) {
                                  setAutoSaveErrorByWorkerId((p) => ({ ...p, [worker.id]: e?.message ?? "공수 저장 실패" }))
                                } finally {
                                  setAutoSavingRowIds((p) => ({ ...p, [worker.id]: false }))
                                }
                              }}
                            >
                              -0.5
                            </Button>

                            <div className="w-[56px] text-right tabular-nums">
                              {getWorkUnits(worker.id).toFixed(1)}
                            </div>

                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 bg-transparent"
                              disabled={Boolean(dailyLockedByWorkerId[worker.id])}
                              onClick={async () => {
                                if (dailyLockedByWorkerId[worker.id]) return
                                const next = getWorkUnits(worker.id) + 0.5

                                setWorkUnitsDraftByWorkerId((p) => ({ ...p, [worker.id]: next }))

                                try {
                                  setAutoSavingRowIds((p) => ({ ...p, [worker.id]: true }))
                                  setAutoSaveErrorByWorkerId((p) => {
                                    const n = { ...p }; delete n[worker.id]; return n
                                  })

                                  const row = await putDailySettlement({
                                    siteId: site!.id,
                                    workerId: worker.id,
                                    workDate,
                                    dailyWage: getDailyWage(worker.id),
                                    workUnits: next,
                                  })
                                  applyDailySettlementRow(row)

                                } catch (e: any) {
                                  setAutoSaveErrorByWorkerId((p) => ({ ...p, [worker.id]: e?.message ?? "공수 저장 실패" }))
                                } finally {
                                  setAutoSavingRowIds((p) => ({ ...p, [worker.id]: false }))
                                }
                              }}
                            >
                              +0.5
                            </Button>
                          </div>

                          <div className="mt-1 flex justify-end">
                            {autoSavingRowIds[worker.id] ? (
                              <span className="text-[10px] text-muted-foreground">저장중…</span>
                            ) : autoSaveErrorByWorkerId[worker.id] ? (
                              <span className="text-[10px] text-destructive">저장 실패</span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">&nbsp;</span>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="text-right">
                          <Input
                            type="number"
                            inputMode="numeric"
                            className="h-8 w-[120px] text-right"
                            value={getDailyWage(worker.id)}
                            disabled={Boolean(dailyLockedByWorkerId[worker.id])}
                            onChange={(e) => {
                              // ✅ 확정(locked) 상태면 수정/자동저장 절대 금지 (안전장치)
                              if (dailyLockedByWorkerId[worker.id]) return

                              const next = Number(e.target.value || 0)

                              setDailyWageDraftByWorkerId((prev) => ({ ...prev, [worker.id]: next }))

                              // 디바운스 자동 저장
                              const prevTimer = wageDebounceRef.get(worker.id)
                              if (prevTimer) clearTimeout(prevTimer)

                              const t = setTimeout(async () => {
                                try {
                                  setAutoSavingRowIds((p) => ({ ...p, [worker.id]: true }))
                                  setAutoSaveErrorByWorkerId((p) => {
                                    const n = { ...p }
                                    delete n[worker.id]
                                    return n
                                  })

                                  const row = await putDailySettlement({
                                    siteId: site!.id,
                                    workerId: worker.id,
                                    workDate,
                                    dailyWage: next,                 // 너가 이미 바꾼 부분
                                    workUnits: getWorkUnits(worker.id),
                                  })
                                  applyDailySettlementRow(row)

                                } catch (err: any) {
                                  setAutoSaveErrorByWorkerId((p) => ({ ...p, [worker.id]: err?.message ?? "자동 저장 실패" }))
                                } finally {
                                  setAutoSavingRowIds((p) => ({ ...p, [worker.id]: false }))
                                }
                              }, 450)

                              wageDebounceRef.set(worker.id, t)
                            }}
                          />

                          {/* 작은 상태표시(저장중/실패) */}
                          <div className="mt-1 flex justify-end">
                            {autoSavingRowIds[worker.id] ? (
                              <span className="text-[10px] text-muted-foreground">저장중…</span>
                            ) : autoSaveErrorByWorkerId[worker.id] ? (
                              <span className="text-[10px] text-destructive">저장 실패</span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">&nbsp;</span>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="text-right">
                          {dailyLockedByWorkerId[worker.id] ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 bg-transparent"
                              onClick={() => {
                                setUnlockTargetWorkerId(worker.id)
                                setUnlockAcknowledge(false)
                                setUnlockReason("")
                                setUnlockDialogOpen(true)
                              }}
                            >
                              확정 해제
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              className="h-8"
                              disabled={autoSavingRowIds[worker.id]}
                              onClick={async () => {
                                const wage = getDailyWage(worker.id)
                                try {
                                  setSavingRowId(worker.id)
                                  const row = await putDailySettlement({
                                    siteId: site!.id,
                                    workerId: worker.id,
                                    workDate,
                                    dailyWage: getDailyWage(worker.id),
                                    workUnits: getWorkUnits(worker.id),
                                    locked: true,
                                  })
                                  applyDailySettlementRow(row)
                                  toast.success("금액확정 완료")
                                } catch (e: any) {
                                  toast.error(e?.message ?? "금액확정 실패")
                                } finally {
                                  setSavingRowId(null)
                                }
                              }}
                            >
                              {savingRowId === worker.id ? "처리중…" : "금액확정"}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            {displayWorkers.length > 0 && (
              <div className="shrink-0 border-t border-border bg-muted/30 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    총 {displayWorkers.length}명
                  </span>
                  <span className="text-sm font-semibold">
                    합계: {formatKoreanMoney(totalAmount)}
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
                  />
                  <span className="text-muted-foreground">~</span>
                  <Input
                    type="date"
                    value={settlementDateRange.end}
                    onChange={(e) =>
                      setSettlementDateRange((prev) => ({ ...prev, end: e.target.value }))
                    }
                    className="h-8 w-32"
                  />
                </div>
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
                      <TableHead className="min-w-[60px] text-center">공수</TableHead>
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
                        <TableCell className="text-center">{row.attendanceDays.toFixed(1)}공수</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatKoreanMoney(row.unitPrice)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatKoreanMoney(row.calculatedAmount)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatKoreanMoney(row.finalAmount)}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const viewStatus = row.status === "금액확정" ? "금액확정" : "확정대기"
                            const cls =
                              viewStatus === "금액확정"
                                ? "bg-status-progress text-status-progress-foreground"
                                : "bg-muted text-muted-foreground"

                            return <Badge className={cls}>{viewStatus}</Badge>
                          })()}
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
                <Input
                  value={editSiteOfficePhone ?? ""}
                  onChange={(e) => setEditSiteOfficePhone(e.target.value)}
                />
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

      {/* ✅ Unlock Confirmation Dialog (확정 해제) */}
      <Dialog open={unlockDialogOpen} onOpenChange={setUnlockDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>금액확정을 해제할까요?</DialogTitle>
            <DialogDescription>
              해제하면 정산/지급 금액에 영향이 있을 수 있습니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="flex items-start gap-2">
              <Checkbox
                checked={unlockAcknowledge}
                onCheckedChange={(v) => setUnlockAcknowledge(Boolean(v))}
                id="unlock-ack"
              />
              <Label htmlFor="unlock-ack" className="text-sm leading-5">
                정산/지급에 영향이 있을 수 있음을 이해했습니다.
              </Label>
            </div>

            <div className="space-y-1">
              <Label className="text-sm">해제 사유 (선택)</Label>
              <Input
                value={unlockReason}
                onChange={(e) => setUnlockReason(e.target.value)}
                placeholder="선택 입력"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlockDialogOpen(false)} className="bg-transparent">
              취소
            </Button>
            <Button
              variant="destructive"
              disabled={!unlockAcknowledge || !unlockTargetWorkerId}
              onClick={async () => {
                const workerId = unlockTargetWorkerId
                if (!workerId) return
                try {
                  setSavingRowId(workerId)
                  const row = await putDailySettlement({
                    siteId: site!.id,
                    workerId,
                    workDate,
                    locked: false,
                  })
                  applyDailySettlementRow(row)
                  toast.success("확정 해제 완료")
                  setUnlockDialogOpen(false)
                } catch (e: any) {
                  toast.error(e?.message ?? "해제 실패")
                } finally {
                  setSavingRowId(null)
                  setUnlockTargetWorkerId(null)
                }
              }}
            >
              확정 해제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ✅ Bulk Confirm Dialog (오늘 전체 금액확정) */}
      <AlertDialog open={bulkConfirmDialogOpen} onOpenChange={setBulkConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>오늘 전체 금액확정을 진행할까요?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <div>현장: <strong>{site?.name}</strong></div>
              <div>날짜: <strong>{workDate}</strong></div>
              <div className="text-destructive">
                배차된 인력 중 아직 확정되지 않은 항목을 금액확정 처리합니다.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkConfirmRunning}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkConfirmRunning}
              onClick={async () => {
                const unique = Array.from(new Map(displayWorkers.map(w => [w.id, w])).values())

                // 대상: 미확정(locked=false)만
                const targets = unique.filter(w => !dailyLockedByWorkerId[w.id])

                if (targets.length === 0) {
                  toast.message("확정할 인력이 없습니다.")
                  setBulkConfirmDialogOpen(false)
                  return
                }

                setBulkConfirmRunning(true)

                let ok = 0
                const failed: { name: string; reason: string }[] = []

                // A 방식: 실패 스킵, 계속 진행
                for (const w of targets) {
                  try {
                    const row = await putDailySettlement({
                      siteId: site!.id,
                      workerId: w.id,
                      workDate,
                      dailyWage: getDailyWage(w.id),
                      workUnits: getWorkUnits(w.id),
                      locked: true,
                    })
                    applyDailySettlementRow(row)
                    ok += 1
                  } catch (e: any) {
                    failed.push({ name: w.name, reason: e?.message ?? "확정 실패" })
                  }
                }

                setBulkConfirmRunning(false)
                setBulkConfirmDialogOpen(false)

                if (failed.length === 0) {
                  toast.success(`전체 금액확정 완료 (성공 ${ok}건)`)
                } else {
                  toast.warning(`전체 금액확정 완료: 성공 ${ok}건 / 실패 ${failed.length}건`)
                  // 실패 상세는 다음 단계에서 Sheet/Toast 확장 가능
                  console.warn("Bulk confirm failed:", failed)
                }
              }}
            >
              {bulkConfirmRunning ? "처리 중..." : "전체 확정"}
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
                    {(selectedWorker.roles ?? []).map((role) => (
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
