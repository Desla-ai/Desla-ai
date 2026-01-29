import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session"

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}
function isYmd(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v)
}

export async function GET(req: Request) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return jsonError("Unauthorized", 401)
  const s = session

  const url = new URL(req.url)
  const siteId = String(url.searchParams.get("siteId") ?? "").trim()
  const periodStart = String(url.searchParams.get("periodStart") ?? "").trim()
  const periodEnd = String(url.searchParams.get("periodEnd") ?? "").trim()

  if (!siteId) return jsonError("siteId is required", 400)
  if (!isYmd(periodStart) || !isYmd(periodEnd)) return jsonError("periodStart/periodEnd must be YYYY-MM-DD", 400)
  if (periodStart > periodEnd) return jsonError("periodStart must be <= periodEnd", 400)

  const { data: batch, error } = await supabaseAdmin
    .from("settlement_batches")
    .select("id, status, period_start, period_end, created_at, confirmed_at, paid_at")
    .eq("office_id", s.officeId)
    .eq("site_id", siteId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .maybeSingle()

  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ batch })
}

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return jsonError("Unauthorized", 401)
  const s = session

  const body = await req.json().catch(() => ({}))
  const siteId = String(body?.siteId ?? "").trim()
  const periodStart = String(body?.periodStart ?? "").trim()
  const periodEnd = String(body?.periodEnd ?? "").trim()

  if (!siteId) return jsonError("siteId is required", 400)
  if (!isYmd(periodStart) || !isYmd(periodEnd)) return jsonError("periodStart/periodEnd must be YYYY-MM-DD", 400)
  if (periodStart > periodEnd) return jsonError("periodStart must be <= periodEnd", 400)

  // get-or-create by unique key (office_id, site_id, period_start, period_end)
  const { data: existing, error: findErr } = await supabaseAdmin
    .from("settlement_batches")
    .select("id, status, period_start, period_end, created_at, confirmed_at, paid_at")
    .eq("office_id", s.officeId)
    .eq("site_id", siteId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .maybeSingle()

  if (findErr) return jsonError(findErr.message, 500)
  if (existing?.id) return NextResponse.json({ batch: existing })

  const { data: created, error: insErr } = await supabaseAdmin
    .from("settlement_batches")
    .insert([
      {
        office_id: s.officeId,
        site_id: siteId,
        period_start: periodStart,
        period_end: periodEnd,
        status: "DRAFT",
        created_by_user_id: s.userId,
      },
    ])
    .select("id, status, period_start, period_end, created_at, confirmed_at, paid_at")
    .single()

  if (insErr) return jsonError(insErr.message, 500)
  return NextResponse.json({ batch: created })
}
