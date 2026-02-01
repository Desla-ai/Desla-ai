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

// -------------------------
// Helpers
// -------------------------
function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr))
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v
    .map((x) => (typeof x === "string" ? x : x == null ? "" : String(x)))
    .map((s) => s.trim())
    .filter(Boolean)
}

function extractLaborInvoiceSitesFromMeta(meta: any): { siteIds: string[]; siteNames: string[] } {
  if (!meta || meta.kind !== "LABOR_INVOICE") return { siteIds: [], siteNames: [] }

  // 1) meta.sites 우선
  if (Array.isArray(meta.sites)) {
    const siteIds = uniq(asStringArray(meta.sites.map((s: any) => s?.id)))
    const siteNames = uniq(asStringArray(meta.sites.map((s: any) => s?.name)))
    return { siteIds, siteNames }
  }

  // 2) meta.roleRows에서 unique 추출
  if (Array.isArray(meta.roleRows)) {
    const siteIds = uniq(asStringArray(meta.roleRows.map((r: any) => r?.siteId ?? r?.site_id)))
    const siteNames = uniq(asStringArray(meta.roleRows.map((r: any) => r?.siteName ?? r?.site_name)))
    return { siteIds, siteNames }
  }

  return { siteIds: [], siteNames: [] }
}

function buildSiteLabel(primarySiteName: string, siteNames: string[]) {
  const names = siteNames.filter(Boolean)
  if (names.length <= 1) return primarySiteName || names[0] || ""
  const head = primarySiteName || names[0] || ""
  return `${head} 외 ${names.length - 1}건`
}

