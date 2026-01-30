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

function parseWorkUnits(raw: any): { ok: true; value: number } | { ok: false; error: string } {
  const n = Number(raw)
  if (!Number.isFinite(n)) return { ok: false, error: "workUnits must be a number" }
  if (n < 0) return { ok: false, error: "workUnits must be >= 0" }
  if (Math.round(n * 2) !== n * 2) return { ok: false, error: "workUnits must be in 0.5 steps" }
  return { ok: true, value: n }
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

  if (!isWithinLastNDays(workDate, 30)) {
    return jsonError("date is out of editable range (last 30 days)", 400)
  }

  const { data, error } = await supabaseAdmin
    .from("daily_settlements")
    .select("id, site_id, worker_id, work_date, daily_wage, work_units, locked, created_at, updated_at")
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
  const unitPrice = Number(body?.dailyWage ?? NaN) // ✅ 입력은 dailyWage지만 의미는 "공수당(단가)"
  const locked = body?.locked

  if (!siteId) return jsonError("siteId is required", 400)
  if (!workerId) return jsonError("workerId is required", 400)

  const workDate = parseDate(date)
  if (!workDate) return jsonError("workDate must be YYYY-MM-DD", 400)

  if (!isWithinLastNDays(workDate, 30)) {
    return jsonError("workDate is out of editable range (last 30 days)", 400)
  }

  const hasUnitPrice = Number.isFinite(unitPrice)
  const hasLocked = typeof locked === "boolean"
  const hasWorkUnits = body?.workUnits !== undefined && body?.workUnits !== null

  if (!hasUnitPrice && !hasLocked && !hasWorkUnits) {
    return jsonError("dailyWage or locked or workUnits is required", 400)
  }

  if (hasUnitPrice && unitPrice < 0) {
    return jsonError("dailyWage (unit price) must be a number >= 0", 400)
  }

  // work_units 파싱
  let workUnits: number | null = null
  if (hasWorkUnits) {
    const parsed = parseWorkUnits(body.workUnits)
    if (!parsed.ok) return jsonError(parsed.error, 400)
    workUnits = parsed.value
  }

  // ✅ A안 정책: locked=true인 row는 수정 금지. 확정 해제 후 수정.
  const wantsToChangeValues = hasUnitPrice || workUnits !== null
  if (wantsToChangeValues) {
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("daily_settlements")
      .select("locked")
      .eq("office_id", session.officeId)
      .eq("site_id", siteId)
      .eq("worker_id", workerId)
      .eq("work_date", workDate)
      .maybeSingle()

    if (exErr) return jsonError(exErr.message, 500)
    if (existing?.locked) {
      return jsonError("이미 금액확정(locked)된 항목은 수정할 수 없습니다. 먼저 확정 해제하세요.", 409)
    }
  }

  const { data, error } = await supabaseAdmin
    .from("daily_settlements")
    .upsert(
      [{
        office_id: session.officeId,
        site_id: siteId,
        worker_id: workerId,
        work_date: workDate,
        ...(hasUnitPrice ? { daily_wage: Math.round(unitPrice) } : {}), // ✅ 원 단위 정수
        ...(hasLocked ? { locked } : {}),
        ...(workUnits !== null ? { work_units: workUnits } : {}),
        created_by_user_id: session.userId ?? null,
        updated_at: new Date().toISOString(),
      }],
      { onConflict: "office_id,site_id,worker_id,work_date" }
    )
    .select("id, site_id, worker_id, work_date, daily_wage, work_units, locked, created_at, updated_at")
    .single()

  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ row: data })
}
