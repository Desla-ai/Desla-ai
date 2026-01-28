import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session"
import { toSiteDTO } from "@/lib/server/site-dto"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: siteId } = await params
  if (!siteId) return NextResponse.json({ error: "Missing site id" }, { status: 400 })

  const body = await req.json()
  const updates: any = {}

  // 안전한 field-delta (존재할 때만 업데이트)
  if (typeof body?.name === "string") updates.name = body.name
  if ("address" in body) updates.address = body.address ?? ""
  if ("status" in body) updates.status = body.status ?? "미진행"

  if ("start_date" in body) updates.start_date = body.start_date ?? null
  if ("end_date" in body) updates.end_date = body.end_date ?? null

  if ("planned_workers" in body) updates.planned_workers = Number(body.planned_workers ?? 0)

  if ("today_required" in body || "todayRequired" in body) {
    const v = body.today_required ?? body.todayRequired
    updates.today_required = Number(v ?? 0)
  }

  if ("check_in_time" in body) updates.check_in_time = body.check_in_time ?? ""
  if ("office_phone" in body) updates.office_phone = body.office_phone ?? ""

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from("sites")
    .update(updates)
    .eq("id", siteId)
    .eq("office_id", session.officeId)
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ site: toSiteDTO(data) })

}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: siteId } = await params
  if (!siteId) return NextResponse.json({ error: "Missing site id" }, { status: 400 })

  const { error } = await supabaseAdmin
    .from("sites")
    .delete()
    .eq("id", siteId)
    .eq("office_id", session.officeId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
