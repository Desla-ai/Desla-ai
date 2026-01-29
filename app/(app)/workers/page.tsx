"use client"

import { useState, useEffect, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { AppShell } from "@/components/layout/app-shell"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Card, CardContent } from "@/components/ui/card"
import { WorkerDetailSheet } from "@/components/workers/worker-detail-sheet"
import { useAppStore } from "@/lib/app-store"
import { type Worker } from "@/lib/mock-data"
import { formatPhone, formatKoreanDate } from "@/lib/format"
import { Search, Users, X, ChevronDown, UserPlus, Crown, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// Only 3 statuses now
const statusOptions = ["미출근", "출근", "배치"] as const
type WorkerStatus = (typeof statusOptions)[number]

export default function WorkersPage() {
  const searchParams = useSearchParams()
  const { state, addWorker, updateWorker, deleteWorker } = useAppStore()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [roleFilter, setRoleFilter] = useState<string>("all")
  const [teamFilter, setTeamFilter] = useState<string>("all")
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null)

  // New Worker Dialog
  const [addWorkerDialogOpen, setAddWorkerDialogOpen] = useState(false)
  const [newWorkerName, setNewWorkerName] = useState("")
  const [newWorkerPhone, setNewWorkerPhone] = useState("")
  const [newWorkerTeam, setNewWorkerTeam] = useState<"반장" | "팀원" | "">("")
  const [newWorkerRoles, setNewWorkerRoles] = useState<string[]>([])

  // Open add worker dialog if action=add in URL
  useEffect(() => {
    if (searchParams.get("action") === "add") {
      setAddWorkerDialogOpen(true)
    }
  }, [searchParams])

  const filteredWorkers = useMemo(() => {
    return state.workers.filter((worker) => {
      const matchesSearch =
        worker.name.toLowerCase().includes(search.toLowerCase()) ||
        worker.phone.includes(search)
      const matchesStatus = statusFilter === "all" || worker.status === statusFilter
      const matchesRole = roleFilter === "all" || worker.roles.some((r) => r.id === roleFilter)
      const matchesTeam =
        teamFilter === "all" ||
        (teamFilter === "반장" && worker.team === "반장") ||
        (teamFilter === "팀원" && worker.team === "팀원") ||
        (teamFilter === "없음" && !worker.team)
      return matchesSearch && matchesStatus && matchesRole && matchesTeam
    })
  }, [state.workers, search, statusFilter, roleFilter, teamFilter])

  const handleWorkerUpdate = (updatedWorker: Worker, opts?: { keepSelection?: boolean }) => {
    updateWorker(updatedWorker)

    // ✅ 팀원 추가/삭제 같은 "배경 업데이트"는 선택 유지
    if (opts?.keepSelection) return

    setSelectedWorker(updatedWorker)
  }

  const handleWorkerDelete = (workerId: string) => {
    deleteWorker(workerId)
    setSelectedWorker(null)
  }

  // Status change rules:
  // - Can only change between 미출근 ↔ 출근
  // - 배치 is read-only here (can only be changed in Sites page)
  const handleStatusChange = (workerId: string, newStatus: WorkerStatus) => {
    const worker = state.workers.find((w) => w.id === workerId)
    if (!worker) return

    // If worker is currently 배치, block change
    if (worker.status === "배치") {
      toast.error("이 인력은 현재 현장에 투입 중입니다. 배치 해제는 '현장 > 배치'에서만 가능합니다.")
      return
    }

    // If trying to set to 배치, block
    if (newStatus === "배치") {
      toast.error("배치 상태는 '현장 > 배치'에서만 설정할 수 있습니다.")
      return
    }

    // Allow 미출근 ↔ 출근
    updateWorker({ ...worker, status: newStatus })
    toast.success(`${worker.name}님이 ${newStatus}(으)로 변경되었습니다`)
  }

  const handleAddWorker = async () => {
    if (!newWorkerName.trim() || !newWorkerPhone.trim()) {
      toast.error("이름과 전화번호를 입력해주세요")
      return
    }

    try {
      await addWorker({
        name: newWorkerName,
        phone: newWorkerPhone.replace(/\D/g, ""),
        roles: state.roles.filter((r) => newWorkerRoles.includes(r.id)), // 이제 r.id가 uuid
        team: newWorkerTeam || null,
        status: "미출근",
        lastAttendance: null,
      })

      toast.success("새 인력이 등록되었습니다")
      setAddWorkerDialogOpen(false)
      resetNewWorkerForm()
    } catch (e: any) {
      toast.error(e?.message ?? "인력 등록에 실패했습니다")
    }
  }



  const resetNewWorkerForm = () => {
    setNewWorkerName("")
    setNewWorkerPhone("")
    setNewWorkerTeam("")
    setNewWorkerRoles([])
  }

  const clearFilters = () => {
    setSearch("")
    setStatusFilter("all")
    setRoleFilter("all")
    setTeamFilter("all")
  }

  const hasActiveFilters =
    search || statusFilter !== "all" || roleFilter !== "all" || teamFilter !== "all"

  // Get team info for a worker
  const getTeamInfo = (worker: Worker) => {
    if (worker.team === "반장") {
      const memberCount = worker.teamMembers?.length || 0
      return { isLeader: true, memberCount, leaderName: null }
    }
    if (worker.team === "팀원" && worker.teamLeaderId) {
      const leader = state.workers.find((w) => w.id === worker.teamLeaderId)
      return { isLeader: false, memberCount: 0, leaderName: leader?.name || "알 수 없음" }
    }
    return null
  }

  const statusColors: Record<WorkerStatus, string> = {
    미출근: "bg-muted text-muted-foreground",
    출근: "bg-chart-1/20 text-chart-1",
    배치: "bg-chart-2/20 text-chart-2",
  }

  return (
    <AppShell title="인력">
      {/* Fixed height flex container to prevent overflow */}
      <div className="flex h-full flex-col">
        {/* Header - fixed height */}
        <div className="shrink-0 border-b border-border bg-background px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">인력 관리</h1>
            <Button onClick={() => setAddWorkerDialogOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              신규 인력 등록
            </Button>
          </div>
        </div>

        {/* Filters - fixed height */}
        <div className="shrink-0 border-b border-border bg-background px-6 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="이름/전화번호 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[120px] h-9">
                <SelectValue placeholder="상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                <SelectItem value="미출근">미출근</SelectItem>
                <SelectItem value="출근">출근</SelectItem>
                <SelectItem value="배치">배치</SelectItem>
              </SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[120px] h-9">
                <SelectValue placeholder="역할" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 역할</SelectItem>
                {state.roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="w-[120px] h-9">
                <SelectValue placeholder="팀" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 팀</SelectItem>
                <SelectItem value="반장">반장</SelectItem>
                <SelectItem value="팀원">팀원</SelectItem>
                <SelectItem value="없음">소속 없음</SelectItem>
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
                <X className="mr-1 h-4 w-4" />
                초기화
              </Button>
            )}
            <div className="ml-auto text-sm text-muted-foreground">
              총 {filteredWorkers.length}명
            </div>
          </div>
        </div>

        {/* Table area - flex-1 with min-h-0 to allow scrolling */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {filteredWorkers.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Users className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <h3 className="mb-2 text-lg font-semibold">인력이 없습니다</h3>
              <p className="text-sm text-muted-foreground">
                {hasActiveFilters
                  ? "검색 조건을 변경해보세요"
                  : "등록된 인력이 없습니다"}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="min-w-[100px]">이름</TableHead>
                      <TableHead className="min-w-[120px]">전화번호</TableHead>
                      <TableHead className="min-w-[150px]">역할</TableHead>
                      <TableHead className="min-w-[120px]">팀</TableHead>
                      <TableHead className="min-w-[100px]">상태</TableHead>
                      <TableHead className="min-w-[100px]">최근 출근</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredWorkers.map((worker) => {
                      const teamInfo = getTeamInfo(worker)
                      const isAssigned = worker.status === "배치"

                      return (
                        <TableRow
                          key={worker.id}
                          className="cursor-pointer"
                          onClick={() => setSelectedWorker(worker)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{worker.name}</span>
                              {worker.isFixed && (
                                <Badge variant="outline" className="text-[10px] px-1">
                                  고정
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="tabular-nums">{formatPhone(worker.phone)}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {worker.roles.slice(0, 2).map((role) => (
                                <Badge
                                  key={role.id}
                                  style={{ backgroundColor: role.color, color: "#fff" }}
                                  className="text-[10px] px-1.5"
                                >
                                  {role.name}
                                </Badge>
                              ))}
                              {worker.roles.length > 2 && (
                                <Badge variant="outline" className="text-[10px] px-1">
                                  +{worker.roles.length - 2}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {teamInfo ? (
                              <div className="flex items-center gap-1">
                                {teamInfo.isLeader ? (
                                  <>
                                    <Badge className="bg-chart-2 text-white text-[10px] px-1.5">
                                      <Crown className="mr-0.5 h-3 w-3" />
                                      반장
                                    </Badge>
                                    <span className="text-[10px] text-muted-foreground">
                                      ({teamInfo.memberCount})
                                    </span>
                                  </>
                                ) : (
                                  <div className="flex flex-col">
                                    <Badge variant="secondary" className="text-[10px] px-1.5">팀원</Badge>
                                    <span className="text-[10px] text-muted-foreground">
                                      {teamInfo.leaderName}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {isAssigned ? (
                              <Badge className={cn("text-[10px]", statusColors["배치"])}>
                                배치
                              </Badge>
                            ) : (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className={cn("h-6 px-2 text-[10px]", statusColors[worker.status])}
                                  >
                                    {worker.status}
                                    <ChevronDown className="ml-1 h-3 w-3" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                  <DropdownMenuItem
                                    onClick={() => handleStatusChange(worker.id, "미출근")}
                                    disabled={worker.status === "미출근"}
                                  >
                                    미출근
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleStatusChange(worker.id, "출근")}
                                    disabled={worker.status === "출근"}
                                  >
                                    출근
                                  </DropdownMenuItem>
                                  <DropdownMenuItem disabled className="text-muted-foreground text-xs">
                                    <AlertCircle className="mr-1 h-3 w-3" />
                                    배치 (현장에서만)
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {worker.lastAttendance
                              ? formatKoreanDate(worker.lastAttendance)
                              : "-"}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Info box - fixed height */}
        <div className="shrink-0 border-t border-border bg-muted/30 px-6 py-3">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              이 화면에서는 '미출근' ↔ '출근' 상태만 변경 가능합니다.
              '배치' 상태는 '현장 &gt; 배치'에서 변경됩니다.
            </span>
          </div>
        </div>
      </div>

      {/* Worker Detail Sheet */}
      <WorkerDetailSheet
        worker={selectedWorker}
        open={!!selectedWorker}
        onOpenChange={(open) => !open && setSelectedWorker(null)}
        onWorkerUpdate={handleWorkerUpdate}
        onWorkerDelete={handleWorkerDelete}
        allWorkers={state.workers}
      />

      {/* Add Worker Dialog */}
      <Dialog open={addWorkerDialogOpen} onOpenChange={setAddWorkerDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>신규 인력 등록</DialogTitle>
            <DialogDescription>새로운 인력 정보를 입력해주세요.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="new-name">이름</Label>
              <Input
                id="new-name"
                value={newWorkerName}
                onChange={(e) => setNewWorkerName(e.target.value)}
                placeholder="홍길동"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-phone">전화번호</Label>
              <Input
                id="new-phone"
                value={newWorkerPhone}
                onChange={(e) => setNewWorkerPhone(e.target.value)}
                placeholder="01012345678"
              />
            </div>
            <div className="grid gap-2">
              <Label>역할 (다중 선택)</Label>
              <div className="flex flex-wrap gap-2">
                {state.roles.map((role) => (
                  <Badge
                    key={role.id}
                    variant={newWorkerRoles.includes(role.id) ? "default" : "outline"}
                    style={
                      newWorkerRoles.includes(role.id)
                        ? { backgroundColor: role.color, color: "#fff" }
                        : {}
                    }
                    className="cursor-pointer"
                    onClick={() => {
                      if (newWorkerRoles.includes(role.id)) {
                        setNewWorkerRoles((prev) => prev.filter((r) => r !== role.id))
                      } else {
                        setNewWorkerRoles((prev) => [...prev, role.id])
                      }
                    }}
                  >
                    {role.name}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-team">팀 구분</Label>
              <Select
                value={newWorkerTeam || "__none__"}
                onValueChange={(v) => setNewWorkerTeam(v === "__none__" ? "" : (v as "반장" | "팀원"))}
              >
                <SelectTrigger id="new-team">
                  <SelectValue placeholder="선택 안함" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">선택 안함</SelectItem>
                  <SelectItem value="반장">반장</SelectItem>
                  <SelectItem value="팀원">팀원</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddWorkerDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleAddWorker}>등록</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
