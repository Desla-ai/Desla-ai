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

  const s = session

  const body = await req.json().catch(() => ({}))
  const siteId = String(body?.siteId ?? "").trim()
  const siteName = String(body?.siteName ?? "").trim()
  const start = String(body?.start ?? body?.periodStart ?? "").trim()
  const end = String(body?.end ?? body?.periodEnd ?? "").trim()
  const method = String(body?.method ?? "BANK").trim()
  const memo = String(body?.memo ?? "").trim()
  const items = body?.items as any[]

  if (!siteId) return jsonError("siteId is required", 400)
  if (!siteName) return jsonError("siteName is required", 400)
  if (!isYmd(start) || !isYmd(end)) return jsonError("start/end must be YYYY-MM-DD", 400)
  if (!Array.isArray(items) || items.length === 0) return jsonError("items is required", 400)

  // 1) payouts 생성
  const { data: payout, error: pErr } = await supabaseAdmin
    .from("payouts")
    .insert([
      {
        office_id: s.officeId,
        site_id: siteId,
        period_start: start,
        period_end: end,
        method,
        memo: memo || null,
        status: "CREATED",
        created_by_user_id: s.userId ?? null,
      },
    ])
    .select("id, created_at")
    .single()

  if (pErr) return jsonError(pErr.message, 500)

  // ✅ FOREMAN이면 teams/team_members 기준으로 member_ids 스냅샷을 채워준다
  // (팀 삭제 정책 때문에 필수)
  async function getMemberIdsForForeman(leaderWorkerId: string) {
    const { data: team, error: tErr } = await supabaseAdmin
      .from("teams")
      .select("id, site_id")
      .eq("office_id", s.officeId)
      .eq("leader_worker_id", leaderWorkerId)
      // site_id가 null/global 팀도 허용하는 구조라면 아래 조건은 빼도 되지만,
      // 현장별 팀을 우선하려면 site filter를 추가해도 됨.
      .maybeSingle()

    if (tErr) throw new Error(tErr.message)
    if (!team?.id) return null

    const { data: members, error: mErr } = await supabaseAdmin
      .from("team_members")
      .select("worker_id")
      .eq("team_id", team.id)

    if (mErr) throw new Error(mErr.message)
    const memberIds = (members ?? []).map((x: any) => String(x.worker_id)).filter(Boolean)
    return memberIds.length > 0 ? memberIds : null
  }

  // payout_items 처리: 기존 지급예정(payout_id IS NULL)을 찾아 payout에 연결(update) 우선
  const isSimplePayable = (x: any) =>
    x &&
    typeof x === "object" &&
    typeof x.payeeType === "string" &&
    typeof x.payeeId === "string" &&
    typeof x.payeeName === "string" &&
    typeof x.amount === "number"

  // 2) 요청 items를 표준 payee 키로 변환
  const normalized = items
    .map((t) => {
      // (1) 지급관리 탭 포맷: {payeeType,payeeId,payeeName,amount}
      if (isSimplePayable(t)) {
        return {
          payee_type: String(t.payeeType),
          payee_id: String(t.payeeId),
          payee_name: String(t.payeeName),
          amount: Math.round(Number(t.amount ?? 0)),
          source_mode: String(t.sourceMode ?? "PROXY"),
          // SimplePayable에는 memberIds가 없으므로 일단 null, 아래에서 FOREMAN이면 DB로 채움
          member_ids: Array.isArray(t.memberIds) ? t.memberIds : null,
        }
      }

      // (2) 인력별정산 탭 포맷: SettlementTarget
      const isTeam = t.type === "team" || t.mode === "TEAM"
      const payeeType = isTeam ? "FOREMAN" : "WORKER"

      // 팀 지급의 payee_id는 리더 worker_id 여야 함
      const payeeId = isTeam ? (t.workerId ?? t.teamId) : t.workerId
      const payeeName = String(t.name ?? "")

      const amount =
        t.mode === "TEAM"
          ? Math.round(t.foremanPayoutTotal ?? 0)
          : t.mode === "PROXY"
            ? Math.round(t.netPay ?? 0)
            : Math.round((t.attendanceDays ?? 0) * (t.dailyWage ?? 0))

      return {
        payee_type: payeeType,
        payee_id: String(payeeId ?? ""),
        payee_name: payeeName,
        amount,
        source_mode: String(t.mode ?? "PROXY"),
        member_ids: Array.isArray(t.memberIds) ? t.memberIds : null,
      }
    })
    .filter((x) => x.payee_id)

  if (normalized.length === 0) return jsonError("No valid payees in items", 400)

  // 3) ✅ FOREMAN이면 member_ids를 DB에서 채워 스냅샷 고정
  // (팀 삭제해도 과거 지급 범위가 유지되도록)
  for (const item of normalized) {
    if (item.payee_type === "FOREMAN") {
      try {
        const mids = await getMemberIdsForForeman(item.payee_id)
        item.member_ids = mids
      } catch (e: any) {
        return jsonError(e?.message ?? "Failed to load team members", 500)
      }
    }
  }

  const payeeIds = Array.from(new Set(normalized.map((x) => x.payee_id)))
  const payeeTypes = Array.from(new Set(normalized.map((x) => x.payee_type)))

  // 4) ✅ 기존 지급예정 조회: payout_id IS NULL
  //   - status를 ACCUMULATED로 제한하면 “상태가 살짝 달라진” 지급예정을 못 잡아서 중복/불안정이 생길 수 있음
  //   - payout_id가 null이면 링크 대상으로 보는 게 더 안전
  const { data: existing, error: exErr } = await supabaseAdmin
    .from("payout_items")
    .select("id, payee_type, payee_id")
    .eq("office_id", s.officeId)
    .eq("site_id", siteId)
    .eq("period_start", start)
    .eq("period_end", end)
    .is("payout_id", null)
    .in("payee_id", payeeIds)
    .in("payee_type", payeeTypes)

  if (exErr) return jsonError(exErr.message, 500)

  const existingByKey = new Map<string, { id: string }>()
  for (const row of existing ?? []) {
    existingByKey.set(`${row.payee_type}:${row.payee_id}`, { id: row.id })
  }

  // 5) 연결(update) 우선, 없으면 insert
  let linked = 0
  let inserted = 0

  for (const item of normalized) {
    const key = `${item.payee_type}:${item.payee_id}`
    const ex = existingByKey.get(key)

    if (ex) {
      const { error: upErr } = await supabaseAdmin
        .from("payout_items")
        .update({
          payout_id: payout.id,
          payee_name: item.payee_name,
          amount: item.amount,
          source_mode: item.source_mode,
          member_ids: item.member_ids, // ✅ FOREMAN이면 스냅샷 포함
          status: "ACCUMULATED",
          period_start: start,
          period_end: end,
        })
        .eq("office_id", s.officeId)
        .eq("id", ex.id)

      if (upErr) return jsonError(upErr.message, 500)
      linked += 1
    } else {
      const { error: insErr } = await supabaseAdmin.from("payout_items").insert([
        {
          payout_id: payout.id,
          office_id: s.officeId,
          site_id: siteId,
          period_start: start,
          period_end: end,
          payee_type: item.payee_type,
          payee_id: item.payee_id,
          payee_name: item.payee_name,
          amount: item.amount,
          source_mode: item.source_mode,
          member_ids: item.member_ids, // ✅ FOREMAN이면 스냅샷 포함
          status: "ACCUMULATED",
        },
      ])

      if (insErr) return jsonError(insErr.message, 500)
      inserted += 1
    }
  }

  return NextResponse.json({ payoutId: payout.id, linked, inserted })
}

