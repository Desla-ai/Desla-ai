import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session"

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
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
