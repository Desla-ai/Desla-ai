"use client"

import { useEffect, useMemo, useState } from "react"

import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { type Site, type Worker } from "@/lib/mock-data"
import { formatDateRange, formatPhone } from "@/lib/format"
import { Search, MessageSquare, X, Plus, Building2, Save } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { CompanyPickerDialog } from "@/components/companies/company-picker-dialog"

interface SiteListPanelProps {
  sites: Site[]
  // ✅ sites 카드의 "배치 n명"을 DB/스토어의 workers로 계산하기 위해 주입
  workers: Worker[]
  selectedSiteId: string | null
  onSelectSite: (siteId: string) => void
  checkedSiteIds: string[]
  onCheckedSiteIdsChange: (ids: string[]) => void
  onAddSite?: (site: Omit<Site, "id"> & { companyId: string }) => void
  onAddWorker?: () => void
}

const statusFilters = ["미진행", "배차대기", "배차완료", "금액확정"] as const
type StatusType = (typeof statusFilters)[number]

const statusColors: Record<StatusType, string> = {
  미진행: "bg-muted text-muted-foreground",
  배차대기: "bg-status-waiting text-status-waiting-foreground",
  배차완료: "bg-status-progress text-status-progress-foreground",
  금액확정: "bg-status-pending text-status-pending-foreground",
}

// ✅ 템플릿 ID는 고정 키로 운영(office_id + id 복합키로 DB 저장하기 좋음)
type SmsTemplateId = "default" | "notice" | "urgent" | "change"
type SmsTemplate = { id: SmsTemplateId; name: string; content: string }

// ✅ fallback(서버 로드 실패 시 사용)
const fallbackSmsTemplates: SmsTemplate[] = [
  {
    id: "default",
    name: "기본 템플릿",
    content: "내일 {출근시간}까지 {현장명}({주소})로 출근 부탁드립니다. 문의: {사무소번호}",
  },
  {
    id: "notice",
    name: "공지",
    content:
      "[공지] {현장명} 현장 안내드립니다.\n위치: {주소}\n출근시간: {출근시간}\n문의: {사무소번호}",
  },
  {
    id: "urgent",
    name: "긴급",
    content:
      "[긴급] {현장명} 현장 긴급 인력 요청\n출근시간: {출근시간}\n위치: {주소}\n연락처: {사무소번호}",
  },
  {
    id: "change",
    name: "현장 변경",
    content:
      "[현장변경] 내일 출근 현장이 변경되었습니다.\n변경현장: {현장명}\n주소: {주소}\n출근시간: {출근시간}\n문의: {사무소번호}",
  },
]

function getSafeSelectedTemplateId(
  templates: SmsTemplate[],
  selected: SmsTemplateId | null | undefined
): SmsTemplateId {
  if (selected && templates.some((t) => t.id === selected)) return selected
  // fallback은 항상 4종이 있으니 여기서 안전하게 결정 가능
  return (templates[0]?.id ?? "default") as SmsTemplateId
}