export async function GET(req: Request) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return jsonError("Unauthorized", 401)

  const url = new URL(req.url)
  const siteId = String(url.searchParams.get("siteId") ?? "").trim()
  const start = String(url.searchParams.get("start") ?? "").trim()
  const end = String(url.searchParams.get("end") ?? "").trim()

  const s = session

  if ((start && !isYmd(start)) || (end && !isYmd(end))) {
    return jsonError("start/end must be YYYY-MM-DD", 400)
  }
  if (start && end && start > end) return jsonError("start must be <= end", 400)

  if (!siteId) return jsonError("siteId is required", 400)

  // payables: 미지급(ACCUMULATED)
  let qPayables = supabaseAdmin
    .from("payout_items")
    .select(
      "id, site_id, payee_type, payee_id, payee_name, amount, status, created_at, period_start, period_end"
    )
    .eq("office_id", s.officeId)
    .eq("site_id", siteId)
    .eq("status", "ACCUMULATED")
    .order("created_at", { ascending: false })

  if (start) qPayables = qPayables.gte("period_start", start)
  if (end) qPayables = qPayables.lte("period_end", end)

  const { data: payables, error: pErr } = await qPayables
  if (pErr) return jsonError(pErr.message, 500)

  // history: PAID payouts
  let qHistory = supabaseAdmin
    .from("payouts")
    .select("id, site_id, period_start, period_end, paid_at, paid_by_user_id, method, memo, status")
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

  // payout_items(=지급 상세 항목)까지 함께 조회해서 history.items로 붙이기
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

  // payout_id -> items[] 그룹핑
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
    })),
    history,
  })
}
