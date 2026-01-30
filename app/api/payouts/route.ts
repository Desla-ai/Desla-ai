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

async function getNormalBatchOrCreate(params: {
  officeId: string
  siteId: string
  start: string
  end: string
  userId?: string | null
}) {
  const { officeId, siteId, start, end, userId } = params

  const { data: rows, error } = await supabaseAdmin
    .from("settlement_batches")
    .select("id, status, site_id, period_start, period_end, created_at, batch_kind, adjustment_seq")
    .eq("office_id", officeId)
    .eq("site_id", siteId)
    .eq("period_start", start)
    .eq("period_end", end)
    .eq("batch_kind", "NORMAL")
    .eq("adjustment_seq", 0)
    .order("created_at", { ascending: false })
    .limit(1)

  if (error) return { error }
  const found = rows?.[0] ?? null
  if (found?.id) return { batch: found }

  const { error: insErr } = await supabaseAdmin.from("settlement_batches").insert([
    {
      office_id: officeId,
      site_id: siteId,
      period_start: start,
      period_end: end,
      status: "DRAFT",
      created_by_user_id: userId ?? null,
      batch_kind: "NORMAL",
      adjustment_seq: 0,
    },
  ])

  if (insErr) return { error: insErr }

  const { data: rows2, error: findErr2 } = await supabaseAdmin
    .from("settlement_batches")
    .select("id, status, site_id, period_start, period_end, created_at, batch_kind, adjustment_seq")
    .eq("office_id", officeId)
    .eq("site_id", siteId)
    .eq("period_start", start)
    .eq("period_end", end)
    .eq("batch_kind", "NORMAL")
    .eq("adjustment_seq", 0)
    .order("created_at", { ascending: false })
    .limit(1)

  if (findErr2) return { error: findErr2 }
  const created = rows2?.[0] ?? null
  if (!created?.id) return { error: { message: "Failed to create settlement batch" } as any }

  return { batch: created }
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

  const payableItemIds = Array.isArray(body?.payableItemIds)
    ? (body.payableItemIds as any[]).map((x) => String(x)).filter(Boolean)
    : []

  const batchIdFromBody = String(body?.settlementBatchId ?? body?.batchId ?? "").trim()

  if (!siteId) return jsonError("siteId is required", 400)
  if (!siteName) return jsonError("siteName is required", 400)
  if (!isYmd(start) || !isYmd(end)) return jsonError("start/end must be YYYY-MM-DD", 400)
  if (start > end) return jsonError("start must be <= end", 400)

  if (payableItemIds.length === 0) {
    return jsonError("payableItemIds is required for individual payout", 400)
  }

  // 0) Resolve settlement_batch_id from payableItemIds (source of truth)
  //    - 절대 기간(periodStart/End)로 batch를 먼저 고르지 말 것
  //    - 선택한 payout_items가 속한 배치로 payout을 생성해야 함
  const { data: chosenItems, error: chosenErr } = await supabaseAdmin
    .from("payout_items")
    .select("id, settlement_batch_id, status, payout_id, site_id, period_start, period_end")
    .eq("office_id", s.officeId)
    .eq("site_id", siteId)
    .in("id", payableItemIds)

  if (chosenErr) return jsonError(chosenErr.message, 500)

  if (!chosenItems || chosenItems.length !== payableItemIds.length) {
    return jsonError(
      `Invalid payableItemIds. requested=${payableItemIds.length}, found=${chosenItems?.length ?? 0}`,
      400
    )
  }

  // 0-1) all selected items must belong to the same settlement_batch_id
  const batchIdSet = new Set<string>()
  for (const it of chosenItems) {
    const bid = String(it.settlement_batch_id ?? "")
    if (!bid) return jsonError("Selected items must have settlement_batch_id", 400)
    batchIdSet.add(bid)
  }
  if (batchIdSet.size !== 1) {
    return jsonError("Selected items span multiple settlement batches. Select items from one batch only.", 400)
  }

  const batchId = Array.from(batchIdSet)[0]

  // 0-2) server-side eligibility check (defensive)
  const ineligible = chosenItems.filter((it: any) => it.status !== "ACCUMULATED" || it.payout_id != null)
  if (ineligible.length > 0) {
    return jsonError("Some items are not eligible (must be ACCUMULATED and not linked).", 409)
  }

  // 0-3) load batch status
  const { data: batchRows, error: bErr } = await supabaseAdmin
    .from("settlement_batches")
    .select("id, status, site_id, period_start, period_end, batch_kind, adjustment_seq")
    .eq("office_id", s.officeId)
    .eq("id", batchId)
    .limit(1)

  if (bErr) return jsonError(bErr.message, 500)
  const b = batchRows?.[0] ?? null
  if (!b?.id) return jsonError("Invalid settlement batch for selected items", 400)

  // sanity: ensure batch matches site/period from request (optional but helpful)
  if (String(b.site_id) !== siteId) return jsonError("settlement batch site mismatch", 400)
  if (String(b.period_start) !== start || String(b.period_end) !== end) {
    return jsonError("settlement batch period mismatch", 400)
  }

  const batchStatus = b.status as string

  // PAID 배치는 신규 지급 생성/링크 금지(정책 유지)
  if (batchStatus === "PAID") return jsonError("This settlement batch is already PAID", 409)


  // 1) payout 생성 (단건 가정 제거: insert 후 재조회 없이 returning만 쓰되, 여기서는 id만 필요)
  const { data: payoutRows, error: pErr } = await supabaseAdmin
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
    .order("created_at", { ascending: false })
    .limit(1)

  if (pErr) return jsonError(pErr.message, 500)
  const payout = payoutRows?.[0] ?? null
  if (!payout?.id) return jsonError("Failed to create payout", 500)

  // 2) 선택된 payout_items만 이 payout에 연결
  const { data: selectedItems, error: selErr } = await supabaseAdmin
    .from("payout_items")
    .select("id, status, payout_id")
    .eq("office_id", s.officeId)
    .eq("site_id", siteId)
    .eq("settlement_batch_id", batchId)
    .in("id", payableItemIds)

  if (selErr) return jsonError(selErr.message, 500)

  const eligibleIds = (selectedItems ?? [])
    .filter((it: any) => it.status === "ACCUMULATED" && it.payout_id == null)
    .map((it: any) => it.id)

  if (eligibleIds.length !== payableItemIds.length) {
    return jsonError(
      `Some items are not eligible (must be ACCUMULATED and not linked). requested=${payableItemIds.length}, eligible=${eligibleIds.length}`,
      409
    )
  }

  const { error: linkErr } = await supabaseAdmin
    .from("payout_items")
    .update({ payout_id: payout.id })
    .eq("office_id", s.officeId)
    .in("id", eligibleIds)

  if (linkErr) return jsonError(linkErr.message, 500)

  return NextResponse.json({ payoutId: payout.id, linked: eligibleIds.length, inserted: 0 })
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

  // payables: payout_id NULL + ACCUMULATED
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

  const paidByUserIds = Array.from(new Set((payouts ?? []).map((p: any) => p.paid_by_user_id).filter(Boolean))) as string[]

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
