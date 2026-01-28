import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { toWorkerDTO } from "@/lib/server/dto"

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const workerId = params.id
  const body = await req.json()

  const updates: any = {}
  if (typeof body?.name === "string") updates.name = body.name
  if ("phone" in body) updates.phone = body.phone ?? null
  if ("status" in body) updates.status = body.status ?? "미출근"
  if ("last_attendance" in body) updates.last_attendance = body.last_attendance ?? null

  if ("is_fixed" in body) updates.is_fixed = !!body.is_fixed
  if ("assigned_site_id" in body) updates.assigned_site_id = body.assigned_site_id ?? null

  // ✅ 고정 배치 기간
  if ("fixed_start_date" in body) updates.fixed_start_date = body.fixed_start_date ?? null
  if ("fixed_end_date" in body) updates.fixed_end_date = body.fixed_end_date ?? null

  // ✅ 안전장치: 고정 해제/현장 해제 시 기간 정리
  if ("is_fixed" in body && !updates.is_fixed) {
    updates.fixed_start_date = null
    updates.fixed_end_date = null
  }
  if ("assigned_site_id" in body && updates.assigned_site_id == null) {
    updates.is_fixed = false
    updates.fixed_start_date = null
    updates.fixed_end_date = null
  }

  const { error: upErr } = await supabaseAdmin
    .from("workers")
    .update(updates)
    .eq("id", workerId)
    .eq("office_id", session.officeId)

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // ✅ 역할 덮어쓰기(선택): role_ids 배열이 오면 worker_roles를 교체
  if (Array.isArray(body.role_ids)) {
    const { error: delErr } = await supabaseAdmin
      .from("worker_roles")
      .delete()
      .eq("worker_id", workerId)

    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

    if (body.role_ids.length > 0) {
      const rows = body.role_ids.map((roleId: string) => ({
        office_id: session.officeId,
        worker_id: workerId,
        role_id: roleId,
      }))
      const { error: insErr } = await supabaseAdmin.from("worker_roles").insert(rows)
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    }
  }

  // ✅ 조인해서 roles 포함 DTO 반환
  const { data: joined, error: joinErr } = await supabaseAdmin
    .from("workers")
    .select(`
      *,
      worker_roles (
        role_id,
        roles ( id, name, color )
      )
    `)
    .eq("id", workerId)
    .eq("office_id", session.officeId)
    .single()

  if (joinErr) return NextResponse.json({ error: joinErr.message }, { status: 500 })
  return NextResponse.json({ worker: toWorkerDTO(joined) })
}



export async function DELETE(
    _req: Request,
    { params }: { params: { id: string } }
) {
    const cookieStore = await cookies();
    const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workerId = params.id;

    const { error } = await supabaseAdmin
        .from("workers")
        .delete()
        .eq("id", workerId)
        .eq("office_id", session.officeId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
