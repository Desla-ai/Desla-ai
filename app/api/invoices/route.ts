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

    // 0) 기본 필수값 검증
    const siteId = String(body?.siteId ?? "").trim()
    if (!siteId) return jsonError("siteId is required", 400)

    const contractorName = String(body?.contractorName ?? "").trim()
    if (!contractorName) return jsonError("contractorName is required", 400)

    const inItems = Array.isArray(body?.lineItems) ? body.lineItems : []
    if (inItems.length === 0) return jsonError("lineItems is required", 400)

    // 1) ✅ siteId가 현재 office 소속인지 검증 (이거 빠지면 '상관없는 청구서' 바로 발생)
    const { data: site, error: siteErr } = await supabaseAdmin
      .from("sites")
      .select("id, office_id, name")
      .eq("id", siteId)
      .eq("office_id", session.officeId)
      .maybeSingle()

    if (siteErr) return jsonError(siteErr.message, 500)
    if (!site) return jsonError("Invalid siteId or access denied", 403)

    // 2) ✅ attachments 스코프 검증 (jsonb 배열)
    const attachments = Array.isArray(body?.attachments) ? body.attachments : []
    try {
      assertAttachmentScope(session.officeId, attachments)
    } catch (e: any) {
      return jsonError(e?.message ?? "Invalid attachment scope", 400)
    }

    // 3) ✅ lineItems 정규화 + amount 서버 재계산 (numeric/bigint 스키마에 맞춤)
    const normalized = inItems
      .map((li: any) => {
        const category = li?.category
        const description = String(li?.description ?? "").trim()

        // quantity: numeric
        const quantity = Math.max(0, Number(li?.quantity ?? 0))

        // unit_price/amount: bigint (정수로 강제)
        const unitPrice = Math.max(0, Math.round(Number(li?.unitPrice ?? 0)))

        if (!description) return null

        const amount = Math.round(quantity * unitPrice)

        return { category, description, quantity, unitPrice, amount }
      })
      .filter(Boolean) as Array<{
        category: "인건비" | "장비" | "자재" | "기타"
        description: string
        quantity: number
        unitPrice: number
        amount: number
      }>

    if (normalized.length === 0) return jsonError("At least 1 line item is required", 400)

    // 4) ✅ totals 계산(클라 amount 신뢰 X)
    const { subtotal, tax, total } = computeTotals(normalized)

    // 5) ✅ invoiceNumber 생성(레이스 간이 대응: 중복시 재시도)
    //    + invoices.office_id는 반드시 session.officeId
    let lastErr: any = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const invoiceNumber = await nextInvoiceNumber(session.officeId)

        // invoices insert
        const { data: invoiceRow, error: invErr } = await supabaseAdmin
          .from("invoices")
          .insert({
            office_id: session.officeId,
            site_id: siteId,
            invoice_number: invoiceNumber,
            contractor_name: contractorName,
            status: "초안",
            notes: String(body?.notes ?? ""),
            subtotal,
            tax,
            total,
            attachments, // jsonb
          })
          .select("id, office_id, site_id, invoice_number, contractor_name, status, issue_date, due_date, subtotal, tax, total, notes, attachments, created_at, updated_at")
          .single()

        if (invErr) throw invErr

        // invoice_line_items insert
        const { error: liErr } = await supabaseAdmin.from("invoice_line_items").insert(
          normalized.map((li) => ({
            invoice_id: invoiceRow.id,
            category: li.category,
            description: li.description,
            quantity: li.quantity,            // numeric
            unit_price: li.unitPrice,         // bigint
            amount: li.amount,                // bigint
          }))
        )
        if (liErr) throw liErr

        // 응답: BillingPage가 기대하는 형태로 맞추기
        return NextResponse.json({
          invoice: {
            id: invoiceRow.id,
            invoiceNumber: invoiceRow.invoice_number,
            siteId: invoiceRow.site_id,
            siteName: site?.name ?? "", // 있으면 넣어주면 프론트에서 좋아함
            contractorName: invoiceRow.contractor_name,
            status: invoiceRow.status,
            issueDate: invoiceRow.issue_date ?? null,
            dueDate: invoiceRow.due_date ?? null,
            lineItems: normalized.map((li, idx) => ({
              id: `tmp-${idx}`, // DB에서 line_items를 다시 select해서 내려주면 더 좋음
              category: li.category,
              description: li.description,
              quantity: li.quantity,
              unitPrice: li.unitPrice,
              amount: li.amount,
            })),
            subtotal: invoiceRow.subtotal,
            tax: invoiceRow.tax,
            total: invoiceRow.total,
            notes: invoiceRow.notes,
            attachments: invoiceRow.attachments ?? [],
            createdAt: invoiceRow.created_at,
            updatedAt: invoiceRow.updated_at,
          },
        })
      } catch (e: any) {
        lastErr = e
        const msg = String(e?.message ?? e)
        // 유니크 인덱스 걸면 여기서 중복 뜨면 재시도 가능
        if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) continue
        break
      }
    }

    return jsonError(lastErr?.message ?? "Failed to create invoice", 500)

  } catch (e: any) {
    return jsonError(e?.message ?? "Failed to create invoice", 500)
  }
}
