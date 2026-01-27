"use client"

import { useMemo } from "react"

import { useState } from "react"
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
import { type Site } from "@/lib/mock-data"
import { formatDateRange, formatPhone } from "@/lib/format"
import { Search, MessageSquare, X, Plus, Building2, Save } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface SiteListPanelProps {
  sites: Site[]
  selectedSiteId: string | null
  onSelectSite: (siteId: string) => void
  checkedSiteIds: string[]
  onCheckedSiteIdsChange: (ids: string[]) => void
  onAddSite?: (site: Omit<Site, "id">) => void
  onAddWorker?: () => void // Declare the onAddWorker variable
}

const statusFilters = ["미진행", "배차대기", "배차완료", "정산완료"] as const
type StatusType = (typeof statusFilters)[number]

const statusColors: Record<StatusType, string> = {
  미진행: "bg-muted text-muted-foreground",
  배차대기: "bg-status-waiting text-status-waiting-foreground",
  배차완료: "bg-status-progress text-status-progress-foreground",
  정산완료: "bg-status-pending text-status-pending-foreground",
}

// SMS Template system
const smsTemplates = [
  { id: "default", name: "기본 템플릿", content: "내일 {출근시간}까지 {현장명}({주소})로 출근 부탁드립니다. 문의: {사무소번호}" },
  { id: "notice", name: "공지", content: "[공지] {현장명} 현장 안내드립니다.\n위치: {주소}\n출근시간: {출근시간}\n문의: {사무소번호}" },
  { id: "urgent", name: "긴급", content: "[긴급] {현장명} 현장 긴급 인력 요청\n출근시간: {출근시간}\n위치: {주소}\n연락처: {사무소번호}" },
  { id: "change", name: "현장 변경", content: "[현장변경] 내일 출근 현장이 변경되었습니다.\n변경현장: {현장명}\n주소: {주소}\n출근시간: {출근시간}\n문의: {사무소번호}" },
]

