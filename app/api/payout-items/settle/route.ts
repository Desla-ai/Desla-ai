// app/api/payout-items/settle/route.ts
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
function ymdToYm(v: string) {
    return v.slice(0, 7) // YYYY-MM-DD -> YYYY-MM
}

function calcCommission(gross: number, rule: any | null) {
    if (!rule) return { commission: 0, ruleLabel: "규칙 없음" }
    if (rule.commissionType === "RATE") {
        const rate = Number(rule.commissionValue || 0)
        const c = Math.round((gross * rate) / 100)
        return { commission: c, ruleLabel: `${rate}% (${rule.type})` }
    }
    const fixed = Number(rule.commissionValue || 0)
    return { commission: fixed, ruleLabel: `${fixed}원 (${rule.type})` }
}

function pickRule(rules: any[], args: { workerId: string; occupation: string; ym: string }) {
    const { workerId, occupation, ym } = args
    const inPeriod = (r: any) => r.effectiveStart <= ym && ym <= r.effectiveEnd

    // 우선순위: worker > occupation > site
    const workerRule = rules.find((r) => r.type === "worker" && r.targetId === workerId && inPeriod(r))
    if (workerRule) return workerRule

    const occRule = rules.find(
        (r) =>
            r.type === "occupation" &&
            (r.targetId === occupation || r.targetName === occupation) &&
            inPeriod(r)
    )
    if (occRule) return occRule

    const siteRule = rules.find((r) => r.type === "site" && inPeriod(r))
    return siteRule ?? null
}

