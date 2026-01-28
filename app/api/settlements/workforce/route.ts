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

  const url = new URL(req.url)
  const siteId = String(url.searchParams.get("siteId") ?? "").trim()
  const start = String(url.searchParams.get("start") ?? "").trim()
  const end = String(url.searchParams.get("end") ?? "").trim()

  if (!siteId) return jsonError("siteId is required", 400)
  if (!isYmd(start) || !isYmd(end)) return jsonError("start/end must be YYYY-MM-DD", 400)
  if (start > end) return jsonError("start must be <= end", 400)

  const ym = ymdToYm(start)

  // 1) rules 로드
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

  // 2) 원장 로드
  const { data: ds, error: dsErr } = await supabaseAdmin
    .from("daily_settlements")
    .select("worker_id, work_date, daily_wage, locked")
    .eq("office_id", session.officeId)
    .eq("site_id", siteId)
    .gte("work_date", start)
    .lte("work_date", end)

  if (dsErr) return jsonError(dsErr.message, 500)

  // 3) worker 로드(이름/역할)
  const { data: workers, error: wErr } = await supabaseAdmin
    .from("workers")
    .select("id, name, phone, worker_roles(roles(name))")
    .eq("office_id", session.officeId)

  if (wErr) return jsonError(wErr.message, 500)

  const workerById = new Map<string, any>()
  for (const w of workers ?? []) workerById.set(w.id, w)

  // 4) worker별 합계/일수 + 기간내 locked 여부
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

  // 5) ✅ DB에서 팀 구성 로드: teams + team_members
  // 정책: 팀은 전체 인력 풀 (teams.site_id NULL 가능), 하지만 site별 팀도 가능
  // 여기서는 "해당 현장(siteId) 팀" + "global 팀(site_id is null)" 둘 다 포함
  const { data: teamRows, error: teamErr } = await supabaseAdmin
    .from("teams")
    .select("id, leader_worker_id, site_id")
    .eq("office_id", session.officeId)
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

  // leader -> memberIds 구성
  const leaderToMembers = new Map<string, string[]>()
  const leaderToTeamId = new Map<string, string>()
  for (const t of teamRows ?? []) {
    leaderToTeamId.set(t.leader_worker_id, t.id)
    leaderToMembers.set(t.leader_worker_id, [])
  }
  for (const m of teamMemberRows) {
    // team_id -> leader 찾기
    const team = (teamRows ?? []).find((t: any) => t.id === m.team_id)
    const leaderId = team?.leader_worker_id
    if (!leaderId) continue
    const arr = leaderToMembers.get(leaderId) ?? []
    if (!arr.includes(m.worker_id)) arr.push(m.worker_id)
    leaderToMembers.set(leaderId, arr)
  }

  const usedInTeam = new Set<string>()
  const targets: any[] = []

  // 6) TEAM 타겟 생성 (반장 + 팀원 합계)
  for (const [leaderId, memberIds] of leaderToMembers.entries()) {
    // 리더나 팀원이 기간 내 원장(agg)에 하나도 없으면 TEAM 타겟 생성 여부 정책
    // 현재는 "기간에 원장 없으면 스킵"으로 두는 것이 안전.
    const leaderAgg = agg.get(leaderId)
    const memberAggExists = memberIds.some((mid) => agg.has(mid))
    if (!leaderAgg && !memberAggExists) continue

    const leaderA = leaderAgg ?? { gross: 0, days: 0, anyLocked: false }
    let total = leaderA.gross
    let days = leaderA.days
    let anyLocked = leaderA.anyLocked

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
      teamId: leaderId, // (주의) 프론트가 teamId를 leaderId로 쓰는 구조라면 유지. 정규화 team.id를 쓰고 싶으면 여기 바꾸기.
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

  // 7) 나머지 worker 타겟 생성 (기본 PROXY)
  for (const [workerId, a] of agg.entries()) {
    if (usedInTeam.has(workerId)) continue

    const w = workerById.get(workerId)
    const name = w?.name ?? "(알수없음)"
    const occupation =
      w?.worker_roles?.[0]?.roles?.name ||
      w?.worker_roles?.[0]?.roles?.[0]?.name ||
      "일반"

    const mode: SettlementMode = "PROXY"

    // PROXY: rules에서 수수료 결정
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
      mode,
      introFee: 0,
      dailyWage: a.days > 0 ? Math.round(a.gross / a.days) : 0,
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
