import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session"

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return value
}

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return jsonError("Unauthorized", 401)

  const body = await req.json().catch(() => ({}))
  const siteId = String(body?.siteId ?? "").trim()
  const start = String(body?.start ?? "").trim()
  const end = String(body?.end ?? "").trim()

  if (!siteId) return jsonError("siteId is required", 400)
  const startDate = parseDate(start)
  const endDate = parseDate(end)
  if (!startDate || !endDate) return jsonError("start/end must be YYYY-MM-DD", 400)
  if (startDate > endDate) return jsonError("start must be <= end", 400)

  // 권한: site가 내 office인지 확인
  const { data: site, error: siteError } = await supabaseAdmin
    .from("sites")
    .select("id, office_id")
    .eq("id", siteId)
    .single()

  if (siteError) return jsonError(siteError.message, 500)
  if (!site || site.office_id !== session.officeId) return jsonError("Forbidden", 403)

  // 이미 locked된 row 포함해서 '기간 전체를 확정'하는 정책(멱등)
  const { error: updError, count } = await supabaseAdmin
    .from("daily_settlements")
    .update({
      locked: true,
      updated_at: new Date().toISOString(),
    })
    .eq("office_id", session.officeId)
    .eq("site_id", siteId)
    .gte("work_date", startDate)
    .lte("work_date", endDate)

  if (updError) return jsonError(updError.message, 500)

  return NextResponse.json({
    ok: true,
    lockedRange: { siteId, start: startDate, end: endDate },
    updatedCount: count ?? null,
  })
}
