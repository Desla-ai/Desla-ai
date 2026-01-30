// lib/server/invoice-dto.ts
export type InvoiceStatus = "초안" | "발행" | "입금완료"

export type InvoiceLineItemDTO = {
  id: string
  category: "인건비" | "장비" | "자재" | "기타"
  description: string
  quantity: number
  unitPrice: number
  amount: number
}

export type InvoiceDTO = {
  id: string
  officeId: string
  siteId: string
  siteName: string | null

  invoiceNumber: string
  contractorName: string
  status: InvoiceStatus

  issueDate: string | null
  dueDate: string | null

  subtotal: number
  tax: number
  total: number

  notes: string
  attachments: any[]

  lineItems: InvoiceLineItemDTO[]

  createdAt: string
  updatedAt: string
}

export function toInvoiceLineItemDTO(row: any): InvoiceLineItemDTO {
  return {
    id: row.id,
    category: row.category,
    description: row.description ?? "",
    quantity: Number(row.quantity ?? 0),
    unitPrice: Number(row.unit_price ?? 0),
    amount: Number(row.amount ?? 0),
  }
}

export function toInvoiceDTO(row: any): InvoiceDTO {
  const siteName = row?.sites?.name ?? null

  return {
    id: row.id,
    officeId: row.office_id,
    siteId: row.site_id,
    siteName,

    invoiceNumber: row.invoice_number,
    contractorName: row.contractor_name,
    status: row.status,

    issueDate: row.issue_date ?? null,
    dueDate: row.due_date ?? null,

    subtotal: Number(row.subtotal ?? 0),
    tax: Number(row.tax ?? 0),
    total: Number(row.total ?? 0),

    notes: row.notes ?? "",
    attachments: row.attachments ?? [],

    lineItems: Array.isArray(row.invoice_line_items)
      ? row.invoice_line_items.map(toInvoiceLineItemDTO)
      : [],

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
