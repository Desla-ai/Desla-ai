import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session"

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}
function isYmd(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v)
}

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return jsonError("Unauthorized", 401)
  const s = session

  const body = await req.json().catch(() => ({}))
  const siteId = String(body?.siteId ?? "").trim()
  const siteName = String(body?.siteName ?? "").trim()
  const start = String(body?.start ?? body?.periodStart ?? "").trim()
  const end = String(body?.end ?? body?.periodEnd ?? "").trim()
  const method = String(body?.method ?? "BANK").trim()
  const memo = String(body?.memo ?? "").trim()

  // optionally support batchId from client (preferred once UI is updated)
  const batchIdFromBody = String(body?.settlementBatchId ?? body?.batchId ?? "").trim()

  if (!siteId) return jsonError("siteId is required", 400)
  if (!siteName) return jsonError("siteName is required", 400)
  if (!isYmd(start) || !isYmd(end)) return jsonError("start/end must be YYYY-MM-DD", 400)
  if (start > end) return jsonError("start must be <= end", 400)

  // 0) get-or-create batch
  let batchId = batchIdFromBody || ""
  let batchStatus: string | null = null

  if (batchId) {
    const { data: b, error } = await supabaseAdmin
      .from("settlement_batches")
      .select("id, status, site_id, period_start, period_end")
      .eq("office_id", s.officeId)
      .eq("id", batchId)
      .maybeSingle()

    if (error) return jsonError(error.message, 500)
    if (!b?.id) return jsonError("Invalid settlementBatchId", 400)

    if (String(b.site_id) !== siteId) return jsonError("settlementBatchId site mismatch", 400)
    if (String(b.period_start) !== start || String(b.period_end) !== end) {
      return jsonError("settlementBatchId period mismatch", 400)
    }

    batchStatus = b.status
  } else {
    const { data: b, error } = await supabaseAdmin
      .from("settlement_batches")
      .select("id, status")
      .eq("office_id", s.officeId)
      .eq("site_id", siteId)
      .eq("period_start", start)
      .eq("period_end", end)
      .maybeSingle()

    if (error) return jsonError(error.message, 500)

    if (b?.id) {
      batchId = b.id
      batchStatus = b.status
    } else {
      const { data: created, error: insErr } = await supabaseAdmin
        .from("settlement_batches")
        .insert([
          {
            office_id: s.officeId,
            site_id: siteId,
            period_start: start,
            period_end: end,
            status: "DRAFT",
            created_by_user_id: s.userId,
          },
        ])
        .select("id, status")
        .single()

      if (insErr) return jsonError(insErr.message, 500)
      batchId = created.id
      batchStatus = created.status
    }
  }

  if (batchStatus === "PAID") return jsonError("This settlement batch is already PAID", 409)

  // 1) payout 생성
  const { data: payout, error: pErr } = await supabaseAdmin
    .from("payouts")
    .insert([
      {
        office_id: s.officeId,
        site_id: siteId,
        period_start: start,
        period_end: end,
        settlement_batch_id: batchId,
        method,
        memo: memo || null,
        status: "CREATED",
        created_by_user_id: s.userId ?? null,
      },
    ])
    .select("id, created_at")
    .single()

  if (pErr) return jsonError(pErr.message, 500)

  // 2) batch의 payout_items(미지급)만 이 payout에 연결
  const { data: items, error: iErr } = await supabaseAdmin
    .from("payout_items")
    .select("id")
    .eq("office_id", s.officeId)
    .eq("settlement_batch_id", batchId)
    .is("payout_id", null)
    .eq("status", "ACCUMULATED")

  if (iErr) return jsonError(iErr.message, 500)
  const itemIds = (items ?? []).map((x: any) => x.id).filter(Boolean)

  if (itemIds.length === 0) {
    return NextResponse.json({ payoutId: payout.id, linked: 0, inserted: 0, note: "No payable items in batch" })
  }

  const { error: linkErr } = await supabaseAdmin
    .from("payout_items")
    .update({ payout_id: payout.id })
    .eq("office_id", s.officeId)
    .in("id", itemIds)

  if (linkErr) return jsonError(linkErr.message, 500)

  return NextResponse.json({ payoutId: payout.id, linked: itemIds.length, inserted: 0 })
}

