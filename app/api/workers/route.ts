import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { toWorkerDTO } from "@/lib/server/worker-dto"

// 관계명이 roles일 수도/role일 수도 있어 둘 다 select(하나만 실제로 채워질 것)
const WORKER_SELECT_WITH_ROLES = `
  *,
  worker_roles (
    role_id,
    roles ( id, name, color ),
    role:roles ( id, name, color )
  )
`

export async function GET() {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from("workers")
    .select(WORKER_SELECT_WITH_ROLES)
    .eq("office_id", session.officeId)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const workers = (data ?? []).map(toWorkerDTO)
  return NextResponse.json({ workers })
}

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()

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
    .single()

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  if (!inserted) return NextResponse.json({ error: "Insert failed" }, { status: 500 })

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
