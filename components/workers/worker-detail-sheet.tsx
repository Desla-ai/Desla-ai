"use client"

import { useState, useEffect, useMemo } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
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
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useAppStore } from "@/lib/app-store"
import { type Worker, type Role } from "@/lib/mock-data"
import { formatPhone, formatKoreanDate, formatDateRange } from "@/lib/format"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Plus,
  X,
  Check,
  UserPlus,
  UserMinus,
  Crown,
  Users,
  Lock,
  Calendar,
  Trash2,
  AlertTriangle,
  Search,
} from "lucide-react"
import { toast } from "sonner"

interface WorkerDetailSheetProps {
  worker: Worker | null
  allWorkers: Worker[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onWorkerUpdate: (worker: Worker) => void
  onWorkerDelete?: (workerId: string) => void
}

const colorPalette = [
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#6366f1",
]

type Json = Record<string, any>

async function safeJson(res: Response): Promise<Json> {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

function errMsg(e: unknown, fallback: string) {
  if (e instanceof Error) return e.message || fallback
  if (typeof e === "string") return e || fallback
  return fallback
}

function formatKoreanDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function shortName(name: unknown) {
  const s = typeof name === "string" ? name.trim() : ""
  return (s || "?").slice(0, 2)
}


export function WorkerDetailSheet({
  worker,
  allWorkers,
  open,
  onOpenChange,
  onWorkerUpdate,
  onWorkerDelete,
}: WorkerDetailSheetProps) {
  /**
   * ✅ 훅은 항상 동일 순서로 호출되어야 함.
   * worker가 null이어도 useAppStore/useState/useMemo/useEffect는 모두 호출되도록 유지.
   */
  const { state, addRole, refreshWorkers, updateWorkerPatch } = useAppStore()

  /**
   * ✅ stale selectedWorker 방지:
   * props.worker는 오래된 객체일 수 있으니, store의 최신 workers에서 같은 id를 찾아쓴다.
   */
  const resolvedWorker = useMemo<Worker | null>(() => {
    if (!worker?.id) return null
    return state.workers.find((w) => w.id === worker.id) ?? worker
  }, [state.workers, worker])

  const workerId = resolvedWorker?.id ?? null

  // Roles
  const [selectedRoles, setSelectedRoles] = useState<Role[]>([])
  const [isAddingRole, setIsAddingRole] = useState(false)
  const [newRoleName, setNewRoleName] = useState("")
  const [newRoleColor, setNewRoleColor] = useState(colorPalette[0])

  // Team (DB truth = /api/teams + team_members)
  const [teamId, setTeamId] = useState<string | null>(null)
  const [teamMembers, setTeamMembers] = useState<string[]>([])
  const [isTeamLoading, setIsTeamLoading] = useState(false)

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Team member search dialog
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false)
  const [memberSearchQuery, setMemberSearchQuery] = useState("")

  // Team dissolve confirmation
  const [teamDeleteDialogOpen, setTeamDeleteDialogOpen] = useState(false)
  const [teamDeleteConfirmText, setTeamDeleteConfirmText] = useState("")
  const [isDissolving, setIsDissolving] = useState(false)
  const [teamDeleteError, setTeamDeleteError] = useState<string | null>(null)

  // Promote confirm (member -> leader replace)
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false)
  const [isPromoting, setIsPromoting] = useState(false)
  const [promoteError, setPromoteError] = useState<string | null>(null)

  // Assigned site (resolvedWorker 기반)
  const assignedSite = useMemo(() => {
    if (!resolvedWorker?.assignedSiteId) return null
    return state.sites.find((s) => s.id === resolvedWorker.assignedSiteId) ?? null
  }, [resolvedWorker?.assignedSiteId, state.sites])

  // Team leader (if member)
  const teamLeader = useMemo(() => {
    if (!resolvedWorker?.teamLeaderId) return null
    return allWorkers.find((w) => w.id === resolvedWorker.teamLeaderId) ?? null
  }, [allWorkers, resolvedWorker?.teamLeaderId])

  // Team member workers (if leader)
  const teamMemberWorkers = useMemo(() => {
    return teamMembers
      .map((id) => allWorkers.find((w) => w.id === id))
      .filter(Boolean) as Worker[]
  }, [allWorkers, teamMembers])

  const isLeader = !!teamId // ✅ DB team 존재 여부로 리더 판단
  const isMember = !!resolvedWorker?.teamLeaderId && !isLeader

