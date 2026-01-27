"use client"

import { useState, useMemo } from "react"
import { AppShell } from "@/components/layout/app-shell"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
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
  contractorName: string
  status: InvoiceStatus
  issueDate: string
  dueDate: string
  lineItems: InvoiceLineItem[]
  subtotal: number
  tax: number
  total: number
  notes: string
  attachments: string[]
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
  const [invoices, setInvoices] = useState<Invoice[]>([
    {
      id: "inv1",
      invoiceNumber: "INV-2025-001",
      siteId: "s1",
      siteName: "강남 오피스텔 신축현장",
      contractorName: "대림건설",
      status: "발행",
      issueDate: "2025-01-15",
      dueDate: "2025-02-15",
      lineItems: [
        { id: "li1", category: "인건비", description: "일용직 인건비 (1/1~1/15)", quantity: 15, unitPrice: 200000, amount: 3000000 },
        { id: "li2", category: "장비", description: "크레인 임대료", quantity: 1, unitPrice: 500000, amount: 500000 },
      ],
      subtotal: 3500000,
      tax: 350000,
      total: 3850000,
      notes: "1월 전반기 청구분",
      attachments: [],
      createdAt: "2025-01-15T09:00:00Z",
      updatedAt: "2025-01-15T09:00:00Z",
    },
    {
      id: "inv2",
      invoiceNumber: "INV-2025-002",
      siteId: "s2",
      siteName: "판교 테크노밸리 2차",
      contractorName: "GS건설",
      status: "초안",
      issueDate: "",
      dueDate: "",
      lineItems: [
        { id: "li3", category: "인건비", description: "일용직 인건비 (1/16~1/31)", quantity: 20, unitPrice: 200000, amount: 4000000 },
      ],
      subtotal: 4000000,
      tax: 400000,
      total: 4400000,
      notes: "",
      attachments: [],
      createdAt: "2025-01-28T09:00:00Z",
      updatedAt: "2025-01-28T09:00:00Z",
    },
    {
      id: "inv3",
      invoiceNumber: "INV-2024-045",
      siteId: "s3",
      siteName: "송파 아파트 리모델링",
      contractorName: "현대건설",
      status: "입금완료",
      issueDate: "2024-12-20",
      dueDate: "2025-01-20",
      lineItems: [
        { id: "li4", category: "인건비", description: "12월 인건비", quantity: 10, unitPrice: 200000, amount: 2000000 },
        { id: "li5", category: "자재", description: "안전장비", quantity: 5, unitPrice: 50000, amount: 250000 },
      ],
      subtotal: 2250000,
      tax: 225000,
      total: 2475000,
      notes: "완료",
      attachments: ["receipt.pdf"],
      createdAt: "2024-12-20T09:00:00Z",
      updatedAt: "2025-01-22T14:30:00Z",
    },
  ])

  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [siteFilter, setSiteFilter] = useState<string>("all")
  const [search, setSearch] = useState("")

  // Create invoice dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  
  // New invoice form
  const [newInvoiceSiteId, setNewInvoiceSiteId] = useState("")
  const [newInvoiceContractor, setNewInvoiceContractor] = useState("")
  const [newInvoiceNotes, setNewInvoiceNotes] = useState("")
  const [newInvoiceLineItems, setNewInvoiceLineItems] = useState<InvoiceLineItem[]>([
    { id: "new1", category: "인건비", description: "", quantity: 1, unitPrice: 0, amount: 0 }
  ])

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
    return invoices.filter(inv => {
      const matchesStatus = statusFilter === "all" || inv.status === statusFilter
      const matchesSite = siteFilter === "all" || inv.siteId === siteFilter
      const matchesSearch = search === "" || 
        inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
        inv.siteName.toLowerCase().includes(search.toLowerCase()) ||
        inv.contractorName.toLowerCase().includes(search.toLowerCase())
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

  const handleCreateInvoice = () => {
    if (!newInvoiceSiteId) {
      toast.error("현장을 선택해주세요")
      return
    }
    if (!newInvoiceContractor.trim()) {
      toast.error("건설사명을 입력해주세요")
      return
    }
    
    const site = state.sites.find(s => s.id === newInvoiceSiteId)
    const { subtotal, tax, total } = calculateTotals()
    
    const newInvoice: Invoice = {
      id: `inv${Date.now()}`,
      invoiceNumber: `INV-2025-${String(invoices.length + 1).padStart(3, "0")}`,
      siteId: newInvoiceSiteId,
      siteName: site?.name || "",
      contractorName: newInvoiceContractor,
      status: "초안",
      issueDate: "",
      dueDate: "",
      lineItems: newInvoiceLineItems.filter(li => li.description.trim() !== ""),
      subtotal,
      tax,
      total,
      notes: newInvoiceNotes,
      attachments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    
    setInvoices(prev => [newInvoice, ...prev])
    toast.success("청구서가 생성되었습니다")
    resetForm()
    setCreateDialogOpen(false)
  }

  const resetForm = () => {
    setNewInvoiceSiteId("")
    setNewInvoiceContractor("")
    setNewInvoiceNotes("")
    setNewInvoiceLineItems([
      { id: "new1", category: "인건비", description: "", quantity: 1, unitPrice: 0, amount: 0 }
    ])
  }

  const handleStatusChange = (invoiceId: string, newStatus: InvoiceStatus) => {
    setInvoices(prev => prev.map(inv => {
      if (inv.id === invoiceId) {
        const updates: Partial<Invoice> = { 
          status: newStatus,
          updatedAt: new Date().toISOString()
        }
        if (newStatus === "발행" && !inv.issueDate) {
          updates.issueDate = new Date().toISOString().split("T")[0]
          // Default due date: 30 days from issue
          const dueDate = new Date()
          dueDate.setDate(dueDate.getDate() + 30)
          updates.dueDate = dueDate.toISOString().split("T")[0]
        }
        return { ...inv, ...updates }
      }
      return inv
    }))
    toast.success(`청구서 상태가 "${newStatus}"(으)로 변경되었습니다`)
  }

  const handleDeleteInvoice = (invoiceId: string) => {
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
              청구서 작성
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
              총 {filteredInvoices.length}건
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
                청구서 작성
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
                              <span className="truncate max-w-[140px]">{invoice.siteName}</span>
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
                                <DropdownMenuItem>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>새 청구서 작성</DialogTitle>
            <DialogDescription>건설사에 발행할 청구서를 작성합니다</DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 -mx-6 px-6">
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
                  <Label>건설사명</Label>
                  <Input
                    value={newInvoiceContractor}
                    onChange={(e) => setNewInvoiceContractor(e.target.value)}
                    placeholder="예: 대림건설"
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
                    <div key={item.id} className="flex items-start gap-2 rounded-lg border border-border p-3">
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
                <div className="flex items-center justify-center rounded-lg border border-dashed border-border p-6 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Paperclip className="h-8 w-8" />
                    <p className="text-sm">파일을 드래그하거나 클릭하여 첨부</p>
                    <p className="text-xs">(PDF, 이미지 등 증빙자료)</p>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="border-t border-border pt-4 mt-4">
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
