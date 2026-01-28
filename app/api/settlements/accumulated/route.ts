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

type AccRow = {
  id: string
  workerId: string
  workerName: string
  role: string
  attendanceDays: number
  attendanceHours: number
  unitPrice: number
  calculatedAmount: number
  adjustment: number
  finalAmount: number
  status: "미정산" | "정산완료"
}

export async function GET(req: Request) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return jsonError("Unauthorized", 401)

  const url = new URL(req.url)
  const siteId = String(url.searchParams.get("siteId") ?? "").trim()
  const start = String(url.searchParams.get("start") ?? "").trim()
  const end = String(url.searchParams.get("end") ?? "").trim()

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

  // 기간 원장
  const { data: rows, error: rowsError } = await supabaseAdmin
    .from("daily_settlements")
    .select("worker_id, work_date, daily_wage, locked")
    .eq("office_id", session.officeId)
    .eq("site_id", siteId)
    .gte("work_date", startDate)
    .lte("work_date", endDate)

  if (rowsError) return jsonError(rowsError.message, 500)

  // worker 이름/역할
  const { data: workers, error: workersError } = await supabaseAdmin
    .from("workers")
    .select("id, name, worker_roles(role_id, roles(name))")
    .eq("office_id", session.officeId)

  if (workersError) return jsonError(workersError.message, 500)

  const workerById = new Map<string, any>()
  for (const w of workers ?? []) workerById.set(w.id, w)

  // 집계
  const agg = new Map<string, { total: number; days: number; anyLocked: boolean }>()
  for (const r of rows ?? []) {
    const workerId = r.worker_id as string
    const prev = agg.get(workerId) ?? { total: 0, days: 0, anyLocked: false }
    agg.set(workerId, {
      total: prev.total + (r.daily_wage ?? 0),
      days: prev.days + 1,
      anyLocked: prev.anyLocked || Boolean(r.locked),
    })
  }

  const items: AccRow[] = []
  for (const [workerId, a] of agg.entries()) {
    const w = workerById.get(workerId)

    const roleName =
      w?.worker_roles?.[0]?.roles?.name ||
      w?.worker_roles?.[0]?.roles?.[0]?.name ||
      "일반"

    const unitPrice = a.days > 0 ? Math.round(a.total / a.days) : 0

    items.push({
      id: `acc-${siteId}-${workerId}-${startDate}-${endDate}`,
      workerId,
      workerName: w?.name ?? "(알수없음)",
      role: roleName,
      attendanceDays: a.days,
      attendanceHours: 0,
      unitPrice,
      calculatedAmount: a.total,
      adjustment: 0,
      finalAmount: a.total,
      status: a.anyLocked ? "정산완료" : "미정산",
    })
  }

  items.sort((a, b) => b.finalAmount - a.finalAmount)

  return NextResponse.json({ items })
}
