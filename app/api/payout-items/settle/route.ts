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
    return v.slice(0, 7)
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
    const s = session

    const body = await req.json().catch(() => ({}))
    const siteId = String(body?.siteId ?? "").trim()
    const periodStart = String(body?.periodStart ?? "").trim()
    const periodEnd = String(body?.periodEnd ?? "").trim()
    const includeTeams = Boolean(body?.includeTeams ?? true)

    const workerIds = Array.isArray(body?.workerIds)
        ? (body.workerIds as any[]).map((x) => String(x)).filter(Boolean)
        : null

    const teamLeaderIds = Array.isArray(body?.teamLeaderIds)
        ? (body.teamLeaderIds as any[]).map((x) => String(x)).filter(Boolean)
        : null

    if (!siteId) return jsonError("siteId is required", 400)
    if (!isYmd(periodStart) || !isYmd(periodEnd)) return jsonError("periodStart/periodEnd must be YYYY-MM-DD", 400)
    if (periodStart > periodEnd) return jsonError("periodStart must be <= periodEnd", 400)

    // 0) get-or-create batch
    const { data: existingBatch, error: bFindErr } = await supabaseAdmin
        .from("settlement_batches")
        .select("id, status")
        .eq("office_id", s.officeId)
        .eq("site_id", siteId)
        .eq("period_start", periodStart)
        .eq("period_end", periodEnd)
        .maybeSingle()

    if (bFindErr) return jsonError(bFindErr.message, 500)

    let batchId = existingBatch?.id as string | undefined
    if (!batchId) {
        const { data: createdBatch, error: bInsErr } = await supabaseAdmin
            .from("settlement_batches")
            .insert([
                {
                    office_id: s.officeId,
                    site_id: siteId,
                    period_start: periodStart,
                    period_end: periodEnd,
                    status: "DRAFT",
                    created_by_user_id: s.userId,
                },
            ])
            .select("id, status")
            .single()

        if (bInsErr) return jsonError(bInsErr.message, 500)
        batchId = createdBatch.id
    }

    // 이미 PAID로 마감된 배치는 정산확정 불가
    if (existingBatch?.status === "PAID") {
        return jsonError("This settlement batch is already PAID", 409)
    }

    // 1) settlement_rules
    const { data: rulesRows, error: rErr } = await supabaseAdmin
        .from("settlement_rules")
        .select(
            "id, site_id, type, target_id, target_name, commission_type, commission_value, effective_start, effective_end"
        )
        .eq("office_id", s.officeId)
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

    // 2) locked=true daily_settlements
    const { data: dsRows, error: dErr } = await supabaseAdmin
        .from("daily_settlements")
        .select("worker_id, work_date, daily_wage")
        .eq("office_id", s.officeId)
        .eq("site_id", siteId)
        .gte("work_date", periodStart)
        .lte("work_date", periodEnd)
        .eq("locked", true)

    if (dErr) return jsonError(dErr.message, 500)

    // 3) workers (name + role)
    const { data: workerRows, error: wErr } = await supabaseAdmin
        .from("workers")
        .select("id, name, worker_roles(roles(name))")
        .eq("office_id", s.officeId)

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

    // 5) team info
    let leaderToMemberIds = new Map<string, string[]>()
    if (includeTeams) {
        const { data: teams, error: tErr } = await supabaseAdmin
            .from("teams")
            .select("id, leader_worker_id, site_id")
            .eq("office_id", s.officeId)
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

    // 6) payout_items rows (배치 단위)
    const usedInTeam = new Set<string>()
    const rowsToCreate: any[] = []

    // ✅ 이미 PAID인 payee는 이번 정산확정에서 다시 ACCUMULATED로 만들면 안 됨
    // (배치 내에서 upsert가 PAID를 ACCUMULATED로 "되돌리는" 것을 방지)
    const { data: paidExisting, error: paidExErr } = await supabaseAdmin
        .from("payout_items")
        .select("payee_type, payee_id")
        .eq("office_id", s.officeId)
        .eq("settlement_batch_id", batchId)
        .eq("status", "PAID")

    if (paidExErr) return jsonError(paidExErr.message, 500)

    const paidKeySet = new Set<string>()
    for (const r of paidExisting ?? []) {
        paidKeySet.add(`${r.payee_type}:${r.payee_id}`)
    }

    if (includeTeams) {
        for (const [leaderId, memberIds] of leaderToMemberIds.entries()) {
            if (teamLeaderIds && !teamLeaderIds.includes(leaderId)) continue

            let total = 0
            const leaderAgg = agg.get(leaderId)
            if (leaderAgg) total += leaderAgg.gross

            for (const mid of memberIds) {
                const a = agg.get(mid)
                if (!a) continue
                total += a.gross
                usedInTeam.add(mid)
            }
            if (total <= 0) continue

            const leader = workerById.get(leaderId)
            const payeeName = leader?.name ?? "반장"

            // ✅ 이미 지급완료(PAID)된 FOREMAN은 다시 정산확정 생성 금지
            if (paidKeySet.has(`FOREMAN:${leaderId}`)) continue


            rowsToCreate.push({
                settlement_batch_id: batchId,
                payout_id: null,
                office_id: s.officeId,
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

    const ym = ymdToYm(periodStart)
    for (const [workerId, a] of agg.entries()) {
        if (workerIds && !workerIds.includes(workerId)) continue
        if (usedInTeam.has(workerId)) continue

        const w = workerById.get(workerId)
        const name = w?.name ?? "인력"
        const occupation = w?.roleName ?? "일반"

        const rule = pickRule(rules, { workerId, occupation, ym })
        const { commission } = calcCommission(a.gross, rule)
        const net = Math.max(0, a.gross - commission)
        if (net <= 0) continue

        // ✅ 이미 지급완료(PAID)된 WORKER는 다시 정산확정 생성 금지
        if (paidKeySet.has(`WORKER:${workerId}`)) continue


        rowsToCreate.push({
            settlement_batch_id: batchId,
            payout_id: null,
            office_id: s.officeId,
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

    // 7) upsert by unique index (settlement_batch_id, payee_type, payee_id)
    // Supabase upsert requires specifying onConflict columns
    const { data: upserted, error: upErr } = await supabaseAdmin
        .from("payout_items")
        .upsert(rowsToCreate, { onConflict: "settlement_batch_id,payee_type,payee_id" })
        .select("id")

    if (upErr) return jsonError(upErr.message, 500)

    // 8) mark batch CONFIRMED
    const { error: bUpErr } = await supabaseAdmin
        .from("settlement_batches")
        .update({ status: "CONFIRMED", confirmed_at: new Date().toISOString() })
        .eq("office_id", s.officeId)
        .eq("id", batchId)

    if (bUpErr) return jsonError(bUpErr.message, 500)

    return NextResponse.json({
        ok: true,
        batchId,
        upsertedCount: (upserted ?? []).length,
    })
}
