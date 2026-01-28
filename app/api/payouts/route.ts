// app/api/payouts/route.ts
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

  const body = await req.json().catch(() => ({}))
  const siteId = String(body?.siteId ?? "").trim()
  const siteName = String(body?.siteName ?? "").trim()
  const start = String(body?.start ?? "").trim()
  const end = String(body?.end ?? "").trim()
  const method = String(body?.method ?? "BANK").trim()
  const memo = String(body?.memo ?? "").trim()
  const items = body?.items as any[] // SettlementTarget[]에서 필요한 정보만

  if (!siteId) return jsonError("siteId is required", 400)
  if (!siteName) return jsonError("siteName is required", 400)
  if (!isYmd(start) || !isYmd(end)) return jsonError("start/end must be YYYY-MM-DD", 400)
  if (!Array.isArray(items) || items.length === 0) return jsonError("items is required", 400)

  // payouts 생성
  const { data: payout, error: pErr } = await supabaseAdmin
    .from("payouts")
    .insert([{
      office_id: session.officeId,
      site_id: siteId,
      period_start: start,
      period_end: end,
      method,
      memo: memo || null,
      status: "CREATED",
      created_by_user_id: session.userId ?? null,
    }])
    .select("id, created_at")
    .single()

  if (pErr) return jsonError(pErr.message, 500)

  // payout_items 생성
  const payloadItems = items.map((t) => {
    const isTeam = t.type === "team" || t.mode === "TEAM"
    const payeeType = isTeam ? "FOREMAN" : "WORKER"
    const payeeId = isTeam ? t.teamId : t.workerId
    const payeeName = t.name

    const amount =
      t.mode === "TEAM" ? Math.round(t.foremanPayoutTotal ?? 0)
      : t.mode === "PROXY" ? Math.round(t.netPay ?? 0)
      : Math.round((t.attendanceDays ?? 0) * (t.dailyWage ?? 0)) // DIRECT 임시(추후 개선)

    return {
      payout_id: payout.id,
      office_id: session.officeId,
      site_id: siteId,
      period_start: start,
      period_end: end,
      payee_type: payeeType,
      payee_id: payeeId,
      payee_name: payeeName,
      amount,
      source_mode: t.mode,
      member_ids: Array.isArray(t.memberIds) ? t.memberIds : null,
      status: "ACCUMULATED",
    }
  })

  const { error: iErr } = await supabaseAdmin.from("payout_items").insert(payloadItems)
  if (iErr) return jsonError(iErr.message, 500)

  return NextResponse.json({ payoutId: payout.id })
}

export async function GET(req: Request) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return jsonError("Unauthorized", 401)

  const url = new URL(req.url)
  const siteId = String(url.searchParams.get("siteId") ?? "").trim()
  const period = String(url.searchParams.get("period") ?? "").trim() // YYYY-MM (선택)

  if (!siteId) return jsonError("siteId is required", 400)

  // payables: 미지급(ACCUMULATED)
  const { data: payables, error: pErr } = await supabaseAdmin
    .from("payout_items")
    .select("id, site_id, payee_type, payee_id, payee_name, amount, status, created_at, period_start, period_end")
    .eq("office_id", session.officeId)
    .eq("site_id", siteId)
    .eq("status", "ACCUMULATED")
    .order("created_at", { ascending: false })

  if (pErr) return jsonError(pErr.message, 500)

  // history: PAID payouts
  const { data: payouts, error: hErr } = await supabaseAdmin
    .from("payouts")
    .select("id, site_id, period_start, period_end, paid_at, paid_by_user_id, method, memo, status")
    .eq("office_id", session.officeId)
    .eq("site_id", siteId)
    .eq("status", "PAID")
    .order("paid_at", { ascending: false })

  if (hErr) return jsonError(hErr.message, 500)

  return NextResponse.json({
    payables: (payables ?? []).map((x: any) => ({
      id: x.id,
      siteId: x.site_id,
      siteName: "", // 정산 페이지에서 이미 siteName 알고 있으면 프론트에서 채워도 됨
      period: `${String(x.period_start).slice(0,7)}`,
      payeeType: x.payee_type,
      payeeId: x.payee_id,
      payeeName: x.payee_name,
      amount: x.amount,
      status: x.status,
      createdAt: x.created_at,
    })),
    history: payouts ?? [],
  })
}
