import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { jsonError } from "@/lib/server/dto"
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session"

type Attachment = {
  id: string
  name: string
  mime: string
  size: number
  path: string
  url?: string | null
  createdAt: string
}

type LineItemIn = {
  category: "인건비" | "장비" | "자재" | "기타"
  description: string
  quantity: number
  unitPrice: number
  amount: number
}

type CreateBody = {
  siteId: string
  contractorName: string
  notes?: string
  attachments?: Attachment[]
  lineItems: LineItemIn[]
}

function computeTotals(lineItems: { amount: number }[]) {
  const subtotal = Math.max(0, Math.round(lineItems.reduce((s, x) => s + Number(x.amount ?? 0), 0)))
  const tax = Math.round(subtotal * 0.1)
  const total = subtotal + tax
  return { subtotal, tax, total }
}

async function nextInvoiceNumber(officeId: string) {
  const year = new Date().getUTCFullYear()

  const { data: row, error: selErr } = await supabaseAdmin
    .from("invoice_counters")
    .select("office_id, year, seq")
    .eq("office_id", officeId)
    .eq("year", year)
    .maybeSingle()

  if (selErr) throw new Error(selErr.message)

  let nextSeq = 1
  if (!row) {
    const { error: insErr } = await supabaseAdmin
      .from("invoice_counters")
      .insert({ office_id: officeId, year, seq: 1 })
    if (insErr) throw new Error(insErr.message)
    nextSeq = 1
  } else {
    nextSeq = Number(row.seq ?? 0) + 1
    const { error: updErr } = await supabaseAdmin
      .from("invoice_counters")
      .update({ seq: nextSeq })
      .eq("office_id", officeId)
      .eq("year", year)
    if (updErr) throw new Error(updErr.message)
  }

  return `INV-${year}-${String(nextSeq).padStart(3, "0")}`
}

function assertAttachmentScope(officeId: string, attachments?: Attachment[]) {
  if (!attachments) return
  if (!Array.isArray(attachments)) throw new Error("attachments must be array")
  for (const a of attachments) {
    if (!a?.path?.startsWith(`${officeId}/`)) throw new Error("Invalid attachment path scope")
  }
}

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
    const session = verifySessionCookie(token)
    if (!session) return jsonError("Unauthorized", 401)

    const url = new URL(req.url)
    const status = url.searchParams.get("status") // 초안|발행|입금완료|pending|all
    const siteId = url.searchParams.get("siteId")
    const search = (url.searchParams.get("search") ?? "").trim()

    let q = supabaseAdmin
      .from("invoices")
      .select("id, office_id, site_id, invoice_number, contractor_name, status, issue_date, due_date, subtotal, tax, total, notes, attachments, created_at, updated_at, sites(name)")
      .eq("office_id", session.officeId)
      .order("created_at", { ascending: false })

    if (siteId) q = q.eq("site_id", siteId)

    if (status && status !== "all") {
      if (status === "pending") q = q.in("status", ["초안", "발행"])
      else q = q.eq("status", status)
    }

    if (search) {
      const s = search.replace(/%/g, "\\%").replace(/_/g, "\\_")
      q = q.or(`invoice_number.ilike.%${s}%,contractor_name.ilike.%${s}%,sites.name.ilike.%${s}%`)
    }

    const { data, error } = await q
    if (error) return jsonError(error.message, 500)

    const invoices = (data ?? []).map((r: any) => ({
      id: r.id,
      invoiceNumber: r.invoice_number,
      siteId: r.site_id,
      siteName: r.sites?.name ?? "",
      contractorName: r.contractor_name,
      status: r.status,
      issueDate: r.issue_date ?? "",
      dueDate: r.due_date ?? "",
      lineItems: [], // 목록에서는 미포함 (상세에서 로드)
      subtotal: Number(r.subtotal ?? 0),
      tax: Number(r.tax ?? 0),
      total: Number(r.total ?? 0),
      notes: r.notes ?? "",
      attachments: r.attachments ?? [],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }))

    return NextResponse.json({ invoices })
  } catch (e: any) {
    return jsonError(e?.message ?? "Failed to load invoices", 500)
  }
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
    const session = verifySessionCookie(token)
    if (!session) return jsonError("Unauthorized", 401)

    const body = (await req.json()) as CreateBody
    if (!body?.siteId) return jsonError("siteId is required", 400)
    if (!body?.contractorName?.trim()) return jsonError("contractorName is required", 400)
    if (!Array.isArray(body?.lineItems) || body.lineItems.length === 0) return jsonError("lineItems is required", 400)

    assertAttachmentScope(session.officeId, body.attachments)

    const normalizedItems = body.lineItems.map((li) => {
      const quantity = Number(li.quantity ?? 0)
      const unitPrice = Math.round(Number(li.unitPrice ?? 0))
      const amount = Math.round(Number(li.amount ?? quantity * unitPrice))
      return {
        category: li.category,
        description: li.description ?? "",
        quantity,
        unit_price: unitPrice,
        amount,
      }
    })

    const { subtotal, tax, total } = computeTotals(normalizedItems.map(x => ({ amount: Number(x.amount) })))

    // 유니크 충돌 대비 재시도
    let lastErr: any = null
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const invoiceNumber = await nextInvoiceNumber(session.officeId)

        const { data: inv, error: invErr } = await supabaseAdmin
          .from("invoices")
          .insert({
            office_id: session.officeId,
            site_id: body.siteId,
            invoice_number: invoiceNumber,
            contractor_name: body.contractorName.trim(),
            status: "초안",
            issue_date: null,
            due_date: null,
            subtotal,
            tax,
            total,
            notes: body.notes ?? "",
            attachments: body.attachments ?? [],
          })
          .select("*, sites(name)")
          .single()

        if (invErr) throw invErr

        const { data: items, error: itemsErr } = await supabaseAdmin
          .from("invoice_line_items")
          .insert(normalizedItems.map((x) => ({ invoice_id: inv.id, ...x })))
          .select("*")

        if (itemsErr) throw itemsErr

        return NextResponse.json({
          invoice: {
            id: inv.id,
            invoiceNumber: inv.invoice_number,
            siteId: inv.site_id,
            siteName: inv.sites?.name ?? "",
            contractorName: inv.contractor_name,
            status: inv.status,
            issueDate: inv.issue_date ?? "",
            dueDate: inv.due_date ?? "",
            lineItems: (items ?? []).map((it: any) => ({
              id: it.id,
              category: it.category,
              description: it.description ?? "",
              quantity: Number(it.quantity ?? 0),
              unitPrice: Number(it.unit_price ?? 0),
              amount: Number(it.amount ?? 0),
            })),
            subtotal: Number(inv.subtotal ?? 0),
            tax: Number(inv.tax ?? 0),
            total: Number(inv.total ?? 0),
            notes: inv.notes ?? "",
            attachments: inv.attachments ?? [],
            createdAt: inv.created_at,
            updatedAt: inv.updated_at,
          }
        })
      } catch (err: any) {
        lastErr = err
      }
    }

    return jsonError(lastErr?.message ?? "Failed to create invoice", 500)
  } catch (e: any) {
    return jsonError(e?.message ?? "Failed to create invoice", 500)
  }
}
