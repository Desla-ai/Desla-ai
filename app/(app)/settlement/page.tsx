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

export default function SettlementPage() {
  const { state } = useAppStore()
  const [activeTab, setActiveTab] = useState("workforce")
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState(
    new Date().toISOString().slice(0, 7)
  )

  const selectedSite = useMemo(
    () => state.sites.find((s) => s.id === selectedSiteId),
    [state.sites, selectedSiteId]
  )

  useEffect(() => {
    if (!selectedSiteId && state.sites.length > 0) {
      setSelectedSiteId(state.sites[0].id)
    }
  }, [selectedSiteId, state.sites])

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
              <Label className="text-sm text-muted-foreground">기간:</Label>
              <Input
                type="month"
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="w-[160px]"
              />
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
                  <SettlementConfigTab siteId={selectedSiteId} siteName={selectedSite?.name || ""} />
                </TabsContent>

                <TabsContent value="workforce" className="h-full m-0 data-[state=inactive]:hidden">
                  <WorkforceSettlementTab
                    siteId={selectedSiteId}
                    siteName={selectedSite?.name || ""}
                    period={selectedPeriod}
                  />
                </TabsContent>

                <TabsContent value="team" className="h-full m-0 data-[state=inactive]:hidden">
                  <TeamSettlementTab
                    siteId={selectedSiteId}
                    siteName={selectedSite?.name || ""}
                    period={selectedPeriod}
                  />
                </TabsContent>

                <TabsContent value="payout" className="h-full m-0 data-[state=inactive]:hidden">
                  <PayoutManagementTab
                    siteId={selectedSiteId}
                    siteName={selectedSite?.name || ""}
                    period={selectedPeriod}
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
}: {
  siteId: string | null
  siteName: string
}) {
  const [loading, setLoading] = useState(false)
  const [rules, setRules] = useState<SettlementRule[]>([])
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<SettlementRule | null>(null)
  const [monthlyPayoutEnabled, setMonthlyPayoutEnabled] = useState(false)

  useEffect(() => {
    if (!siteId) return
    loadRules()
  }, [siteId])

  const loadRules = async () => {
    setLoading(true)
    try {
      await new Promise((r) => setTimeout(r, 500))
      setRules([
        {
          id: "rule-1",
          siteId: siteId!,
          type: "site",
          commissionType: "RATE",
          commissionValue: 10,
          effectiveStart: "2025-01",
          effectiveEnd: "2025-12",
        },
        {
          id: "rule-2",
          siteId: siteId!,
          type: "occupation",
          targetId: "r1",
          targetName: "형틀",
          commissionType: "RATE",
          commissionValue: 8,
          effectiveStart: "2025-01",
          effectiveEnd: "2025-12",
        },
        {
          id: "rule-3",
          siteId: siteId!,
          type: "worker",
          targetId: "w1",
          targetName: "김철수",
          commissionType: "FIXED",
          commissionValue: 15000,
          effectiveStart: "2025-01",
          effectiveEnd: "2025-06",
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleSaveRule = async (rule: SettlementRule) => {
    await new Promise((r) => setTimeout(r, 300))
    if (rule.id.startsWith("new-")) {
      rule.id = `rule-${Date.now()}`
      setRules((prev) => [...prev, rule])
    } else {
      setRules((prev) => prev.map((r) => (r.id === rule.id ? rule : r)))
    }
    setEditDialogOpen(false)
    toast.success("규칙이 저장되었습니다")
  }

  const handleDeleteRule = async (ruleId: string) => {
    await new Promise((r) => setTimeout(r, 300))
    setRules((prev) => prev.filter((r) => r.id !== ruleId))
    toast.success("규칙이 삭제되었습니다")
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
                <p className="text-sm font-medium">월말 일괄지급 (지급예정 누적)</p>
                <p className="text-xs text-muted-foreground">
                  활성화시 정산 완료된 금액이 지급 예정에 누적됩니다
                </p>
              </div>
              <Button
                variant={monthlyPayoutEnabled ? "default" : "outline"}
                size="sm"
                onClick={() => setMonthlyPayoutEnabled(!monthlyPayoutEnabled)}
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

  const handleSubmit = async () => {
    setSaving(true)
    await onSave(formData)
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      {(rule.type === "occupation" || rule.type === "worker") && (
        <div>
          <Label>{rule.type === "occupation" ? "직종명" : "인력명"}</Label>
          <Input
            value={formData.targetName || ""}
            onChange={(e) =>
              setFormData({ ...formData, targetName: e.target.value })
            }
            placeholder={rule.type === "occupation" ? "예: 형틀" : "예: 김철수"}
          />
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
}: {
  siteId: string | null
  siteName: string
  period: string
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
  }, [siteId, period])

  const loadSettlements = async () => {
    setLoading(true)
    try {
      // API stub: GET /api/settlements?siteId=&period=
      await new Promise((r) => setTimeout(r, 600))
      // Mock data with different modes
      setSettlements([
        {
          id: "st-1",
          type: "worker",
          workerId: "w1",
          name: "김철수",
          occupation: "형틀",
          attendanceDays: 15,
          attendanceHours: 120,
          mode: "PROXY",
          introFee: 0,
          dailyWage: 200000,
          commission: 300000,
          commissionRule: "인력별 고정 15,000원",
          advance: 0,
          netPay: 2700000,
          foremanPayoutTotal: 0,
          memberCount: 0,
          memberIds: [],
          status: "SETTLED",
        },
        {
          id: "st-2",
          type: "worker",
          workerId: "w2",
          name: "이영희",
          occupation: "콘크리트",
          attendanceDays: 12,
          attendanceHours: 96,
          mode: "DIRECT",
          introFee: 50000,
          dailyWage: 180000,
          commission: 0,
          commissionRule: "",
          advance: 0,
          netPay: 0,
          foremanPayoutTotal: 0,
          memberCount: 0,
          memberIds: [],
          status: "READY",
        },
        {
          id: "st-3",
          type: "worker",
          workerId: "w5",
          name: "최준혁",
          occupation: "철근",
          attendanceDays: 18,
          attendanceHours: 144,
          mode: "PROXY",
          introFee: 0,
          dailyWage: 190000,
          commission: 342000,
          commissionRule: "현장 기본 10%",
          advance: 100000,
          netPay: 2978000,
          foremanPayoutTotal: 0,
          memberCount: 0,
          memberIds: [],
          status: "UNSETTLED",
        },
        {
          id: "st-4",
          type: "team",
          teamId: "team-1",
          name: "박반장 팀",
          occupation: "형틀",
          attendanceDays: 20,
          attendanceHours: 160,
          mode: "TEAM",
          introFee: 0,
          dailyWage: 0,
          commission: 0,
          commissionRule: "",
          advance: 0,
          netPay: 0,
          foremanPayoutTotal: 5000000,
          memberCount: 4,
          memberIds: ["w10", "w11", "w12", "w13"],
          status: "UNSETTLED",
        },
        {
          id: "st-5",
          type: "worker",
          workerId: "w6",
          name: "강민지",
          occupation: "비계",
          attendanceDays: 10,
          attendanceHours: 80,
          mode: "PROXY",
          introFee: 0,
          dailyWage: 170000,
          commission: 136000,
          commissionRule: "직종별 8%",
          advance: 50000,
          netPay: 1514000,
          foremanPayoutTotal: 0,
          memberCount: 0,
          memberIds: [],
          status: "READY",
        },
      ])
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
    await new Promise((r) => setTimeout(r, 500))
    setSettlements((prev) =>
      prev.map((s) =>
        selectedIds.includes(s.id) ? { ...s, status: "SETTLED" as const } : s
      )
    )
    setSelectedIds([])
    setConfirmDialogOpen(false)
    toast.success(`${selectedIds.length}명 정산 확정 완료`)
  }

  // Complete scope
  const handleCompleteScope = async () => {
    setIsCompletingScope(true)
    try {
      // API stub: POST /api/settlements/scope/complete
      await new Promise((r) => setTimeout(r, 500))
      toast.success("해당 범위 전체 정산 완료")
      setCompleteScopeDialogOpen(false)
    } catch {
      toast.error("정산 완료 처리에 실패했습니다")
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
            {selectedIds.length > 0 && (
              <Button size="sm" onClick={() => setConfirmDialogOpen(true)}>
                <Check className="mr-1.5 h-4 w-4" />
                선택 확정 ({selectedIds.length}명)
              </Button>
            )}
            <Button
              size="sm"
              variant="default"
              onClick={() => setCompleteScopeDialogOpen(true)}
              disabled={!isAllSettled}
            >
              <Lock className="mr-1.5 h-4 w-4" />
              정산 완료
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
              {editedTarget?.status !== "SETTLED" && (
                <Button onClick={handleMarkSettled} disabled={saving}>
                  <Check className="mr-1.5 h-4 w-4" />
                  정산 완료
                </Button>
              )}
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

      {/* Complete Scope Dialog */}
      <AlertDialog open={completeScopeDialogOpen} onOpenChange={setCompleteScopeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>전체 정산을 완료할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {isAllSettled ? (
                "해당 현장/기간의 모든 정산이 완료되었습니다. 정산을 최종 확정합니다."
              ) : (
                <div className="space-y-2">
                  <p>아직 정산이 완료되지 않은 대상이 있습니다:</p>
                  <ul className="list-disc pl-4 text-sm">
                    {unsettledTargets.slice(0, 5).map((t) => (
                      <li key={t.id}>{t.name}</li>
                    ))}
                    {unsettledTargets.length > 5 && (
                      <li>외 {unsettledTargets.length - 5}명</li>
                    )}
                  </ul>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCompleteScope}
              disabled={!isAllSettled || isCompletingScope}
            >
              {isCompletingScope ? "처리 중..." : "정산 완료"}
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
}: {
  siteId: string | null
  siteName: string
  period: string
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
  }, [siteId, period])

  const loadData = async () => {
    setLoading(true)
    try {
      await new Promise((r) => setTimeout(r, 600))
      setPayables([
        {
          id: "pay-1",
          siteId: siteId!,
          siteName,
          period,
          payeeType: "WORKER",
          payeeId: "w1",
          payeeName: "김철수",
          amount: 2700000,
          status: "ACCUMULATED",
          createdAt: "2025-01-15",
        },
        {
          id: "pay-2",
          siteId: siteId!,
          siteName,
          period,
          payeeType: "WORKER",
          payeeId: "w5",
          payeeName: "최준혁",
          amount: 2978000,
          status: "ACCUMULATED",
          createdAt: "2025-01-15",
        },
        {
          id: "pay-3",
          siteId: siteId!,
          siteName,
          period,
          payeeType: "FOREMAN",
          payeeId: "team-1",
          payeeName: "박반장 팀",
          amount: 5000000,
          status: "ACCUMULATED",
          createdAt: "2025-01-15",
        },
      ])
      setHistory([
        {
          id: "hist-1",
          paidAt: "2025-01-10",
          paidByUserId: "u1",
          paidByUserName: "관리자",
          siteId: siteId!,
          siteName,
          period: "2025-01",
          items: [
            { payableItemId: "pay-old-1", payeeType: "WORKER", payeeName: "이영희", amount: 1844000 },
            { payableItemId: "pay-old-2", payeeType: "WORKER", payeeName: "강민지", amount: 1514000 },
          ],
          totalAmount: 3358000,
          memo: "1월 중간정산",
          method: "계좌이체",
        },
      ])
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
      await new Promise((r) => setTimeout(r, 500))
      setPayables((prev) =>
        prev.map((p) =>
          selectedPayableIds.includes(p.id) ? { ...p, status: "PAID" as const } : p
        )
      )
      setSelectedPayableIds([])
      setPayoutDialogOpen(false)
      setPayoutMemo("")
      toast.success("지급 완료 처리되었습니다")
    } catch {
      toast.error("지급 처리에 실패했습니다")
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
                        <TableCell className="text-muted-foreground">{p.createdAt}</TableCell>
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
                            {h.paidAt} | {h.paidByUserName} | {h.method}
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
