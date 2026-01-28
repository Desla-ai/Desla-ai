"use client"

import { useState, useEffect, useMemo } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Plus, X, Check, UserPlus, UserMinus, Crown, Users, Lock, Calendar, Trash2, AlertTriangle, Search } from "lucide-react"
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
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
]

export function WorkerDetailSheet({
  worker,
  allWorkers,
  open,
  onOpenChange,
  onWorkerUpdate,
  onWorkerDelete,
}: WorkerDetailSheetProps) {
  const { state, addRole } = useAppStore()
  const [selectedRoles, setSelectedRoles] = useState<Role[]>([])
  const [isAddingRole, setIsAddingRole] = useState(false)
  const [newRoleName, setNewRoleName] = useState("")
  const [newRoleColor, setNewRoleColor] = useState(colorPalette[0])
  const [teamMembers, setTeamMembers] = useState<string[]>([])

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Team member search dialog state
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false)
  const [memberSearchQuery, setMemberSearchQuery] = useState("")

  // Team dissolution confirmation state (for foreman removal)
  const [teamDeleteDialogOpen, setTeamDeleteDialogOpen] = useState(false)
  const [teamDeleteConfirmText, setTeamDeleteConfirmText] = useState("")
  const [isDissolving, setIsDissolving] = useState(false)
  const [teamDeleteError, setTeamDeleteError] = useState<string | null>(null)

  const availableForTeam = allWorkers.filter(
    (w) => w.id !== worker?.id && !teamMembers.includes(w.id) && w.team !== "반장"
  )

  // Filtered search results for team member dialog
  const filteredMemberSearchResults = useMemo(() => {
    if (!memberSearchQuery.trim()) return availableForTeam.slice(0, 10)
    const query = memberSearchQuery.toLowerCase()
    return availableForTeam.filter(
      (w) =>
        w.name.toLowerCase().includes(query) ||
        w.phone.includes(query)
    ).slice(0, 10)
  }, [availableForTeam, memberSearchQuery])

  // Check if worker is already added
  const isAlreadyAdded = (workerId: string) => teamMembers.includes(workerId)

  // Get team leader if worker is a team member
  const teamLeader = worker?.teamLeaderId
    ? allWorkers.find((w) => w.id === worker.teamLeaderId)
    : null

  // Get team members if worker is a leader
  const teamMemberWorkers = teamMembers
    .map((id) => allWorkers.find((w) => w.id === id))
    .filter(Boolean) as Worker[]

  // Get assigned site
  const assignedSite = worker?.assignedSiteId
    ? state.sites.find((s) => s.id === worker.assignedSiteId)
    : null

  useEffect(() => {
    if (worker) {
      setSelectedRoles(worker.roles || [])
      setTeamMembers(worker.teamMembers || [])
    }
  }, [worker])

  if (!worker) return null

  const handleToggleRole = (role: Role) => {
    setSelectedRoles((prev) => {
      const exists = prev.find((r) => r.id === role.id)
      if (exists) {
        return prev.filter((r) => r.id !== role.id)
      }
      return [...prev, role]
    })
  }

  const handleAddNewRole = async () => {
    if (!newRoleName.trim()) return

    const createdRole = await addRole({
      name: newRoleName.trim(),
      color: newRoleColor,
    })

    setSelectedRoles((prev) => [...prev, createdRole])
    setNewRoleName("")
    setIsAddingRole(false)
  }

  const handleSetAsLeader = () => {
    const updatedWorker = { ...worker, team: "반장" as const, teamMembers: [], teamLeaderId: undefined }
    onWorkerUpdate(updatedWorker)
    toast.success(`${worker.name}님이 반장으로 설정되었습니다`)
  }

  const handleRemoveFromTeam = () => {
    // If worker is a foreman, need to dissolve the team with confirmation
    if (worker.team === "반장") {
      setTeamDeleteConfirmText("")
      setTeamDeleteError(null)
      setTeamDeleteDialogOpen(true)
      return
    }
    // Regular team member removal
    const updatedWorker = { ...worker, team: null, teamLeaderId: undefined, teamMembers: undefined }
    onWorkerUpdate(updatedWorker)
    toast.success(`${worker.name}님이 팀에서 제외되었습니다`)
  }

  // Handle foreman removal with team dissolution (hard delete)
  const handleDissolveTeam = async () => {
    if (!worker || worker.team !== "반장") return
    if (teamDeleteConfirmText !== "DELETE") {
      setTeamDeleteError("'DELETE'를 정확히 입력해주세요.")
      return
    }

    setIsDissolving(true)
    setTeamDeleteError(null)

    try {
      // API stub: DELETE /api/teams/:teamId with body { reason: "foreman_removed" }
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Remove all team members from the team
      const membersToUpdate = teamMemberWorkers || []
      for (const member of membersToUpdate) {
        onWorkerUpdate({ ...member, team: null, teamLeaderId: undefined })
      }

      // Remove foreman status from the worker
      const updatedWorker = { ...worker, team: null, teamMembers: undefined }
      onWorkerUpdate(updatedWorker)

      toast.success("팀이 해산되었습니다. 모든 팀원이 개별 인력으로 전환되었습니다.")
      setTeamDeleteDialogOpen(false)
    } catch {
      setTeamDeleteError("팀 해산 중 오류가 발생했습니다. 다시 시도해주세요.")
    } finally {
      setIsDissolving(false)
    }
  }

  const handleAddTeamMember = (memberId: string) => {
    const newMembers = [...teamMembers, memberId]
    setTeamMembers(newMembers)
    const updatedWorker = { ...worker, teamMembers: newMembers }
    onWorkerUpdate(updatedWorker)

    // Also update the member's teamLeaderId
    const member = allWorkers.find((w) => w.id === memberId)
    if (member) {
      onWorkerUpdate({ ...member, team: "팀원", teamLeaderId: worker.id })
    }
    toast.success("팀원이 추가되었습니다")
  }

  const handleRemoveTeamMember = (memberId: string) => {
    const newMembers = teamMembers.filter((id) => id !== memberId)
    setTeamMembers(newMembers)
    const updatedWorker = { ...worker, teamMembers: newMembers }
    onWorkerUpdate(updatedWorker)

    // Also remove the member's teamLeaderId
    const member = allWorkers.find((w) => w.id === memberId)
    if (member) {
      onWorkerUpdate({ ...member, team: null, teamLeaderId: undefined })
    }
    toast.success("팀원이 제거되었습니다")
  }

  const handleSaveRoles = () => {
    const updatedWorker = { ...worker, roles: selectedRoles }
    onWorkerUpdate(updatedWorker)
    toast.success("역할이 저장되었습니다")
  }

  // Hard delete handler
  const handleDeleteWorker = async () => {
    if (!worker || !onWorkerDelete) return
    if (deleteConfirmText !== worker.name && deleteConfirmText !== "DELETE") {
      setDeleteError("인력 이름 또는 'DELETE'를 정확히 입력해주세요.")
      return
    }

    setIsDeleting(true)
    setDeleteError(null)

    try {
      // API stub: DELETE /api/workforces/:workforceId
      await new Promise((resolve) => setTimeout(resolve, 500))

      onWorkerDelete(worker.id)
      toast.success("삭제되었습니다.")
      setDeleteDialogOpen(false)
      onOpenChange(false)
    } catch {
      setDeleteError("삭제 중 오류가 발생했습니다. 다시 시도해주세요.")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-[500px] flex-col overflow-hidden p-0 sm:max-w-[500px]">
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle className="flex items-center gap-2">
            {worker.name}
            {worker.isFixed && (
              <Lock className="h-4 w-4 text-chart-2" />
            )}
            {worker.team && (
              <Badge variant={worker.team === "반장" ? "default" : "secondary"}>
                {worker.team === "반장" && <Crown className="mr-1 h-3 w-3" />}
                {worker.team}
              </Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="flex flex-col gap-6 px-6 py-4">
            {/* Basic Info */}
            <div className="flex flex-col gap-3">
              <h3 className="font-semibold">기본 정보</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">전화번호</span>
                  <p className="font-medium">{formatPhone(worker.phone)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">상태</span>
                  <Badge
                    className={`${worker.status === "배치"
                        ? "bg-chart-2/20 text-chart-2"
                        : worker.status === "출근"
                          ? "bg-chart-1/20 text-chart-1"
                          : "bg-muted text-muted-foreground"
                      }`}
                  >
                    {worker.status}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">최근 출근</span>
                  <p className="font-medium">
                    {worker.lastAttendance ? formatKoreanDate(worker.lastAttendance) : "-"}
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
            {worker.isFixed && worker.fixedStartDate && worker.fixedEndDate && (
              <>
                <Separator />
                <div className="rounded-lg border border-chart-2/30 bg-chart-2/10 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock className="h-4 w-4 text-chart-2" />
                    <span className="font-medium">고정 배치</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>{formatDateRange(worker.fixedStartDate, worker.fixedEndDate)}</span>
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
                  <Input
                    placeholder="역할 이름"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                  />
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

            {/* Team Structure - Enhanced visibility */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <h3 className="font-semibold">팀 구조</h3>
              </div>

              {/* Team Management Actions */}
              <div className="flex gap-2">
                {worker.team !== "반장" && (
                  <Button size="sm" variant="outline" onClick={handleSetAsLeader}>
                    <Crown className="mr-2 h-4 w-4" />
                    반장 설정
                  </Button>
                )}
                {worker.team && (
                  <Button size="sm" variant="outline" onClick={handleRemoveFromTeam}>
                    <UserMinus className="mr-2 h-4 w-4" />
                    팀 제외
                  </Button>
                )}
              </div>

              {/* If worker is a team member, show their leader */}
              {worker.team === "팀원" && teamLeader && (
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
                          {teamLeader.name.slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{teamLeader.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatPhone(teamLeader.phone)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* If worker is a leader, show team members */}
              {worker.team === "반장" && (
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
                        <div
                          key={member.id}
                          className="flex items-center justify-between rounded-lg border border-border p-2"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs">
                                {member.name.slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">{member.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatPhone(member.phone)}
                              </p>
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

              {/* If worker has no team */}
              {!worker.team && (
                <p className="text-sm text-muted-foreground">소속된 팀이 없습니다</p>
              )}
            </div>

            {/* Danger Zone - Delete */}
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
            <AlertDialogDescription className="space-y-3">
              <p>
                <strong>{worker?.name}</strong>님의 모든 정보가 영구적으로 삭제됩니다.
              </p>
              <p className="text-destructive font-medium">삭제 후 복구할 수 없습니다.</p>
              <div className="pt-2">
                <Label htmlFor="delete-confirm">
                  확인을 위해 인력 이름 또는 'DELETE'를 입력하세요
                </Label>
                <Input
                  id="delete-confirm"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={worker?.name || "DELETE"}
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
              onClick={handleDeleteWorker}
              disabled={isDeleting || (!deleteConfirmText)}
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
                  {filteredMemberSearchResults.map((w) => {
                    const alreadyAdded = isAlreadyAdded(w.id)
                    return (
                      <div
                        key={w.id}
                        className="flex items-center justify-between rounded-lg border border-border p-3"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback>{w.name.slice(0, 2)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{w.name}</p>
                            <p className="text-sm text-muted-foreground">{formatPhone(w.phone)}</p>
                          </div>
                        </div>
                        {alreadyAdded ? (
                          <Badge variant="secondary" className="text-xs">
                            이미 추가됨
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => {
                              handleAddTeamMember(w.id)
                              // Don't close dialog to allow adding multiple
                            }}
                          >
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
            <AlertDialogDescription className="space-y-3">
              <p>
                <strong>{worker?.name}</strong>님은 현재 팀의 반장입니다.
              </p>
              <p>
                반장을 제외하면 팀이 해산되고, 모든 팀원({teamMemberWorkers.length}명)이 개별 인력으로 전환됩니다.
              </p>
              <p className="text-destructive font-medium">
                팀은 완전 삭제되며 복구할 수 없습니다.
              </p>
              <div className="pt-2">
                <Label htmlFor="team-delete-confirm">
                  확인을 위해 'DELETE'를 입력하세요
                </Label>
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
    </Sheet>
  )
}
