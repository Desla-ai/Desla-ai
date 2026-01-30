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
  attendanceDays: number // ✅ 이제 "일수"가 아니라 "공수 합계"로 사용 (UI에서 공수로 표기)
  unitPrice: number      // ✅ 공수당(단가) (기간 내 가중평균 단가)
  calculatedAmount: number
  adjustment: number
  finalAmount: number
  status: "확정대기" | "금액확정"
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

  // 기간 원장 (✅ work_units 포함)
  const { data: rows, error: rowsError } = await supabaseAdmin
    .from("daily_settlements")
    .select("worker_id, work_date, daily_wage, work_units, locked")
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

  // 집계: gross(총액), workUnits(공수합), anyLocked(확정여부)
  const agg = new Map<string, { gross: number; workUnits: number; anyLocked: boolean }>()

  for (const r of rows ?? []) {
    const workerId = r.worker_id as string

    const unitPrice = Number((r as any).daily_wage ?? 0)         // 공수당(단가)
    const workUnits = Number((r as any).work_units ?? 1.0)       // 공수 (DB not null이면 사실상 항상 존재)
    const gross = unitPrice * workUnits

    const prev = agg.get(workerId) ?? { gross: 0, workUnits: 0, anyLocked: false }
    agg.set(workerId, {
      gross: prev.gross + gross,
      workUnits: prev.workUnits + workUnits,
      anyLocked: prev.anyLocked || Boolean((r as any).locked),
    })
  }

  const items: AccRow[] = []

  for (const [workerId, a] of agg.entries()) {
    const w = workerById.get(workerId)

    const roleName =
      w?.worker_roles?.[0]?.roles?.name ||
      w?.worker_roles?.[0]?.roles?.[0]?.name ||
      "일반"

    // 기간 내 가중평균 공수당(단가)
    const unitPrice = a.workUnits > 0 ? Math.round(a.gross / a.workUnits) : 0

    // 원 단위 정수 유지
    const calculatedAmount = Math.round(a.gross)

    items.push({
      id: `acc-${siteId}-${workerId}-${startDate}-${endDate}`,
      workerId,
      workerName: w?.name ?? "(알수없음)",
      role: roleName,
      attendanceDays: a.workUnits,      // ✅ 공수 합계
      unitPrice,
      calculatedAmount,
      adjustment: 0,
      finalAmount: calculatedAmount,
      status: a.anyLocked ? "금액확정" : "확정대기",
    })
  }

  items.sort((a, b) => b.finalAmount - a.finalAmount)

  return NextResponse.json({ items })
}