export async function POST(req: Request) {
    const cookieStore = await cookies()
    const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
    if (!session) return jsonError("Unauthorized", 401)

    const body = await req.json().catch(() => ({}))
    const siteId = String(body?.siteId ?? "").trim()
    const periodStart = String(body?.periodStart ?? "").trim()
    const periodEnd = String(body?.periodEnd ?? "").trim()
    const includeTeams = Boolean(body?.includeTeams ?? true)

    // ✅ 선택 정산 지원 (옵션)
    const workerIds = Array.isArray(body?.workerIds)
        ? (body.workerIds as any[]).map((x) => String(x)).filter(Boolean)
        : null

    const teamLeaderIds = Array.isArray(body?.teamLeaderIds)
        ? (body.teamLeaderIds as any[]).map((x) => String(x)).filter(Boolean)
        : null

    if (!siteId) return jsonError("siteId is required", 400)
    if (!isYmd(periodStart) || !isYmd(periodEnd)) return jsonError("periodStart/periodEnd must be YYYY-MM-DD", 400)
    if (periodStart > periodEnd) return jsonError("periodStart must be <= periodEnd", 400)

    // 1) settlement_rules (site별)
    const { data: rulesRows, error: rErr } = await supabaseAdmin
        .from("settlement_rules")
        .select("id, site_id, type, target_id, target_name, commission_type, commission_value, effective_start, effective_end")
        .eq("office_id", session.officeId)
        .eq("site_id", siteId)

    if (rErr) return jsonError(rErr.message, 500)

    const rules = (rulesRows ?? []).map((r: any) => ({
        id: r.id,
        siteId: r.site_id,
        type: r.type,
        targetId: r.target_id ?? undefined,
        targetName: r.target_name ?? undefined,
        commissionType: r.commission_type,
        commissionValue: r.commission_value,
        effectiveStart: r.effective_start,
        effectiveEnd: r.effective_end,
    }))

    // 2) locked=true daily_settlements만 집계
    const { data: dsRows, error: dErr } = await supabaseAdmin
        .from("daily_settlements")
        .select("worker_id, work_date, daily_wage")
        .eq("office_id", session.officeId)
        .eq("site_id", siteId)
        .gte("work_date", periodStart)
        .lte("work_date", periodEnd)
        .eq("locked", true)

    if (dErr) return jsonError(dErr.message, 500)

    // 3) workers (이름 + 역할명)
    const { data: workerRows, error: wErr } = await supabaseAdmin
        .from("workers")
        .select("id, name, worker_roles(roles(name))")
        .eq("office_id", session.officeId)

    if (wErr) return jsonError(wErr.message, 500)

    const workerById = new Map<string, any>()
    for (const w of workerRows ?? []) {
        const roleName = (w as any)?.worker_roles?.[0]?.roles?.name ?? "일반"
        workerById.set(w.id, { ...w, roleName })
    }

    // 4) worker별 합산
    const agg = new Map<string, { gross: number; days: number }>()
    for (const r of dsRows ?? []) {
        const wid = String((r as any).worker_id)
        const wage = Number((r as any).daily_wage ?? 0)

        const prev = agg.get(wid) ?? { gross: 0, days: 0 }
        agg.set(wid, { gross: prev.gross + wage, days: prev.days + 1 })
    }

    // 5) 팀 정보 로드(선택)
    let leaderToMemberIds = new Map<string, string[]>()
    if (includeTeams) {
        const { data: teams, error: tErr } = await supabaseAdmin
            .from("teams")
            .select("id, leader_worker_id, site_id")
            .eq("office_id", session.officeId)
            .or(`site_id.is.null,site_id.eq.${siteId}`)

        if (tErr) return jsonError(tErr.message, 500)

        const teamIds = (teams ?? []).map((t: any) => t.id)
        if (teamIds.length > 0) {
            const { data: members, error: mErr } = await supabaseAdmin
                .from("team_members")
                .select("team_id, worker_id")
                .in("team_id", teamIds)

            if (mErr) return jsonError(mErr.message, 500)

            const membersByTeamId = new Map<string, string[]>()
            for (const row of members ?? []) {
                const tid = String((row as any).team_id)
                const wid = String((row as any).worker_id)
                membersByTeamId.set(tid, [...(membersByTeamId.get(tid) ?? []), wid])
            }

            for (const t of teams ?? []) {
                const leaderId = String((t as any).leader_worker_id)
                const tid = String((t as any).id)
                leaderToMemberIds.set(leaderId, membersByTeamId.get(tid) ?? [])
            }
        }
    }

    // 6) payout_items용 rows 생성 (팀원 중복 방지)
    const usedInTeam = new Set<string>()
    const rowsToCreate: any[] = []

    // (A) 팀(반장) 지급예정 생성
    if (includeTeams) {
        for (const [leaderId, memberIds] of leaderToMemberIds.entries()) {
            // ✅ 선택된 팀만 처리
            if (teamLeaderIds && !teamLeaderIds.includes(leaderId)) continue

            let total = 0
            let days = 0

            const leaderAgg = agg.get(leaderId)
            if (leaderAgg) {
                total += leaderAgg.gross
                days += leaderAgg.days
            }

            for (const mid of memberIds) {
                const a = agg.get(mid)
                if (!a) continue
                total += a.gross
                days += a.days
                usedInTeam.add(mid)
            }

            if (total <= 0) continue

            const leader = workerById.get(leaderId)
            const payeeName = leader?.name ?? "반장"

            rowsToCreate.push({
                office_id: session.officeId,
                payout_id: null,
                site_id: siteId,
                period_start: periodStart,
                period_end: periodEnd,
                payee_type: "FOREMAN",
                payee_id: leaderId,
                payee_name: payeeName,
                amount: Math.round(total),
                source_mode: "TEAM",
                member_ids: memberIds,
                status: "ACCUMULATED",
            })
        }
    }

    // (B) 개인 지급예정 생성 (팀원 제외)
    // 기간 대표 ym: periodStart 기준으로 rule 선택(단순화)
    const ym = ymdToYm(periodStart)

    for (const [workerId, a] of agg.entries()) {
        // ✅ 선택된 개인만 처리
        if (workerIds && !workerIds.includes(workerId)) continue

        if (usedInTeam.has(workerId)) continue

        const w = workerById.get(workerId)
        const name = w?.name ?? "인력"
        const occupation = w?.roleName ?? "일반"

        const rule = pickRule(rules, { workerId, occupation, ym })
        const { commission } = calcCommission(a.gross, rule)
        const net = Math.max(0, a.gross - commission)

        if (net <= 0) continue

        rowsToCreate.push({
            office_id: session.officeId,
            payout_id: null,
            site_id: siteId,
            period_start: periodStart,
            period_end: periodEnd,
            payee_type: "WORKER",
            payee_id: workerId,
            payee_name: name,
            amount: Math.round(net),
            source_mode: "PROXY",
            member_ids: [],
            status: "ACCUMULATED",
        })
    }

    // ✅ 이미 지급완료(PAID)된 건은 다시 지급예정(ACCUMULATED)으로 만들면 안 됨
    const { data: paidExisting, error: paidExErr } = await supabaseAdmin
        .from("payout_items")
        .select("payee_type, payee_id")
        .eq("office_id", session.officeId)
        .eq("site_id", siteId)
        .eq("period_start", periodStart)
        .eq("period_end", periodEnd)
        .eq("status", "PAID")

    if (paidExErr) return jsonError(paidExErr.message, 500)

    const paidKeySet = new Set<string>()
    for (const r of paidExisting ?? []) {
        paidKeySet.add(`${r.payee_type}:${r.payee_id}`)
    }


    // 7) 중복 생성 방지: 같은 기간/현장/수령인(타입+id) 기존 row가 있으면 update, 없으면 insert
    const { data: existing, error: eErr } = await supabaseAdmin
        .from("payout_items")
        .select("id, payee_type, payee_id, payout_id, status")
        .eq("office_id", session.officeId)
        .eq("site_id", siteId)
        .eq("period_start", periodStart)
        .eq("period_end", periodEnd)
        .is("payout_id", null)

    if (eErr) return jsonError(eErr.message, 500)

    const keyOf = (x: any) => `${x.payee_type}:${x.payee_id}`
    const existingByKey = new Map<string, any>()
    for (const ex of existing ?? []) existingByKey.set(keyOf(ex), ex)

    const toInsert: any[] = []
    const toUpdate: { id: string; patch: any }[] = []

    for (const row of rowsToCreate) {
        // ✅ 이미 PAID된 payee는 다시 정산확정(지급예정) 생성 금지
        if (paidKeySet.has(`${row.payee_type}:${row.payee_id}`)) continue
        const ex = existingByKey.get(`${row.payee_type}:${row.payee_id}`)
        if (!ex) {
            toInsert.push(row)
        } else {
            toUpdate.push({
                id: ex.id,
                patch: {
                    payee_name: row.payee_name,
                    amount: row.amount,
                    source_mode: row.source_mode,
                    member_ids: row.member_ids,
                    status: "ACCUMULATED",
                },
            })
        }
    }

    let created = 0
    let updated = 0

    if (toInsert.length > 0) {
        const { error: insErr } = await supabaseAdmin.from("payout_items").insert(toInsert)
        if (insErr) return jsonError(insErr.message, 500)
        created = toInsert.length
    }

    for (const u of toUpdate) {
        const { error: upErr } = await supabaseAdmin
            .from("payout_items")
            .update(u.patch)
            .eq("office_id", session.officeId)
            .eq("id", u.id)

        if (upErr) return jsonError(upErr.message, 500)
        updated += 1
    }

    return NextResponse.json({ ok: true, created, updated })
}
