import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { toWorkerDTO } from "@/lib/server/worker-dto"

const WORKER_SELECT_WITH_ROLES = `
  *,
  worker_roles (
    role_id,
    roles ( id, name, color )
  )
`

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: workerId } = await params
  if (!workerId) return NextResponse.json({ error: "Missing worker id" }, { status: 400 })

  const body = await req.json()

  // 1) workers 테이블 업데이트(필드 존재할 때만)
  const updates: any = {}

  if (typeof body?.name === "string") updates.name = body.name

  if ("phone" in body) updates.phone = body.phone ?? null
  if ("status" in body) updates.status = body.status ?? "미출근"

  // snake/camel 모두 허용 (프론트 과도기 안전)
  if ("assignedSiteId" in body || "assigned_site_id" in body) {
    updates.assigned_site_id = body.assignedSiteId ?? body.assigned_site_id ?? null
  }
  if ("isFixed" in body || "is_fixed" in body) {
    updates.is_fixed = !!(body.isFixed ?? body.is_fixed)
  }

  if ("fixedStartDate" in body || "fixed_start_date" in body) {
    updates.fixed_start_date = body.fixedStartDate ?? body.fixed_start_date ?? null
  }
  if ("fixedEndDate" in body || "fixed_end_date" in body) {
    updates.fixed_end_date = body.fixedEndDate ?? body.fixed_end_date ?? null
  }

  if ("lastAttendance" in body || "last_attendance" in body) {
    updates.last_attendance = body.lastAttendance ?? body.last_attendance ?? null
  }

  // no-op 방지
  const hasWorkerUpdates = Object.keys(updates).length > 0

  if (hasWorkerUpdates) {
    const { error: updErr } = await supabaseAdmin
      .from("workers")
      .update(updates)
      .eq("id", workerId)
      .eq("office_id", session.officeId)

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  // 2) 역할 교체: role_ids가 오면 기존 worker_roles를 갈아끼움
  // body.role_ids: string[] (roles.id 배열)
  if ("role_ids" in body) {
    if (!Array.isArray(body.role_ids)) {
      return NextResponse.json({ error: "role_ids must be an array" }, { status: 400 })
    }

    // 기존 매핑 삭제 (office 스코프 보호)
    const { error: delErr } = await supabaseAdmin
      .from("worker_roles")
      .delete()
      .eq("worker_id", workerId)
      .eq("office_id", session.officeId)

    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

    // 새 매핑 삽입
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

  // 3) 최종 결과를 join으로 다시 조회해서 DTO로 반환
  const { data: joined, error: joinErr } = await supabaseAdmin
    .from("workers")
    .select(WORKER_SELECT_WITH_ROLES)
    .eq("id", workerId)
    .eq("office_id", session.officeId)
    .single()

  if (joinErr) return NextResponse.json({ error: joinErr.message }, { status: 500 })
  if (!joined) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ worker: toWorkerDTO(joined) })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: workerId } = await params
  if (!workerId) return NextResponse.json({ error: "Missing worker id" }, { status: 400 })

  // 역할 매핑 먼저 삭제(선택: FK on delete cascade면 없어도 됨)
  await supabaseAdmin
    .from("worker_roles")
    .delete()
    .eq("worker_id", workerId)
    .eq("office_id", session.officeId)

  const { error } = await supabaseAdmin
    .from("workers")
    .delete()
    .eq("id", workerId)
    .eq("office_id", session.officeId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
