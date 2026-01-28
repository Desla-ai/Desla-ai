import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session"

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function parseDate(value: string) {
  // expecting YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return value
}

function isWithinLastNDays(dateStr: string, n: number) {
  const [y, m, d] = dateStr.split("-").map(Number)
  if (!y || !m || !d) return false

  // ✅ local midnight (KST 브라우저 기준과 일치)
  const target = new Date(y, m - 1, d)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const diffDays = Math.floor((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24))
  return diffDays >= 0 && diffDays <= n
}

export async function GET(req: Request) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return jsonError("Unauthorized", 401)

  const url = new URL(req.url)
  const siteId = String(url.searchParams.get("siteId") ?? "").trim()
  const date = String(url.searchParams.get("date") ?? "").trim()

  if (!siteId) return jsonError("siteId is required", 400)
  const workDate = parseDate(date)
  if (!workDate) return jsonError("date must be YYYY-MM-DD", 400)

  // 최근 30일만 편집/조회 허용(정책 A)
  if (!isWithinLastNDays(workDate, 30)) {
    return jsonError("date is out of editable range (last 30 days)", 400)
  }

  const { data, error } = await supabaseAdmin
    .from("daily_settlements")
    .select("id, site_id, worker_id, work_date, daily_wage, locked, created_at, updated_at")
    .eq("office_id", session.officeId)
    .eq("site_id", siteId)
    .eq("work_date", workDate)
    .order("created_at", { ascending: true })

  if (error) return jsonError(error.message, 500)

  return NextResponse.json({ rows: data ?? [] })
}

export async function PUT(req: Request) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return jsonError("Unauthorized", 401)

  const body = await req.json().catch(() => ({}))
  const siteId = String(body?.siteId ?? "").trim()
  const workerId = String(body?.workerId ?? "").trim()
  const date = String(body?.workDate ?? "").trim()
  const dailyWage = Number(body?.dailyWage ?? NaN)

  if (!siteId) return jsonError("siteId is required", 400)
  if (!workerId) return jsonError("workerId is required", 400)

  const workDate = parseDate(date)
  if (!workDate) return jsonError("workDate must be YYYY-MM-DD", 400)

  if (!isWithinLastNDays(workDate, 30)) {
    return jsonError("workDate is out of editable range (last 30 days)", 400)
  }

  if (!Number.isFinite(dailyWage) || dailyWage < 0) {
    return jsonError("dailyWage must be a number >= 0", 400)
  }

  // (선택) locked면 수정 막기: 정책 결정 가능
  // 지금은 "편집 기능"이 있으니 locked라도 수정 허용하거나,
  // 권한/토글로 제한할 수 있음. 일단은 허용하되, 원하면 여기서 막아줄게.

  const { data, error } = await supabaseAdmin
    .from("daily_settlements")
    .upsert(
      [{
        office_id: session.officeId,
        site_id: siteId,
        worker_id: workerId,
        work_date: workDate,
        daily_wage: Math.round(dailyWage),
        created_by_user_id: session.userId ?? null,
        updated_at: new Date().toISOString(),
      }],
      { onConflict: "office_id,site_id,worker_id,work_date" }
    )
    .select("id, site_id, worker_id, work_date, daily_wage, locked, created_at, updated_at")
    .single()

  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ row: data })
}
