import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session"

const SNAPSHOT_LIMIT = 100

export async function GET() {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from("app_snapshots")
    .select("id, title, created_at, metrics")
    .eq("office_id", session.officeId)
    .order("created_at", { ascending: false })
    .limit(SNAPSHOT_LIMIT)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // UI가 기대하는 AppSnapshot 형태로 맞추되, 목록에서는 data를 제외(무거움)
  const snapshots = (data ?? []).map((s: any) => ({
    id: s.id,
    title: s.title,
    timestamp: s.created_at,
    metrics: s.metrics ?? {},
    data: null, // 목록에서는 미포함
  }))

  return NextResponse.json({ snapshots })
}

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const title = String(body?.title ?? "").trim()
  const data = body?.data
  const metrics = body?.metrics ?? {}

  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 })
  if (!data) return NextResponse.json({ error: "data is required" }, { status: 400 })

  // 1) insert
  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("app_snapshots")
    .insert({
      office_id: session.officeId,
      title,
      data,
      metrics,
    })
    .select("id, title, created_at, metrics, data")
    .single()

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  // 2) limit 유지: 최신 100개만 남기고 나머지 삭제
  const { data: ids, error: idsErr } = await supabaseAdmin
    .from("app_snapshots")
    .select("id")
    .eq("office_id", session.officeId)
    .order("created_at", { ascending: false })
    .range(SNAPSHOT_LIMIT, 10000)

  if (!idsErr && ids && ids.length > 0) {
    const oldIds = ids.map((x: any) => x.id)
    await supabaseAdmin.from("app_snapshots").delete().in("id", oldIds)
  }

  return NextResponse.json({
    snapshot: {
      id: inserted.id,
      title: inserted.title,
      timestamp: inserted.created_at,
      metrics: inserted.metrics ?? {},
      data: inserted.data,
    },
  })
}