  // Available workers to add (leader only)
  const availableForTeam = useMemo(() => {
    const w = resolvedWorker
    if (!w) return []
    return allWorkers.filter((x) => x.id !== w.id && !teamMembers.includes(x.id) && x.team !== "반장")
  }, [allWorkers, teamMembers, resolvedWorker])

  const filteredMemberSearchResults = useMemo(() => {
    if (!memberSearchQuery.trim()) return availableForTeam.slice(0, 10)
    const q = memberSearchQuery.toLowerCase()
    return availableForTeam
      .filter((w) => (w.name ?? "").toLowerCase().includes(q) || (w.phone ?? "").includes(q))
      .slice(0, 10)
  }, [availableForTeam, memberSearchQuery])

  const isAlreadyAdded = (wid: string) => teamMembers.includes(wid)

  // ✅ 레거시 worker.team과 무관하게, leaderWorkerId로 팀 조회
  const loadLeaderTeam = async (leaderWorkerId: string) => {
    setIsTeamLoading(true)
    try {
      const res = await fetch(`/api/teams?leaderWorkerId=${encodeURIComponent(leaderWorkerId)}`, {
        cache: "no-store",
      })
      const json = await safeJson(res)
      if (!res.ok) throw new Error(json?.error ?? "팀 조회 실패")

      const t = (json?.teams ?? [])[0]
      const nextTeamId = t?.id ?? null
      const memberIds = Array.isArray(t?.members) ? t.members.map((m: any) => m.workerId).filter(Boolean) : []

      setTeamId(nextTeamId)
      setTeamMembers(memberIds)
    } catch {
      setTeamId(null)
      setTeamMembers([])
    } finally {
      setIsTeamLoading(false)
    }
  }

  useEffect(() => {
    const w = resolvedWorker
    if (!w?.id) return

    // ✅ 반장(leader)인 경우: 전역 workers가 갱신될 때마다 팀 구성 재조회
    // (팀원 탭에서 팀 제외를 해도, 반장 시트가 열린 상태면 여기서 즉시 반영됨)
    if (isLeader) {
      loadLeaderTeam(w.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.workers, resolvedWorker?.id, isLeader])

  // worker 변경 시 리더팀 로드(리더가 아니면 teamId=null로 유지)
  useEffect(() => {
    if (!workerId) {
      setTeamId(null)
      setTeamMembers([])
      return
    }
    loadLeaderTeam(workerId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId])

  // Roles init
  useEffect(() => {
    const w = resolvedWorker
    if (!w) {
      setSelectedRoles([])
      setIsAddingRole(false)
      setNewRoleName("")
      setNewRoleColor(colorPalette[0])
      return
    }
    setSelectedRoles(w.roles ?? [])
    setIsAddingRole(false)
    setNewRoleName("")
    setNewRoleColor(colorPalette[0])
  }, [resolvedWorker?.id])

  const handleToggleRole = (role: Role) => {
    setSelectedRoles((prev) => {
      const exists = prev.find((r) => r.id === role.id)
      return exists ? prev.filter((r) => r.id !== role.id) : [...prev, role]
    })
  }

  const handleAddNewRole = async () => {
    if (!newRoleName.trim()) return
    const createdRole = await addRole({ name: newRoleName.trim(), color: newRoleColor })
    setSelectedRoles((prev) => [...prev, createdRole])
    setNewRoleName("")
    setIsAddingRole(false)
  }

  const handleSaveRoles = () => {
    const w = resolvedWorker
    if (!w) return
    const updatedWorker = { ...w, roles: selectedRoles }
    onWorkerUpdate(updatedWorker)
    toast.success("역할이 저장되었습니다")
  }

  /**
   * ✅ 반장 설정 버튼 재활용:
   * - 무소속: 새 팀 생성(POST /api/teams)
   * - 팀원: 확인 모달 → 현재 소속 팀의 반장 교체(PATCH /api/teams/{teamId})
   */
  const handleSetAsLeader = async () => {
    const w = resolvedWorker
    if (!w) return

    if (teamId) {
      toast.message("이미 반장 팀이 존재합니다")
      return
    }

    // 팀원인 경우: 반장 변경 확인 모달
    if (w.teamLeaderId) {
      setPromoteError(null)
      setPromoteDialogOpen(true)
      return
    }

    // 무소속인 경우: 새 팀 생성
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaderWorkerId: w.id, siteId: null }),
      })
      const json = await safeJson(res)
      if (!res.ok) throw new Error(json?.error ?? "팀 생성 실패")

      setTeamId(json?.team?.id ?? null)
      setTeamMembers([])

