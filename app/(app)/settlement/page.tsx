"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { AppShell } from "@/components/layout/app-shell"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { useAppStore } from "@/lib/app-store"
import { formatKoreanMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  Settings2,
  Users,
  UserCheck,
  Wallet,
  FileText,
  Building2,
  Search,
  RotateCcw,
  Check,
  X,
  Lock,
  AlertTriangle,
  Loader2,
  ChevronRight,
  Edit2,
  Plus,
  Trash2,
  Calendar,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Receipt,
  Filter,
  Download,
} from "lucide-react"

// Types for settlement system
type SettlementMode = "DIRECT" | "PROXY" | "TEAM"

interface SettlementRule {
  id: string
  siteId: string
  type: "site" | "occupation" | "worker"
  targetId?: string
  targetName?: string
  commissionType: "RATE" | "FIXED"
  commissionValue: number
  effectiveStart: string
  effectiveEnd: string
}

interface SettlementTarget {
  id: string
  type: "worker" | "team"
  workerId?: string
  teamId?: string
  name: string
  occupation: string
  attendanceDays: number
  attendanceHours: number
  mode: SettlementMode
  // DIRECT mode fields
  introFee: number
  // PROXY mode fields
  dailyWage: number
  commission: number
  commissionRule: string
  advance: number
  netPay: number
  // TEAM mode fields
  foremanPayoutTotal: number
  memberCount: number
  memberIds: string[]
  // Common
  status: "UNSETTLED" | "READY" | "SETTLED"
}

interface PayableItem {
  id: string
  siteId: string
  siteName: string
  period: string
  payeeType: "WORKER" | "FOREMAN"
  payeeId: string
  payeeName: string
  amount: number
  status: "ACCUMULATED" | "PAID"
  createdAt: string
}

interface PayoutHistory {
  id: string
  paidAt: string
  paidByUserId: string
  paidByUserName: string
  siteId: string
  siteName: string
  period: string
  items: { payableItemId: string; payeeType: string; payeeName: string; amount: number }[]
  totalAmount: number
  memo?: string
  method: string
}