export function SiteListPanel({
  sites,
  workers,
  selectedSiteId,
  onSelectSite,
  checkedSiteIds,
  onCheckedSiteIdsChange,
  onAddSite,
  onAddWorker,
}: SiteListPanelProps) {
  const [search, setSearch] = useState("")
  const [activeFilter, setActiveFilter] = useState<StatusType | null>(null)

  // SMS dialog
  const [smsDialogOpen, setSmsDialogOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<SmsTemplateId>("default")
  const [smsMessage, setSmsMessage] = useState("")
  const [isSendingSms, setIsSendingSms] = useState(false)

  // ✅ templates are now backed by DB (fallback if not available)
  const [templates, setTemplates] = useState<SmsTemplate[]>(fallbackSmsTemplates)
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)

  // New Site Dialog with full fields
  const [newSiteDialogOpen, setNewSiteDialogOpen] = useState(false)
  const [newSiteName, setNewSiteName] = useState("")
  const [newSiteAddress, setNewSiteAddress] = useState("")
  const [newSitePhone, setNewSitePhone] = useState("")
  const [newSiteCheckInTime, setNewSiteCheckInTime] = useState("07:00")
  const [newSiteStartDate, setNewSiteStartDate] = useState("")
  const [newSiteEndDate, setNewSiteEndDate] = useState("")
  const [newSitePlannedWorkers, setNewSitePlannedWorkers] = useState("0")
  const [newSiteStatus, setNewSiteStatus] = useState<StatusType>("배차대기")

  // ✅ New Site: company picker (required)
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false)
  const [newSiteCompanyId, setNewSiteCompanyId] = useState("")
  const [newSiteCompanyName, setNewSiteCompanyName] = useState("")
  const [newSiteCompanyBizNo, setNewSiteCompanyBizNo] = useState("")

  const filteredSites = sites.filter((site) => {
    const matchesSearch = site.name.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = !activeFilter || site.status === activeFilter
    return matchesSearch && matchesFilter
  })

  const checkedSites = sites.filter((site) => checkedSiteIds.includes(site.id))

  const handleCheckboxChange = (siteId: string, checked: boolean) => {
    if (checked) {
      onCheckedSiteIdsChange([...checkedSiteIds, siteId])
    } else {
      onCheckedSiteIdsChange(checkedSiteIds.filter((id) => id !== siteId))
    }
  }

  const handleClearSelection = () => {
    onCheckedSiteIdsChange([])
  }

  const getAssignedCountForSite = (siteId: string) => {
    return workers.filter((w) => {
      const assigned = (w as any).assignedSiteId ?? (w as any).assigned_site_id ?? null
      return assigned === siteId
    }).length
  }

  const generateMessage = (template: string, site: Site) => {
    return template
      .replace("{현장명}", site.name)
      .replace("{주소}", site.address)
      .replace("{출근시간}", (site as any).checkInTime ?? (site as any).check_in_time ?? "")
      .replace(
        "{사무소번호}",
        formatPhone((site as any).officePhone ?? (site as any).office_phone ?? "")
      )
  }

  // -----------------------------
  // ✅ Load templates from DB
  // -----------------------------
  const loadTemplates = async () => {
    setIsLoadingTemplates(true)
    try {
      const res = await fetch("/api/settings/sms-templates", { method: "GET", cache: "no-store" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error ?? `SMS 템플릿을 불러오지 못했습니다 (${res.status})`)
        return
      }

      const list = Array.isArray(json?.templates) ? (json.templates as SmsTemplate[]) : []

      // ✅ 서버에 아무 것도 없으면 fallback 유지
      if (list.length > 0) {
        setTemplates(list)

        // ✅ [핵심] 드롭다운 공백 방지: 현재 선택값이 서버 목록에 없으면 보정
        setSelectedTemplate((prev) => getSafeSelectedTemplateId(list, prev))
      } else {
        // 서버가 빈 배열이면 fallback 유지 + 선택값도 fallback 기준으로 보정
        setSelectedTemplate((prev) => getSafeSelectedTemplateId(fallbackSmsTemplates, prev))
      }
    } catch (e) {
      console.error(e)
      toast.error("SMS 템플릿 로드 중 오류가 발생했습니다")
    } finally {
      setIsLoadingTemplates(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (cancelled) return
      await loadTemplates()
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleOpenSmsDialog = () => {
    if (checkedSiteIds.length === 0) return

    // ✅ [핵심] Dialog 열 때도 항상 유효한 template + message가 세팅되도록 보정
    const safeId = getSafeSelectedTemplateId(templates, selectedTemplate)
    if (safeId !== selectedTemplate) setSelectedTemplate(safeId)

    const template = templates.find((t) => t.id === safeId) ?? templates[0]
    if (template) {
      setSmsMessage(template.content) // ✅ 토큰 템플릿 원본 유지(초기 공백 방지)
    }

    setSmsDialogOpen(true)
  }

  const handleTemplateChange = (templateId: SmsTemplateId) => {
    const safeId = getSafeSelectedTemplateId(templates, templateId)
    setSelectedTemplate(safeId)

    const template = templates.find((t) => t.id === safeId)
    if (template) setSmsMessage(template.content) // ✅ 토큰 템플릿 원본 유지
  }

  const handleSaveTemplate = async () => {
    const safeId = getSafeSelectedTemplateId(templates, selectedTemplate)
    const t = templates.find((x) => x.id === safeId)
    if (!t) return

    setIsSavingTemplate(true)
    try {
      const res = await fetch("/api/settings/sms-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: t.id,
          name: t.name,
          content: smsMessage,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error ?? `템플릿 저장 실패 (${res.status})`)
        return
      }

      const saved = (json?.template ?? { ...t, content: smsMessage }) as SmsTemplate
      setTemplates((prev) => prev.map((x) => (x.id === saved.id ? saved : x)))
      toast.success("템플릿이 저장되었습니다")
    } catch (e) {
      console.error(e)
      toast.error("템플릿 저장 중 오류가 발생했습니다")
    } finally {
      setIsSavingTemplate(false)
    }
  }

  // -----------------------------
  // Preview per site
  // -----------------------------
  const perSitePreviewData = useMemo(() => {
    const safeId = getSafeSelectedTemplateId(templates, selectedTemplate)
    const template = templates.find((t) => t.id === safeId)
    if (!template) return []

    return checkedSiteIds.map((siteId) => {
      const site = sites.find((s) => s.id === siteId)
      if (!site) return { siteId: "", siteName: "", message: "", recipientCount: 0 }
      return {
        siteId: site.id,
        siteName: site.name,
        message: generateMessage(smsMessage || template.content, site),
        recipientCount: getAssignedCountForSite(site.id),
      }
    })
  }, [checkedSiteIds, templates, selectedTemplate, sites, workers, smsMessage])

  const handleSendSms = async () => {
    if (checkedSiteIds.length === 0) return
    if (!smsMessage.trim()) {
      toast.error("문자 내용을 입력해주세요.")
      return
    }

    setIsSendingSms(true)
    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "bySiteWorkers",
          siteIds: checkedSiteIds,
          template: smsMessage, // ✅ 토큰 템플릿 원본 전송(서버가 site별로 치환)
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? "문자 발송 실패")

      const sent = Number(data?.sent ?? 0)
      const failed = Number(data?.failed ?? 0)
      const totalTargets = Number(data?.totalTargets ?? 0)
      const skippedNoPhone = Number(data?.skippedNoPhone ?? 0)

      toast.success(
        `문자 발송 완료: ${sent}건 / 실패: ${failed}건 (대상:${totalTargets}명, 번호없음:${skippedNoPhone}명)`
      )

      setSmsDialogOpen(false)
      setSmsMessage("")
      onCheckedSiteIdsChange([])
    } catch (e: any) {
      toast.error(e?.message ?? "문자 발송에 실패했습니다. 다시 시도해주세요.")
    } finally {
      setIsSendingSms(false)
    }
  }

  const handleAddNewSite = () => {
    if (!newSiteCompanyId) {
      toast.error("건설사(업체)를 선택해 주세요")
      return
    }
    if (!newSiteName.trim() || !newSiteAddress.trim()) {
      toast.error("현장명과 주소를 입력해주세요")
      return
    }
    if (!newSiteStartDate || !newSiteEndDate) {
      toast.error("기간을 입력해주세요")
      return
    }

    const plannedWorkers = Number.parseInt(newSitePlannedWorkers) || 0

    onAddSite?.({
      name: newSiteName.trim(),
      address: newSiteAddress.trim(),
      officePhone: newSitePhone,
      checkInTime: newSiteCheckInTime,
      startDate: newSiteStartDate,
      endDate: newSiteEndDate,
      status: newSiteStatus,
      plannedWorkers,
      assignedWorkers: 0,
      todayRequired: plannedWorkers,
      progress: 0,
      companyId: newSiteCompanyId,
    })

    toast.success("새 현장이 등록되었습니다")
    setNewSiteDialogOpen(false)

    setNewSiteName("")
    setNewSiteAddress("")
    setNewSitePhone("")
    setNewSiteCheckInTime("07:00")
    setNewSiteStartDate("")
    setNewSiteEndDate("")
    setNewSitePlannedWorkers("0")
    setNewSiteStatus("배차대기")
    setNewSiteCompanyId("")
    setNewSiteCompanyName("")
    setNewSiteCompanyBizNo("")
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">현장</h2>
        </div>

        <div className="mb-4">
          <Button size="sm" onClick={() => setNewSiteDialogOpen(true)} className="w-full">
            <Building2 className="mr-1.5 h-4 w-4" />
            신규 현장 등록
          </Button>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="현장 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {statusFilters.map((filter) => (
            <Badge
              key={filter}
              variant={activeFilter === filter ? "default" : "outline"}
              className={cn(
                "cursor-pointer transition-colors",
                activeFilter === filter ? statusColors[filter] : ""
              )}
              onClick={() => setActiveFilter(activeFilter === filter ? null : filter)}
            >
              {filter}
            </Badge>
          ))}
        </div>
      </div>

      {/* Bulk Action Bar */}
      <div className="shrink-0 flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-3">
        <Badge
          variant={checkedSiteIds.length > 0 ? "default" : "secondary"}
          className={cn(
            "text-sm font-semibold px-3 py-1",
            checkedSiteIds.length > 0 && "bg-primary text-primary-foreground"
          )}
        >
          선택 {checkedSiteIds.length}개
        </Badge>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearSelection}
            disabled={checkedSiteIds.length === 0}
            className="h-8 px-2 text-xs"
          >
            <X className="mr-1 h-3 w-3" />
            선택 해제
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleOpenSmsDialog}
            disabled={checkedSiteIds.length === 0}
            className="h-8 px-3 text-xs"
          >
            <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
            문자 발송
          </Button>
        </div>
      </div>

      {/* Site List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col gap-2 p-4">
          {filteredSites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm text-muted-foreground">현장이 없습니다</p>
            </div>
          ) : (
            filteredSites.map((site) => {
              const isChecked = checkedSiteIds.includes(site.id)
              return (
                <div
                  key={site.id}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-sm overflow-hidden min-w-0",
                    selectedSiteId === site.id && "border-primary bg-accent"
                  )}
                >
                  <Checkbox
                    id={`site-checkbox-${site.id}`}
                    checked={isChecked}
                    onCheckedChange={(checked) => handleCheckboxChange(site.id, checked as boolean)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 shrink-0"
                    aria-label={`${site.name} 선택`}
                  />
                  <button
                    type="button"
                    onClick={() => onSelectSite(site.id)}
                    className="flex flex-1 flex-col gap-2 text-left min-w-0"
                  >
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <span className="font-medium min-w-0 whitespace-normal break-words leading-snug">
                        {site.name}
                      </span>
                      <Badge className={cn("shrink-0 text-xs", statusColors[site.status])}>
                        {site.status}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground truncate">
                      {formatDateRange(site.startDate, site.endDate)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      오늘 필요 {site.todayRequired}명 / 배치 {getAssignedCountForSite(site.id)}명
                    </span>
                  </button>
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>

      {/* SMS Dialog */}
      <Dialog open={smsDialogOpen} onOpenChange={setSmsDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>문자 발송</DialogTitle>
            <DialogDescription>
              {checkedSites.length > 1
                ? "선택한 현장별 템플릿으로 나누어 발송합니다."
                : "선택한 현장의 작업자들에게 문자를 발송합니다."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div>
              {checkedSites.length > 1 ? (
                <>
                  <p className="mb-2 text-sm font-medium">
                    현장별 발송 미리보기 ({checkedSites.length}개 현장)
                  </p>
                  <div className="max-h-[200px] overflow-y-auto space-y-2 border border-border rounded-lg p-2">
                    {perSitePreviewData.map((preview) => (
                      <div key={preview.siteId} className="bg-muted/50 rounded-md p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{preview.siteName}</span>
                          <Badge variant="outline" className="text-xs">
                            {preview.recipientCount}명
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {preview.message}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="mb-2 text-sm font-medium">선택된 현장 ({checkedSites.length}개)</p>
                  <div className="flex flex-wrap gap-2">
                    {checkedSites.map((site) => (
                      <Badge key={site.id} variant="secondary" className="text-xs">
                        {site.name}
                      </Badge>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div>
              <Label htmlFor="template-select" className="mb-2 block text-sm font-medium">
                템플릿 선택
              </Label>
              <Select
                value={getSafeSelectedTemplateId(templates, selectedTemplate)}
                onValueChange={(v) => handleTemplateChange(v as SmsTemplateId)}
              >
                <SelectTrigger id="template-select">
                  <SelectValue placeholder={isLoadingTemplates ? "불러오는 중..." : "템플릿 선택"} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="mt-2 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadTemplates}
                  disabled={isLoadingTemplates}
                  className="h-8"
                >
                  {isLoadingTemplates ? "불러오는 중..." : "서버 템플릿 다시 불러오기"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  * 설정에서 저장한 템플릿이 여기에도 반영됩니다.
                </span>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label htmlFor="sms-message" className="text-sm font-medium">
                  메시지 내용
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSaveTemplate}
                  disabled={isSavingTemplate}
                  className="h-7 px-2 text-xs"
                >
                  <Save className="mr-1 h-3 w-3" />
                  {isSavingTemplate ? "저장 중..." : "템플릿 저장"}
                </Button>
              </div>

              <Textarea
                id="sms-message"
                placeholder="발송할 메시지 내용을 입력하세요..."
                value={smsMessage}
                onChange={(e) => setSmsMessage(e.target.value)}
                className="min-h-[140px] resize-none"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                변수: {"{현장명}"}, {"{주소}"}, {"{출근시간}"}, {"{사무소번호}"}
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setSmsDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSendSms} disabled={!smsMessage.trim() || isSendingSms}>
              {isSendingSms ? "발송 중..." : "발송"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Site Dialog */}
      <Dialog open={newSiteDialogOpen} onOpenChange={setNewSiteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>신규 현장 등록</DialogTitle>
            <DialogDescription>새로운 현장 정보를 입력하세요.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4 max-h-[60vh] overflow-y-auto">
            <div>
              <Label htmlFor="site-name">현장명 *</Label>
              <Input
                id="site-name"
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value)}
                placeholder="현장명을 입력하세요"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="site-address">주소 *</Label>
              <Input
                id="site-address"
                value={newSiteAddress}
                onChange={(e) => setNewSiteAddress(e.target.value)}
                placeholder="주소를 입력하세요"
                className="mt-1.5"
              />
            </div>

            {/* Company Picker */}
            <div>
              <Label>건설사(업체) *</Label>

              <div className="mt-1.5 flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={() => setCompanyPickerOpen(true)}>
                  {newSiteCompanyId ? "회사 변경" : "회사 선택"}
                </Button>

                {newSiteCompanyId ? (
                  <div className="min-w-0 text-sm">
                    <div className="truncate font-medium">{newSiteCompanyName}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      사업자번호: {newSiteCompanyBizNo}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    회사를 선택해야 현장을 등록할 수 있습니다.
                  </div>
                )}
              </div>
            </div>

            <CompanyPickerDialog
              open={companyPickerOpen}
              onOpenChange={setCompanyPickerOpen}
              onPick={(c: any) => {
                setNewSiteCompanyId(String(c.id))
                setNewSiteCompanyName(String(c.name ?? ""))
                setNewSiteCompanyBizNo(String(c.biz_no ?? ""))
              }}
            />

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="site-start-date">기간 시작일 *</Label>
                <Input
                  id="site-start-date"
                  type="date"
                  value={newSiteStartDate}
                  onChange={(e) => setNewSiteStartDate(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="site-end-date">기간 종료일 *</Label>
                <Input
                  id="site-end-date"
                  type="date"
                  value={newSiteEndDate}
                  onChange={(e) => setNewSiteEndDate(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="site-planned-workers">기본 계획 인원</Label>
              <Input
                id="site-planned-workers"
                type="number"
                min="0"
                value={newSitePlannedWorkers}
                onChange={(e) => setNewSitePlannedWorkers(e.target.value)}
                placeholder="0"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="site-status">상태</Label>
              <Select value={newSiteStatus} onValueChange={(v) => setNewSiteStatus(v as StatusType)}>
                <SelectTrigger id="site-status" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusFilters.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="site-phone">사무소 전화번호</Label>
                <Input
                  id="site-phone"
                  value={newSitePhone}
                  onChange={(e) => setNewSitePhone(e.target.value)}
                  placeholder="0212345678"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="site-checkin">출근 시간</Label>
                <Input
                  id="site-checkin"
                  type="time"
                  value={newSiteCheckInTime}
                  onChange={(e) => setNewSiteCheckInTime(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewSiteDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleAddNewSite}>
              <Plus className="mr-2 h-4 w-4" />
              등록
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
