import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { toWorkerDTO } from "@/lib/server/worker-dto"
import { encryptText, hmacIdentity } from "@/lib/server/worker-id-crypto";

// 관계명이 roles일 수도/role일 수도 있어 둘 다 select(하나만 실제로 채워질 것)
const WORKER_SELECT_WITH_ROLES = `
  *,
  worker_roles (
    role_id,
    roles ( id, name, color ),
    role:roles ( id, name, color )
  )
`

import { getSession } from "@/lib/server/session"

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return jsonError("Unauthorized", 401)

    // 1) workers 기본 조회
    const { data, error } = await supabaseAdmin
      .from("workers")
      .select(WORKER_SELECT_WITH_ROLES)
      .eq("office_id", session.officeId)
      .order("created_at", { ascending: true })

    if (error) return jsonError(error.message ?? "Failed to fetch workers", 500)

    const workers = (data ?? []).map(toWorkerDTO)

    // 2) teams + team_members 로드(office 범위)
    const { data: teams, error: teamsErr } = await supabaseAdmin
      .from("teams")
      .select("id, leader_worker_id")
      .eq("office_id", session.officeId)

    if (teamsErr) return jsonError(teamsErr.message ?? "Failed to fetch teams", 500)

    const teamIds = (teams ?? []).map((t) => t.id)
    const leaderByTeamId = new Map<string, string>()
    const teamIdByLeader = new Map<string, string>()
    for (const t of teams ?? []) {
      if (t.id && t.leader_worker_id) {
        leaderByTeamId.set(t.id, t.leader_worker_id)
        teamIdByLeader.set(t.leader_worker_id, t.id)
      }
    }

    let members: Array<{ team_id: string; worker_id: string }> = []
    if (teamIds.length > 0) {
      const { data: tm, error: tmErr } = await supabaseAdmin
        .from("team_members")
        .select("team_id, worker_id")
        .in("team_id", teamIds)

      if (tmErr) return jsonError(tmErr.message ?? "Failed to fetch team members", 500)
      members = (tm ?? []) as any
    }

    const membersByLeader = new Map<string, string[]>()
    const leaderByMember = new Map<string, string>()

    for (const m of members) {
      const leaderId = leaderByTeamId.get(m.team_id)
      if (!leaderId) continue
      leaderByMember.set(m.worker_id, leaderId)
      const arr = membersByLeader.get(leaderId) ?? []
      arr.push(m.worker_id)
      membersByLeader.set(leaderId, arr)
    }

    // 3) DTO overwrite: "반장 혼자"도 leader로 표시되게 teamIdByLeader를 기준으로 판단
    const enriched = workers.map((w) => {
      const isLeader = teamIdByLeader.has(w.id)
      if (isLeader) {
        return {
          ...w,
          team: "반장" as const,
          teamLeaderId: undefined,
          teamMembers: membersByLeader.get(w.id) ?? [],
        }
      }

      const leaderId = leaderByMember.get(w.id)
      if (leaderId) {
        return {
          ...w,
          team: "팀원" as const,
          teamLeaderId: leaderId,
          teamMembers: undefined,
        }
      }

      return { ...w, team: null, teamLeaderId: undefined, teamMembers: undefined }
    })

    return NextResponse.json({ workers: enriched })
  } catch (e: any) {
    return jsonError(e?.message ?? "Internal Server Error", 500)
  }
}

