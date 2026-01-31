import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { jsonError } from "@/lib/server/dto"
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session"
import { buildLaborInvoiceAgg } from "@/lib/server/labor-invoice-agg"

// 간단 합계
function computeTotals(lineItems: { amount: number }[]) {
  const subtotal = Math.max(0, Math.round(lineItems.reduce((s, x) => s + Number(x.amount ?? 0), 0)))
  const tax = Math.round(subtotal * 0.1)
  const total = subtotal + tax
  return { subtotal, tax, total }
}

// 간단 번호(기존 nextInvoiceNumber를 여기로 복사하거나, 공용 모듈로 빼는 걸 추천)
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
    const { error: insErr } = await supabaseAdmin.from("invoice_counters").insert({ office_id: officeId, year, seq: 1 })
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

type Body = {
  companyId: string
  periodStart: string // YYYY-MM-DD
  periodEnd: string   // YYYY-MM-DD
  siteId?: string
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
    const session = verifySessionCookie(token)
    if (!session) return jsonError("Unauthorized", 401)

    const body = (await req.json()) as Body
    const companyId = String(body?.companyId ?? "").trim()
    const siteId = String(body?.siteId ?? "").trim()
    const periodStart = String(body?.periodStart ?? "").trim()
    const periodEnd = String(body?.periodEnd ?? "").trim()

    if (!companyId) return jsonError("companyId is required", 400)
    if (!periodStart || !periodEnd) return jsonError("periodStart/periodEnd is required", 400)

    // ✅ 공용 집계로 LABOR_INVOICE meta 구성 (직종/날짜 그리드 포함)
    const { agg, sites, companyName } = await buildLaborInvoiceAgg({
      supabaseAdmin,
      officeId: session.officeId,
      companyId,
      periodStart,
      periodEnd,
      siteId: siteId || undefined,
    })

    // 대표 현장: 최소 버전은 첫 번째
    // (원하면 agg.roleRows/gross 등을 이용해 “gross 최대 현장”으로 고도화 가능)
    const 대표현장Id = sites[0]?.id
    if (!대표현장Id) return jsonError("No sites linked", 409)

    // gross(세전) 기준으로 line item 생성 (청구 탭 목록/합계는 이걸로 유지)
    // - meta.grids는 PDF 양식용(날짜/직종별 출역)
    const gross = Math.round(agg.gross)
    if (gross <= 0) return jsonError("No settlements in period", 409)

    const 현장수 = sites.length

    const lineItems = [
      {
        category: "인건비" as const,
        description: siteId
          ? `노무비 (${agg.siteName ?? sites?.[0]?.name ?? "현장"})`
          : `노무비 (회사 통합, 현장 ${현장수}개)`,
        quantity: 1,
        unitPrice: gross,
        amount: gross,
      },
    ]

    const { subtotal, tax, total } = computeTotals(lineItems)

    const invoiceNumber = await nextInvoiceNumber(session.officeId)

    // ✅ invoices 저장 (meta 포함)
    const { data: invoiceRow, error: invErr } = await supabaseAdmin
      .from("invoices")
      .insert({
        office_id: session.officeId,
        site_id: 대표현장Id,
        invoice_number: invoiceNumber,
        contractor_name: companyName,
        status: "초안",
        notes: `기간: ${periodStart}~${periodEnd}` + (siteId ? "" : ` / 회사 통합(현장 ${현장수}개)`),
        subtotal,
        tax,
        total,
        attachments: [],
        meta: agg, // ✅ 핵심: LABOR_INVOICE 그리드/집계 저장
      })
      .select("id, invoice_number, site_id, contractor_name, status, subtotal, tax, total, notes, meta, created_at, updated_at")
      .single()

    if (invErr) return jsonError(invErr.message, 500)

    // invoice_line_items 저장
    const { error: liErr } = await supabaseAdmin.from("invoice_line_items").insert(
      lineItems.map((li) => ({
        invoice_id: invoiceRow.id,
        category: li.category,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unitPrice,
        amount: li.amount,
      }))
    )
    if (liErr) return jsonError(liErr.message, 500)

    return NextResponse.json({
      invoice: {
        id: invoiceRow.id,
        invoiceNumber: invoiceRow.invoice_number,
        siteId: invoiceRow.site_id,
        siteName: sites.find((s: any) => String(s.id) === String(invoiceRow.site_id))?.name ?? "",
        contractorName: invoiceRow.contractor_name,
        status: invoiceRow.status,
        issueDate: "",
        dueDate: "",
        lineItems,
        subtotal: Number(invoiceRow.subtotal ?? 0),
        tax: Number(invoiceRow.tax ?? 0),
        total: Number(invoiceRow.total ?? 0),
        notes: invoiceRow.notes ?? "",
        attachments: [],
        meta: invoiceRow.meta ?? {}, // ✅ 디버깅/프론트 분기용
        createdAt: invoiceRow.created_at,
        updatedAt: invoiceRow.updated_at,
      },
    })
  } catch (e: any) {
    return jsonError(e?.message ?? "Failed to create invoice from company", 500)
  }
}
