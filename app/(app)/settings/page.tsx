"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
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
import { formatKoreanDate } from "@/lib/format"
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
  KeyRound,
  Copy,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type OfficeProfileForm = {
  supplierName: string
  bizNo: string
  ceoName: string
  address: string
  bizType: string
  bizItem: string
  phone: string
  bankName: string
  bankAccount: string
  bankHolder: string
}

type UserProfileForm = {
  name: string
  email: string
  phone: string
}

type OfficePrefs = {
  notifyCheckIn: boolean
  notifyBilling: boolean
  notifyIssues: boolean
  autoLogout: boolean
  autoRefresh: boolean
}

type SmsTemplateId = "default" | "notice" | "urgent" | "change"
type SmsTemplateRow = { id: SmsTemplateId; name: string; content: string }

const SMS_TOKENS_KO = ["{현장명}", "{주소}", "{출근시간}", "{사무소번호}"] as const

function coerceSnapshots(value: unknown): AppSnapshot[] {
  if (Array.isArray(value)) return value as AppSnapshot[]
  if (value && typeof value === "object" && Array.isArray((value as any).snapshots)) {
    return (value as any).snapshots as AppSnapshot[]
  }
  return []
}

function emptyOfficeProfile(): OfficeProfileForm {
  return {
    supplierName: "",
    bizNo: "",
    ceoName: "",
    address: "",
    bizType: "",
    bizItem: "",
    phone: "",
    bankName: "",
    bankAccount: "",
    bankHolder: "",
  }
}

function emptyUserProfile(): UserProfileForm {
  return { name: "", email: "", phone: "" }
}

const FALLBACK_SMS_TEMPLATES: SmsTemplateRow[] = [
  { id: "default", name: "기본 템플릿", content: "내일 {출근시간}까지 {현장명}({주소})로 출근 부탁드립니다. 문의: {사무소번호}" },
  { id: "notice", name: "공지", content: "[공지] {현장명} 현장 안내드립니다.\n위치: {주소}\n출근시간: {출근시간}\n문의: {사무소번호}" },
  { id: "urgent", name: "긴급", content: "[긴급] {현장명} 현장 긴급 인력 요청\n출근시간: {출근시간}\n위치: {주소}\n연락처: {사무소번호}" },
  { id: "change", name: "현장 변경", content: "[현장변경] 내일 출근 현장이 변경되었습니다.\n변경현장: {현장명}\n주소: {주소}\n출근시간: {출근시간}\n문의: {사무소번호}" },
]


