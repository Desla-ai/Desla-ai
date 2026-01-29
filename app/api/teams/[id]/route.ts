import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { verifySessionCookie, SESSION_COOKIE_NAME, getSession } from "@/lib/server/session"

function jsonError(message: string, status = 400) {
    return NextResponse.json({ error: message }, { status })
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) return jsonError("Unauthorized", 401)

    // ✅ 핵심: teamId는 문자열이어야 함
    const { id: teamId } = await ctx.params

    const body = await req.json().catch(() => ({}))
    const leaderWorkerId: string | undefined = body?.leaderWorkerId

    if (!teamId) return jsonError("teamId is required", 400)
    if (!leaderWorkerId) return jsonError("leaderWorkerId is required", 400)

    // 1) 팀이 현재 office 소속인지 확인
    const { data: team, error: teamErr } = await supabaseAdmin
      .from("teams")
      .select("id, office_id, leader_worker_id")
      .eq("id", teamId) // ✅ 문자열 id
      .single()

    if (teamErr || !team) return jsonError("Team not found", 404)
    if (team.office_id !== session.officeId) return jsonError("Forbidden", 403)

    // 2) 새 리더가 같은 office의 다른 팀 멤버인지 확인 후 기존 멤버십 제거(자동 이동)
    const { data: existingMemberships, error: memErr } = await supabaseAdmin
      .from("team_members")
      .select("team_id")
      .eq("worker_id", leaderWorkerId)

    if (memErr) return jsonError(memErr.message ?? "Failed to read memberships", 500)

    if (existingMemberships?.length) {
      const teamIds = existingMemberships.map((m) => m.team_id).filter(Boolean)
      if (teamIds.length) {
        const { data: officeTeams, error: officeTeamsErr } = await supabaseAdmin
          .from("teams")
          .select("id")
          .eq("office_id", session.officeId)
          .in("id", teamIds)

        if (officeTeamsErr) return jsonError(officeTeamsErr.message ?? "Failed to scope memberships", 500)

        const officeTeamIdSet = new Set((officeTeams ?? []).map((t) => t.id))
        const teamIdsToRemove = teamIds.filter((id) => officeTeamIdSet.has(id))

        if (teamIdsToRemove.length) {
          const { error: delErr } = await supabaseAdmin
            .from("team_members")
            .delete()
            .eq("worker_id", leaderWorkerId)
            .in("team_id", teamIdsToRemove)

          if (delErr) return jsonError(delErr.message ?? "Failed to remove old membership", 500)
        }
      }
    }

    // 3) 새 리더가 현재 팀의 멤버로 들어있으면 제거(리더=멤버 금지)
    const { error: selfDelErr } = await supabaseAdmin
      .from("team_members")
      .delete()
      .eq("team_id", teamId)     // ✅ 문자열 id
      .eq("worker_id", leaderWorkerId)

    if (selfDelErr) return jsonError(selfDelErr.message ?? "Failed to cleanup leader membership", 500)

    // 4) leader 교체
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("teams")
      .update({ leader_worker_id: leaderWorkerId })
      .eq("id", teamId)           // ✅ 문자열 id
      .eq("office_id", session.officeId)
      .select("id, leader_worker_id, site_id, created_at")
      .single()

    if (updErr) return jsonError(updErr.message ?? "Failed to update team leader", 500)

    const oldLeaderId = team.leader_worker_id

    // 5) ✅ 기존 반장 자동 팀원 편입 (+중복 충돌 방지)
    if (oldLeaderId && oldLeaderId !== leaderWorkerId) {
      const { error: insErr } = await supabaseAdmin
        .from("team_members")
        .insert({ team_id: teamId, worker_id: oldLeaderId }) // ✅ 문자열 id
      // team_members PK가 (team_id, worker_id)라 중복이면 여기서 에러날 수 있음.
      // 이미 멤버로 들어가 있었던 케이스를 허용하려면 아래처럼 처리:
      if (insErr && !String(insErr.message ?? "").includes("duplicate")) {
        return jsonError(insErr.message ?? "Failed to add old leader as member", 500)
      }
    }

    return NextResponse.json({ team: updated })
  } catch (e: any) {
    return jsonError(e?.message ?? "Internal Server Error", 500)
  }
}


export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const cookieStore = await cookies()
    const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
    if (!session) return jsonError("Unauthorized", 401)

    const { id: teamId } = await ctx.params
    if (!teamId) return jsonError("teamId is required", 400)

    // 팀이 내 office인지 확인
    const { data: team, error: tErr } = await supabaseAdmin
        .from("teams")
        .select("id, office_id")
        .eq("id", teamId)
        .single()

    if (tErr) return jsonError(tErr.message, 500)
    if (!team || team.office_id !== session.officeId) return jsonError("Forbidden", 403)

    // 1) members 먼저 삭제
    const { error: mErr } = await supabaseAdmin
        .from("team_members")
        .delete()
        .eq("team_id", teamId)

    if (mErr) return jsonError(mErr.message, 500)

    // 2) team 삭제
    const { error: dErr } = await supabaseAdmin
        .from("teams")
        .delete()
        .eq("id", teamId)

    if (dErr) return jsonError(dErr.message, 500)

    return NextResponse.json({ ok: true })
}

