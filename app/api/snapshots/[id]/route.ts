import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session"

type Params = { id: string }

export async function GET(_req: Request, ctx: { params: Promise<Params> | Params }) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const params = await Promise.resolve(ctx.params) // ✅ 핵심
  const id = params.id

  const { data, error } = await supabaseAdmin
    .from("app_snapshots")
    .select("id, title, created_at, metrics, data")
    .eq("id", id)
    .eq("office_id", session.officeId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    snapshot: {
      id: data.id,
      title: data.title,
      timestamp: data.created_at,
      metrics: data.metrics ?? {},
      data: data.data,
    },
  })
}

export async function DELETE(_req: Request, ctx: { params: Promise<Params> | Params }) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const params = await Promise.resolve(ctx.params) // ✅ 핵심
  const id = params.id

  const { error } = await supabaseAdmin
    .from("app_snapshots")
    .delete()
    .eq("id", id)
    .eq("office_id", session.officeId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
