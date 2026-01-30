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

type SettleMode = "NORMAL" | "ADJUSTMENT"

function diffDaysInclusive(startYmd: string, endYmd: string) {
    const start = new Date(`${startYmd}T00:00:00Z`).getTime()
    const end = new Date(`${endYmd}T00:00:00Z`).getTime()
    const ms = end - start
    const days = Math.floor(ms / (24 * 60 * 60 * 1000)) + 1
    return Math.max(1, days)
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

function toUnitsNumber(v: any) {
    const n = Number(v)
    if (!Number.isFinite(n)) return 1.0
    return n
}

async function getLatestNormalBatch(args: {
    officeId: string
    siteId: string
    periodStart: string
    periodEnd: string
}) {
    const { officeId, siteId, periodStart, periodEnd } = args

    const { data: rows, error } = await supabaseAdmin
        .from("settlement_batches")
        .select("id, status")
        .eq("office_id", officeId)
        .eq("site_id", siteId)
        .eq("period_start", periodStart)
        .eq("period_end", periodEnd)
        .eq("batch_kind", "NORMAL")
        .eq("adjustment_seq", 0)
        .order("created_at", { ascending: false })
        .limit(1)

    if (error) throw new Error(error.message)
    return rows?.[0] ?? null
}

async function getOrCreateNormalBatch(args: {
    officeId: string
    siteId: string
    periodStart: string
    periodEnd: string
    userId: string
}) {
    const { officeId, siteId, periodStart, periodEnd, userId } = args

    const existing = await getLatestNormalBatch({ officeId, siteId, periodStart, periodEnd })
    if (existing?.id) {
        return { batchId: String(existing.id), batchStatus: String(existing.status ?? "DRAFT"), created: false }
    }

    const { data: created, error: insErr } = await supabaseAdmin
        .from("settlement_batches")
        .insert([
            {
                office_id: officeId,
                site_id: siteId,
                period_start: periodStart,
                period_end: periodEnd,
                batch_kind: "NORMAL",
                adjustment_seq: 0,
                status: "DRAFT",
                created_by_user_id: userId,
            },
        ])
        .select("id, status")
        .single()

    if (insErr) throw new Error(insErr.message)

    return { batchId: String(created.id), batchStatus: String(created.status ?? "DRAFT"), created: true }
}

async function createAdjustmentBatch(args: {
    officeId: string
    siteId: string
    periodStart: string
    periodEnd: string
    userId: string
    parentBatchId?: string | null
}) {
    const { officeId, siteId, periodStart, periodEnd, userId, parentBatchId } = args

    const { data: rows, error: seqErr } = await supabaseAdmin
        .from("settlement_batches")
        .select("adjustment_seq")
        .eq("office_id", officeId)
        .eq("site_id", siteId)
        .eq("period_start", periodStart)
        .eq("period_end", periodEnd)
        .eq("batch_kind", "ADJUSTMENT")

    if (seqErr) throw new Error(seqErr.message)

    const maxSeq = (rows ?? []).reduce((m: number, r: any) => Math.max(m, Number(r.adjustment_seq ?? 0)), 0) || 0
    const nextSeq = maxSeq + 1

    const { data: created, error: insErr } = await supabaseAdmin
        .from("settlement_batches")
        .insert([
            {
                office_id: officeId,
                site_id: siteId,
                period_start: periodStart,
                period_end: periodEnd,
                batch_kind: "ADJUSTMENT",
                adjustment_seq: nextSeq,
                parent_batch_id: parentBatchId ?? null,
                status: "DRAFT",
                created_by_user_id: userId,
            },
        ])
        .select("id, status, adjustment_seq")
        .single()

    if (insErr) throw new Error(insErr.message)

    return {
        batchId: String(created.id),
        batchStatus: String(created.status ?? "DRAFT"),
        adjustmentSeq: Number(created.adjustment_seq ?? nextSeq),
    }
}

function ymdInRange(d: string, start: string, end: string) {
    return start <= d && d <= end
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
    const settleMode = String(body?.settleMode ?? "NORMAL").toUpperCase() as SettleMode

    const workerIds = Array.isArray(body?.workerIds)
        ? (body.workerIds as any[]).map((x) => String(x)).filter(Boolean)
        : null
    const teamLeaderIds = Array.isArray(body?.teamLeaderIds)
        ? (body.teamLeaderIds as any[]).map((x) => String(x)).filter(Boolean)
        : null

    if (!siteId) return jsonError("siteId is required", 400)
    if (!isYmd(periodStart) || !isYmd(periodEnd)) return jsonError("periodStart/periodEnd must be YYYY-MM-DD", 400)
    if (periodStart > periodEnd) return jsonError("periodStart must be <= periodEnd", 400)
    if (settleMode !== "NORMAL" && settleMode !== "ADJUSTMENT") return jsonError("settleMode must be NORMAL or ADJUSTMENT", 400)

    // 선택 대상 없이 전체 확정되는 사고 방지
    if ((!workerIds || workerIds.length === 0) && (!teamLeaderIds || teamLeaderIds.length === 0)) {
        return jsonError("workerIds or teamLeaderIds is required", 400)
    }

    const warnings: string[] = []
    if (settleMode === "ADJUSTMENT") {
        const days = diffDaysInclusive(periodStart, periodEnd)
        if (days > 7) {
            warnings.push(
                `추가분(ADJUSTMENT) 기간이 ${days}일입니다(권장 7일 이하). 기간이 길면 '현장+날짜' 중복지급 방지 로직이 보수적으로 작동해 일부 지급예정이 제외될 수 있습니다.`
            )
        }
    }

    // 0) 배치 결정
    let batchId = ""
    let batchStatus = ""
    let adjustmentSeq: number | null = null
    let parentBatchId: string | null = null

    try {
        if (settleMode === "NORMAL") {
            const b = await getOrCreateNormalBatch({
                officeId: s.officeId,
                siteId,
                periodStart,
                periodEnd,
                userId: s.userId,
            })
            batchId = b.batchId
            batchStatus = b.batchStatus

            if (batchStatus === "PAID") return jsonError("This settlement batch is already PAID", 409)
        } else {
            const normal = await getLatestNormalBatch({
                officeId: s.officeId,
                siteId,
                periodStart,
                periodEnd,
            })
            parentBatchId = normal?.id ? String(normal.id) : null

            const b = await createAdjustmentBatch({
                officeId: s.officeId,
                siteId,
                periodStart,
                periodEnd,
                userId: s.userId,
                parentBatchId,
            })
            batchId = b.batchId
            batchStatus = b.batchStatus
            adjustmentSeq = b.adjustmentSeq
        }
    } catch (e: any) {
        return jsonError(e?.message ?? "Failed to get or create batch", 500)
    }

    // 1) rules
    const { data: rulesRows, error: rErr } = await supabaseAdmin
        .from("settlement_rules")
        .select("id, site_id, type, target_id, target_name, commission_type, commission_value, effective_start, effective_end")
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

    // 2) daily_settlements (locked=true) in period
    const dsStart = periodStart
    const dsEnd = periodEnd

    const { data: dsRows, error: dErr } = await supabaseAdmin
        .from("daily_settlements")
        .select("worker_id, work_date, daily_wage, work_units")
        .eq("office_id", s.officeId)
        .eq("site_id", siteId)
        .gte("work_date", dsStart)
        .lte("work_date", dsEnd)
        .eq("locked", true)
    if (dErr) return jsonError(dErr.message, 500)

    // 이번 기간에 실제로 “일한 날짜” 셋(현장+날짜 기준으로 중복지급 방지에 사용)
    const workedDates = Array.from(new Set((dsRows ?? []).map((r: any) => String(r.work_date)).filter(Boolean))).sort()

    // 3) workers
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

    // 4) agg
    const agg = new Map<string, { gross: number; workUnits: number }>()
    for (const r of dsRows ?? []) {
        const wid = String((r as any).worker_id)
        const wage = Number((r as any).daily_wage ?? 0)
        const units = toUnitsNumber((r as any).work_units ?? 1.0)
        const prev = agg.get(wid) ?? { gross: 0, workUnits: 0 }
        agg.set(wid, { gross: prev.gross + wage * units, workUnits: prev.workUnits + units })
    }

    // 5) teams
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

    // ✅ “현장+날짜 1회 지급” 차단용:
    //    이미 PAID 뿐 아니라, 이미 ACCUMULATED(지급예정)로 잡혀있는 것도 막아야
    //    같은 날짜/같은 사람의 payables가 배치별로 중복 생성되지 않음
    const { data: paidRows, error: paidErr } = await supabaseAdmin
        .from("payout_items")
        .select("payee_type, payee_id, period_start, period_end, status")
        .eq("office_id", s.officeId)
        .eq("site_id", siteId)
        .in("status", ["PAID", "ACCUMULATED"])
        .lte("period_start", dsEnd)
        .gte("period_end", dsStart)
        .limit(10000)
    if (paidErr) return jsonError(paidErr.message, 500)

    // payeeKey -> list of paid ranges
    const paidRangesByPayee = new Map<string, Array<{ start: string; end: string }>>()
    for (const r of paidRows ?? []) {
        const key = `${r.payee_type}:${r.payee_id}`
        const arr = paidRangesByPayee.get(key) ?? []
        arr.push({ start: String(r.period_start), end: String(r.period_end) })
        paidRangesByPayee.set(key, arr)
    }

    // “현장+날짜” 차단을 날짜별로 정확히 하기:
    // 이번 settle 기간 중 실제 workedDates 중 하나라도 paid range에 포함되면 차단
    function isPaidOnAnyWorkedDate(payeeType: "WORKER" | "FOREMAN", payeeId: string) {
        const key = `${payeeType}:${payeeId}`
        const ranges = paidRangesByPayee.get(key) ?? []
        if (ranges.length === 0) return false
        if (workedDates.length === 0) return false
        return workedDates.some((d) => ranges.some((rr) => ymdInRange(d, rr.start, rr.end)))
    }

    // 7) payout_items rows
    const usedInTeam = new Set<string>()
    const rowsToCreate: any[] = []

    // 팀(FOREMAN)
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

            if (isPaidOnAnyWorkedDate("FOREMAN", leaderId)) continue

            const leader = workerById.get(leaderId)
            const payeeName = leader?.name ?? "반장"

            rowsToCreate.push({
                settlement_batch_id: batchId,
                payout_id: null,
                office_id: s.officeId,
                site_id: siteId,
                period_start: dsStart,
                period_end: dsEnd,
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

    // 개인(WORKER)
    const ym = ymdToYm(dsStart)
    for (const [workerId, a] of agg.entries()) {
        if (workerIds && !workerIds.includes(workerId)) continue
        if (usedInTeam.has(workerId)) continue

        if (isPaidOnAnyWorkedDate("WORKER", workerId)) continue

        const w = workerById.get(workerId)
        const name = w?.name ?? "인력"
        const occupation = w?.roleName ?? "일반"

        const rule = pickRule(rules, { workerId, occupation, ym })
        const { commission } = calcCommission(a.gross, rule)
        const net = Math.max(0, a.gross - commission)
        if (net <= 0) continue

        rowsToCreate.push({
            settlement_batch_id: batchId,
            payout_id: null,
            office_id: s.officeId,
            site_id: siteId,
            period_start: dsStart,
            period_end: dsEnd,
            payee_type: "WORKER",
            payee_id: workerId,
            payee_name: name,
            amount: Math.round(net),
            source_mode: "PROXY",
            member_ids: [],
            status: "ACCUMULATED",
        })
    }

    const { data: upserted, error: upErr } = await supabaseAdmin
        .from("payout_items")
        .upsert(rowsToCreate, { onConflict: "settlement_batch_id,payee_type,payee_id" })
        .select("id")
    if (upErr) return jsonError(upErr.message, 500)

    const { error: bUpErr } = await supabaseAdmin
        .from("settlement_batches")
        .update({ status: "CONFIRMED", confirmed_at: new Date().toISOString() })
        .eq("office_id", s.officeId)
        .eq("id", batchId)
    if (bUpErr) return jsonError(bUpErr.message, 500)

    return NextResponse.json({
        ok: true,
        warnings,
        settleMode,
        batchId,
        batchStatus: "CONFIRMED",
        adjustmentSeq,
        parentBatchId,
        periodStart: dsStart,
        periodEnd: dsEnd,
        upsertedCount: (upserted ?? []).length,
    })
}
