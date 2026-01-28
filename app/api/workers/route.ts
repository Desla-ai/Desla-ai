import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { toWorkerDTO } from "@/lib/server/dto"

export async function GET() {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // ✅ roles 조인: worker_roles -> roles
  const { data, error } = await supabaseAdmin
    .from("workers")
    .select(`
      *,
      worker_roles (
        role_id,
        roles ( id, name, color )
      )
    `)
    .eq("office_id", session.officeId)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ workers: (data ?? []).map(toWorkerDTO) })
}

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // body: { name, phone, status, is_fixed, assigned_site_id, fixed_start_date, fixed_end_date, role_ids?: string[] }
  const body = await req.json()

  const payload = {
    office_id: session.officeId,
    name: body.name,
    phone: body.phone ?? null,
    status: body.status ?? "미출근",
    is_fixed: body.is_fixed ?? false,
    assigned_site_id: body.assigned_site_id ?? null,
    fixed_start_date: body.fixed_start_date ?? null,
    fixed_end_date: body.fixed_end_date ?? null,
    last_attendance: body.last_attendance ?? null,
  }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("workers")
    .insert(payload)
    .select("*")
    .single()

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  // ✅ 역할 매핑(선택): role_ids 배열이 오면 worker_roles에 넣음
  if (Array.isArray(body.role_ids) && body.role_ids.length > 0) {
    const rows = body.role_ids.map((roleId: string) => ({
      office_id: session.officeId,
      worker_id: inserted.id,
      role_id: roleId,
    }))
    const { error: wrErr } = await supabaseAdmin.from("worker_roles").insert(rows)
    if (wrErr) return NextResponse.json({ error: wrErr.message }, { status: 500 })
  }

  // ✅ 다시 조인해서 roles 포함 DTO로 반환
  const { data: joined, error: joinErr } = await supabaseAdmin
    .from("workers")
    .select(`
      *,
      worker_roles (
        role_id,
        roles ( id, name, color )
      )
    `)
    .eq("id", inserted.id)
    .eq("office_id", session.officeId)
    .single()

  if (joinErr) return NextResponse.json({ error: joinErr.message }, { status: 500 })
  return NextResponse.json({ worker: toWorkerDTO(joined) })
}
