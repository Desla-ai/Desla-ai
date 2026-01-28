"use client"

import { useState, useEffect } from "react"
import { AppShell } from "@/components/layout/app-shell"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { useAppStore, type AppSnapshot } from "@/lib/app-store"
import { formatKoreanMoney } from "@/lib/format"
import {
  Save,
  RotateCcw,
  Trash2,
  Clock,
  Building2,
  Users,
  UserCheck,
  Wallet,
  Receipt,
  Database,
  FileArchive,
} from "lucide-react"
import { toast } from "sonner"

export default function RecordsPage() {
  const { state, saveSnapshot, loadSnapshot, getSnapshots, deleteSnapshot } = useAppStore()
  const [snapshots, setSnapshots] = useState<AppSnapshot[]>([])
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [snapshotTitle, setSnapshotTitle] = useState("")
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [snapshotToRestore, setSnapshotToRestore] = useState<AppSnapshot | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [snapshotToDelete, setSnapshotToDelete] = useState<AppSnapshot | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)


  useEffect(() => {
    ; (async () => {
      const list = await getSnapshots()
      setSnapshots(list)
    })()
  }, [getSnapshots])

  const refreshSnapshots = async () => {
    const list = await getSnapshots()
    setSnapshots(list)
  }

  const handleSave = async () => {
    if (isSaving) return
    if (!snapshotTitle.trim()) {
      toast.error("스냅샷 제목을 입력해주세요")
      return
    }

    try {
      setIsSaving(true)
      await saveSnapshot(snapshotTitle.trim())

      const list = await getSnapshots()
      setSnapshots(list)

      setSaveDialogOpen(false)
      setSnapshotTitle("")
      toast.success("스냅샷이 저장되었습니다")
    } catch {
      toast.error("스냅샷 저장에 실패했습니다")
    } finally {
      setIsSaving(false)
    }
  }

  const handleRestoreClick = (snapshot: AppSnapshot) => {
    setSnapshotToRestore(snapshot)
    setRestoreDialogOpen(true)
  }

  const handleRestoreConfirm = async () => {
    if (isRestoring) return
    if (!snapshotToRestore) return

    try {
      setIsRestoring(true)
      await loadSnapshot(snapshotToRestore)

      setRestoreDialogOpen(false)
      setSnapshotToRestore(null)
      toast.success("스냅샷이 복원되었습니다")

      // 복원 후 목록 갱신(선택)
      const list = await getSnapshots()
      setSnapshots(list)
    } catch {
      toast.error("복원에 실패했습니다")
    } finally {
      setIsRestoring(false)
    }
  }

  const handleDeleteClick = (snapshot: AppSnapshot) => {
    setSnapshotToDelete(snapshot)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (isDeleting) return
    if (!snapshotToDelete) return

    try {
      setIsDeleting(true)
      await deleteSnapshot(snapshotToDelete.id)

      const list = await getSnapshots()
      setSnapshots(list)

      setDeleteDialogOpen(false)
      setSnapshotToDelete(null)
      toast.success("스냅샷이 삭제되었습니다")
    } catch {
      toast.error("삭제에 실패했습니다")
    } finally {
      setIsDeleting(false)
    }
  }
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  // Current state metrics
  const currentMetrics = {
    siteCount: state.sites.length,
    waitingWorkers: state.workers.filter((w) => w.status === "미출근").length,
    assignedWorkers: state.workers.filter((w) => w.status === "배치" || w.status === "출근")
      .length,
    pendingPayments: state.settlements
      .filter((s) => s.status === "지급대기")
      .reduce((sum, s) => sum + s.amount, 0),
    pendingBillings: state.settlements
      .filter((s) => s.status === "청구대기")
      .reduce((sum, s) => sum + s.amount, 0),
  }

  return (
    <AppShell title="스냅샷 관리">
      <div className="flex flex-col gap-6 p-6">
        {/* Current State Summary */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Database className="h-5 w-5" />
                  현재 상태
                </CardTitle>
                <CardDescription>
                  현재 앱의 전체 상태를 스냅샷으로 저장할 수 있습니다
                </CardDescription>
              </div>
              <Button onClick={() => setSaveDialogOpen(true)}>
                <Save className="mr-2 h-4 w-4" />
                현재 상태 저장
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-5">
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <div className="rounded-full bg-chart-2/20 p-2">
                  <Building2 className="h-4 w-4 text-chart-2" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">현장 수</p>
                  <p className="text-lg font-semibold">{currentMetrics.siteCount}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <div className="rounded-full bg-status-waiting/20 p-2">
                  <Users className="h-4 w-4 text-status-waiting-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">미출근 인원</p>
                  <p className="text-lg font-semibold">{currentMetrics.waitingWorkers}명</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <div className="rounded-full bg-status-progress/20 p-2">
                  <UserCheck className="h-4 w-4 text-status-progress-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">배치 인원</p>
                  <p className="text-lg font-semibold">{currentMetrics.assignedWorkers}명</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <div className="rounded-full bg-chart-1/20 p-2">
                  <Wallet className="h-4 w-4 text-chart-1" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">지급대기</p>
                  <p className="text-sm font-semibold">
                    {formatKoreanMoney(currentMetrics.pendingPayments)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <div className="rounded-full bg-status-pending/20 p-2">
                  <Receipt className="h-4 w-4 text-status-pending-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">청구대기</p>
                  <p className="text-sm font-semibold">
                    {formatKoreanMoney(currentMetrics.pendingBillings)}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Saved Snapshots */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileArchive className="h-5 w-5" />
              저장된 스냅샷 ({snapshots.length}개)
            </CardTitle>
            <CardDescription>
              저장된 스냅샷을 복원하면 모든 화면의 데이터가 해당 시점으로 되돌아갑니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            {snapshots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileArchive className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-semibold">저장된 스냅샷이 없습니다</h3>
                <p className="text-sm text-muted-foreground">
                  &quot;현재 상태 저장&quot; 버튼을 눌러 첫 번째 스냅샷을 만들어보세요
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {snapshots.map((snapshot) => (
                  <div
                    key={snapshot.id}
                    className="flex flex-col gap-4 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{snapshot.title}</h3>
                        <Badge variant="secondary" className="text-xs">
                          <Clock className="mr-1 h-3 w-3" />
                          {formatTimestamp(snapshot.timestamp)}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          현장 {snapshot.metrics.siteCount}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          미출근 {snapshot.metrics.waitingWorkers}명
                        </span>
                        <span className="flex items-center gap-1">
                          <UserCheck className="h-3 w-3" />
                          배치 {snapshot.metrics.assignedWorkers}명
                        </span>
                        <span className="flex items-center gap-1">
                          <Wallet className="h-3 w-3" />
                          지급대기 {formatKoreanMoney(snapshot.metrics.pendingPayments)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Receipt className="h-3 w-3" />
                          청구대기 {formatKoreanMoney(snapshot.metrics.pendingBillings)}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRestoreClick(snapshot)}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        복원
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleDeleteClick(snapshot)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Save Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>스냅샷 저장</DialogTitle>
            <DialogDescription>
              현재 앱의 전체 상태를 스냅샷으로 저장합니다. 나중에 이 시점으로 복원할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="snapshot-title" className="mb-2 block">
              스냅샷 제목
            </Label>
            <Input
              id="snapshot-title"
              placeholder="예: 1월 28일 오전 작업 완료"
              value={snapshotTitle}
              onChange={(e) => setSnapshotTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave()
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>스냅샷 복원</AlertDialogTitle>
            <AlertDialogDescription>
              현재 상태가 선택한 스냅샷으로 대체됩니다. 계속할까요?
              {snapshotToRestore && (
                <span className="mt-2 block font-medium text-foreground">
                  &quot;{snapshotToRestore.title}&quot; ({formatTimestamp(snapshotToRestore.timestamp)})
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestoreConfirm} disabled={isRestoring}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {isRestoring ? "복원 중..." : "복원"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>스냅샷 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 스냅샷을 삭제하시겠습니까? 삭제된 스냅샷은 복구할 수 없습니다.
              {snapshotToDelete && (
                <span className="mt-2 block font-medium text-foreground">
                  &quot;{snapshotToDelete.title}&quot;
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm} disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {isDeleting ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}
