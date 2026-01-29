import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session"

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(req: Request) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return jsonError("Unauthorized", 401)

  const url = new URL(req.url)
  const siteId = String(url.searchParams.get("siteId") ?? "").trim()
  if (!siteId) return jsonError("siteId is required", 400)

  const { data: site, error } = await supabaseAdmin
    .from("sites")
    .select("id, default_settlement_mode")
    .eq("office_id", session.officeId)
    .eq("id", siteId)
    .maybeSingle()

  if (error) return jsonError(error.message, 500)
  if (!site) return jsonError("Site not found", 404)

  // default_settlement_mode 예시:
  // - "MONTHLY"면 월말 일괄지급 ON
  // - 그 외/null이면 OFF로 취급
  const monthlyPayoutEnabled = String(site.default_settlement_mode ?? "") === "MONTHLY"

  return NextResponse.json({
    ok: true,
    siteId: site.id,
    monthlyPayoutEnabled,
    defaultSettlementMode: site.default_settlement_mode ?? null,
  })
}

export async function PUT(req: Request) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return jsonError("Unauthorized", 401)

  const body = await req.json().catch(() => ({}))
  const siteId = String(body?.siteId ?? "").trim()
  const monthlyPayoutEnabled = Boolean(body?.monthlyPayoutEnabled)

  if (!siteId) return jsonError("siteId is required", 400)

  const defaultSettlementMode = monthlyPayoutEnabled ? "MONTHLY" : null

  const { data, error } = await supabaseAdmin
    .from("sites")
    .update({ default_settlement_mode: defaultSettlementMode })
    .eq("office_id", session.officeId)
    .eq("id", siteId)
    .select("id, default_settlement_mode")
    .maybeSingle()

  if (error) return jsonError(error.message, 500)
  if (!data) return jsonError("Site not found", 404)

  return NextResponse.json({
    ok: true,
    siteId: data.id,
    monthlyPayoutEnabled: String(data.default_settlement_mode ?? "") === "MONTHLY",
    defaultSettlementMode: data.default_settlement_mode ?? null,
  })
}