function buildInvoiceSiteSummary(row: any) {
  const primarySiteName = row?.sites?.name ?? ""
  const meta = row?.meta ?? {}

  if (meta?.kind !== "LABOR_INVOICE") {
    return {
      siteLabel: primarySiteName,
      siteIds: row?.site_id ? [String(row.site_id)] : [],
      siteNames: primarySiteName ? [String(primarySiteName)] : [],
      siteCount: row?.site_id ? 1 : 0,
    }
  }

  const { siteIds, siteNames } = extractLaborInvoiceSitesFromMeta(meta)
  const siteCount = siteNames.length || siteIds.length || 0
  const siteLabel = buildSiteLabel(
    primarySiteName,
    siteNames.length ? siteNames : [primarySiteName].filter(Boolean)
  )

  return { siteLabel, siteIds, siteNames, siteCount }
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

// -------------------------
// GET /api/invoices
// -------------------------
export async function GET(req: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
    const session = verifySessionCookie(token)
    if (!session) return jsonError("Unauthorized", 401)

    const url = new URL(req.url)
    const status = url.searchParams.get("status") // 초안|발행|입금완료|pending|all
    const siteId = (url.searchParams.get("siteId") ?? "").trim()
    const search = (url.searchParams.get("search") ?? "").trim()

    // NOTE:
    // - siteId/search 를 DB에서만 처리하면 LABOR_INVOICE(통합)에서 누락될 수 있어
    // - 그래서 DB에서는 status만 걸고,
    // - siteId/search는 "대표현장/대표현장명 + meta(포함현장)"까지 서버 후처리로 보강한다.
    let q = supabaseAdmin
      .from("invoices")
      .select(
        "id, office_id, site_id, invoice_number, contractor_name, status, issue_date, due_date, subtotal, tax, total, notes, attachments, meta, created_at, updated_at, sites(name)"
      )
      .eq("office_id", session.officeId)
      .order("created_at", { ascending: false })

    if (status && status !== "all") {
      if (status === "pending") q = q.in("status", ["초안", "발행"])
      else q = q.eq("status", status)
    }

    // DB 검색은 대표 필드로 1차만 (성능)
    if (search) {
      const s = search.replace(/%/g, "\\%").replace(/_/g, "\\_")
      q = q.or(`invoice_number.ilike.%${s}%,contractor_name.ilike.%${s}%,sites.name.ilike.%${s}%`)
    }

    const { data, error } = await q
    if (error) return jsonError(error.message, 500)

    // meta 기반 site summary 포함
    let rows = (data ?? []).map((r: any) => ({ ...r, ...buildInvoiceSiteSummary(r) }))

    // 서버 후처리: siteId(포함현장까지)
    if (siteId) {
      rows = rows.filter((r: any) => {
        if (String(r.site_id ?? "") === siteId) return true
        const ids = asStringArray((r as any).siteIds)
        return ids.includes(siteId)
      })
    }

    // 서버 후처리: search(포함현장명까지)
    if (search) {
      const qLower = search.toLowerCase()
      rows = rows.filter((r: any) => {
        const invoiceNo = String(r.invoice_number ?? "").toLowerCase()
        const contractor = String(r.contractor_name ?? "").toLowerCase()
        const primarySite = String(r.sites?.name ?? "").toLowerCase()

        const siteLabel = String((r as any).siteLabel ?? "").toLowerCase()
        const siteNames = asStringArray((r as any).siteNames).map((x) => x.toLowerCase())

        return (
          invoiceNo.includes(qLower) ||
          contractor.includes(qLower) ||
          primarySite.includes(qLower) ||
          siteLabel.includes(qLower) ||
          siteNames.some((n) => n.includes(qLower))
        )
      })
    }

    const invoices = rows.map((r: any) => ({
      id: r.id,
      invoiceNumber: r.invoice_number,

      siteId: r.site_id,
      siteName: r.sites?.name ?? "",

      // ✅ 추가: 통합 노무비(다현장) 표시/검색/필터를 위한 필드
      siteLabel: r.siteLabel ?? (r.sites?.name ?? ""),
      siteIds: asStringArray(r.siteIds),
      siteNames: asStringArray(r.siteNames),
      siteCount: Number(r.siteCount ?? 0),

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

// -------------------------
// POST /api/invoices (수기 생성)
// -------------------------
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

    // 1) siteId가 현재 office 소속인지 검증
    const { data: site, error: siteErr } = await supabaseAdmin
      .from("sites")
      .select("id, office_id, name")
      .eq("id", siteId)
      .eq("office_id", session.officeId)
      .maybeSingle()

    if (siteErr) return jsonError(siteErr.message, 500)
    if (!site) return jsonError("Invalid siteId or access denied", 403)

    // 2) attachments 스코프 검증
    const attachments = Array.isArray(body?.attachments) ? body.attachments : []
    try {
      assertAttachmentScope(session.officeId, attachments)
    } catch (e: any) {
      return jsonError(e?.message ?? "Invalid attachment scope", 400)
    }

    // 3) lineItems 정규화 + amount 서버 재계산
    const normalized = inItems
      .map((li: any) => {
        const category = li?.category
        const description = String(li?.description ?? "").trim()

        const quantity = Math.max(0, Number(li?.quantity ?? 0))
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

    // 4) totals 계산
    const { subtotal, tax, total } = computeTotals(normalized)

    // 5) invoiceNumber 생성 (중복시 재시도)
    let lastErr: any = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const invoiceNumber = await nextInvoiceNumber(session.officeId)

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
            attachments,
          })
          .select(
            "id, office_id, site_id, invoice_number, contractor_name, status, issue_date, due_date, subtotal, tax, total, notes, attachments, created_at, updated_at"
          )
          .single()

        if (invErr) throw invErr

        const { error: liErr } = await supabaseAdmin.from("invoice_line_items").insert(
          normalized.map((li) => ({
            invoice_id: invoiceRow.id,
            category: li.category,
            description: li.description,
            quantity: li.quantity,
            unit_price: li.unitPrice,
            amount: li.amount,
          }))
        )
        if (liErr) throw liErr

        return NextResponse.json({
          invoice: {
            id: invoiceRow.id,
            invoiceNumber: invoiceRow.invoice_number,
            siteId: invoiceRow.site_id,
            siteName: site?.name ?? "",

            // 수기는 단일 현장이므로 라벨은 siteName 동일
            siteLabel: site?.name ?? "",
            siteIds: siteId ? [siteId] : [],
            siteNames: site?.name ? [site.name] : [],
            siteCount: 1,

            contractorName: invoiceRow.contractor_name,
            status: invoiceRow.status,
            issueDate: invoiceRow.issue_date ?? null,
            dueDate: invoiceRow.due_date ?? null,
            lineItems: normalized.map((li, idx) => ({
              id: `tmp-${idx}`,
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
        if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) continue
        break
      }
    }

    return jsonError(lastErr?.message ?? "Failed to create invoice", 500)
  } catch (e: any) {
    return jsonError(e?.message ?? "Failed to create invoice", 500)
  }
}
