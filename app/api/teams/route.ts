import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session"

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return jsonError("Unauthorized", 401)

  const body = await req.json().catch(() => ({}))
  const leaderWorkerId = String(body?.leaderWorkerId ?? "").trim()
  const siteIdRaw = body?.siteId
  const siteId = siteIdRaw ? String(siteIdRaw).trim() : null

  if (!leaderWorkerId) return jsonError("leaderWorkerId is required", 400)

  // leader_worker_id UNIQUE라서 이미 팀이 있으면 에러
  const { data: team, error } = await supabaseAdmin
    .from("teams")
    .insert([{
      office_id: session.officeId,
      leader_worker_id: leaderWorkerId,
      site_id: siteId || null,
    }])
    .select("id, leader_worker_id, site_id, created_at")
    .single()

  if (error) return jsonError(error.message, 500)

  return NextResponse.json({ team })
}

export async function GET(req: Request) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return jsonError("Unauthorized", 401)

  const url = new URL(req.url)
  const leaderWorkerId = String(url.searchParams.get("leaderWorkerId") ?? "").trim()

  let q = supabaseAdmin
    .from("teams")
    .select("id, leader_worker_id, site_id, created_at")
    .eq("office_id", session.officeId)
    .order("created_at", { ascending: false })

  if (leaderWorkerId) q = q.eq("leader_worker_id", leaderWorkerId)

  const { data: teams, error } = await q
  if (error) return jsonError(error.message, 500)

  const teamIds = (teams ?? []).map((t: any) => t.id).filter(Boolean)

  let members: any[] = []
  if (teamIds.length > 0) {
    const { data, error: mErr } = await supabaseAdmin
      .from("team_members")
      .select("team_id, worker_id, created_at")
      .in("team_id", teamIds)
    if (mErr) return jsonError(mErr.message, 500)
    members = data ?? []
  }

  const workerIds = Array.from(new Set([
    ...(teams ?? []).map((t: any) => t.leader_worker_id),
    ...members.map((m: any) => m.worker_id),
  ].filter(Boolean)))

  let workers: any[] = []
  if (workerIds.length > 0) {
    const { data, error: wErr } = await supabaseAdmin
      .from("workers")
      .select("id, name, phone")
      .eq("office_id", session.officeId)
      .in("id", workerIds)
    if (wErr) return jsonError(wErr.message, 500)
    workers = data ?? []
  }

  const workerById = new Map<string, any>()
  for (const w of workers) workerById.set(w.id, w)

  const membersByTeamId = new Map<string, any[]>()
  for (const m of members) {
    const arr = membersByTeamId.get(m.team_id) ?? []
    const w = workerById.get(m.worker_id)
    arr.push({
      workerId: m.worker_id,
      workerName: w?.name ?? "",
      workerPhone: w?.phone ?? "",
      createdAt: m.created_at,
    })
    membersByTeamId.set(m.team_id, arr)
  }

  const items = (teams ?? []).map((t: any) => {
    const leader = workerById.get(t.leader_worker_id)
    return {
      id: t.id,
      leaderWorkerId: t.leader_worker_id,
      leaderWorkerName: leader?.name ?? "",
      leaderWorkerPhone: leader?.phone ?? "",
      siteId: t.site_id ?? null,
      members: membersByTeamId.get(t.id) ?? [],
      createdAt: t.created_at,
    }
  })

  return NextResponse.json({ teams: items })
}
