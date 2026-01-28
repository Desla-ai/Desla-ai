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
  return v.slice(0, 7) // YYYY-MM
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

  const url = new URL(req.url)
  const siteId = String(url.searchParams.get("siteId") ?? "").trim()
  const start = String(url.searchParams.get("start") ?? "").trim()
  const end = String(url.searchParams.get("end") ?? "").trim()

  if (!siteId) return jsonError("siteId is required", 400)
  if (!isYmd(start) || !isYmd(end)) return jsonError("start/end must be YYYY-MM-DD", 400)
  if (start > end) return jsonError("start must be <= end", 400)

  const ym = ymdToYm(start) // 간단히 start의 월을 기준 period로 사용(필요하면 월跨越 처리 확장)

  // rules 로드
  const { data: ruleRows, error: ruleErr } = await supabaseAdmin
    .from("settlement_rules")
    .select("id, site_id, type, target_id, target_name, commission_type, commission_value, effective_start, effective_end")
    .eq("office_id", session.officeId)
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

  // 원장 로드
  const { data: ds, error: dsErr } = await supabaseAdmin
    .from("daily_settlements")
    .select("worker_id, work_date, daily_wage, locked")
    .eq("office_id", session.officeId)
    .eq("site_id", siteId)
    .gte("work_date", start)
    .lte("work_date", end)

  if (dsErr) return jsonError(dsErr.message, 500)

  // worker 로드(이름/역할/팀)
  const { data: workers, error: wErr } = await supabaseAdmin
    .from("workers")
    .select("id, name, team, team_leader_id, team_members, worker_roles(roles(name))")
    .eq("office_id", session.officeId)

  if (wErr) return jsonError(wErr.message, 500)

  const workerById = new Map<string, any>()
  for (const w of workers ?? []) workerById.set(w.id, w)

  // worker별 합계/일수 + 기간내 locked 여부
  const agg = new Map<string, { gross: number; days: number; anyLocked: boolean }>()
  for (const r of ds ?? []) {
    const id = r.worker_id as string
    const prev = agg.get(id) ?? { gross: 0, days: 0, anyLocked: false }
    agg.set(id, {
      gross: prev.gross + (r.daily_wage ?? 0),
      days: prev.days + 1,
      anyLocked: prev.anyLocked || Boolean(r.locked),
    })
  }

  // TEAM 묶기 준비: member -> leader
  const leaderToMembers = new Map<string, string[]>()
  for (const [workerId] of agg.entries()) {
    const w = workerById.get(workerId)
    if (!w) continue
    if (w.team === "팀원" && w.team_leader_id) {
      const leaderId = w.team_leader_id as string
      const arr = leaderToMembers.get(leaderId) ?? []
      if (!arr.includes(workerId)) arr.push(workerId)
      leaderToMembers.set(leaderId, arr)
    }
  }

  const usedInTeam = new Set<string>()
  const targets: any[] = []

  // TEAM 타겟 생성(반장 + 팀원 합계, 너가 선택한 A 정책)
  for (const [leaderId, memberIds] of leaderToMembers.entries()) {
    const leaderAgg = agg.get(leaderId) ?? { gross: 0, days: 0, anyLocked: false }
    let total = leaderAgg.gross
    let days = leaderAgg.days
    let anyLocked = leaderAgg.anyLocked

    for (const mid of memberIds) {
      const ma = agg.get(mid)
      if (!ma) continue
      total += ma.gross
      days += ma.days
      anyLocked = anyLocked || ma.anyLocked
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
      status: anyLocked ? "SETTLED" : "UNSETTLED",
    })
  }

  // 나머지 worker 타겟 생성 (DIRECT/PROXY)
  for (const [workerId, a] of agg.entries()) {
    if (usedInTeam.has(workerId)) continue

    const w = workerById.get(workerId)
    const name = w?.name ?? "(알수없음)"
    const occupation =
      w?.worker_roles?.[0]?.roles?.name ||
      w?.worker_roles?.[0]?.roles?.[0]?.name ||
      "일반" // ✅ occupation = roles[0].name

    // TODO: mode는 향후 worker별 설정으로. 지금은 기본 PROXY로 두고, UI에서 바꿀 수 있게 확장 가능
    const mode: SettlementMode = "PROXY"

    if (mode === "DIRECT") {
      targets.push({
        id: `w-${siteId}-${workerId}-${start}-${end}`,
        type: "worker",
        workerId,
        name,
        occupation,
        attendanceDays: a.days,
        attendanceHours: 0,
        mode,
        introFee: 0,
        dailyWage: 0,
        commission: 0,
        commissionRule: "",
        advance: 0,
        netPay: 0,
        foremanPayoutTotal: 0,
        memberCount: 0,
        memberIds: [],
        status: a.anyLocked ? "SETTLED" : "UNSETTLED",
      })
      continue
    }

    // PROXY: rules에서 수수료 결정
    const rule = pickRule(rules, workerId, occupation, ym)
    const { commission, label } = calcCommission(a.gross, rule)
    const netPay = Math.max(0, a.gross - commission /* - advance(0) */)

    targets.push({
      id: `w-${siteId}-${workerId}-${start}-${end}`,
      type: "worker",
      workerId,
      name,
      occupation,
      attendanceDays: a.days,
      attendanceHours: 0,
      mode,
      introFee: 0,
      dailyWage: a.days > 0 ? Math.round(a.gross / a.days) : 0, // 표시용
      commission,
      commissionRule: label,
      advance: 0,
      netPay,
      foremanPayoutTotal: 0,
      memberCount: 0,
      memberIds: [],
      status: a.anyLocked ? "SETTLED" : "UNSETTLED",
    })
  }

  return NextResponse.json({ settlements: targets })
}