export async function GET(req: Request) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return jsonError("Unauthorized", 401)
  const s = session

  const url = new URL(req.url)
  const siteId = String(url.searchParams.get("siteId") ?? "").trim()
  const start = String(url.searchParams.get("start") ?? "").trim()
  const end = String(url.searchParams.get("end") ?? "").trim()

  if (!siteId) return jsonError("siteId is required", 400)
  if ((start && !isYmd(start)) || (end && !isYmd(end))) return jsonError("start/end must be YYYY-MM-DD", 400)
  if (start && end && start > end) return jsonError("start must be <= end", 400)

  // payables: 현 기간 배치들의 payout_id NULL + ACCUMULATED
  let qPayables = supabaseAdmin
    .from("payout_items")
    .select(
      "id, site_id, payee_type, payee_id, payee_name, amount, status, created_at, period_start, period_end, settlement_batch_id"
    )
    .eq("office_id", s.officeId)
    .eq("site_id", siteId)
    .eq("status", "ACCUMULATED")
    .is("payout_id", null)
    .order("created_at", { ascending: false })

  if (start) qPayables = qPayables.lte("period_start", start).or(`period_end.gte.${start}`)
  if (end) qPayables = qPayables.gte("period_end", end).or(`period_start.lte.${end}`)

  const { data: payables, error: pErr } = await qPayables
  if (pErr) return jsonError(pErr.message, 500)

  // history: PAID payouts
  let qHistory = supabaseAdmin
    .from("payouts")
    .select("id, site_id, period_start, period_end, paid_at, paid_by_user_id, method, memo, status, settlement_batch_id")
    .eq("office_id", s.officeId)
    .eq("site_id", siteId)
    .eq("status", "PAID")
    .order("paid_at", { ascending: false })

  if (start) qHistory = qHistory.gte("period_start", start)
  if (end) qHistory = qHistory.lte("period_end", end)

  const { data: payouts, error: hErr } = await qHistory
  if (hErr) return jsonError(hErr.message, 500)

  const payoutIds = (payouts ?? []).map((x: any) => x.id).filter(Boolean)

  const paidByUserIds = Array.from(
    new Set((payouts ?? []).map((p: any) => p.paid_by_user_id).filter(Boolean))
  ) as string[]

  const userNameById = new Map<string, string>()
  if (paidByUserIds.length > 0) {
    const { data: users, error: uErr } = await supabaseAdmin
      .from("users")
      .select("id, username")
      .eq("office_id", s.officeId)
      .in("id", paidByUserIds)

    if (uErr) return jsonError(uErr.message, 500)
    for (const u of users ?? []) userNameById.set(u.id, u.username)
  }

  let paidItems: any[] = []
  if (payoutIds.length > 0) {
    const { data: items, error: iErr } = await supabaseAdmin
      .from("payout_items")
      .select("id, payout_id, payee_type, payee_name, amount, status, created_at, period_start, period_end")
      .eq("office_id", s.officeId)
      .eq("site_id", siteId)
      .eq("status", "PAID")
      .in("payout_id", payoutIds)

    if (iErr) return jsonError(iErr.message, 500)
    paidItems = items ?? []
  }

  const itemsByPayoutId = new Map<string, any[]>()
  for (const it of paidItems) {
    const pid = String(it.payout_id ?? "")
    if (!pid) continue
    const arr = itemsByPayoutId.get(pid) ?? []
    arr.push(it)
    itemsByPayoutId.set(pid, arr)
  }

  const history = (payouts ?? []).map((p: any) => {
    const pid = String(p.id)
    const its = itemsByPayoutId.get(pid) ?? []
    const mappedItems = its.map((it: any) => ({
      payableItemId: it.id,
      payeeType: it.payee_type,
      payeeName: it.payee_name,
      amount: it.amount,
      paidByUserName: userNameById.get(p.paid_by_user_id) ?? "",
    }))
    const totalAmount = mappedItems.reduce((sum: number, x: any) => sum + (Number(x.amount) || 0), 0)

    return {
      id: pid,
      paidAt: p.paid_at ?? null,
      paidByUserId: p.paid_by_user_id ?? null,
      paidByUserName: userNameById.get(p.paid_by_user_id) ?? "",
      siteId: p.site_id,
      siteName: "",
      period: String(p.period_start ?? "").slice(0, 7),
      items: mappedItems,
      totalAmount,
      memo: p.memo ?? undefined,
      method: p.method ?? "",
      settlementBatchId: p.settlement_batch_id ?? null,
    }
  })

  return NextResponse.json({
    payables: (payables ?? []).map((x: any) => ({
      id: x.id,
      siteId: x.site_id,
      siteName: "",
      period: `${String(x.period_start).slice(0, 7)}`,
      payeeType: x.payee_type,
      payeeId: x.payee_id,
      payeeName: x.payee_name,
      amount: x.amount,
      status: x.status,
      createdAt: x.created_at,
      settlementBatchId: x.settlement_batch_id ?? null,
    })),
    history,
  })
}