export default function SettingsPage() {
  const {
    state,
    saveSnapshot,
    loadSnapshot,
    getSnapshots,
    deleteSnapshot,
  } = useAppStore()

  // -------------------------
  // SMS Template editing
  // -------------------------
  const [editingTemplate, setEditingTemplate] = useState<SmsTemplateId | null>(null)
  const [editTemplateContent, setEditTemplateContent] = useState("")
  const [isLoadingSmsTemplates, setIsLoadingSmsTemplates] = useState(false)
  const [isSavingSmsTemplate, setIsSavingSmsTemplate] = useState(false)

  const [smsTemplates, setSmsTemplates] = useState<SmsTemplateRow[]>(FALLBACK_SMS_TEMPLATES)

  const handleEditTemplate = (templateId: SmsTemplateId) => {
    const template = smsTemplates.find((t) => t.id === templateId)
    if (template) {
      setEditingTemplate(templateId)
      setEditTemplateContent(String(template.content ?? ""))
    }
  }


  const loadSmsTemplatesFromDb = async () => {
    setIsLoadingSmsTemplates(true)
    try {
      const res = await fetch("/api/settings/sms-templates", { method: "GET", cache: "no-store" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error ?? `SMS 템플릿을 불러오지 못했습니다 (${res.status})`)
        return
      }

      const rows: SmsTemplateRow[] = Array.isArray(json?.templates) ? json.templates : []
      if (rows.length > 0) setSmsTemplates(rows)
      else setSmsTemplates(FALLBACK_SMS_TEMPLATES)
    } finally {
      setIsLoadingSmsTemplates(false)
    }
  }


  const handleSaveTemplate = async () => {
    if (!editingTemplate) return
    const template = smsTemplates.find((t) => t.id === editingTemplate)
    if (!template) return

    setIsSavingSmsTemplate(true)
    try {
      const payload: SmsTemplateRow = {
        id: template.id,
        name: template.name,
        content: editTemplateContent,
      }

      const res = await fetch("/api/settings/sms-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error ?? `SMS 템플릿 저장 실패 (${res.status})`)
        return
      }

      const saved: SmsTemplateRow = (json?.template ?? payload) as SmsTemplateRow

      // ✅ 로컬 state 갱신(이 화면의 Single Source of Truth)
      setSmsTemplates((prev) => prev.map((t) => (t.id === saved.id ? saved : t)))

      toast.success("SMS 템플릿이 저장되었습니다")
      setEditingTemplate(null)
      setEditTemplateContent("")
    } catch (e) {
      console.error(e)
      toast.error("SMS 템플릿 저장 중 오류가 발생했습니다")
    } finally {
      setIsSavingSmsTemplate(false)
    }
  }


  // -------------------------
  // Snapshot management
  // -------------------------
  const [snapshots, setSnapshots] = useState<AppSnapshot[]>(() => coerceSnapshots(getSnapshots()))
  const [newSnapshotTitle, setNewSnapshotTitle] = useState("")
  const [saveSnapshotDialogOpen, setSaveSnapshotDialogOpen] = useState(false)
  const [loadSnapshotDialogOpen, setLoadSnapshotDialogOpen] = useState(false)
  const [selectedSnapshot, setSelectedSnapshot] = useState<AppSnapshot | null>(null)
  const [deleteSnapshotId, setDeleteSnapshotId] = useState<string | null>(null)

  const totalWorkersInSnapshot = useMemo(() => {
    return snapshots.reduce(
      (acc, s) => acc + (s?.metrics?.waitingWorkers ?? 0) + (s?.metrics?.assignedWorkers ?? 0),
      0
    )
  }, [snapshots])

  const refreshSnapshots = async () => {
    try {
      const result = await Promise.resolve(getSnapshots() as any)
      setSnapshots(coerceSnapshots(result))
    } catch (e) {
      console.error(e)
      setSnapshots([])
      toast.error("스냅샷 목록을 불러오지 못했습니다")
    }
  }

  const handleSaveSnapshot = async () => {
    if (!newSnapshotTitle.trim()) {
      toast.error("스냅샷 이름을 입력해주세요")
      return
    }
    try {
      const snapshot = await Promise.resolve(saveSnapshot(newSnapshotTitle.trim()) as any)
      await refreshSnapshots()
      setSaveSnapshotDialogOpen(false)
      setNewSnapshotTitle("")
      toast.success(`"${snapshot?.title ?? "스냅샷"}" 스냅샷이 저장되었습니다`)
    } catch (e) {
      console.error(e)
      toast.error("스냅샷 저장에 실패했습니다")
    }
  }

  const handleLoadSnapshot = async () => {
    if (!selectedSnapshot) return
    try {
      await Promise.resolve(loadSnapshot(selectedSnapshot) as any)
      setLoadSnapshotDialogOpen(false)
      setSelectedSnapshot(null)
      toast.success(`"${selectedSnapshot.title}" 스냅샷을 불러왔습니다`)
    } catch (e) {
      console.error(e)
      toast.error("스냅샷 불러오기에 실패했습니다")
    }
  }

  const handleDeleteSnapshot = async () => {
    if (!deleteSnapshotId) return
    try {
      await Promise.resolve(deleteSnapshot(deleteSnapshotId) as any)
      await refreshSnapshots()
      setDeleteSnapshotId(null)
      toast.success("스냅샷이 삭제되었습니다")
    } catch (e) {
      console.error(e)
      toast.error("스냅샷 삭제에 실패했습니다")
    }
  }

  // -------------------------
  // Invite code
  // -------------------------
  const [inviteCode, setInviteCode] = useState<string>("")
  const [inviteExpiresAt, setInviteExpiresAt] = useState<string>("")
  const [isIssuingInvite, setIsIssuingInvite] = useState(false)

  const handleIssueInviteCode = async () => {
    setIsIssuingInvite(true)
    try {
      const res = await fetch("/api/admin/invitations", { method: "POST" })
      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        const msg =
          json?.error ??
          (res.status === 401 ? "로그인이 필요합니다" : `초대코드 발급 실패 (${res.status})`)
        toast.error(msg)
        return
      }

      setInviteCode(String(json.inviteCode ?? ""))
      setInviteExpiresAt(String(json.expiresAt ?? ""))
      toast.success("초대코드를 발급했습니다")
    } catch (e) {
      console.error(e)
      toast.error("초대코드 발급 중 오류가 발생했습니다")
    } finally {
      setIsIssuingInvite(false)
    }
  }

  const handleCopyInviteCode = async () => {
    if (!inviteCode) return
    try {
      await navigator.clipboard.writeText(inviteCode)
      toast.success("초대코드를 복사했습니다")
    } catch {
      toast.error("복사에 실패했습니다")
    }
  }

  // -------------------------
  // Office profile (supplier)
  // -------------------------
  const [officeProfile, setOfficeProfile] = useState<OfficeProfileForm>(() => emptyOfficeProfile())
  const [isLoadingOfficeProfile, setIsLoadingOfficeProfile] = useState(false)
  const [isSavingOfficeProfile, setIsSavingOfficeProfile] = useState(false)

  const loadOfficeProfile = async () => {
    setIsLoadingOfficeProfile(true)
    try {
      const res = await fetch("/api/settings/office-profile", { method: "GET" })
      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        const msg = json?.error ?? `회사 정보를 불러오지 못했습니다 (${res.status})`
        toast.error(msg)
        return
      }

      const p = json?.officeProfile ?? {}
      setOfficeProfile({
        supplierName: String(p.supplierName ?? ""),
        bizNo: String(p.bizNo ?? ""),
        ceoName: String(p.ceoName ?? ""),
        address: String(p.address ?? ""),
        bizType: String(p.bizType ?? ""),
        bizItem: String(p.bizItem ?? ""),
        phone: String(p.phone ?? ""),
        bankName: String(p.bankName ?? ""),
        bankAccount: String(p.bankAccount ?? ""),
        bankHolder: String(p.bankHolder ?? ""),
      })
    } catch (e) {
      console.error(e)
      toast.error("회사 정보를 불러오는 중 오류가 발생했습니다")
    } finally {
      setIsLoadingOfficeProfile(false)
    }
  }

  const saveOfficeProfile = async () => {
    setIsSavingOfficeProfile(true)
    try {
      const res = await fetch("/api/settings/office-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(officeProfile),
      })
      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        const msg = json?.error ?? `회사 정보 저장 실패 (${res.status})`
        toast.error(msg)
        return
      }

      toast.success("회사 정보가 저장되었습니다")
      const p = json?.officeProfile ?? {}
      setOfficeProfile({
        supplierName: String(p.supplierName ?? ""),
        bizNo: String(p.bizNo ?? ""),
        ceoName: String(p.ceoName ?? ""),
        address: String(p.address ?? ""),
        bizType: String(p.bizType ?? ""),
        bizItem: String(p.bizItem ?? ""),
        phone: String(p.phone ?? ""),
        bankName: String(p.bankName ?? ""),
        bankAccount: String(p.bankAccount ?? ""),
        bankHolder: String(p.bankHolder ?? ""),
      })
    } catch (e) {
      console.error(e)
      toast.error("회사 정보 저장 중 오류가 발생했습니다")
    } finally {
      setIsSavingOfficeProfile(false)
    }
  }

  // -------------------------
  // User profile (user_profiles)
  // -------------------------
  const [userProfile, setUserProfile] = useState<UserProfileForm>(() => emptyUserProfile())
  const [isLoadingUserProfile, setIsLoadingUserProfile] = useState(false)
  const [isSavingUserProfile, setIsSavingUserProfile] = useState(false)

  const loadUserProfile = async () => {
    setIsLoadingUserProfile(true)
    try {
      const res = await fetch("/api/settings/profile", { method: "GET" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error ?? `프로필을 불러오지 못했습니다 (${res.status})`)
        return
      }
      const p = json?.profile ?? {}
      setUserProfile({
        name: String(p.name ?? ""),
        email: String(p.email ?? ""),
        phone: String(p.phone ?? ""),
      })
    } catch (e) {
      console.error(e)
      toast.error("프로필을 불러오는 중 오류가 발생했습니다")
    } finally {
      setIsLoadingUserProfile(false)
    }
  }

  const saveUserProfile = async () => {
    setIsSavingUserProfile(true)
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userProfile),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error ?? `프로필 저장 실패 (${res.status})`)
        return
      }
      const p = json?.profile ?? {}
      setUserProfile({
        name: String(p.name ?? ""),
        email: String(p.email ?? ""),
        phone: String(p.phone ?? ""),
      })
      toast.success("프로필이 저장되었습니다")
    } catch (e) {
      console.error(e)
      toast.error("프로필 저장 중 오류가 발생했습니다")
    } finally {
      setIsSavingUserProfile(false)
    }
  }

  // -------------------------
  // Office prefs (office_prefs)
  // -------------------------
  const [prefs, setPrefs] = useState<OfficePrefs>({
    notifyCheckIn: true,
    notifyBilling: true,
    notifyIssues: true,
    autoLogout: true,
    autoRefresh: true,
  })
  const [isLoadingPrefs, setIsLoadingPrefs] = useState(false)
  const [isSavingPrefsKey, setIsSavingPrefsKey] = useState<string | null>(null)

  const loadPrefs = async () => {
    setIsLoadingPrefs(true)
    try {
      const res = await fetch("/api/settings/prefs", { method: "GET" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error ?? `설정을 불러오지 못했습니다 (${res.status})`)
        return
      }
      const p = (json?.prefs ?? {}) as Partial<OfficePrefs>
      setPrefs((prev) => ({ ...prev, ...p }))
    } catch (e) {
      console.error(e)
      toast.error("설정을 불러오는 중 오류가 발생했습니다")
    } finally {
      setIsLoadingPrefs(false)
    }
  }

  const savePrefsPartial = async (patch: Partial<OfficePrefs>, keyLabel: string) => {
    setIsSavingPrefsKey(keyLabel)
    try {
      const res = await fetch("/api/settings/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error ?? `설정 저장 실패 (${res.status})`)
        return
      }

      const next = (json?.prefs ?? {}) as Partial<OfficePrefs>
      setPrefs((prev) => ({ ...prev, ...next }))

      // ✅ 추가: 전역 적용 레이어가 즉시 반영되도록 “서버값 재조회”
      await loadPrefs()
    } catch (e) {
      console.error(e)
      toast.error("설정 저장 중 오류가 발생했습니다")
    } finally {
      setIsSavingPrefsKey(null)
    }
  }


  useEffect(() => {
    void refreshSnapshots()
    void loadOfficeProfile()
    void loadUserProfile()
    void loadPrefs()
    void loadSmsTemplatesFromDb()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AppShell title="설정">
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-border bg-background px-6 py-4">
          <h1 className="text-2xl font-semibold">설정</h1>
        </div>

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
                    <CardDescription>이름/이메일/연락처를 저장합니다. (username과 별개)</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {isLoadingUserProfile ? (
                      <div className="text-sm text-muted-foreground">불러오는 중...</div>
                    ) : null}

                    <div className="grid gap-2">
                      <Label htmlFor="name">이름</Label>
                      <Input
                        id="name"
                        value={userProfile.name}
                        onChange={(e) => setUserProfile((p) => ({ ...p, name: e.target.value }))}
                        className="max-w-md"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="email">이메일</Label>
                      <Input
                        id="email"
                        type="email"
                        value={userProfile.email}
                        onChange={(e) => setUserProfile((p) => ({ ...p, email: e.target.value }))}
                        className="max-w-md"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="phone">연락처</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={userProfile.phone}
                        onChange={(e) => setUserProfile((p) => ({ ...p, phone: e.target.value }))}
                        className="max-w-md"
                      />
                    </div>

                    <div className="pt-2 flex items-center gap-2">
                      <Button onClick={saveUserProfile} disabled={isSavingUserProfile}>
                        {isSavingUserProfile ? "저장 중..." : "저장"}
                      </Button>
                      <Button variant="outline" onClick={loadUserProfile} disabled={isSavingUserProfile}>
                        다시 불러오기
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Company / Supplier info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">회사 정보(공급자)</CardTitle>
                    <CardDescription>노무비 청구서 PDF의 ‘공급자’ 영역에 표시됩니다.</CardDescription>
                  </CardHeader>

                  <CardContent className="flex flex-col gap-4">
                    {isLoadingOfficeProfile ? (
                      <div className="text-sm text-muted-foreground">불러오는 중...</div>
                    ) : null}

                    <div className="grid gap-2">
                      <Label htmlFor="supplierName">상호</Label>
                      <Input
                        id="supplierName"
                        className="max-w-md"
                        value={officeProfile.supplierName}
                        onChange={(e) => setOfficeProfile((p) => ({ ...p, supplierName: e.target.value }))}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="bizNo">등록번호(사업자등록번호)</Label>
                      <Input
                        id="bizNo"
                        className="max-w-md"
                        value={officeProfile.bizNo}
                        onChange={(e) => setOfficeProfile((p) => ({ ...p, bizNo: e.target.value }))}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="ceoName">대표자</Label>
                      <Input
                        id="ceoName"
                        className="max-w-md"
                        value={officeProfile.ceoName}
                        onChange={(e) => setOfficeProfile((p) => ({ ...p, ceoName: e.target.value }))}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="address">주소</Label>
                      <Input
                        id="address"
                        className="max-w-2xl"
                        value={officeProfile.address}
                        onChange={(e) => setOfficeProfile((p) => ({ ...p, address: e.target.value }))}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor="bizType">업태</Label>
                        <Input
                          id="bizType"
                          value={officeProfile.bizType}
                          onChange={(e) => setOfficeProfile((p) => ({ ...p, bizType: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="bizItem">종목</Label>
                        <Input
                          id="bizItem"
                          value={officeProfile.bizItem}
                          onChange={(e) => setOfficeProfile((p) => ({ ...p, bizItem: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="officePhone">연락처</Label>
                      <Input
                        id="officePhone"
                        className="max-w-md"
                        value={officeProfile.phone}
                        onChange={(e) => setOfficeProfile((p) => ({ ...p, phone: e.target.value }))}
                      />
                    </div>

                    <Separator />

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div className="grid gap-2">
                        <Label htmlFor="bankName">은행명</Label>
                        <Input
                          id="bankName"
                          value={officeProfile.bankName}
                          onChange={(e) => setOfficeProfile((p) => ({ ...p, bankName: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2 md:col-span-2">
                        <Label htmlFor="bankAccount">계좌번호</Label>
                        <Input
                          id="bankAccount"
                          value={officeProfile.bankAccount}
                          onChange={(e) => setOfficeProfile((p) => ({ ...p, bankAccount: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="bankHolder">예금주</Label>
                      <Input
                        id="bankHolder"
                        className="max-w-md"
                        value={officeProfile.bankHolder}
                        onChange={(e) => setOfficeProfile((p) => ({ ...p, bankHolder: e.target.value }))}
                      />
                    </div>

                    <div className="pt-2 flex items-center gap-2">
                      <Button onClick={saveOfficeProfile} disabled={isSavingOfficeProfile}>
                        {isSavingOfficeProfile ? "저장 중..." : "저장"}
                      </Button>
                      <Button variant="outline" onClick={loadOfficeProfile} disabled={isSavingOfficeProfile}>
                        다시 불러오기
                      </Button>
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
                        <span className="text-sm text-muted-foreground">근로자 출근 시 알림을 받습니다</span>
                      </div>
                      <Switch
                        checked={prefs.notifyCheckIn}
                        disabled={isLoadingPrefs || isSavingPrefsKey === "notifyCheckIn"}
                        onCheckedChange={(v) => {
                          setPrefs((p) => ({ ...p, notifyCheckIn: v }))
                          void savePrefsPartial({ notifyCheckIn: v }, "notifyCheckIn")
                        }}
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <Label>청구 알림</Label>
                        <span className="text-sm text-muted-foreground">청구서 상태 변경 시 알림을 받습니다</span>
                      </div>
                      <Switch
                        checked={prefs.notifyBilling}
                        disabled={isLoadingPrefs || isSavingPrefsKey === "notifyBilling"}
                        onCheckedChange={(v) => {
                          setPrefs((p) => ({ ...p, notifyBilling: v }))
                          void savePrefsPartial({ notifyBilling: v }, "notifyBilling")
                        }}
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <Label>이슈 알림</Label>
                        <span className="text-sm text-muted-foreground">미해결 이슈 발생 시 알림을 받습니다</span>
                      </div>
                      <Switch
                        checked={prefs.notifyIssues}
                        disabled={isLoadingPrefs || isSavingPrefsKey === "notifyIssues"}
                        onCheckedChange={(v) => {
                          setPrefs((p) => ({ ...p, notifyIssues: v }))
                          void savePrefsPartial({ notifyIssues: v }, "notifyIssues")
                        }}
                      />
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
                      인력에게 발송할 템플릿을 관리합니다. 변수:{" "}
                      {SMS_TOKENS_KO.map((t, i) => (
                        <span key={t} className="font-mono">
                          {t}
                          {i < SMS_TOKENS_KO.length - 1 ? ", " : ""}
                        </span>
                      ))}
                      {isLoadingSmsTemplates ? " (불러오는 중...)" : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {smsTemplates.map((template) => (
                      <div key={template.id} className="rounded-lg border border-border p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{template.name}</span>
                            <Badge variant="outline">{template.id}</Badge>
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditTemplate(template.id)}
                          >
                            <Edit2 className="mr-1 h-4 w-4" />
                            수정
                          </Button>
                        </div>

                        <pre className="whitespace-pre-wrap rounded bg-muted/50 p-3 text-sm text-muted-foreground">
                          {template.content}
                        </pre>
                      </div>
                    ))}

                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={loadSmsTemplatesFromDb} disabled={isLoadingSmsTemplates}>
                        서버 템플릿 다시 불러오기
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        * 이제 “저장”은 DB(sms_templates)에 반영됩니다.
                      </span>
                    </div>
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
                      <Button
                        variant="outline"
                        onClick={async () => {
                          await refreshSnapshots()
                          setLoadSnapshotDialogOpen(true)
                        }}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        스냅샷 불러오기
                      </Button>
                    </div>

                    {snapshots.length > 0 && (
                      <div className="rounded-lg border border-border">
                        <div className="p-3 border-b border-border bg-muted/30">
                          <span className="text-sm font-medium">
                            저장된 스냅샷 ({snapshots.length}) · (표시 인력합: {totalWorkersInSnapshot}명)
                          </span>
                        </div>
                        <ScrollArea className="max-h-[240px]">
                          {snapshots.map((snapshot) => (
                            <div
                              key={snapshot.id}
                              className="flex items-center justify-between p-3 border-b border-border last:border-0 hover:bg-muted/30"
                            >
                              <div className="flex flex-col gap-1">
                                <span className="font-medium text-sm">{snapshot.title}</span>
                                <span className="text-xs text-muted-foreground">
                                  {formatKoreanDate(snapshot.timestamp.split("T")[0])} • 현장{" "}
                                  {snapshot.metrics.siteCount}개 • 인력{" "}
                                  {(snapshot.metrics.waitingWorkers ?? 0) + (snapshot.metrics.assignedWorkers ?? 0)}명
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedSnapshot(snapshot)
                                    setLoadSnapshotDialogOpen(true)
                                  }}
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

                    {snapshots.length === 0 && (
                      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                        저장된 스냅샷이 없습니다
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* System Tab */}
              <TabsContent value="system" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <KeyRound className="h-4 w-4" />
                      초대코드 발급
                    </CardTitle>
                    <CardDescription>
                      같은 오피스에 참여할 사용자를 초대할 수 있습니다. 초대코드는 24시간 후 만료되며 1회만 사용할 수 있습니다.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Button onClick={handleIssueInviteCode} disabled={isIssuingInvite}>
                        {isIssuingInvite ? "발급 중..." : "초대코드 발급"}
                      </Button>

                      {inviteCode ? (
                        <Button variant="outline" onClick={handleCopyInviteCode}>
                          <Copy className="h-4 w-4 mr-2" />
                          복사
                        </Button>
                      ) : null}

                      <Link href="/signup" className="text-sm text-muted-foreground underline underline-offset-4">
                        회원가입 페이지로 이동
                      </Link>
                    </div>

                    {inviteCode ? (
                      <div className="rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-col gap-1">
                            <div className="text-sm font-medium">발급된 초대코드</div>
                            <div className="font-mono text-base">{inviteCode}</div>
                            {inviteExpiresAt ? (
                              <div className="text-xs text-muted-foreground">만료: {inviteExpiresAt}</div>
                            ) : null}
                          </div>
                          <Badge variant="outline">24h</Badge>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        초대코드를 발급하면 여기에서 확인하고 복사할 수 있어요.
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">시스템 설정</CardTitle>
                    <CardDescription>시스템 환경을 설정합니다</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <Label>자동 로그아웃</Label>
                        <span className="text-sm text-muted-foreground">30분 동안 활동이 없으면 자동 로그아웃됩니다</span>
                      </div>
                      <Switch
                        checked={prefs.autoLogout}
                        disabled={isLoadingPrefs || isSavingPrefsKey === "autoLogout"}
                        onCheckedChange={(v) => {
                          setPrefs((p) => ({ ...p, autoLogout: v }))
                          void savePrefsPartial({ autoLogout: v }, "autoLogout")
                        }}
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <Label>데이터 자동 새로고침</Label>
                        <span className="text-sm text-muted-foreground">5분마다 데이터를 자동으로 새로고침합니다</span>
                      </div>
                      <Switch
                        checked={prefs.autoRefresh}
                        disabled={isLoadingPrefs || isSavingPrefsKey === "autoRefresh"}
                        onCheckedChange={(v) => {
                          setPrefs((p) => ({ ...p, autoRefresh: v }))
                          void savePrefsPartial({ autoRefresh: v }, "autoRefresh")
                        }}
                      />
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
              템플릿 내용을 수정합니다. 변수:{" "}
              {SMS_TOKENS_KO.map((v) => (
                <span key={v} className="font-mono ml-1">{v}</span>
              ))}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <Textarea
              value={editTemplateContent}
              onChange={(e) => setEditTemplateContent(e.target.value)}
              rows={8}
              className="font-mono text-sm"
            />
            <div className="flex flex-wrap gap-1">
              {SMS_TOKENS_KO.map((v) => (
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
            <Button variant="outline" onClick={() => setEditingTemplate(null)} disabled={isSavingSmsTemplate}>
              취소
            </Button>
            <Button onClick={handleSaveTemplate} disabled={isSavingSmsTemplate}>
              {isSavingSmsTemplate ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Snapshot Dialog */}
      <Dialog open={saveSnapshotDialogOpen} onOpenChange={setSaveSnapshotDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>현재 상태 저장</DialogTitle>
            <DialogDescription>현재 데이터를 스냅샷으로 저장합니다. 나중에 이 시점으로 복원할 수 있습니다.</DialogDescription>
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
            <Button variant="outline" onClick={() => setSaveSnapshotDialogOpen(false)}>취소</Button>
            <Button onClick={handleSaveSnapshot}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load Snapshot Dialog */}
      <Dialog open={loadSnapshotDialogOpen} onOpenChange={setLoadSnapshotDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>스냅샷 불러오기</DialogTitle>
            <DialogDescription>선택한 스냅샷으로 데이터를 복원합니다. 현재 데이터는 덮어씌워집니다.</DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {snapshots.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">저장된 스냅샷이 없습니다</div>
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
                          {(snapshot.metrics.waitingWorkers ?? 0) + (snapshot.metrics.assignedWorkers ?? 0)}명
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          대기 {snapshot.metrics.waitingWorkers ?? 0}명
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLoadSnapshotDialogOpen(false)}>취소</Button>
            <Button onClick={handleLoadSnapshot} disabled={!selectedSnapshot}>불러오기</Button>
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
