"use client"

import { useState, useMemo, useEffect } from "react"
import { AppShell } from "@/components/layout/app-shell"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CompanyPickerDialog } from "@/components/companies/company-picker-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
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
import { useAppStore } from "@/lib/app-store"
import { formatKoreanMoney, formatKoreanDate } from "@/lib/format"
import {
  FileText,
  Plus,
  Trash2,
  ChevronDown,
  Receipt,
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  Send,
  MoreHorizontal,
  Search,
  Download,
  Paperclip,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

// Invoice status type
type InvoiceStatus = "초안" | "발행" | "입금완료"

// Invoice line item categories
const lineItemCategories = ["인건비", "장비", "자재", "기타"] as const
type LineItemCategory = (typeof lineItemCategories)[number]

type InvoiceAttachment = {
  id: string
  name: string
  mime: string
  size: number
  path: string
  url: string | null
  createdAt: string
}

// Invoice interface
interface InvoiceLineItem {
  id: string
  category: LineItemCategory
  description: string
  quantity: number
  unitPrice: number
  amount: number
}

interface Invoice {
  id: string
  invoiceNumber: string
  siteId: string
  siteName: string
  siteLabel?: string
  siteIds?: string[]
  siteNames?: string[]
  siteCount?: number
  contractorName: string
  status: InvoiceStatus
  issueDate: string
  dueDate: string
  lineItems: InvoiceLineItem[]
  subtotal: number
  tax: number
  total: number
  notes: string
  attachments: InvoiceAttachment[]
  createdAt: string
  updatedAt: string
}

// Status colors
const statusConfig: Record<InvoiceStatus, { color: string; icon: typeof Clock }> = {
  초안: { color: "bg-muted text-muted-foreground", icon: FileText },
  발행: { color: "bg-status-waiting text-status-waiting-foreground", icon: Send },
  입금완료: { color: "bg-status-progress text-status-progress-foreground", icon: CheckCircle2 },
}

export default function BillingPage() {
  const { state } = useAppStore()

  // Invoice state (would be stored in global state in production)
  const [invoices, setInvoices] = useState<Invoice[]>([])

  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [siteFilter, setSiteFilter] = useState<string>("all")
  const [search, setSearch] = useState("")

  // Create invoice dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [isLoading, setIsLoading] = useState(false)


  // New invoice form

  const [companyPickerOpen, setCompanyPickerOpen] = useState(false)
  const [newInvoiceCompanyId, setNewInvoiceCompanyId] = useState("")
  const [newInvoiceCompanyName, setNewInvoiceCompanyName] = useState("")
  const [newInvoiceCompanyBizNo, setNewInvoiceCompanyBizNo] = useState("")


  const [newInvoiceSiteId, setNewInvoiceSiteId] = useState("")
  const [newInvoiceContractor, setNewInvoiceContractor] = useState("")
  const [newInvoiceNotes, setNewInvoiceNotes] = useState("")
  const [newInvoiceLineItems, setNewInvoiceLineItems] = useState<InvoiceLineItem[]>([
    { id: "new1", category: "인건비", description: "", quantity: 1, unitPrice: 0, amount: 0 }
  ])

  const [newInvoiceAttachments, setNewInvoiceAttachments] = useState<InvoiceAttachment[]>([])
  const [isUploading, setIsUploading] = useState(false)

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of list) {
        const initRes = await fetch("/api/uploads/invoice-attachments/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, mime: file.type, size: file.size }),
        });
        const init = await initRes.json();
        if (!initRes.ok) throw new Error(init.error ?? "업로드 준비 실패");

        // ✅ 가장 안전: Blob으로 감싸서 BodyInit 확실히 만족
        const putRes = await fetch(init.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: new Blob([file], { type: file.type || "application/octet-stream" }),
        });
        if (!putRes.ok) throw new Error("스토리지 업로드 실패");

        const signRes = await fetch("/api/uploads/invoice-attachments/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths: [init.attachmentDraft.path], expiresIn: 60 * 30 }),
        });
        const signed = await signRes.json();
        const url = signed?.signed?.[0]?.url ?? null;

        setNewInvoiceAttachments((prev) => [...prev, { ...init.attachmentDraft, url }]);
      }

      toast.success("첨부파일 업로드 완료");
    } finally {
      setIsUploading(false);
    }
  }


  useEffect(() => {
    let cancelled = false
      ; (async () => {
        try {
          setIsLoading(true)
          const res = await fetch("/api/invoices?status=all", { cache: "no-store" })
          const data = await res.json()
          if (!cancelled) setInvoices(data.invoices ?? [])
        } catch (e: any) {
          toast.error(e?.message ?? "청구서 목록을 불러오지 못했습니다")
        } finally {
          if (!cancelled) setIsLoading(false)
        }
      })()
    return () => { cancelled = true }
  }, [])


  // Calculated stats
  const stats = useMemo(() => {
    const draft = invoices.filter(i => i.status === "초안")
    const issued = invoices.filter(i => i.status === "발행")
    const paid = invoices.filter(i => i.status === "입금완료")

    return {
      draftCount: draft.length,
      draftTotal: draft.reduce((sum, i) => sum + i.total, 0),
      issuedCount: issued.length,
      issuedTotal: issued.reduce((sum, i) => sum + i.total, 0),
      paidCount: paid.length,
      paidTotal: paid.reduce((sum, i) => sum + i.total, 0),
    }
  }, [invoices])

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase()

    return invoices.filter((inv) => {
      const matchesStatus = statusFilter === "all" || inv.status === statusFilter

      // ✅ 현장 필터: 대표현장(siteId) + 포함현장(siteIds)까지 매칭
      const invSiteIds = Array.isArray(inv.siteIds) ? inv.siteIds : []
      const matchesSite =
        siteFilter === "all" ||
        inv.siteId === siteFilter ||
        invSiteIds.includes(siteFilter)

      // ✅ 검색: 청구번호/표시현장(siteLabel)/포함현장(siteNames)/건설사
      const displaySite = (inv.siteLabel ?? inv.siteName ?? "").toLowerCase()
      const invSiteNames = Array.isArray(inv.siteNames) ? inv.siteNames : []
      const matchesSearch =
        q === "" ||
        inv.invoiceNumber.toLowerCase().includes(q) ||
        displaySite.includes(q) ||
        invSiteNames.some((n) => String(n).toLowerCase().includes(q)) ||
        inv.contractorName.toLowerCase().includes(q)

      return matchesStatus && matchesSite && matchesSearch
    })
  }, [invoices, statusFilter, siteFilter, search])


  // Line item handlers
  const updateLineItem = (index: number, updates: Partial<InvoiceLineItem>) => {
    setNewInvoiceLineItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], ...updates }
      // Recalculate amount
      if (updates.quantity !== undefined || updates.unitPrice !== undefined) {
        updated[index].amount = updated[index].quantity * updated[index].unitPrice
      }
      return updated
    })
  }

  const addLineItem = () => {
    setNewInvoiceLineItems(prev => [
      ...prev,
      { id: `new${Date.now()}`, category: "인건비", description: "", quantity: 1, unitPrice: 0, amount: 0 }
    ])
  }

  const removeLineItem = (index: number) => {
    if (newInvoiceLineItems.length > 1) {
      setNewInvoiceLineItems(prev => prev.filter((_, i) => i !== index))
    }
  }

  const calculateTotals = () => {
    const subtotal = newInvoiceLineItems.reduce((sum, item) => sum + item.amount, 0)
    const tax = Math.round(subtotal * 0.1)
    return { subtotal, tax, total: subtotal + tax }
  }

  const handleCreateInvoice = async () => {
    if (!newInvoiceSiteId) return toast.error("현장을 선택해주세요")
    if (!newInvoiceCompanyId) return toast.error("건설사(업체)를 선택해주세요")
    if (!newInvoiceCompanyName.trim()) return toast.error("건설사명이 비어있습니다(회사 선택을 다시 해주세요)")

    const lineItems = newInvoiceLineItems
      .filter(li => li.description.trim() !== "")
      .map(li => ({
        category: li.category,
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        amount: li.amount,
      }))

    if (lineItems.length === 0) return toast.error("청구 항목을 1개 이상 입력해주세요")

    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteId: newInvoiceSiteId,
          contractorName: newInvoiceCompanyName,
          notes: newInvoiceNotes,
          lineItems,
          attachments: newInvoiceAttachments,
        }),
      })
      const data = await res.json()
      if (!res.ok) return toast.error(data.error ?? "청구서 생성 실패")

      setInvoices((prev) => [data.invoice, ...prev])
      toast.success("청구서가 생성되었습니다")

      resetForm()
      setNewInvoiceAttachments([])
      setCreateDialogOpen(false)
    } catch (e: any) {
      toast.error(e?.message ?? "청구서 생성 실패")
    }
  }


  const resetForm = () => {

    setNewInvoiceSiteId("")
    setNewInvoiceNotes("")

    setNewInvoiceCompanyId("")
    setNewInvoiceCompanyName("")
    setNewInvoiceCompanyBizNo("")

    setNewInvoiceLineItems([
      { id: "new1", category: "인건비", description: "", quantity: 1, unitPrice: 0, amount: 0 }
    ])
  }

  const handleStatusChange = async (invoiceId: string, newStatus: InvoiceStatus) => {
    const res = await fetch(`/api/invoices/${invoiceId}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    const data = await res.json()
    if (!res.ok) return toast.error(data.error ?? "상태 변경 실패")

    setInvoices(prev => prev.map(inv => inv.id === invoiceId ? data.invoice : inv))
    toast.success(`청구서 상태가 "${newStatus}"(으)로 변경되었습니다`)
  }

  const handleDeleteInvoice = async (invoiceId: string) => {
    const res = await fetch(`/api/invoices/${invoiceId}`, { method: "DELETE" })
    const data = await res.json()
    if (!res.ok) return toast.error(data.error ?? "삭제 실패")

    setInvoices(prev => prev.filter(inv => inv.id !== invoiceId))
    toast.success("청구서가 삭제되었습니다")
  }


  const { subtotal, tax, total } = calculateTotals()

  return (
    <AppShell title="청구">
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 border-b border-border bg-background px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">건설사 청구</h1>
              <p className="text-sm text-muted-foreground mt-1">건설사에 발행할 청구서를 관리합니다</p>
            </div>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              수기 청구서 작성
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="shrink-0 border-b border-border bg-background px-6 py-4">
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-muted p-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">초안</p>
                    <p className="text-lg font-semibold">{formatKoreanMoney(stats.draftTotal)}</p>
                    <p className="text-xs text-muted-foreground">{stats.draftCount}건</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-status-waiting/10">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-status-waiting/20 p-2">
                    <Send className="h-4 w-4 text-status-waiting-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">발행 (미수금)</p>
                    <p className="text-lg font-semibold text-status-waiting-foreground">{formatKoreanMoney(stats.issuedTotal)}</p>
                    <p className="text-xs text-muted-foreground">{stats.issuedCount}건</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-status-progress/10">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-status-progress/20 p-2">
                    <CheckCircle2 className="h-4 w-4 text-status-progress-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">입금완료</p>
                    <p className="text-lg font-semibold text-status-progress-foreground">{formatKoreanMoney(stats.paidTotal)}</p>
                    <p className="text-xs text-muted-foreground">{stats.paidCount}건</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Filters */}
        <div className="shrink-0 border-b border-border bg-background px-6 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="청구서 번호/현장/건설사 검색"
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
                <SelectItem value="초안">초안</SelectItem>
                <SelectItem value="발행">발행</SelectItem>
                <SelectItem value="입금완료">입금완료</SelectItem>
              </SelectContent>
            </Select>
            <Select value={siteFilter} onValueChange={setSiteFilter}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue placeholder="현장" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 현장</SelectItem>
                {state.sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto text-sm text-muted-foreground">
              {isLoading ? "불러오는 중..." : `총 ${filteredInvoices.length}건`}
            </div>
          </div>
        </div>

        {/* Invoice List */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {filteredInvoices.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Receipt className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <h3 className="mb-2 text-lg font-semibold">청구서가 없습니다</h3>
              <p className="text-sm text-muted-foreground mb-4">
                새 청구서를 작성해보세요
              </p>
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                수기 청구서 작성
              </Button>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="min-w-[120px]">청구서 번호</TableHead>
                      <TableHead className="min-w-[150px]">현장</TableHead>
                      <TableHead className="min-w-[100px]">건설사</TableHead>
                      <TableHead className="min-w-[80px]">상태</TableHead>
                      <TableHead className="min-w-[100px]">발행일</TableHead>
                      <TableHead className="min-w-[100px]">만기일</TableHead>
                      <TableHead className="min-w-[120px] text-right">금액</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((invoice) => {
                      const StatusIcon = statusConfig[invoice.status].icon
                      return (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-mono text-sm">{invoice.invoiceNumber}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="truncate max-w-[140px]">
                                {invoice.siteLabel ?? invoice.siteName}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>{invoice.contractorName}</TableCell>
                          <TableCell>
                            <Badge className={cn("gap-1", statusConfig[invoice.status].color)}>
                              <StatusIcon className="h-3 w-3" />
                              {invoice.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {invoice.issueDate ? formatKoreanDate(invoice.issueDate) : "-"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {invoice.dueDate ? formatKoreanDate(invoice.dueDate) : "-"}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {formatKoreanMoney(invoice.total)}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {invoice.status === "초안" && (
                                  <DropdownMenuItem onClick={() => handleStatusChange(invoice.id, "발행")}>
                                    <Send className="mr-2 h-4 w-4" />
                                    발행하기
                                  </DropdownMenuItem>
                                )}
                                {invoice.status === "발행" && (
                                  <DropdownMenuItem onClick={() => handleStatusChange(invoice.id, "입금완료")}>
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    입금 확인
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => window.open(`/api/invoices/${invoice.id}/pdf`, "_blank")}>
                                  <Download className="mr-2 h-4 w-4" />
                                  PDF 다운로드
                                </DropdownMenuItem>
                                {invoice.status === "초안" && (
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => handleDeleteInvoice(invoice.id)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    삭제
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
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
      </div>

      {/* Create Invoice Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>새 청구서 작성</DialogTitle>
            <DialogDescription>건설사에 발행할 청구서를 작성합니다</DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            <div className="grid gap-6 py-4">
              {/* Basic Info */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>현장 선택</Label>
                  <Select value={newInvoiceSiteId} onValueChange={setNewInvoiceSiteId}>
                    <SelectTrigger>
                      <SelectValue placeholder="현장을 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {state.sites.filter(s => s.status !== "미진행").map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>건설사(업체)</Label>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setCompanyPickerOpen(true)}
                    >
                      {newInvoiceCompanyId ? "회사 변경" : "회사 선택"}
                    </Button>

                    {newInvoiceCompanyId ? (
                      <div className="min-w-0 text-sm">
                        <div className="truncate font-medium">{newInvoiceCompanyName}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          사업자번호: {newInvoiceCompanyBizNo}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        회사를 선택해 주세요.
                      </div>
                    )}
                  </div>

                  <CompanyPickerDialog
                    open={companyPickerOpen}
                    onOpenChange={setCompanyPickerOpen}
                    onPick={(c: any) => {
                      setNewInvoiceCompanyId(String(c.id))
                      setNewInvoiceCompanyName(String(c.name ?? ""))
                      setNewInvoiceCompanyBizNo(String(c.biz_no ?? ""))
                    }}
                  />
                </div>
              </div>

              <Separator />

              {/* Line Items */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>청구 항목</Label>
                  <Button variant="outline" size="sm" onClick={addLineItem}>
                    <Plus className="mr-1 h-3 w-3" />
                    항목 추가
                  </Button>
                </div>

                <div className="space-y-2">
                  {newInvoiceLineItems.map((item, index) => (
                    <div key={item.id} className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 sm:flex sm:items-start sm:gap-2">
                      <div className="flex gap-2">
                        <Select
                          value={item.category}
                          onValueChange={(v) => updateLineItem(index, { category: v as LineItemCategory })}
                        >
                          <SelectTrigger className="w-[100px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {lineItemCategories.map((cat) => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={item.description}
                          onChange={(e) => updateLineItem(index, { description: e.target.value })}
                          placeholder="내역"
                          className="flex-1"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 sm:justify-end">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateLineItem(index, { quantity: Number(e.target.value) })}
                            className="w-16 text-center"
                            min={1}
                          />
                          <Input
                            type="number"
                            value={item.unitPrice}
                            onChange={(e) => updateLineItem(index, { unitPrice: Number(e.target.value) })}
                            className="w-28"
                            placeholder="단가"
                          />
                        </div>
                        <div className="w-28 text-right text-sm font-medium py-2">
                          {formatKoreanMoney(item.amount)}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => removeLineItem(index)}
                          disabled={newInvoiceLineItems.length <= 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">소계</span>
                    <span>{formatKoreanMoney(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">부가세 (10%)</span>
                    <span>{formatKoreanMoney(tax)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span>합계</span>
                    <span className="text-lg">{formatKoreanMoney(total)}</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Notes */}
              <div className="grid gap-2">
                <Label>비고</Label>
                <Textarea
                  value={newInvoiceNotes}
                  onChange={(e) => setNewInvoiceNotes(e.target.value)}
                  placeholder="청구서에 대한 메모나 특이사항을 입력하세요"
                  rows={3}
                />
              </div>

              {/* Attachments placeholder */}
              <div className="grid gap-2">
                <Label>첨부파일</Label>

                <div
                  className={cn(
                    "flex items-center justify-center rounded-lg border border-dashed border-border p-6 text-center",
                    "cursor-pointer hover:bg-muted/30 transition"
                  )}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); void uploadFiles(e.dataTransfer.files) }}
                  onClick={() => document.getElementById("invoice-attach-input")?.click()}
                >
                  <input
                    id="invoice-attach-input"
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = e.target.files
                      if (files) void uploadFiles(files)
                      e.currentTarget.value = ""
                    }}
                  />
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Paperclip className="h-8 w-8" />
                    <p className="text-sm">파일을 드래그하거나 클릭하여 첨부</p>
                    <p className="text-xs">(PDF, 이미지 등 증빙자료)</p>
                    {isUploading && <p className="text-xs">업로드 중...</p>}
                  </div>
                </div>

                {newInvoiceAttachments.length > 0 && (
                  <div className="space-y-2">
                    {newInvoiceAttachments.map((att) => (
                      <div key={att.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{att.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{att.mime} · {Math.round(att.size / 1024)}KB</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => att.url && window.open(att.url, "_blank")} disabled={!att.url}>
                            <Download className="mr-2 h-4 w-4" />
                            열기
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setNewInvoiceAttachments(prev => prev.filter(x => x.id !== att.id))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-border pt-4 mt-4 flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => { resetForm(); setCreateDialogOpen(false) }}>
              취소
            </Button>
            <Button onClick={handleCreateInvoice}>
              <FileText className="mr-2 h-4 w-4" />
              초안 저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
