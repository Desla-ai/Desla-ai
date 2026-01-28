import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session"

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return jsonError("Unauthorized", 401)

  const { id: teamId } = await ctx.params
  if (!teamId) return jsonError("teamId is required", 400)

  const body = await req.json().catch(() => ({}))
  const action = String(body?.action ?? "").trim() // add | remove
  const workerId = String(body?.workerId ?? "").trim()

  if (!["add", "remove"].includes(action)) return jsonError("action must be add|remove", 400)
  if (!workerId) return jsonError("workerId is required", 400)

  // 팀이 내 office인지 확인
  const { data: team, error: tErr } = await supabaseAdmin
    .from("teams")
    .select("id, office_id, leader_worker_id")
    .eq("id", teamId)
    .single()

  if (tErr) return jsonError(tErr.message, 500)
  if (!team || team.office_id !== session.officeId) return jsonError("Forbidden", 403)

  if (action === "add") {
    // 리더를 멤버로 추가하는 건 보통 금지(원하면 허용 가능)
    if (workerId === team.leader_worker_id) return jsonError("leader cannot be member", 400)

    const { error } = await supabaseAdmin
      .from("team_members")
      .insert([{ team_id: teamId, worker_id: workerId }])

    if (error) return jsonError(error.message, 500)
    return NextResponse.json({ ok: true })
  }

  const { error } = await supabaseAdmin
    .from("team_members")
    .delete()
    .eq("team_id", teamId)
    .eq("worker_id", workerId)

  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ ok: true })
}
