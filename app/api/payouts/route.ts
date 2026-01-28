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

    const payoutIds = (payouts ?? []).map((x: any) => x.id).filter(Boolean)

    const paidByUserIds = Array.from(
        new Set((payouts ?? []).map((p: any) => p.paid_by_user_id).filter(Boolean))
    ) as string[]

    const userNameById = new Map<string, string>()
    if (paidByUserIds.length > 0) {
        const { data: users, error: uErr } = await supabaseAdmin
            .from("users")
            .select("id, username")
            .eq("office_id", session.officeId)
            .in("id", paidByUserIds)

        if (uErr) return jsonError(uErr.message, 500)
        for (const u of users ?? []) userNameById.set(u.id, u.username)
    }


    // ✅ payout_items(=지급 상세 항목)까지 함께 조회해서 history.items로 붙이기
    let paidItems: any[] = []
    if (payoutIds.length > 0) {
        const { data: items, error: iErr } = await supabaseAdmin
            .from("payout_items")
            .select("id, payout_id, payee_type, payee_name, amount, status, created_at, period_start, period_end")
            .eq("office_id", session.officeId)
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

    // history 응답을 프론트 타입(PayoutHistory)에 맞춰 구성
    const history = (payouts ?? []).map((p: any) => {
        const pid = String(p.id)
        const its = itemsByPayoutId.get(pid) ?? []

        const mappedItems = its.map((it: any) => ({
            payableItemId: it.id, // payout_items.id
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
            paidByUserName: "", // 사용자명은 별도 조인/프로필 테이블 있으면 확장
            siteId: p.site_id,
            siteName: "", // 프론트에서 채움
            period: String(p.period_start ?? "").slice(0, 7),
            items: mappedItems,
            totalAmount,
            memo: p.memo ?? undefined,
            method: p.method ?? "",
        }
    })

    // period 필터(선택): 프론트가 period로 조회하므로 맞춰주면 UX 좋아짐
    const filteredHistory = period ? history.filter((h: any) => h.period === period) : history

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
        history: filteredHistory,
    })
}