export function SiteListPanel({
  sites,
  selectedSiteId,
  onSelectSite,
  checkedSiteIds,
  onCheckedSiteIdsChange,
  onAddSite,
  onAddWorker, // Pass the onAddWorker prop
}: SiteListPanelProps) {
  const [search, setSearch] = useState("")
  const [activeFilter, setActiveFilter] = useState<StatusType | null>(null)
  const [smsDialogOpen, setSmsDialogOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState("default")
  const [smsMessage, setSmsMessage] = useState("")
  const [customTemplates, setCustomTemplates] = useState(smsTemplates)
  
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

  const filteredSites = sites.filter((site) => {
    const matchesSearch = site.name.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = !activeFilter || site.status === activeFilter
    return matchesSearch && matchesFilter
  })

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

  const generateMessage = (template: string, site: Site) => {
    return template
      .replace("{현장명}", site.name)
      .replace("{주소}", site.address)
      .replace("{출근시간}", site.checkInTime)
      .replace("{사무소번호}", formatPhone(site.officePhone))
  }

  const handleOpenSmsDialog = () => {
    if (checkedSiteIds.length === 0) return
    const firstSite = sites.find((s) => checkedSiteIds.includes(s.id))
    const template = customTemplates.find((t) => t.id === selectedTemplate)
    if (firstSite && template) {
      setSmsMessage(generateMessage(template.content, firstSite))
    }
    setSmsDialogOpen(true)
  }

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId)
    const template = customTemplates.find((t) => t.id === templateId)
    const firstSite = sites.find((s) => checkedSiteIds.includes(s.id))
    if (template && firstSite) {
      setSmsMessage(generateMessage(template.content, firstSite))
    }
  }

  const handleSaveTemplate = () => {
    setCustomTemplates((prev) =>
      prev.map((t) => (t.id === selectedTemplate ? { ...t, content: smsMessage } : t))
    )
    toast.success("템플릿이 저장되었습니다")
  }

  // Per-site SMS sending with template
  const [isSendingSms, setIsSendingSms] = useState(false)
  const [showPerSitePreview, setShowPerSitePreview] = useState(false)

  // Generate preview data for each site
  const perSitePreviewData = useMemo(() => {
    const template = customTemplates.find((t) => t.id === selectedTemplate)
    if (!template) return []
    return checkedSiteIds.map((siteId) => {
      const site = sites.find((s) => s.id === siteId)
      if (!site) return { siteId: "", siteName: "", message: "", recipientCount: 0 }
      return {
        siteId: site.id,
        siteName: site.name,
        message: generateMessage(template.content, site),
        recipientCount: Math.floor(Math.random() * 10) + 5, // Mock recipient count
      }
    })
  }, [checkedSiteIds, customTemplates, selectedTemplate, sites])

  const handleSendSms = async () => {
    if (checkedSiteIds.length === 0) return

    setIsSendingSms(true)
    try {
      // API stub: POST /api/sms/send with { siteIds: string[], mode: "perSiteTemplate" }
      // Server performs per-site loop and sends separately with each site's template
      await new Promise((resolve) => setTimeout(resolve, 1000))

      toast.success(`${checkedSiteIds.length}개 현장에 현장별 템플릿으로 문자 발송 완료`)
      setSmsDialogOpen(false)
      setSmsMessage("")
      setShowPerSitePreview(false)
      onCheckedSiteIdsChange([])
    } catch {
      toast.error("문자 발송에 실패했습니다. 다시 시도해주세요.")
    } finally {
      setIsSendingSms(false)
    }
  }

  const handleAddNewSite = () => {
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
      plannedWorkers: plannedWorkers,
      assignedWorkers: 0,
      todayRequired: plannedWorkers,
      progress: 0,
    })
    toast.success("새 현장이 등록되었습니다")
    setNewSiteDialogOpen(false)
    // Reset form
    setNewSiteName("")
    setNewSiteAddress("")
    setNewSitePhone("")
    setNewSiteCheckInTime("07:00")
    setNewSiteStartDate("")
    setNewSiteEndDate("")
    setNewSitePlannedWorkers("0")
    setNewSiteStatus("배차대기")
  }

  const checkedSites = sites.filter((site) => checkedSiteIds.includes(site.id))

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">현장</h2>
        </div>
        
        {/* Action Button - Site registration only */}
        <div className="mb-4">
          <Button
            size="sm"
            onClick={() => setNewSiteDialogOpen(true)}
            className="w-full"
          >
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

      {/* Site List - with proper overflow handling */}
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
                    onCheckedChange={(checked) =>
                      handleCheckboxChange(site.id, checked as boolean)
                    }
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
                      <span className="font-medium truncate min-w-0">{site.name}</span>
                      <Badge className={cn("shrink-0 text-xs", statusColors[site.status])}>
                        {site.status}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground truncate">
                      {formatDateRange(site.startDate, site.endDate)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      오늘 필요 {site.todayRequired}명 / 배치 {site.assignedWorkers}명
                    </span>
                  </button>
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>

{/* SMS Dialog with Per-Site Template System */}
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
                  <p className="mb-2 text-sm font-medium">현장별 발송 미리보기 ({checkedSites.length}개 현장)</p>
                  <div className="max-h-[200px] overflow-y-auto space-y-2 border border-border rounded-lg p-2">
                    {perSitePreviewData.map((preview) => (
                      <div key={preview.siteId} className="bg-muted/50 rounded-md p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{preview.siteName}</span>
                          <Badge variant="outline" className="text-xs">{preview.recipientCount}명</Badge>
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
              <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
                <SelectTrigger id="template-select">
                  <SelectValue placeholder="템플릿 선택" />
                </SelectTrigger>
                <SelectContent>
                  {customTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  className="h-7 px-2 text-xs"
                >
                  <Save className="mr-1 h-3 w-3" />
                  템플릿 저장
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

      {/* New Site Dialog - with Date Range */}
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