function assertIdParts(front6: string, back1: string) {
  if (!/^\d{6}$/.test(front6)) throw new Error("주민/외국인등록번호 앞 6자리는 숫자 6자리여야 합니다.");
  if (!/^\d{1}$/.test(back1)) throw new Error("주민/외국인등록번호 뒤 1자리는 숫자 1자리여야 합니다.");
}

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()

  const idFront6 = String(body?.idFront6 ?? body?.id_front6 ?? "").trim();
  const idBack1 = String(body?.idBack1 ?? body?.id_back1 ?? "").trim();

  const idCopyFrontPath = String(body?.idCopyFrontPath ?? body?.id_copy_front_path ?? "").trim();
  const idCopyBackPath = String(body?.idCopyBackPath ?? body?.id_copy_back_path ?? "").trim();

  try {
    assertIdParts(idFront6, idBack1);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "invalid id parts" }, { status: 400 });
  }

  if (!idCopyFrontPath || !idCopyBackPath) {
    return NextResponse.json({ error: "신분증 사본(앞/뒤) 2장을 모두 업로드해주세요." }, { status: 400 });
  }

  const idHash = hmacIdentity(session.officeId, idFront6, idBack1);

  if (typeof body?.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 })
  }

  const payload: any = {
    office_id: session.officeId,
    name: body.name.trim(),

    phone: ("phone" in body ? body.phone : null) ?? null,
    status: body.status ?? "미출근",

    assigned_site_id: body.assigned_site_id ?? body.assignedSiteId ?? null,
    is_fixed: body.is_fixed ?? body.isFixed ?? false,

    fixed_start_date: body.fixed_start_date ?? body.fixedStartDate ?? null,
    fixed_end_date: body.fixed_end_date ?? body.fixedEndDate ?? null,

    last_attendance: body.last_attendance ?? body.lastAttendance ?? null,
  }

  payload.id_front6 = encryptText(idFront6);
  payload.id_back1 = encryptText(idBack1);
  payload.id_hash = idHash;
  payload.id_copy_front_path = idCopyFrontPath;
  payload.id_copy_back_path = idCopyBackPath;
  payload.id_copy_uploaded_at = new Date().toISOString();

  // ✅ team 저장 (컬럼 추가했으니 활성화)
  if ("team" in body) payload.team = body.team ?? null
  if ("teamLeaderId" in body || "team_leader_id" in body) {
    payload.team_leader_id = body.team_leader_id ?? body.teamLeaderId ?? null
  }
  if ("teamMembers" in body || "team_members" in body) {
    payload.team_members = body.team_members ?? body.teamMembers ?? null
  }

  // 1) workers insert
  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("workers")
    .insert(payload)
    .select("*")
    .single();

  if (insErr) {
    // Supabase/Postgres unique 위반은 보통 code 23505
    const anyErr = insErr as any;
    if (anyErr?.code === "23505") {
      return NextResponse.json({ error: "이미 등록된 인력입니다(주민/외국인번호 중복)." }, { status: 409 });
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }


  // 2) role_ids 또는 roles 지원
  let roleIds: string[] = []

  if ("role_ids" in body) {
    if (!Array.isArray(body.role_ids)) {
      return NextResponse.json({ error: "role_ids must be an array" }, { status: 400 })
    }
    roleIds = body.role_ids
  }

  if (roleIds.length === 0 && "roles" in body) {
    if (!Array.isArray(body.roles)) {
      return NextResponse.json({ error: "roles must be an array" }, { status: 400 })
    }
    roleIds = body.roles
      .map((r: any) => r?.id)
      .filter((id: any) => typeof id === "string" && id.trim().length > 0)
  }

  roleIds = Array.from(new Set(roleIds))

  if (roleIds.length > 0) {
    const rows = roleIds.map((roleId: string) => ({
      office_id: session.officeId,
      worker_id: inserted.id,
      role_id: roleId,
    }))

    const { error: wrErr } = await supabaseAdmin.from("worker_roles").insert(rows)
    if (wrErr) return NextResponse.json({ error: wrErr.message }, { status: 500 })
  }

  // 3) 조인 재조회 후 DTO로 반환
  const { data: joined, error: joinErr } = await supabaseAdmin
    .from("workers")
    .select(WORKER_SELECT_WITH_ROLES)
    .eq("id", inserted.id)
    .eq("office_id", session.officeId)
    .single()

  if (joinErr) return NextResponse.json({ error: joinErr.message }, { status: 500 })
  if (!joined) return NextResponse.json({ error: "Not found after insert" }, { status: 404 })

  return NextResponse.json({ worker: toWorkerDTO(joined) })
}
