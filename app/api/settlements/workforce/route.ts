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

type SettlementMode = "DIRECT" | "PROXY" | "TEAM"

function pickRule(rules: any[], workerId: string, occupation: string, ym: string) {
  const inPeriod = rules.filter((r) => r.effectiveStart <= ym && r.effectiveEnd >= ym)

  const byWorker = inPeriod.find((r) => r.type === "worker" && r.targetId === workerId)
  if (byWorker) return byWorker

  const byOcc = inPeriod.find((r) => r.type === "occupation" && (r.targetId === occupation || r.targetName === occupation))
  if (byOcc) return byOcc

  const bySite = inPeriod.find((r) => r.type === "site")
  return bySite ?? null
}

function calcCommission(gross: number, rule: any) {
  if (!rule) return { commission: 0, label: "규칙 없음" }
  if (rule.commissionType === "RATE") {
    const c = Math.round(gross * (Number(rule.commissionValue) / 100))
    return { commission: c, label: `${rule.type} ${rule.commissionValue}%` }
  }
  const c = Math.round(Number(rule.commissionValue))
  return { commission: c, label: `${rule.type} 고정 ${c.toLocaleString()}원` }
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
  if (!isYmd(start) || !isYmd(end)) return jsonError("start/end must be YYYY-MM-DD", 400)
  if (start > end) return jsonError("start must be <= end", 400)

  const ym = ymdToYm(start)

  // 0) get-or-create batch (DRAFT if none)
  const { data: existingBatch, error: bFindErr } = await supabaseAdmin
    .from("settlement_batches")
    .select("id, status")
    .eq("office_id", s.officeId)
    .eq("site_id", siteId)
    .eq("period_start", start)
    .eq("period_end", end)
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
          period_start: start,
          period_end: end,
          status: "DRAFT",
          created_by_user_id: s.userId,
        },
      ])
      .select("id, status")
      .single()

    if (bInsErr) return jsonError(bInsErr.message, 500)
    batchId = createdBatch.id
  }

  // 1) rules
  const { data: ruleRows, error: ruleErr } = await supabaseAdmin
    .from("settlement_rules")
    .select("id, site_id, type, target_id, target_name, commission_type, commission_value, effective_start, effective_end")
    .eq("office_id", s.officeId)
    .eq("site_id", siteId)

  if (ruleErr) return jsonError(ruleErr.message, 500)

  const rules = (ruleRows ?? []).map((r: any) => ({
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

  // 2) daily_settlements
  const { data: ds, error: dsErr } = await supabaseAdmin
    .from("daily_settlements")
    .select("worker_id, work_date, daily_wage, locked")
    .eq("office_id", s.officeId)
    .eq("site_id", siteId)
    .gte("work_date", start)
    .lte("work_date", end)

  if (dsErr) return jsonError(dsErr.message, 500)

  // 3) settled(=ACCUMULATED & payout_id null) by batch
  const { data: piRows, error: piErr } = await supabaseAdmin
    .from("payout_items")
    .select("payee_type, payee_id, payout_id, status")
    .eq("office_id", s.officeId)
    .eq("settlement_batch_id", batchId)
    .is("payout_id", null)
    .eq("status", "ACCUMULATED")

  if (piErr) return jsonError(piErr.message, 500)

  const settledWorkerIds = new Set<string>()
  const settledForemanIds = new Set<string>()
  for (const r of piRows ?? []) {
    if (r.payee_type === "WORKER") settledWorkerIds.add(String(r.payee_id))
    if (r.payee_type === "FOREMAN") settledForemanIds.add(String(r.payee_id))
  }

  // 4) paid by batch (hide)
  const { data: paidItems, error: paidErr } = await supabaseAdmin
    .from("payout_items")
    .select("payee_type, payee_id, member_ids")
    .eq("office_id", s.officeId)
    .eq("settlement_batch_id", batchId)
    .eq("status", "PAID")

  if (paidErr) return jsonError(paidErr.message, 500)

  const paidWorkerIds = new Set<string>()
  const paidForemanIds = new Set<string>()

  for (const it of paidItems ?? []) {
    const payeeType = String((it as any).payee_type ?? "")
    const payeeId = String((it as any).payee_id ?? "")

    if (payeeType === "WORKER") {
      if (payeeId) paidWorkerIds.add(payeeId)
      continue
    }

    if (payeeType === "FOREMAN") {
      if (payeeId) paidForemanIds.add(payeeId)
      const mids = Array.isArray((it as any).member_ids) ? (it as any).member_ids : []
      for (const mid of mids) {
        if (mid) paidWorkerIds.add(String(mid))
      }
    }
  }

  // 5) workers
  const { data: workers, error: wErr } = await supabaseAdmin
    .from("workers")
    .select("id, name, phone, worker_roles(roles(name))")
    .eq("office_id", s.officeId)

  if (wErr) return jsonError(wErr.message, 500)

  const workerById = new Map<string, any>()
  for (const w of workers ?? []) workerById.set(w.id, w)

  // 6) aggregate locked=true only
  const agg = new Map<string, { gross: number; days: number }>()
  for (const r of ds ?? []) {
    if (!r.locked) continue
    const id = r.worker_id as string
    const prev = agg.get(id) ?? { gross: 0, days: 0 }
    agg.set(id, { gross: prev.gross + (r.daily_wage ?? 0), days: prev.days + 1 })
  }

  // 7) teams
  const { data: teamRows, error: teamErr } = await supabaseAdmin
    .from("teams")
    .select("id, leader_worker_id, site_id")
    .eq("office_id", s.officeId)
    .or(`site_id.is.null,site_id.eq.${siteId}`)

  if (teamErr) return jsonError(teamErr.message, 500)

  const teamIds = (teamRows ?? []).map((t: any) => t.id).filter(Boolean)

  let teamMemberRows: any[] = []
  if (teamIds.length > 0) {
    const { data, error: tmErr } = await supabaseAdmin
      .from("team_members")
      .select("team_id, worker_id")
      .in("team_id", teamIds)

    if (tmErr) return jsonError(tmErr.message, 500)
    teamMemberRows = data ?? []
  }

  const teamById = new Map<string, any>()
  for (const t of teamRows ?? []) teamById.set(String(t.id), t)

  const leaderToMembers = new Map<string, string[]>()
  for (const t of teamRows ?? []) leaderToMembers.set(String(t.leader_worker_id), [])

  for (const m of teamMemberRows) {
    const team = teamById.get(String(m.team_id))
    const leaderId = String(team?.leader_worker_id ?? "")
    if (!leaderId) continue
    const arr = leaderToMembers.get(leaderId) ?? []
    if (!arr.includes(m.worker_id)) arr.push(m.worker_id)
    leaderToMembers.set(leaderId, arr)
  }

  const targets: any[] = []
  const usedInTeam = new Set<string>()

  // 8) TEAM targets
  for (const [leaderId, memberIds] of leaderToMembers.entries()) {
    if (paidForemanIds.has(String(leaderId))) continue

    const leaderAgg = agg.get(leaderId)
    const memberAggExists = memberIds.some((mid) => agg.has(mid))
    if (!leaderAgg && !memberAggExists) continue

    let total = (leaderAgg?.gross ?? 0)
    let days = (leaderAgg?.days ?? 0)

    for (const mid of memberIds) {
      const ma = agg.get(mid)
      if (!ma) continue
      total += ma.gross
      days += ma.days
      usedInTeam.add(mid)
    }
    usedInTeam.add(leaderId)

    const leader = workerById.get(leaderId)
    const name = leader?.name ?? "(반장)"

    targets.push({
      id: `team-${siteId}-${leaderId}-${start}-${end}`,
      type: "team",
      teamId: leaderId,
      name: `${name} 팀`,
      occupation: "TEAM",
      attendanceDays: days,
      attendanceHours: 0,
      mode: "TEAM" as SettlementMode,
      introFee: 0,
      dailyWage: 0,
      commission: 0,
      commissionRule: "",
      advance: 0,
      netPay: 0,
      foremanPayoutTotal: total,
      memberCount: memberIds.length,
      memberIds,
      status: total > 0 ? (settledForemanIds.has(String(leaderId)) ? "SETTLED" : "READY") : "UNSETTLED",
      settlementBatchId: batchId,
    })
  }

  // 9) worker targets
  for (const [workerId, a] of agg.entries()) {
    if (usedInTeam.has(workerId)) continue
    if (paidWorkerIds.has(String(workerId))) continue

    const w = workerById.get(workerId)
    const name = w?.name ?? "(알수없음)"
    const occupation =
      w?.worker_roles?.[0]?.roles?.name ||
      w?.worker_roles?.[0]?.roles?.[0]?.name ||
      "일반"

    const rule = pickRule(rules, workerId, occupation, ym)
    const { commission, label } = calcCommission(a.gross, rule)
    const netPay = Math.max(0, a.gross - commission)

    targets.push({
      id: `w-${siteId}-${workerId}-${start}-${end}`,
      type: "worker",
      workerId,
      name,
      occupation,
      attendanceDays: a.days,
      attendanceHours: 0,
      mode: "PROXY" as SettlementMode,
      introFee: 0,
      dailyWage: a.days > 0 ? Math.round(a.gross / a.days) : 0,
      commission,
      commissionRule: label,
      advance: 0,
      netPay,
      foremanPayoutTotal: 0,
      memberCount: 0,
      memberIds: [],
      status: a.gross > 0 ? (settledWorkerIds.has(String(workerId)) ? "SETTLED" : "READY") : "UNSETTLED",
      settlementBatchId: batchId,
    })
  }

  return NextResponse.json({ settlements: targets, settlementBatchId: batchId })
}