      await loadLeaderTeam(w.id)
      await refreshWorkers()

      toast.success(`${w.name}님이 반장으로 설정되었습니다`)
    } catch (e) {
      toast.error(errMsg(e, "반장 설정 실패"))
    }
  }

  // 팀원 -> 반장 변경(기존 팀의 leader 교체)
  const promoteToLeader = async () => {
    const w = resolvedWorker
    if (!w?.teamLeaderId) return

    setIsPromoting(true)
    setPromoteError(null)

    try {
      const res1 = await fetch(`/api/teams?leaderWorkerId=${encodeURIComponent(w.teamLeaderId)}`, { cache: "no-store" })
      const j1 = await res1.json().catch(() => ({}))
      if (!res1.ok) throw new Error(j1?.error ?? "현재 소속 팀 조회 실패")

      const currentTeamId = j1?.teams?.[0]?.id as string | undefined

      // ✅ 여기 추가: teamId 없으면 중단
      if (!currentTeamId) {
        throw new Error("현재 소속 팀(teamId)을 찾지 못했습니다. (팀 데이터 조회 결과가 비어있음)")
      }

      const res2 = await fetch(`/api/teams/${encodeURIComponent(currentTeamId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaderWorkerId: w.id }),
      })
      const j2 = await res2.json().catch(() => ({}))
      if (!res2.ok) throw new Error(j2?.error ?? "반장 변경 실패")

      toast.success("반장이 변경되었습니다.")
      setPromoteDialogOpen(false)

      await loadLeaderTeam(w.id)
      await refreshWorkers()
    } catch (e: any) {
      setPromoteError(e?.message ?? "반장 변경 중 오류가 발생했습니다.")
    } finally {
      setIsPromoting(false)
    }
  }


  // 팀 제외
  const handleRemoveFromTeam = async () => {
    const w = resolvedWorker
    if (!w) return

    // 리더는 해산 플로우 유지
    if (isLeader) {
      setTeamDeleteConfirmText("")
      setTeamDeleteError(null)
      setTeamDeleteDialogOpen(true)
      return
    }

    // 팀원이 아니면 종료
    if (!w.teamLeaderId) {
      toast.message("현재 소속된 팀이 없습니다")
      return
    }

    try {
      // 1) memberWorkerId로 내 teamId 찾기 (응답은 { teams: [...] })
      const res = await fetch(`/api/teams?memberWorkerId=${encodeURIComponent(w.id)}`, { cache: "no-store" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? "내 팀 조회 실패")

      const myTeamId = json?.teams?.[0]?.id as string | undefined
      if (!myTeamId) {
        toast.message("이미 팀에서 제외된 상태입니다")
        await refreshWorkers()
        return
      }

      // 2) 정규화 테이블에서 제거
      const res2 = await fetch(`/api/teams/${encodeURIComponent(myTeamId)}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", workerId: w.id }),
      })
      const json2 = await res2.json().catch(() => ({}))
      if (!res2.ok) throw new Error(json2?.error ?? "팀 제외 실패")

      await refreshWorkers()
      toast.success("팀에서 제외되었습니다")
    } catch (e: any) {
      toast.error(e?.message ?? "팀 제외 실패")
    }
  }



  const handleAddTeamMember = async (memberId: string) => {
    const w = resolvedWorker
    if (!w) return
    if (!teamId) {
      toast.error("팀이 아직 생성되지 않았습니다.")
      return
    }
    try {
      const res = await fetch(`/api/teams/${encodeURIComponent(teamId)}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", workerId: memberId }),
      })
      const json = await safeJson(res)
      if (!res.ok) throw new Error(json?.error ?? "팀원 추가 실패")

      setTeamMembers((prev) => (prev.includes(memberId) ? prev : [...prev, memberId]))

      await loadLeaderTeam(w.id)
      await refreshWorkers()
      toast.success("팀원이 추가되었습니다")
    } catch (e) {
      toast.error(errMsg(e, "팀원 추가 실패"))
    }
  }

  const handleRemoveTeamMember = async (memberId: string) => {
    const w = resolvedWorker
    if (!w) return
    if (!teamId) return
    try {
      const res = await fetch(`/api/teams/${encodeURIComponent(teamId)}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", workerId: memberId }),
      })
      const json = await safeJson(res)
      if (!res.ok) throw new Error(json?.error ?? "팀원 제거 실패")

      const newMembers = teamMembers.filter((id) => id !== memberId)
      setTeamMembers(newMembers)

      await loadLeaderTeam(w.id)
      await refreshWorkers()
      toast.success("팀원이 제거되었습니다")
    } catch (e) {
      toast.error(errMsg(e, "팀원 제거 실패"))
    }
  }

  const handleDissolveTeam = async () => {
    const w = resolvedWorker
    if (!w) return

    if (teamDeleteConfirmText !== "DELETE") {
      setTeamDeleteError("'DELETE'를 정확히 입력해주세요.")
      return
    }
    if (!teamId) {
      setTeamDeleteError("팀 ID를 찾지 못했습니다. 다시 열어서 시도해주세요.")
      return
    }

    setIsDissolving(true)
    setTeamDeleteError(null)

    try {
      const res = await fetch(`/api/teams/${encodeURIComponent(teamId)}`, { method: "DELETE" })
      const json = await safeJson(res)
      if (!res.ok) throw new Error(json?.error ?? "팀 해산 실패")

      // (선택) 레거시 정리: 현재 updateWorkerPatch가 허용하는 범위면 유지
      for (const mid of teamMembers) {
        await updateWorkerPatch(mid, { team: null, teamLeaderId: undefined })
      }
      await updateWorkerPatch(w.id, { team: null, teamLeaderId: undefined, teamMembers: undefined })

      setTeamMembers([])
      setTeamId(null)

      await refreshWorkers()

      toast.success("팀이 해산되었습니다. 모든 팀원이 개별 인력으로 전환되었습니다.")
      setTeamDeleteDialogOpen(false)

      onWorkerUpdate({ ...w, team: null, teamLeaderId: undefined, teamMembers: undefined })
    } catch (e) {
      setTeamDeleteError(errMsg(e, "팀 해산 중 오류가 발생했습니다. 다시 시도해주세요."))
    } finally {
      setIsDissolving(false)
    }
  }

  // Hard delete handler (그대로 유지)
  const handleDeleteWorker = async () => {
    const w = resolvedWorker
    if (!w) return
    if (!onWorkerDelete) return
    if (deleteConfirmText !== w.name && deleteConfirmText !== "DELETE") {
      setDeleteError("인력 이름 또는 'DELETE'를 정확히 입력해주세요.")
      return
    }

    setIsDeleting(true)
    setDeleteError(null)

    try {
      // TODO: 실제 DELETE API로 교체 필요
      await new Promise((resolve) => setTimeout(resolve, 500))
      onWorkerDelete(w.id)
      toast.success("삭제되었습니다.")
      setDeleteDialogOpen(false)
      onOpenChange(false)
    } catch {
      setDeleteError("삭제 중 오류가 발생했습니다. 다시 시도해주세요.")
    } finally {
      setIsDeleting(false)
    }
  }

  // ✅ 렌더: worker가 없으면 “빈 Sheet”로 유지(훅순서 안정)
  const w = resolvedWorker
  const showEmpty = !w

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-[500px] flex-col overflow-hidden p-0 sm:max-w-[500px]">
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle className="flex items-center gap-2">
            {showEmpty ? "인력" : w.name}
            {!showEmpty && w.isFixed && <Lock className="h-4 w-4 text-chart-2" />}

            {/* 배지: resolvedWorker 기준 */}
            {!showEmpty && (w.team || isLeader) && (
              <Badge variant={isLeader ? "default" : "secondary"}>
                {isLeader && <Crown className="mr-1 h-3 w-3" />}
                {isLeader ? "반장" : w.team}
              </Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="flex flex-col gap-6 px-6 py-4">
            {showEmpty ? (
              <div className="text-sm text-muted-foreground">선택된 인력이 없습니다.</div>
            ) : (
              <>
                {/* Basic Info */}
                <div className="flex flex-col gap-3">
                  <h3 className="font-semibold">기본 정보</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">전화번호</span>
                      <p className="font-medium">{formatPhone(w.phone)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">상태</span>
                      <Badge
                        className={`${w.status === "배치"
                          ? "bg-chart-2/20 text-chart-2"
                          : w.status === "출근"
                            ? "bg-chart-1/20 text-chart-1"
                            : "bg-muted text-muted-foreground"
                          }`}
                      >
                        {w.status}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">최근 출근</span>
                      <p className="font-medium">
                        {w.lastAttendanceAt
                          ? formatKoreanDateTime(w.lastAttendanceAt)
                          : w.lastAttendance
                            ? formatKoreanDate(w.lastAttendance)
                            : "-"}
                      </p>
                    </div>
                    {assignedSite && (
                      <div>
                        <span className="text-muted-foreground">배치 현장</span>
                        <p className="font-medium">{assignedSite.name}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Fixed Assignment Info */}
                {w.isFixed && w.fixedStartDate && w.fixedEndDate && (
                  <>
                    <Separator />
                    <div className="rounded-lg border border-chart-2/30 bg-chart-2/10 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Lock className="h-4 w-4 text-chart-2" />
                        <span className="font-medium">고정 배치</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>{formatDateRange(w.fixedStartDate, w.fixedEndDate)}</span>
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                {/* Roles */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">역할</h3>
                    <Button size="sm" variant="outline" onClick={handleSaveRoles}>
                      저장
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {selectedRoles.map((role) => (
                      <Badge
                        key={role.id}
                        style={{ backgroundColor: role.color, color: "#fff" }}
                        className="flex items-center gap-1 pr-1"
                      >
                        {role.name}
                        <button
                          type="button"
                          onClick={() => handleToggleRole(role)}
                          className="ml-1 rounded-full hover:bg-white/20"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {state.roles
                      .filter((r) => !selectedRoles.find((sr) => sr.id === r.id))
                      .map((role) => (
                        <Badge
                          key={role.id}
                          variant="outline"
                          className="cursor-pointer"
                          onClick={() => handleToggleRole(role)}
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          {role.name}
                        </Badge>
                      ))}
                  </div>

                  {isAddingRole ? (
                    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
                      <Input placeholder="역할 이름" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} />
                      <div className="flex flex-wrap gap-2">
                        {colorPalette.map((color) => (
                          <button
                            key={color}
                            type="button"
                            className="h-6 w-6 rounded-full transition-transform hover:scale-110"
                            style={{ backgroundColor: color }}
                            onClick={() => setNewRoleColor(color)}
                          >
                            {newRoleColor === color && <Check className="mx-auto h-3 w-3 text-white" />}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleAddNewRole}>
                          추가
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setIsAddingRole(false)}>
                          취소
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setIsAddingRole(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      새 역할 추가
                    </Button>
                  )}
                </div>

                <Separator />

                {/* Team */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <h3 className="font-semibold">팀 구조</h3>
                  </div>

                  <div className="flex gap-2">
                    {/* ✅ 버튼 재활용: 무소속은 생성 / 팀원은 승격(모달) */}
                    {!isLeader && (
                      <Button size="sm" variant="outline" onClick={handleSetAsLeader} disabled={isTeamLoading}>
                        <Crown className="mr-2 h-4 w-4" />
                        반장 설정
                      </Button>
                    )}

                    {(isLeader || w.team || w.teamLeaderId) && (
                      <Button size="sm" variant="outline" onClick={handleRemoveFromTeam}>
                        <UserMinus className="mr-2 h-4 w-4" />
                        팀 제외
                      </Button>
                    )}
                  </div>

                  {isTeamLoading && <p className="text-sm text-muted-foreground">팀 정보를 불러오는 중...</p>}

                  {/* Member view */}
                  {!isLeader && isMember && teamLeader && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <Crown className="h-4 w-4 text-amber-500" />
                          소속 반장
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-primary text-primary-foreground">
                              {shortName(teamLeader?.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{teamLeader.name}</p>
                            <p className="text-sm text-muted-foreground">{formatPhone(teamLeader.phone)}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Leader view */}
                  {isLeader && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            팀원 목록 ({teamMemberWorkers.length}명)
                          </span>
                        </CardTitle>
                      </CardHeader>

                      <CardContent className="flex flex-col gap-2">
                        {teamMemberWorkers.length === 0 ? (
                          <p className="text-sm text-muted-foreground">등록된 팀원이 없습니다</p>
                        ) : (
                          teamMemberWorkers.map((member) => (
                            <div key={member.id} className="flex items-center justify-between rounded-lg border border-border p-2">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback className="text-xs">{shortName(member?.name)}</AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="text-sm font-medium">{member.name}</p>
                                  <p className="text-xs text-muted-foreground">{formatPhone(member.phone)}</p>
                                </div>
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => handleRemoveTeamMember(member.id)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))
                        )}

                        {availableForTeam.length > 0 && (
                          <div className="mt-2 border-t border-border pt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full bg-transparent"
                              onClick={() => {
                                setMemberSearchQuery("")
                                setAddMemberDialogOpen(true)
                              }}
                            >
                              <UserPlus className="mr-2 h-4 w-4" />
                              팀원 추가
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {!isLeader && !w.teamLeaderId && !w.team && (
                    <p className="text-sm text-muted-foreground">소속된 팀이 없습니다</p>
                  )}
                </div>

                {/* Danger Zone */}
                {onWorkerDelete && (
                  <>
                    <Separator />
                    <div className="flex flex-col gap-3">
                      <h3 className="font-semibold text-destructive">위험 구역</h3>
                      <Button
                        variant="destructive"
                        onClick={() => {
                          setDeleteConfirmText("")
                          setDeleteError(null)
                          setDeleteDialogOpen(true)
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        인력 삭제
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              인력을 삭제할까요?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <div>
                  <strong>{w?.name}</strong>님의 모든 정보가 영구적으로 삭제됩니다.
                </div>
                <div className="text-destructive font-medium">삭제 후 복구할 수 없습니다.</div>

                <div className="pt-2">
                  <Label htmlFor="delete-confirm">확인을 위해 인력 이름 또는 'DELETE'를 입력하세요</Label>
                  <Input
                    id="delete-confirm"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder={w?.name || "DELETE"}
                    className="mt-2"
                  />
                </div>

                {deleteError && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{deleteError}</AlertDescription>
                  </Alert>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteWorker}
              disabled={isDeleting || !deleteConfirmText}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Team Member Search Dialog */}
      <Dialog open={addMemberDialogOpen} onOpenChange={setAddMemberDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>팀원 추가</DialogTitle>
            <DialogDescription>이름 또는 전화번호로 검색하여 팀원을 추가하세요.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="이름/전화번호 검색"
                value={memberSearchQuery}
                onChange={(e) => setMemberSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="max-h-[300px] overflow-y-auto">
              {filteredMemberSearchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Users className="mb-2 h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    {memberSearchQuery ? "검색 결과가 없습니다" : "추가할 수 있는 인력이 없습니다"}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredMemberSearchResults.map((x) => {
                    const alreadyAdded = isAlreadyAdded(x.id)
                    return (
                      <div key={x.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback>{shortName(x?.name)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{x.name}</p>
                            <p className="text-sm text-muted-foreground">{formatPhone(x.phone)}</p>
                          </div>
                        </div>

                        {alreadyAdded ? (
                          <Badge variant="secondary" className="text-xs">
                            이미 추가됨
                          </Badge>
                        ) : (
                          <Button size="sm" onClick={() => handleAddTeamMember(x.id)}>
                            <UserPlus className="mr-1 h-3 w-3" />
                            추가
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Team Dissolution Confirmation Dialog */}
      <AlertDialog open={teamDeleteDialogOpen} onOpenChange={setTeamDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              반장을 제외하면 팀이 해산됩니다
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <div>
                  <strong>{w?.name}</strong>님은 현재 팀의 반장입니다.
                </div>
                <div>
                  반장을 제외하면 팀이 해산되고, 모든 팀원({teamMemberWorkers.length}명)이 개별 인력으로 전환됩니다.
                </div>
                <div className="text-destructive font-medium">팀은 완전 삭제되며 복구할 수 없습니다.</div>

                <div className="pt-2">
                  <Label htmlFor="team-delete-confirm">확인을 위해 'DELETE'를 입력하세요</Label>
                  <Input
                    id="team-delete-confirm"
                    value={teamDeleteConfirmText}
                    onChange={(e) => setTeamDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="mt-2"
                  />
                </div>

                {teamDeleteError && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{teamDeleteError}</AlertDescription>
                  </Alert>
                )}
              </div>
            </AlertDialogDescription>

          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDissolving}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDissolveTeam}
              disabled={isDissolving || !teamDeleteConfirmText}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDissolving ? "해산 중..." : "팀 해산"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Promote to leader confirmation (member -> leader replace) */}
      <AlertDialog open={promoteDialogOpen} onOpenChange={setPromoteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              반장 변경
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div>
                  현재 소속 팀의 반장을 <strong>{w?.name}</strong>님으로 변경할까요?
                </div>
                <div className="text-muted-foreground">
                  확인을 누르면 팀의 반장이 이 사람으로 교체되며, 기존 반장은 팀원으로 자동 편입됩니다.
                </div>

                {promoteError && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{promoteError}</AlertDescription>
                  </Alert>
                )}
              </div>
            </AlertDialogDescription>

          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPromoting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={promoteToLeader}
              disabled={isPromoting}
              className="bg-amber-500 text-white hover:bg-amber-500/90"
            >
              {isPromoting ? "변경 중..." : "변경하기"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  )
}
