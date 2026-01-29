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

  const { data: piRows, error: piErr } = await supabaseAdmin
    .from("payout_items")
    .select("payee_type, payee_id, payout_id, status")
    .eq("office_id", session.officeId)
    .eq("site_id", siteId)
    .eq("period_start", start)
    .eq("period_end", end)
    .is("payout_id", null)
    .eq("status", "ACCUMULATED")

  if (piErr) return jsonError(piErr.message, 500)

  const settledWorkerIds = new Set<string>()
  const settledForemanIds = new Set<string>()
  for (const r of piRows ?? []) {
    if (r.payee_type === "WORKER") settledWorkerIds.add(String(r.payee_id))
    if (r.payee_type === "FOREMAN") settledForemanIds.add(String(r.payee_id))
  }

  // 3) worker 로드(이름/역할)
  const { data: workers, error: wErr } = await supabaseAdmin
    .from("workers")
    .select("id, name, phone, worker_roles(roles(name))")
    .eq("office_id", session.officeId)

  if (wErr) return jsonError(wErr.message, 500)

  const workerById = new Map<string, any>()
  for (const w of workers ?? []) workerById.set(w.id, w)

  // 4) ✅ worker별 합계/일수: "금액확정(locked=true)"만 집계
  // 정책: 확정대기(locked=false)는 정산 대상 제외
  const agg = new Map<string, { gross: number; days: number }>()
  for (const r of ds ?? []) {
    if (!r.locked) continue
    const id = r.worker_id as string
    const prev = agg.get(id) ?? { gross: 0, days: 0 }
    agg.set(id, {
      gross: prev.gross + (r.daily_wage ?? 0),
      days: prev.days + 1,
    })
  }

  // 4-1) ✅ 이미 지급완료(PAID)된 payee는 정산 목록에서 제외
  // 정책: 같은 site + 같은 기간(start/end)에서 payout_items가 PAID면 정산 화면에 남기지 않음
  // ✅ 이미 지급완료(PAID)된 payee는 정산 목록에서 제외
  // 핵심: 팀 해체(teams 삭제) 후에도 과거 지급 범위를 유지하려면,
  //       "현재 팀 구성"이 아니라 "payout_items.member_ids 스냅샷"으로 팀원을 제외해야 함.
  const { data: paidItems, error: paidErr } = await supabaseAdmin
    .from("payout_items")
    .select("payee_type, payee_id, member_ids")
    .eq("office_id", session.officeId)
    .eq("site_id", siteId)
    .eq("period_start", start)
    .eq("period_end", end)
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

      // ✅ FOREMAN 지급완료면, 그때의 팀원 스냅샷(member_ids)도 같이 지급완료로 간주하여 제외
      const mids = Array.isArray((it as any).member_ids) ? (it as any).member_ids : []
      for (const mid of mids) {
        if (mid) paidWorkerIds.add(String(mid))
      }
    }
  }

  // ✅ 팀 지급이 PAID인 경우(FOREMAN), 리더는 개인(PROXY)로 다시 뜨면 안 됨.
  // TEAM 타겟은 paidForemanIds로 제외되지만, TEAM 루프를 continue로 건너뛰면 usedInTeam에 leaderId가 안 들어가서
  // 아래 worker(PROXY) 생성 루프에서 리더가 다시 등장할 수 있다.
  // 따라서 여기서 미리 “PAID된 FOREMAN 리더”를 usedInTeam에 넣어 개인 타겟 생성을 막는다.
  const paidLeaderIds = new Set<string>(Array.from(paidForemanIds))

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
    // ✅ 지급완료(PAID)된 팀은 정산 화면에서 제외 (옵션 A)
    if (paidForemanIds.has(String(leaderId))) continue
    // 리더나 팀원이 기간 내 원장(agg)에 하나도 없으면 TEAM 타겟 생성 여부 정책
    // 현재는 "기간에 원장 없으면 스킵"으로 두는 것이 안전.
    const leaderAgg = agg.get(leaderId)
    const memberAggExists = memberIds.some((mid) => agg.has(mid))
    if (!leaderAgg && !memberAggExists) continue

    const leaderA = leaderAgg ?? { gross: 0, days: 0 }
    let total = leaderA.gross
    let days = leaderA.days

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
      status: total > 0 ? (settledForemanIds.has(String(leaderId)) ? "SETTLED" : "READY") : "UNSETTLED",
    })
  }

  // 7) 나머지 worker 타겟 생성 (기본 PROXY)
  for (const [workerId, a] of agg.entries()) {
    if (paidLeaderIds.has(String(workerId))) continue
    if (usedInTeam.has(workerId)) continue
    if (paidWorkerIds.has(String(workerId))) continue

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
      status: a.gross > 0 ? (settledWorkerIds.has(String(workerId)) ? "SETTLED" : "READY") : "UNSETTLED",
    })
  }

  return NextResponse.json({ settlements: targets })
}
