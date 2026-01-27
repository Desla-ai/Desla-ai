"use client"

import { useState } from "react"
import { AppShell } from "@/components/layout/app-shell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { formatKoreanMoney, formatKoreanDate } from "@/lib/format"
import {
  Save,
  MessageSquare,
  History,
  Upload,
  Trash2,
  Building2,
  Users,
  Clock,
  Edit2,
  User,
  Bell,
  Cog,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export default function SettingsPage() {
  const {
    state,
    updateSmsTemplate,
    saveSnapshot,
    loadSnapshot,
    getSnapshots,
    deleteSnapshot,
  } = useAppStore()

  // SMS Template editing
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null)
  const [editTemplateContent, setEditTemplateContent] = useState("")

  // Snapshot management
  const [snapshots, setSnapshots] = useState<AppSnapshot[]>(() => getSnapshots())
  const [newSnapshotTitle, setNewSnapshotTitle] = useState("")
  const [saveSnapshotDialogOpen, setSaveSnapshotDialogOpen] = useState(false)
  const [loadSnapshotDialogOpen, setLoadSnapshotDialogOpen] = useState(false)
  const [selectedSnapshot, setSelectedSnapshot] = useState<AppSnapshot | null>(null)
  const [deleteSnapshotId, setDeleteSnapshotId] = useState<string | null>(null)

  const handleSave = () => {
    toast.success("설정이 저장되었습니다")
  }

  const handleEditTemplate = (templateId: string) => {
    const template = state.smsTemplates.find((t) => t.id === templateId)
    if (template) {
      setEditingTemplate(templateId)
      setEditTemplateContent(template.content)
    }
  }

  const handleSaveTemplate = () => {
    if (!editingTemplate) return
    const template = state.smsTemplates.find((t) => t.id === editingTemplate)
    if (template) {
      updateSmsTemplate({ ...template, content: editTemplateContent })
      toast.success("SMS 템플릿이 저장되었습니다")
    }
    setEditingTemplate(null)
    setEditTemplateContent("")
  }

  const handleSaveSnapshot = () => {
    if (!newSnapshotTitle.trim()) {
      toast.error("스냅샷 이름을 입력해주세요")
      return
    }
    const snapshot = saveSnapshot(newSnapshotTitle.trim())
    setSnapshots(getSnapshots())
    setSaveSnapshotDialogOpen(false)
    setNewSnapshotTitle("")
    toast.success(`"${snapshot.title}" 스냅샷이 저장되었습니다`)
  }

  const handleLoadSnapshot = () => {
    if (!selectedSnapshot) return
    loadSnapshot(selectedSnapshot)
    setLoadSnapshotDialogOpen(false)
    setSelectedSnapshot(null)
    toast.success(`"${selectedSnapshot.title}" 스냅샷을 불러왔습니다`)
  }

  const handleDeleteSnapshot = () => {
    if (!deleteSnapshotId) return
    deleteSnapshot(deleteSnapshotId)
    setSnapshots(getSnapshots())
    setDeleteSnapshotId(null)
    toast.success("스냅샷이 삭제되었습니다")
  }

  const refreshSnapshots = () => {
    setSnapshots(getSnapshots())
  }

  return (
    <AppShell title="설정">
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="shrink-0 border-b border-border bg-background px-6 py-4">
          <h1 className="text-2xl font-semibold">설정</h1>
        </div>

        {/* Content area with centered max-width container */}
        <ScrollArea className="flex-1">
          <div className="mx-auto w-full max-w-4xl px-6 py-6">
            <Tabs defaultValue="profile" className="w-full">
              <TabsList className="mb-6 w-full justify-start">
                <TabsTrigger value="profile" className="gap-2">
                  <User className="h-4 w-4" />
                  프로필
                </TabsTrigger>
                <TabsTrigger value="notifications" className="gap-2">
                  <Bell className="h-4 w-4" />
                  알림
                </TabsTrigger>
                <TabsTrigger value="sms" className="gap-2">
                  <MessageSquare className="h-4 w-4" />
                  SMS 템플릿
                </TabsTrigger>
                <TabsTrigger value="data" className="gap-2">
                  <History className="h-4 w-4" />
                  데이터
                </TabsTrigger>
                <TabsTrigger value="system" className="gap-2">
                  <Cog className="h-4 w-4" />
                  시스템
                </TabsTrigger>
              </TabsList>

              {/* Profile Tab */}
              <TabsContent value="profile" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">프로필 설정</CardTitle>
                    <CardDescription>계정 정보를 관리합니다</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="name">이름</Label>
                      <Input id="name" defaultValue="관리자" className="max-w-md" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="email">이메일</Label>
                      <Input id="email" type="email" defaultValue="admin@desla.ai" className="max-w-md" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="phone">연락처</Label>
                      <Input id="phone" type="tel" defaultValue="010-1234-5678" className="max-w-md" />
                    </div>
                    <div className="pt-2">
                      <Button onClick={handleSave}>저장</Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Notifications Tab */}
              <TabsContent value="notifications" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">알림 설정</CardTitle>
                    <CardDescription>알림 수신 여부를 설정합니다</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <Label>출근 알림</Label>
                        <span className="text-sm text-muted-foreground">
                          근로자 출근 시 알림을 받습니다
                        </span>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <Label>청구 알림</Label>
                        <span className="text-sm text-muted-foreground">
                          청구서 상태 변경 시 알림을 받습니다
                        </span>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <Label>이슈 알림</Label>
                        <span className="text-sm text-muted-foreground">
                          미해결 이슈 발생 시 알림을 받습니다
                        </span>
                      </div>
                      <Switch defaultChecked />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* SMS Templates Tab */}
              <TabsContent value="sms" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      SMS 템플릿 관리
                    </CardTitle>
                    <CardDescription>
                      인력에게 발송할 SMS 템플릿을 관리합니다. 변수: {'{siteName}'}, {'{date}'}, {'{checkInTime}'}, {'{address}'}, {'{officePhone}'}, {'{message}'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {state.smsTemplates.map((template) => (
                      <div key={template.id} className="rounded-lg border border-border p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{template.name}</span>
                            <Badge variant="outline">{template.type}</Badge>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => handleEditTemplate(template.id)}>
                            <Edit2 className="h-4 w-4 mr-1" />
                            수정
                          </Button>
                        </div>
                        <pre className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/50 rounded p-3">
                          {template.content}
                        </pre>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Data Tab */}
              <TabsContent value="data" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <History className="h-4 w-4" />
                      데이터 스냅샷
                    </CardTitle>
                    <CardDescription>
                      현재 상태를 저장하고 나중에 복원할 수 있습니다. 테스트/롤백에 유용합니다.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <div className="flex gap-2">
                      <Button onClick={() => setSaveSnapshotDialogOpen(true)}>
                        <Save className="h-4 w-4 mr-2" />
                        현재 상태 저장
                      </Button>
                      <Button variant="outline" onClick={() => { refreshSnapshots(); setLoadSnapshotDialogOpen(true) }}>
                        <Upload className="h-4 w-4 mr-2" />
                        스냅샷 불러오기
                      </Button>
                    </div>

                    {snapshots.length > 0 && (
                      <div className="rounded-lg border border-border">
                        <div className="p-3 border-b border-border bg-muted/30">
                          <span className="text-sm font-medium">저장된 스냅샷 ({snapshots.length})</span>
                        </div>
                        <ScrollArea className="max-h-[240px]">
                          {snapshots.map((snapshot) => (
                            <div key={snapshot.id} className="flex items-center justify-between p-3 border-b border-border last:border-0 hover:bg-muted/30">
                              <div className="flex flex-col gap-1">
                                <span className="font-medium text-sm">{snapshot.title}</span>
                                <span className="text-xs text-muted-foreground">
                                  {formatKoreanDate(snapshot.timestamp.split("T")[0])} • 현장 {snapshot.metrics.siteCount}개 • 인력 {snapshot.metrics.waitingWorkers + snapshot.metrics.assignedWorkers}명
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => { setSelectedSnapshot(snapshot); setLoadSnapshotDialogOpen(true) }}
                                >
                                  <Upload className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => setDeleteSnapshotId(snapshot.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </ScrollArea>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* System Tab */}
              <TabsContent value="system" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">시스템 설정</CardTitle>
                    <CardDescription>시스템 환경을 설정합니다</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <Label>자동 로그아웃</Label>
                        <span className="text-sm text-muted-foreground">
                          30분 동안 활동이 없으면 자동 로그아웃됩니다
                        </span>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <Label>데이터 자동 새로고침</Label>
                        <span className="text-sm text-muted-foreground">
                          5분마다 데이터를 자동으로 새로고침합니다
                        </span>
                      </div>
                      <Switch defaultChecked />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </div>

      {/* Edit SMS Template Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>SMS 템플릿 수정</DialogTitle>
            <DialogDescription>
              템플릿 내용을 수정합니다. 변수를 사용하면 발송 시 자동으로 치환됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Textarea
              value={editTemplateContent}
              onChange={(e) => setEditTemplateContent(e.target.value)}
              rows={6}
              className="font-mono text-sm"
            />
            <div className="flex flex-wrap gap-1">
              {["{siteName}", "{date}", "{checkInTime}", "{address}", "{officePhone}", "{message}"].map((v) => (
                <Badge
                  key={v}
                  variant="outline"
                  className="cursor-pointer text-xs"
                  onClick={() => setEditTemplateContent((prev) => prev + v)}
                >
                  {v}
                </Badge>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTemplate(null)}>
              취소
            </Button>
            <Button onClick={handleSaveTemplate}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Snapshot Dialog */}
      <Dialog open={saveSnapshotDialogOpen} onOpenChange={setSaveSnapshotDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>현재 상태 저장</DialogTitle>
            <DialogDescription>
              현재 데이터를 스냅샷으로 저장합니다. 나중에 이 시점으로 복원할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="snapshot-title">스냅샷 이름</Label>
              <Input
                id="snapshot-title"
                value={newSnapshotTitle}
                onChange={(e) => setNewSnapshotTitle(e.target.value)}
                placeholder="예: 1월 28일 오전 상태"
              />
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="font-medium mb-2">저장될 데이터:</p>
              <ul className="text-muted-foreground space-y-1">
                <li>• 현장: {state.sites.length}개</li>
                <li>• 인력: {state.workers.length}명</li>
                <li>• 청구 기록: {state.settlementRecords.length}건</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveSnapshotDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSaveSnapshot}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load Snapshot Dialog */}
      <Dialog open={loadSnapshotDialogOpen} onOpenChange={setLoadSnapshotDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>스냅샷 불러오기</DialogTitle>
            <DialogDescription>
              선택한 스냅샷으로 데이터를 복원합니다. 현재 데이터는 덮어씌워집니다.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {snapshots.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                저장된 스냅샷이 없습니다
              </div>
            ) : (
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-2">
                  {snapshots.map((snapshot) => (
                    <div
                      key={snapshot.id}
                      className={cn(
                        "rounded-lg border p-3 cursor-pointer transition-colors",
                        selectedSnapshot?.id === snapshot.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/30"
                      )}
                      onClick={() => setSelectedSnapshot(snapshot)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{snapshot.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatKoreanDate(snapshot.timestamp.split("T")[0])}
                        </span>
                      </div>
                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {snapshot.metrics.siteCount}개
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {snapshot.metrics.waitingWorkers + snapshot.metrics.assignedWorkers}명
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          대기 {snapshot.metrics.waitingWorkers}명
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoadSnapshotDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleLoadSnapshot} disabled={!selectedSnapshot}>
              불러오기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Snapshot Confirmation */}
      <AlertDialog open={!!deleteSnapshotId} onOpenChange={(open) => !open && setDeleteSnapshotId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>스냅샷을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              이 작업은 되돌릴 수 없습니다. 스냅샷이 영구적으로 삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSnapshot} className="bg-destructive text-white hover:bg-destructive/90">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}
