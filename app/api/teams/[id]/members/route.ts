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
        if (workerId === team.leader_worker_id) return jsonError("leader cannot be member", 400)

        // 1) 같은 office 내에서 이 worker가 속한 기존 팀을 찾는다
        const { data: existingMemberships, error: emErr } = await supabaseAdmin
            .from("team_members")
            .select("team_id")
            .eq("worker_id", workerId)

        if (emErr) return jsonError(emErr.message, 500)

        const existingTeamIds = Array.from(new Set((existingMemberships ?? []).map((x: any) => x.team_id))).filter(Boolean)

        if (existingTeamIds.length > 0) {
            // 2) 기존 팀들이 현재 office 소속인지 확인 (스코프)
            const { data: existingTeams, error: etErr } = await supabaseAdmin
                .from("teams")
                .select("id")
                .eq("office_id", session.officeId)
                .in("id", existingTeamIds)

            if (etErr) return jsonError(etErr.message, 500)

            const officeScopedTeamIds = (existingTeams ?? []).map((t: any) => t.id)

            // 3) 정책2: 기존 팀 소속을 모두 제거하고, 새 팀에 넣는다 (move)
            if (officeScopedTeamIds.length > 0) {
                const { error: delErr } = await supabaseAdmin
                    .from("team_members")
                    .delete()
                    .eq("worker_id", workerId)
                    .in("team_id", officeScopedTeamIds)

                if (delErr) return jsonError(delErr.message, 500)
            }
        }

        // 4) 새 팀에 추가
        const { error: insErr } = await supabaseAdmin
            .from("team_members")
            .insert([{ team_id: teamId, worker_id: workerId }])

        if (insErr) return jsonError(insErr.message, 500)

        return NextResponse.json({ ok: true, moved: existingTeamIds.length > 0 })
    }


    const { error } = await supabaseAdmin
        .from("team_members")
        .delete()
        .eq("team_id", teamId)
        .eq("worker_id", workerId)

    if (error) return jsonError(error.message, 500)
    return NextResponse.json({ ok: true })
}