function kstTodayYmd() {
  // 브라우저 로컬 타임존이 KST인 환경에서 가장 안전
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function getMonthRange(periodYm: string) {
  // periodYm: "YYYY-MM"
  const [yStr, mStr] = periodYm.split("-")
  const y = Number(yStr)
  const m = Number(mStr)

  // 말일 계산: 다음달 0일
  const endDate = new Date(y, m, 0)
  const end = `${yStr}-${mStr}-${String(endDate.getDate()).padStart(2, "0")}`
  const start = `${yStr}-${mStr}-01`
  return { start, end }
}

export default function SettlementPage() {
  const { state } = useAppStore()
  const [activeTab, setActiveTab] = useState("workforce")
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState(
    new Date().toISOString().slice(0, 7)
  )

  // ✅ 월말 일괄지급 여부: ON이면 month(1개), OFF면 start/end(2개)
  const [monthlyPayoutEnabled, setMonthlyPayoutEnabled] = useState<boolean>(true)
  const [customRange, setCustomRange] = useState<{ start: string; end: string }>(() => {
    const today = kstTodayYmd()
    return { start: today, end: today }
  })

  const computedRange = useMemo(() => {
    if (monthlyPayoutEnabled) return getMonthRange(selectedPeriod)
    return { start: customRange.start, end: customRange.end }
  }, [monthlyPayoutEnabled, selectedPeriod, customRange])


  const selectedSite = useMemo(
    () => state.sites.find((s) => s.id === selectedSiteId),
    [state.sites, selectedSiteId]
  )

  useEffect(() => {
    if (!selectedSiteId && state.sites.length > 0) {
      setSelectedSiteId(state.sites[0].id)
    }
  }, [selectedSiteId, state.sites])

  useEffect(() => {
    const loadSitePrefs = async () => {
      if (!selectedSiteId) return
      try {
        const res = await fetch(`/api/sites/prefs?siteId=${encodeURIComponent(selectedSiteId)}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error ?? "설정 로드 실패")

        setMonthlyPayoutEnabled(Boolean(json?.monthlyPayoutEnabled))
        const next = Boolean(json?.monthlyPayoutEnabled)
        setMonthlyPayoutEnabled(next)
        const today = kstTodayYmd()
        setCustomRange({ start: today, end: today })
        if (next) setSelectedPeriod(kstTodayYmd().slice(0, 7))
        // 커스텀 기간도 마지막 사용값을 저장할 거면 여기서 함께 로드 가능
      } catch {
        // 실패 시 기본 true 유지
      }
    }
    loadSitePrefs()
  }, [selectedSiteId])


  return (
    <AppShell title="정산">
      <div className="flex h-full flex-col overflow-hidden">
        {/* Site & Period Selector Header */}
        <div className="shrink-0 border-b border-border bg-card px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground">현장:</Label>
              <Select value={selectedSiteId || ""} onValueChange={setSelectedSiteId}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="현장 선택" />
                </SelectTrigger>
                <SelectContent>
                  {state.sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">기간:</Label>

                {monthlyPayoutEnabled ? (
                  <Input
                    type="month"
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                    className="w-[160px]"
                  />
                ) : (
                  <>
                    <Input
                      type="date"
                      value={customRange.start}
                      onChange={(e) => setCustomRange((p) => ({ ...p, start: e.target.value }))}
                      className="w-[160px]"
                    />
                    <span className="text-muted-foreground">~</span>
                    <Input
                      type="date"
                      value={customRange.end}
                      onChange={(e) => setCustomRange((p) => ({ ...p, end: e.target.value }))}
                      className="w-[160px]"
                    />
                  </>
                )}
              </div>

            </div>
            {selectedSite && (
              <Badge
                variant="outline"
                className={cn(
                  selectedSite.status === "정산완료"
                    ? "border-green-500 text-green-600"
                    : "border-muted-foreground"
                )}
              >
                {selectedSite.status}
              </Badge>
            )}
          </div>
        </div>

        {/* Main Content with Tabs */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
            <div className="flex h-full min-h-0 overflow-hidden">
              {/* 1) 정산 탭 메뉴: IconRail과 컨텐츠 사이(왼쪽) */}
              <div className="w-52 shrink-0 border-r border-border bg-muted/30 p-4">
                <TabsList className="flex h-auto w-full flex-col gap-1 bg-transparent">
                  <TabsTrigger
                    value="config"
                    className="w-full justify-start gap-2 px-3 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    <Settings2 className="h-4 w-4" />
                    정산 설정
                  </TabsTrigger>

                  <TabsTrigger
                    value="workforce"
                    className="w-full justify-start gap-2 px-3 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    <Users className="h-4 w-4" />
                    인력별 정산
                  </TabsTrigger>

                  <TabsTrigger
                    value="team"
                    className="w-full justify-start gap-2 px-3 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    <UserCheck className="h-4 w-4" />
                    팀 정산
                  </TabsTrigger>

                  <TabsTrigger
                    value="payout"
                    className="w-full justify-start gap-2 px-3 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    <Wallet className="h-4 w-4" />
                    지급 관리
                  </TabsTrigger>

                  <TabsTrigger
                    value="billing"
                    className="w-full justify-start gap-2 px-3 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    <FileText className="h-4 w-4" />
                    청구/미수금
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* 2) 컨텐츠 영역 */}
              <div className="flex-1 min-h-0 overflow-hidden">
                <TabsContent value="config" className="h-full m-0 data-[state=inactive]:hidden">
                  <SettlementConfigTab
                    siteId={selectedSiteId}
                    siteName={selectedSite?.name || ""}
                    period={selectedPeriod}
                    range={computedRange}
                    monthlyPayoutEnabled={monthlyPayoutEnabled}
                    setMonthlyPayoutEnabled={setMonthlyPayoutEnabled}
                  />

                </TabsContent>

                <TabsContent value="workforce" className="h-full m-0 data-[state=inactive]:hidden">
                  <WorkforceSettlementTab
                    siteId={selectedSiteId}
                    siteName={selectedSite?.name || ""}
                    period={selectedPeriod}
                    range={computedRange}
                  />
                </TabsContent>

                <TabsContent value="team" className="h-full m-0 data-[state=inactive]:hidden">
                  <TeamSettlementTab
                    siteId={selectedSiteId}
                    siteName={selectedSite?.name || ""}
                    period={selectedPeriod}
                    range={computedRange}
                  />
                </TabsContent>

                <TabsContent value="payout" className="h-full m-0 data-[state=inactive]:hidden">
                  <PayoutManagementTab
                    siteId={selectedSiteId}
                    siteName={selectedSite?.name || ""}
                    period={selectedPeriod}
                    range={computedRange}
                  />
                </TabsContent>

                <TabsContent value="billing" className="h-full m-0 data-[state=inactive]:hidden">
                  <BillingReceivablesTab
                    siteId={selectedSiteId}
                    siteName={selectedSite?.name || ""}
                    period={selectedPeriod}
                  />
                </TabsContent>
              </div>
            </div>
          </Tabs>
        </div>
      </div>
    </AppShell>
  )
}

// ============================================
// 정산 설정 (Settlement Configuration) Tab
// ============================================
function SettlementConfigTab({
  siteId,
  siteName,
  period,
  range,
  monthlyPayoutEnabled,
  setMonthlyPayoutEnabled,
}: {
  siteId: string | null
  siteName: string
  period: string
  range: { start: string; end: string }
  monthlyPayoutEnabled: boolean
  setMonthlyPayoutEnabled: (v: boolean | ((prev: boolean) => boolean)) => void
}) {
  const [loading, setLoading] = useState(false)
  const [rules, setRules] = useState<SettlementRule[]>([])
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<SettlementRule | null>(null)

  useEffect(() => {
    if (!siteId) return
    loadRules()
  }, [siteId, period])

  const loadRules = async () => {
    if (!siteId) return
    setLoading(true)
    try {
      const res = await fetch(
        `/api/settlement-rules?siteId=${encodeURIComponent(siteId)}&period=${encodeURIComponent(period)}`
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? "규칙 로드 실패")

      setRules(json.rules ?? [])
    } catch (e: any) {
      toast.error(e?.message ?? "규칙을 불러오지 못했습니다")
      setRules([])
    } finally {
      setLoading(false)
    }
  }


  const handleSaveRule = async (rule: SettlementRule) => {
    try {
      const res = await fetch("/api/settlement-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rule }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? "규칙 저장 실패")

      const saved = (json.rule ?? json) as SettlementRule

      setRules((prev) => {
        const exists = prev.some((r) => r.id === saved.id)
        return exists ? prev.map((r) => (r.id === saved.id ? saved : r)) : [...prev, saved]
      })

      setEditDialogOpen(false)
      toast.success("규칙이 저장되었습니다")
    } catch (e: any) {
      toast.error(e?.message ?? "규칙 저장 실패")
    }
  }


  const handleDeleteRule = async (ruleId: string) => {
    try {
      const res = await fetch(`/api/settlement-rules?id=${encodeURIComponent(ruleId)}`, {
        method: "DELETE",
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? "규칙 삭제 실패")

      setRules((prev) => prev.filter((r) => r.id !== ruleId))
      toast.success("규칙이 삭제되었습니다")
    } catch (e: any) {
      toast.error(e?.message ?? "규칙 삭제 실패")
    }
  }


  if (!siteId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Building2 className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
          <p className="text-muted-foreground">현장을 선택해주세요</p>
        </div>
      </div>
    )
  }

  const siteRules = rules.filter((r) => r.type === "site")
  const occupationRules = rules.filter((r) => r.type === "occupation")
  const workerRules = rules.filter((r) => r.type === "worker")

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">정산 규칙 설정</h2>
            <p className="text-sm text-muted-foreground">
              현장, 직종, 인력별 수수료 규칙을 설정합니다 (우선순위: 인력 &gt; 직종 &gt; 현장)
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadRules} disabled={loading}>
            <RotateCcw className={cn("mr-1.5 h-4 w-4", loading && "animate-spin")} />
            새로고침
          </Button>
        </div>

        {/* Monthly Payout Toggle */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">월말 일괄지급 설정</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">월말 일괄지급</p>
                <p className="text-xs text-muted-foreground">
                  활성화시 정산 기간을 달별로 고정합니다
                </p>
              </div>
              <Button
                variant={monthlyPayoutEnabled ? "default" : "outline"}
                size="sm"
                onClick={async () => {
                  if (!siteId) return
                  const next = !monthlyPayoutEnabled

                  // 1) UI 즉시 반영(전역 SoT)
                  setMonthlyPayoutEnabled(next)

                  // 2) 서버 저장 (현장별 유지)
                  try {
                    const res = await fetch("/api/sites/prefs", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ siteId, monthlyPayoutEnabled: next }),
                    })
                    const json = await res.json().catch(() => ({}))
                    if (!res.ok) throw new Error(json?.error ?? "설정 저장 실패")
                    toast.success(`월말 일괄지급 ${next ? "활성" : "비활성"} 저장됨`)
                  } catch (e: any) {
                    toast.error(e?.message ?? "설정 저장 실패")
                  }
                }}
              >
                {monthlyPayoutEnabled ? "활성" : "비활성"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Site Default Rules */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">현장 기본 규칙</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingRule({
                    id: `new-${Date.now()}`,
                    siteId: siteId,
                    type: "site",
                    commissionType: "RATE",
                    commissionValue: 10,
                    effectiveStart: new Date().toISOString().slice(0, 7),
                    effectiveEnd: "2025-12",
                  })
                  setEditDialogOpen(true)
                }}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                추가
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
              </div>
            ) : siteRules.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                현장 기본 규칙이 없습니다
              </p>
            ) : (
              <div className="space-y-2">
                {siteRules.map((rule) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    onEdit={() => {
                      setEditingRule(rule)
                      setEditDialogOpen(true)
                    }}
                    onDelete={() => handleDeleteRule(rule.id)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Occupation Rules */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">직종별 규칙</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingRule({
                    id: `new-${Date.now()}`,
                    siteId: siteId,
                    type: "occupation",
                    commissionType: "RATE",
                    commissionValue: 8,
                    effectiveStart: new Date().toISOString().slice(0, 7),
                    effectiveEnd: "2025-12",
                  })
                  setEditDialogOpen(true)
                }}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                추가
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
              </div>
            ) : occupationRules.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                직종별 규칙이 없습니다
              </p>
            ) : (
              <div className="space-y-2">
                {occupationRules.map((rule) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    onEdit={() => {
                      setEditingRule(rule)
                      setEditDialogOpen(true)
                    }}
                    onDelete={() => handleDeleteRule(rule.id)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Worker Override Rules */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">인력별 예외 규칙</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingRule({
                    id: `new-${Date.now()}`,
                    siteId: siteId,
                    type: "worker",
                    commissionType: "FIXED",
                    commissionValue: 15000,
                    effectiveStart: new Date().toISOString().slice(0, 7),
                    effectiveEnd: "2025-12",
                  })
                  setEditDialogOpen(true)
                }}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                추가
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
              </div>
            ) : workerRules.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                인력별 예외 규칙이 없습니다
              </p>
            ) : (
              <div className="space-y-2">
                {workerRules.map((rule) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    onEdit={() => {
                      setEditingRule(rule)
                      setEditDialogOpen(true)
                    }}
                    onDelete={() => handleDeleteRule(rule.id)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingRule?.id.startsWith("new-") ? "규칙 추가" : "규칙 수정"}
              </DialogTitle>
            </DialogHeader>
            {editingRule && (
              <RuleEditForm
                rule={editingRule}
                onSave={handleSaveRule}
                onCancel={() => setEditDialogOpen(false)}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </ScrollArea>
  )
}

function RuleRow({
  rule,
  onEdit,
  onDelete,
}: {
  rule: SettlementRule
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-3">
      <div className="flex items-center gap-3">
        {rule.targetName && (
          <Badge variant="secondary">{rule.targetName}</Badge>
        )}
        <span className="text-sm">
          {rule.commissionType === "RATE"
            ? `${rule.commissionValue}% 수수료`
            : `${formatKoreanMoney(rule.commissionValue)} 고정`}
        </span>
        <span className="text-xs text-muted-foreground">
          {rule.effectiveStart} ~ {rule.effectiveEnd}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" onClick={onEdit}>
          <Edit2 className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  )
}

function RuleEditForm({
  rule,
  onSave,
  onCancel,
}: {
  rule: SettlementRule
  onSave: (rule: SettlementRule) => void
  onCancel: () => void
}) {
  const [formData, setFormData] = useState(rule)
  const [saving, setSaving] = useState(false)

  const { state } = useAppStore()
  const workersForSelect = state.workers ?? []

  const handleSubmit = async () => {
    setSaving(true)
    await onSave(formData)
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      {rule.type === "occupation" && (
        <div>
          <Label>직종명</Label>
          <Input
            value={formData.targetName || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                targetName: e.target.value,
                targetId: e.target.value, // 직종은 name을 id처럼 써도 pickRule이 targetName도 비교함
              })
            }
            placeholder="예: 형틀"
          />
        </div>
      )}

      {rule.type === "worker" && (
        <div>
          <Label>인력 선택</Label>
          <Select
            value={formData.targetId || ""}
            onValueChange={(id) => {
              const w = (workersForSelect as any[]).find((x) => x.id === id)
              setFormData({
                ...formData,
                targetId: id,                // ✅ workerId(UUID)
                targetName: w?.name ?? "",    // 표시용 이름
              })
            }}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue placeholder="인력을 선택하세요" />
            </SelectTrigger>
            <SelectContent>
              {(workersForSelect as any[]).map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <p className="text-xs text-muted-foreground mt-1">
            인력별 예외는 UUID로 저장되어야 정확히 적용됩니다.
          </p>
        </div>
      )}
      <div>
        <Label>수수료 유형</Label>
        <Select
          value={formData.commissionType}
          onValueChange={(v) =>
            setFormData({ ...formData, commissionType: v as "RATE" | "FIXED" })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="RATE">비율 (%)</SelectItem>
            <SelectItem value="FIXED">고정 금액</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>
          {formData.commissionType === "RATE" ? "수수료율 (%)" : "고정 금액 (원)"}
        </Label>
        <Input
          type="number"
          value={formData.commissionValue}
          onChange={(e) =>
            setFormData({
              ...formData,
              commissionValue: Number(e.target.value),
            })
          }
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>적용 시작</Label>
          <Input
            type="month"
            value={formData.effectiveStart}
            onChange={(e) =>
              setFormData({ ...formData, effectiveStart: e.target.value })
            }
          />
        </div>
        <div>
          <Label>적용 종료</Label>
          <Input
            type="month"
            value={formData.effectiveEnd}
            onChange={(e) =>
              setFormData({ ...formData, effectiveEnd: e.target.value })
            }
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} className="bg-transparent">
          취소
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? "저장 중..." : "저장"}
        </Button>
      </DialogFooter>
    </div>
  )
}

// ============================================
// 인력별 정산 (Workforce Settlement) Tab
// With Settlement Mode (DIRECT/PROXY/TEAM) and Sheet-based edit
// ============================================
function WorkforceSettlementTab({
  siteId,
  siteName,
  period,
  range,
}: {
  siteId: string | null
  siteName: string
  period: string
  range: { start: string; end: string }
}) {
  const [loading, setLoading] = useState(false)
  const [settlements, setSettlements] = useState<SettlementTarget[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)

  // Filters
  const [modeFilter, setModeFilter] = useState<SettlementMode | "ALL">("ALL")
  const [statusFilter, setStatusFilter] = useState<"ALL" | "UNSETTLED" | "READY" | "SETTLED">("ALL")
  const [searchQuery, setSearchQuery] = useState("")

  // Sheet state for editing
  const [selectedTarget, setSelectedTarget] = useState<SettlementTarget | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editedTarget, setEditedTarget] = useState<SettlementTarget | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [saving, setSaving] = useState(false)

  // Scope completion
  const [completeScopeDialogOpen, setCompleteScopeDialogOpen] = useState(false)
  const [isCompletingScope, setIsCompletingScope] = useState(false)

  useEffect(() => {
    if (!siteId) return
    loadSettlements()
  }, [siteId, period, range.start, range.end])



  const loadSettlements = async () => {
    if (!siteId) return
    setLoading(true)

    // ✅ snapshot: 로딩 중 range 변경되더라도 이 호출은 고정된 기간으로 수행
    const start = range.start
    const end = range.end

    try {
      const res = await fetch(
        `/api/settlements/workforce?siteId=${encodeURIComponent(siteId)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? "정산 로드 실패")

      console.log("[workforce] sample", (json.settlements ?? []).slice(0, 3))

      // ✅ DB 결과로만 렌더링(낙관적 업데이트 금지)
      setSettlements(json.settlements ?? [])
    } catch (e: any) {
      toast.error(e?.message ?? "정산 데이터를 불러오지 못했습니다")
      setSettlements([])
    } finally {
      setLoading(false)
    }
  }



  // Filtered settlements
  const filteredSettlements = useMemo(() => {
    return settlements.filter((s) => {
      if (modeFilter !== "ALL" && s.mode !== modeFilter) return false
      if (statusFilter !== "ALL" && s.status !== statusFilter) return false
      if (searchQuery && !s.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
      return true
    })
  }, [settlements, modeFilter, statusFilter, searchQuery])

  // Progress stats
  const totalCount = settlements.length
  const settledCount = settlements.filter((s) => s.status === "SETTLED").length
  const progressPercent = totalCount > 0 ? (settledCount / totalCount) * 100 : 0
  const isAllSettled = settledCount === totalCount && totalCount > 0

  // Unsettled targets for completion gating
  const unsettledTargets = settlements.filter((s) => s.status !== "SETTLED")

  // Selection
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(
        filteredSettlements.filter((s) => s.status !== "SETTLED").map((s) => s.id)
      )
    } else {
      setSelectedIds([])
    }
  }

  const handleSelect = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => [...prev, id])
    } else {
      setSelectedIds((prev) => prev.filter((i) => i !== id))
    }
  }

  const selectedTargets = useMemo(() => {
    return settlements.filter((s) => selectedIds.includes(s.id))
  }, [settlements, selectedIds])

  const selectedCounts = useMemo(() => {
    let workers = 0
    let teams = 0
    for (const t of selectedTargets) {
      if (t.mode === "TEAM" || t.type === "team") teams += 1
      else workers += 1
    }
    return { workers, teams }
  }, [selectedTargets])

  const selectedLabel = useMemo(() => {
    return `${selectedCounts.workers}명 · ${selectedCounts.teams}팀`
  }, [selectedCounts])

  const selectedWorkerIds = useMemo(() => {
    return selectedTargets
      .filter((t) => !(t.mode === "TEAM" || t.type === "team"))
      .map((t) => String(t.workerId ?? ""))
      .filter(Boolean)
  }, [selectedTargets])

  const selectedTeamLeaderIds = useMemo(() => {
    return selectedTargets
      .filter((t) => t.type === "team" || t.mode === "TEAM")
      .map((t) => String(t.teamId ?? "")) // ✅ 현재 workforce API는 teamId에 leaderId를 넣고 있음
      .filter(Boolean)
  }, [selectedTargets])




  // Row click to open Sheet
  const handleRowClick = (target: SettlementTarget) => {
    if (hasUnsavedChanges) {
      setPendingAction(() => () => {
        setSelectedTarget(target)
        setEditedTarget({ ...target })
        setSheetOpen(true)
        setHasUnsavedChanges(false)
      })
      setUnsavedDialogOpen(true)
    } else {
      setSelectedTarget(target)
      setEditedTarget({ ...target })
      setSheetOpen(true)
    }
  }

  // Close sheet with unsaved check
  const handleCloseSheet = () => {
    if (hasUnsavedChanges) {
      setPendingAction(() => () => {
        setSheetOpen(false)
        setSelectedTarget(null)
        setEditedTarget(null)
        setHasUnsavedChanges(false)
      })
      setUnsavedDialogOpen(true)
    } else {
      setSheetOpen(false)
      setSelectedTarget(null)
      setEditedTarget(null)
    }
  }

  // Discard unsaved changes
  const handleDiscardChanges = () => {
    setUnsavedDialogOpen(false)
    if (pendingAction) {
      pendingAction()
      setPendingAction(null)
    }
  }

  // Keep editing
  const handleKeepEditing = () => {
    setUnsavedDialogOpen(false)
    setPendingAction(null)
  }

  // Update edited target
  const updateEditedTarget = (updates: Partial<SettlementTarget>) => {
    if (!editedTarget) return
    setEditedTarget({ ...editedTarget, ...updates })
    setHasUnsavedChanges(true)
  }

  // Save changes
  const handleSave = async () => {
    if (!editedTarget || !selectedTarget) return

    // Validation
    if (editedTarget.mode === "DIRECT" && editedTarget.introFee <= 0) {
      toast.error("직불 모드에서는 소개비가 0보다 커야 합니다")
      return
    }
    if (editedTarget.mode === "TEAM" && editedTarget.foremanPayoutTotal <= 0) {
      toast.error("팀 정산 모드에서는 반장 지급 총액을 입력해야 합니다")
      return
    }

    setSaving(true)
    try {
      // API stub: PATCH /api/settlements/:settlementId
      await new Promise((r) => setTimeout(r, 500))

      // Update local state
      setSettlements((prev) =>
        prev.map((s) => (s.id === editedTarget.id ? editedTarget : s))
      )
      setHasUnsavedChanges(false)
      toast.success("저장되었습니다")
    } catch {
      toast.error("저장에 실패했습니다")
    } finally {
      setSaving(false)
    }
  }

  // Mark as settled
  const handleMarkSettled = async () => {
    if (!editedTarget) return

    setSaving(true)
    try {
      // API stub: POST /api/settlements/:settlementId/settle
      await new Promise((r) => setTimeout(r, 500))

      const updatedTarget = { ...editedTarget, status: "SETTLED" as const }

      // If team settlement, propagate to members
      if (editedTarget.mode === "TEAM" && editedTarget.memberIds.length > 0) {
        toast.success(`${editedTarget.name} 및 팀원 ${editedTarget.memberCount}명 정산 완료`)
      } else {
        toast.success("정산 완료 처리되었습니다")
      }

      setSettlements((prev) =>
        prev.map((s) => (s.id === editedTarget.id ? updatedTarget : s))
      )
      setEditedTarget(updatedTarget)
      setSelectedTarget(updatedTarget)
      setHasUnsavedChanges(false)
    } catch {
      toast.error("정산 완료 처리에 실패했습니다")
    } finally {
      setSaving(false)
    }
  }

  // Bulk settle selected
  const handleSettleSelected = async () => {
    if (!siteId) return
    if (selectedTargets.length === 0) {
      toast.error("선택된 정산 대상이 없습니다")
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/payout-items/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          periodStart: range.start,
          periodEnd: range.end,
          includeTeams: true,
          workerIds: selectedWorkerIds,
          teamLeaderIds: selectedTeamLeaderIds,
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? "정산 확정 실패")

      toast.success(`정산 확정 완료 (${selectedLabel})`)
      setSelectedIds([])
      setConfirmDialogOpen(false)
      await loadSettlements()
    } catch (e: any) {
      toast.error(e?.message ?? "정산 확정 실패")
    } finally {
      setSaving(false)
    }
  }



  // Complete scope
  const handleCompleteScope = async () => {
    if (!siteId) return

    setIsCompletingScope(true)
    try {
      console.log("[settle] selectedLabel", selectedLabel, { selectedWorkerIds, selectedTeamLeaderIds, range })
      const res = await fetch("/api/payout-items/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          periodStart: range.start,
          periodEnd: range.end,
          includeTeams: true,
          ...(selectedIds.length > 0
            ? { workerIds: selectedWorkerIds, teamLeaderIds: selectedTeamLeaderIds }
            : {}),
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? "정산완료 생성 실패")

      toast.success(`정산완료 생성: ${json?.created ?? 0}건 (업데이트 ${json?.updated ?? 0}건)`)
      setCompleteScopeDialogOpen(false)

      await loadSettlements()
    } catch (e: any) {
      toast.error(e?.message ?? "정산완료 처리 실패")
    } finally {
      setIsCompletingScope(false)
    }
  }


  if (!siteId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Building2 className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
          <p className="text-muted-foreground">현장을 선택해주세요</p>
        </div>
      </div>
    )
  }

  const getModeLabel = (mode: SettlementMode) => {
    switch (mode) {
      case "DIRECT":
        return "직불"
      case "PROXY":
        return "대불"
      case "TEAM":
        return "팀"
    }
  }

  const getModeColor = (mode: SettlementMode) => {
    switch (mode) {
      case "DIRECT":
        return "bg-blue-100 text-blue-700"
      case "PROXY":
        return "bg-green-100 text-green-700"
      case "TEAM":
        return "bg-purple-100 text-purple-700"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "UNSETTLED":
        return "bg-muted text-muted-foreground"
      case "READY":
        return "bg-yellow-100 text-yellow-700"
      case "SETTLED":
        return "bg-green-100 text-green-700"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "UNSETTLED":
        return "미정산"
      case "READY":
        return "정산중"
      case "SETTLED":
        return "정산완료"
      default:
        return status
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Progress Header */}
      <div className="shrink-0 border-b border-border bg-muted/30 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h3 className="font-semibold">정산 진행 현황</h3>
              <p className="text-sm text-muted-foreground">
                정산 완료: {settledCount}/{totalCount}명
              </p>
            </div>
            <div className="w-48">
              <Progress value={progressPercent} className="h-2" />
            </div>
            {isAllSettled && (
              <Badge className="bg-green-500/10 text-green-600 gap-1">
                <Check className="h-3 w-3" />
                전원 정산 완료
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadSettlements}
              disabled={loading}
              className="bg-transparent"
            >
              <RotateCcw className={cn("mr-1.5 h-4 w-4", loading && "animate-spin")} />
              새로고침
            </Button>

            <Button
              size="sm"
              variant="default"
              onClick={() => setCompleteScopeDialogOpen(true)}
              disabled={selectedIds.length === 0 || saving}
              title={selectedIds.length === 0 ? "전체 정산 확정" : "선택 정산 확정"}
            >
              <Lock className="mr-1.5 h-4 w-4" />
              {selectedIds.length > 0 ? `정산 확정 (${selectedLabel})` : "정산 확정"}
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="shrink-0 border-b border-border px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={modeFilter} onValueChange={(v) => setModeFilter(v as SettlementMode | "ALL")}>
            <SelectTrigger className="w-[120px] h-8">
              <SelectValue placeholder="정산 방식" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">전체</SelectItem>
              <SelectItem value="DIRECT">직불</SelectItem>
              <SelectItem value="PROXY">대불</SelectItem>
              <SelectItem value="TEAM">팀</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-[120px] h-8">
              <SelectValue placeholder="상태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">전체</SelectItem>
              <SelectItem value="UNSETTLED">미정산</SelectItem>
              <SelectItem value="READY">정산중</SelectItem>
              <SelectItem value="SETTLED">정산완료</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="이름 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 w-[200px]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : filteredSettlements.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Users className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">정산 대상이 없습니다</p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={
                      selectedIds.length > 0 &&
                      selectedIds.length ===
                      filteredSettlements.filter((s) => s.status !== "SETTLED").length
                    }
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead>이름</TableHead>
                <TableHead>직종</TableHead>
                <TableHead>정산 방식</TableHead>
                <TableHead className="text-center">출근일</TableHead>
                <TableHead className="text-right">금액</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSettlements.map((s) => (
                <TableRow
                  key={s.id}
                  className={cn(
                    "cursor-pointer hover:bg-muted/50",
                    selectedTarget?.id === s.id && "bg-muted"
                  )}
                  onClick={() => handleRowClick(s)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.includes(s.id)}
                      onCheckedChange={(checked) => handleSelect(s.id, !!checked)}
                      disabled={s.status === "SETTLED"}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{s.name.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{s.name}</p>
                        {s.type === "team" && (
                          <p className="text-xs text-muted-foreground">
                            팀원 {s.memberCount}명
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{s.occupation}</TableCell>
                  <TableCell>
                    <Badge className={getModeColor(s.mode)}>
                      {getModeLabel(s.mode)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">{s.attendanceDays}일</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {s.mode === "DIRECT"
                      ? formatKoreanMoney(s.introFee * s.attendanceDays)
                      : s.mode === "TEAM"
                        ? formatKoreanMoney(s.foremanPayoutTotal)
                        : formatKoreanMoney(s.netPay)}
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(s.status)}>
                      {getStatusLabel(s.status)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={(open) => !open && handleCloseSheet()}>
        <SheetContent side="right" className="w-[480px] sm:max-w-[480px] flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b border-border shrink-0">
            <SheetTitle className="flex items-center gap-2">
              {editedTarget?.name}
              {editedTarget && (
                <Badge className={getModeColor(editedTarget.mode)}>
                  {getModeLabel(editedTarget.mode)}
                </Badge>
              )}
            </SheetTitle>
            <SheetDescription>
              {siteName} | {period} | {editedTarget?.occupation}
            </SheetDescription>
          </SheetHeader>

          {editedTarget && (
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-6 space-y-6">
                {/* Mode Selector */}
                <div>
                  <Label className="text-sm font-medium">정산 방식</Label>
                  <Select
                    value={editedTarget.mode}
                    onValueChange={(v) => updateEditedTarget({ mode: v as SettlementMode })}
                    disabled={editedTarget.status === "SETTLED"}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DIRECT">직불 (소개비만)</SelectItem>
                      <SelectItem value="PROXY">대불 (내가 먼저 지급)</SelectItem>
                      <SelectItem value="TEAM">팀 (오야지 정산)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Mode-specific fields */}
                {editedTarget.mode === "DIRECT" && (
                  <DirectModeForm
                    target={editedTarget}
                    onUpdate={updateEditedTarget}
                    disabled={editedTarget.status === "SETTLED"}
                  />
                )}

                {editedTarget.mode === "PROXY" && (
                  <ProxyModeForm
                    target={editedTarget}
                    onUpdate={updateEditedTarget}
                    disabled={editedTarget.status === "SETTLED"}
                  />
                )}

                {editedTarget.mode === "TEAM" && (
                  <TeamModeForm
                    target={editedTarget}
                    onUpdate={updateEditedTarget}
                    disabled={editedTarget.status === "SETTLED"}
                  />
                )}
              </div>
            </ScrollArea>
          )}

          {/* Footer Actions */}
          <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-between bg-background">
            <Button
              variant="outline"
              onClick={handleCloseSheet}
              className="bg-transparent"
            >
              취소
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={saving || !hasUnsavedChanges}
                className="bg-transparent"
              >
                {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                저장
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Unsaved Changes Dialog */}
      <AlertDialog open={unsavedDialogOpen} onOpenChange={setUnsavedDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>저장하지 않은 변경사항이 있습니다</AlertDialogTitle>
            <AlertDialogDescription>
              변경사항을 저장하지 않고 나가시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleKeepEditing}>계속 편집</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscardChanges}>저장하지 않고 나가기</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Settle Selected Dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>선택한 대상을 정산 완료 처리할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedIds.length}명의 정산을 완료 처리합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleSettleSelected}>확정</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Complete Scope Dialog (선택 정산 확정) */}
      <AlertDialog open={completeScopeDialogOpen} onOpenChange={setCompleteScopeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>선택한 대상을 정산 확정할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              선택: {selectedLabel}
              <br />
              정산 확정하면 지급 예정(지급 관리)에 누적됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCompleteScope}
              disabled={selectedIds.length === 0 || isCompletingScope}
            >
              {isCompletingScope ? "처리 중..." : "정산 확정"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Direct Mode Form (소개비만)
function DirectModeForm({
  target,
  onUpdate,
  disabled,
}: {
  target: SettlementTarget
  onUpdate: (updates: Partial<SettlementTarget>) => void
  disabled: boolean
}) {
  const billableAmount = target.introFee * target.attendanceDays

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">소개비 (1인당)</Label>
        <Input
          type="number"
          value={target.introFee}
          onChange={(e) => onUpdate({ introFee: Number(e.target.value) })}
          disabled={disabled}
          className="mt-1.5"
        />
        <p className="text-xs text-muted-foreground mt-1">
          직종/현장 규칙을 무시하고 인력별로 직접 지정
        </p>
      </div>

      <Separator />

      <div className="bg-muted/50 rounded-lg p-4 space-y-3">
        <h4 className="font-medium text-sm">청구 계산</h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="text-muted-foreground">출근일</span>
          <span className="text-right font-medium">{target.attendanceDays}일</span>
          <span className="text-muted-foreground">소개비 (1인당)</span>
          <span className="text-right font-medium">{formatKoreanMoney(target.introFee)}</span>
          <Separator className="col-span-2 my-1" />
          <span className="text-muted-foreground font-medium">청구 금액</span>
          <span className="text-right font-semibold text-primary">
            {formatKoreanMoney(billableAmount)}
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 bg-transparent">
          <Download className="mr-1.5 h-4 w-4" />
          수수료 청구서
        </Button>
        <Button variant="outline" size="sm" className="flex-1 bg-transparent">
          <Download className="mr-1.5 h-4 w-4" />
          출역 확인서
        </Button>
      </div>
    </div>
  )
}

// Proxy Mode Form (대불)
function ProxyModeForm({
  target,
  onUpdate,
  disabled,
}: {
  target: SettlementTarget
  onUpdate: (updates: Partial<SettlementTarget>) => void
  disabled: boolean
}) {
  const grossPay = target.dailyWage * target.attendanceDays
  const netPay = grossPay - target.commission - target.advance

  // Update netPay when values change
  useEffect(() => {
    onUpdate({ netPay })
  }, [target.dailyWage, target.commission, target.advance, target.attendanceDays])

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">일당</Label>
        <Input
          type="number"
          value={target.dailyWage}
          onChange={(e) => onUpdate({ dailyWage: Number(e.target.value) })}
          disabled={disabled}
          className="mt-1.5"
        />
      </div>

      <div>
        <Label className="text-sm font-medium">수수료</Label>
        <Input
          type="number"
          value={target.commission}
          onChange={(e) => onUpdate({ commission: Number(e.target.value) })}
          disabled={disabled}
          className="mt-1.5"
        />
        <p className="text-xs text-muted-foreground mt-1">
          적용 규칙: {target.commissionRule || "없음"}
        </p>
      </div>

      <div>
        <Label className="text-sm font-medium">가불금</Label>
        <Input
          type="number"
          value={target.advance}
          onChange={(e) => onUpdate({ advance: Number(e.target.value) })}
          disabled={disabled}
          className="mt-1.5"
        />
      </div>

      <Separator />

      <div className="bg-muted/50 rounded-lg p-4 space-y-3">
        <h4 className="font-medium text-sm">지급 계산</h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="text-muted-foreground">출근일</span>
          <span className="text-right font-medium">{target.attendanceDays}일</span>
          <span className="text-muted-foreground">총 급여</span>
          <span className="text-right font-medium">{formatKoreanMoney(grossPay)}</span>
          <span className="text-muted-foreground">수수료</span>
          <span className="text-right font-medium text-destructive">
            -{formatKoreanMoney(target.commission)}
          </span>
          <span className="text-muted-foreground">가불금</span>
          <span className="text-right font-medium text-destructive">
            -{formatKoreanMoney(target.advance)}
          </span>
          <Separator className="col-span-2 my-1" />
          <span className="text-muted-foreground font-medium">실지급액</span>
          <span className="text-right font-semibold text-primary">
            {formatKoreanMoney(netPay)}
          </span>
        </div>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          월말 일괄지급 활성화시, 정산 완료 후 지급 예정에 누적됩니다.
        </AlertDescription>
      </Alert>
    </div>
  )
}

// Team Mode Form (팀 정산)
function TeamModeForm({
  target,
  onUpdate,
  disabled,
}: {
  target: SettlementTarget
  onUpdate: (updates: Partial<SettlementTarget>) => void
  disabled: boolean
}) {
  return (
    <div className="space-y-4">
      <Alert className="bg-purple-50 border-purple-200">
        <UserCheck className="h-4 w-4 text-purple-600" />
        <AlertDescription className="text-xs text-purple-700">
          팀 정산: 반장에게 총액을 지급하면 팀원은 자동으로 정산 완료 처리됩니다.
        </AlertDescription>
      </Alert>

      <div>
        <Label className="text-sm font-medium">반장 지급 총액</Label>
        <Input
          type="number"
          value={target.foremanPayoutTotal}
          onChange={(e) => onUpdate({ foremanPayoutTotal: Number(e.target.value) })}
          disabled={disabled}
          className="mt-1.5"
          placeholder="반장에게 지급할 총액 입력"
        />
      </div>

      <Separator />

      <div>
        <Label className="text-sm font-medium mb-2 block">팀원 ({target.memberCount}명)</Label>
        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {target.memberIds.length > 0 ? (
            target.memberIds.map((id, i) => (
              <div
                key={id}
                className="flex items-center gap-2 p-2 rounded-lg border border-border"
              >
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-xs">팀{i + 1}</AvatarFallback>
                </Avatar>
                <span className="text-sm">팀원 {i + 1}</span>
                <Badge variant="outline" className="ml-auto text-xs">
                  자동 정산
                </Badge>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              팀원 정보가 없습니다
            </p>
          )}
        </div>
      </div>

      <div className="bg-muted/50 rounded-lg p-4 space-y-3">
        <h4 className="font-medium text-sm">지급 요약</h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="text-muted-foreground">반장</span>
          <span className="text-right font-medium">{target.name}</span>
          <span className="text-muted-foreground">팀원 수</span>
          <span className="text-right font-medium">{target.memberCount}명</span>
          <Separator className="col-span-2 my-1" />
          <span className="text-muted-foreground font-medium">반장 지급 총액</span>
          <span className="text-right font-semibold text-primary">
            {formatKoreanMoney(target.foremanPayoutTotal)}
          </span>
        </div>
      </div>

      <Alert variant="destructive" className="bg-destructive/5 border-destructive/20">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          반장 정산 완료시 팀원 {target.memberCount}명이 자동으로 정산 완료 처리됩니다.
        </AlertDescription>
      </Alert>
    </div>
  )
}

// ============================================
// 팀 정산 (Team Settlement) Tab
// ============================================
function TeamSettlementTab({
  siteId,
  siteName,
  period,
  range,
}: {
  siteId: string | null
  siteName: string
  period: string
  range: { start: string; end: string }
}) {
  if (!siteId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Building2 className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
          <p className="text-muted-foreground">현장을 선택해주세요</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <UserCheck className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
        <h3 className="font-semibold mb-1">팀 정산</h3>
        <p className="text-sm text-muted-foreground">
          팀 정산은 "인력별 정산" 탭에서 TEAM 모드로 관리됩니다.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          인력별 정산에서 정산 방식을 "팀"으로 선택하세요.
        </p>
      </div>
    </div>
  )
}

// ============================================
// 지급 관리 (Payout Management) Tab
// ============================================
function PayoutManagementTab({
  siteId,
  siteName,
  period,
  range,
}: {
  siteId: string | null
  siteName: string
  period: string
  range: { start: string; end: string }
}) {
  const [activeSubTab, setActiveSubTab] = useState("pending")
  const [loading, setLoading] = useState(false)
  const [payables, setPayables] = useState<PayableItem[]>([])
  const [history, setHistory] = useState<PayoutHistory[]>([])
  const [selectedPayableIds, setSelectedPayableIds] = useState<string[]>([])
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false)
  const [payoutMemo, setPayoutMemo] = useState("")
  const [isPaying, setIsPaying] = useState(false)
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)

  useEffect(() => {
    if (!siteId) return
    loadData()
  }, [siteId, period, range.start, range.end])


  function formatKst(iso: string) {
    const d = new Date(iso)
    return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
  }


  const loadData = async () => {
    if (!siteId) return
    setLoading(true)
    try {
      const res = await fetch(
        `/api/payouts?siteId=${encodeURIComponent(siteId)}&start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`,
        { cache: "no-store" }
      )

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(json?.error ?? "지급 데이터 로드 실패")
      }

      const rawPayables = Array.isArray(json?.payables) ? json.payables : []
      const rawHistory = Array.isArray(json?.history) ? json.history : []

      const payables = rawPayables.map((p: any) => ({ ...p, siteName }))
      const history = rawHistory.map((h: any) => ({ ...h, siteName }))

      setPayables(payables)
      setHistory(history)
    } catch (e: any) {
      toast.error(e?.message ?? "지급 데이터를 불러오지 못했습니다")
      setPayables([])
      setHistory([])
    } finally {
      setLoading(false)
    }
  }




  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedPayableIds(payables.filter((p) => p.status === "ACCUMULATED").map((p) => p.id))
    } else {
      setSelectedPayableIds([])
    }
  }

  const handleSelect = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedPayableIds((prev) => [...prev, id])
    } else {
      setSelectedPayableIds((prev) => prev.filter((i) => i !== id))
    }
  }

  const selectedTotal = payables
    .filter((p) => selectedPayableIds.includes(p.id))
    .reduce((sum, p) => sum + p.amount, 0)

  const handlePayout = async () => {
    setIsPaying(true)
    try {
      if (!siteId) throw new Error("siteId is required")
      if (selectedPayableIds.length === 0) throw new Error("선택된 지급 항목이 없습니다")

      // 1) 선택된 payable rows
      const selected = payables.filter((p) => selectedPayableIds.includes(p.id))
      if (selected.length === 0) throw new Error("선택된 지급 항목이 없습니다")

      // 2) period(YYYY-MM) -> start/end(YYYY-MM-DD)
      const start = range.start
      const end = range.end

      // 3) payout 생성 payload(items)
      const items = selected.map((p) => ({
        payeeType: p.payeeType, // "WORKER" | "FOREMAN"
        payeeId: p.payeeId,
        payeeName: p.payeeName,
        amount: p.amount,
        // 서버에서 sourceMode/memberIds 등을 필수로 요구하면 여기서 추가
      }))

      // 4) payout 생성
      const createRes = await fetch("/api/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          siteName,             // ✅ 추가
          periodStart: start,
          periodEnd: end,
          method: "계좌이체",
          memo: payoutMemo,
          items,
        }),
      })

      const createJson = await createRes.json().catch(() => ({}))
      if (!createRes.ok) throw new Error(createJson?.error ?? "지급 생성 실패")

      // 서버 응답 형태 방어적으로 처리
      const payoutId =
        createJson?.payout?.id ??
        createJson?.payoutId ??
        createJson?.id

      if (!payoutId) throw new Error("payoutId가 응답에 없습니다")

      // 5) payout 지급 완료 처리(단건) - 너가 준 서버 라우트와 정확히 매칭
      const payRes = await fetch(`/api/payouts/${encodeURIComponent(payoutId)}/mark-paid`, {
        method: "POST",
      })

      const payJson = await payRes.json().catch(() => ({}))
      if (!payRes.ok) throw new Error(payJson?.error ?? "지급 완료 처리 실패")

      toast.success("지급 완료 처리되었습니다")
      setSelectedPayableIds([])
      setPayoutDialogOpen(false)
      setPayoutMemo("")
      await loadData()
    } catch (e: any) {
      toast.error(e?.message ?? "지급 처리에 실패했습니다")
    } finally {
      setIsPaying(false)
    }
  }



  if (!siteId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Building2 className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
          <p className="text-muted-foreground">현장을 선택해주세요</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="flex-1 flex flex-col min-h-0">
        <div className="shrink-0 border-b border-border px-6">
          <TabsList className="h-12 bg-transparent p-0 gap-4">
            <TabsTrigger
              value="pending"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0"
            >
              지급 예정
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0"
            >
              지급 내역
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="pending" className="flex-1 min-h-0 m-0 data-[state=inactive]:hidden flex flex-col">
          {/* Sticky action bar when items selected */}
          {selectedPayableIds.length > 0 && (
            <div className="shrink-0 bg-primary text-primary-foreground px-6 py-3 flex items-center justify-between">
              <span className="text-sm">
                {selectedPayableIds.length}건 선택 | 합계: {formatKoreanMoney(selectedTotal)}
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPayoutDialogOpen(true)}
              >
                <CreditCard className="mr-1.5 h-4 w-4" />
                지급 처리
              </Button>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-auto">
            {loading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : payables.filter((p) => p.status === "ACCUMULATED").length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <Wallet className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
                  <p className="text-muted-foreground">지급 예정 항목이 없습니다</p>
                </div>
              </div>
            ) : (
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={
                          selectedPayableIds.length ===
                          payables.filter((p) => p.status === "ACCUMULATED").length
                        }
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>지급 대상</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead className="text-right">금액</TableHead>
                    <TableHead>생성일</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payables
                    .filter((p) => p.status === "ACCUMULATED")
                    .map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedPayableIds.includes(p.id)}
                            onCheckedChange={(checked) => handleSelect(p.id, !!checked)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{p.payeeName}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {p.payeeType === "FOREMAN" ? "반장" : "인력"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatKoreanMoney(p.amount)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {p.createdAt ? formatKst(p.createdAt) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="history" className="flex-1 min-h-0 m-0 data-[state=inactive]:hidden">
          <div className="h-full overflow-auto">
            {loading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : history.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <Receipt className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
                  <p className="text-muted-foreground">지급 내역이 없습니다</p>
                </div>
              </div>
            ) : (
              <div className="p-6 space-y-4">
                {history.map((h) => (
                  <Card key={h.id}>
                    <CardHeader className="pb-2">
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() =>
                          setExpandedHistoryId(expandedHistoryId === h.id ? null : h.id)
                        }
                      >
                        <div>
                          <CardTitle className="text-base">
                            {formatKoreanMoney(h.totalAmount)}
                          </CardTitle>
                          <CardDescription>
                            {formatKst(h.paidAt)} | {h.paidByUserName} | {h.method}
                          </CardDescription>
                        </div>
                        <Button variant="ghost" size="icon">
                          {expandedHistoryId === h.id ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                    {expandedHistoryId === h.id && (
                      <CardContent>
                        {h.memo && (
                          <p className="text-sm text-muted-foreground mb-3">
                            메모: {h.memo}
                          </p>
                        )}
                        <div className="space-y-2">
                          {h.items.map((item, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between text-sm py-2 border-t border-border first:border-t-0"
                            >
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  {item.payeeType === "FOREMAN" ? "반장" : "인력"}
                                </Badge>
                                <span>{item.payeeName}</span>
                              </div>
                              <span className="font-medium tabular-nums">
                                {formatKoreanMoney(item.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Payout Confirmation Dialog */}
      <Dialog open={payoutDialogOpen} onOpenChange={setPayoutDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>지급 처리</DialogTitle>
            <DialogDescription>
              선택한 {selectedPayableIds.length}건, 총 {formatKoreanMoney(selectedTotal)}을
              지급 완료 처리합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>메모 (선택)</Label>
              <Textarea
                value={payoutMemo}
                onChange={(e) => setPayoutMemo(e.target.value)}
                placeholder="지급 관련 메모를 입력하세요"
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPayoutDialogOpen(false)}
              className="bg-transparent"
            >
              취소
            </Button>
            <Button onClick={handlePayout} disabled={isPaying}>
              {isPaying ? "처리 중..." : "지급 완료"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================
// 청구/미수금 (Billing & Receivables) Tab
// ============================================
function BillingReceivablesTab({
  siteId,
  siteName,
  period,
}: {
  siteId: string | null
  siteName: string
  period: string
}) {
  if (!siteId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Building2 className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
          <p className="text-muted-foreground">현장을 선택해주세요</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <FileText className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
        <h3 className="font-semibold mb-1">청구/미수금</h3>
        <p className="text-sm text-muted-foreground">
          청구 및 미수금 관리는 "청구" 메뉴에서 확인하세요.
        </p>
      </div>
    </div>
  )
}
