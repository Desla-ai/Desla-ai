import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session"

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function isYm(v: string) {
  return /^\d{4}-\d{2}$/.test(v)
}

export async function GET(req: Request) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return jsonError("Unauthorized", 401)

  const url = new URL(req.url)
  const siteId = String(url.searchParams.get("siteId") ?? "").trim()
  const period = String(url.searchParams.get("period") ?? "").trim()

  if (!siteId) return jsonError("siteId is required", 400)
  if (!isYm(period)) return jsonError("period must be YYYY-MM", 400)

  const { data, error } = await supabaseAdmin
    .from("settlement_rules")
    .select("id, site_id, type, target_id, target_name, commission_type, commission_value, effective_start, effective_end")
    .eq("office_id", session.officeId)
    .eq("site_id", siteId)
    .lte("effective_start", period)
    .gte("effective_end", period)
    .order("created_at", { ascending: true })

  if (error) return jsonError(error.message, 500)

  // 프론트 타입명으로 변환
  const rules = (data ?? []).map((r: any) => ({
    id: r.id,
    siteId: r.site_id,
    type: r.type,
    targetId: r.target_id ?? undefined,
    targetName: r.target_name ?? undefined,
    commissionType: r.commission_type,
    commissionValue: r.commission_value,
    effectiveStart: r.effective_start,
    effectiveEnd: r.effective_end,
  }))

  return NextResponse.json({ rules })
}

export async function PUT(req: Request) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return jsonError("Unauthorized", 401)

  const body = await req.json().catch(() => ({}))
  const rule = body?.rule
  if (!rule) return jsonError("rule is required", 400)

  if (!rule.siteId) return jsonError("rule.siteId is required", 400)
  if (!["site", "occupation", "worker"].includes(rule.type)) return jsonError("rule.type invalid", 400)
  if (!["RATE", "FIXED"].includes(rule.commissionType)) return jsonError("rule.commissionType invalid", 400)
  if (!Number.isFinite(rule.commissionValue)) return jsonError("rule.commissionValue invalid", 400)
  if (!isYm(rule.effectiveStart) || !isYm(rule.effectiveEnd)) return jsonError("effectiveStart/End must be YYYY-MM", 400)

  const payload: any = {
    id: rule.id && !String(rule.id).startsWith("new-") ? rule.id : undefined,
    office_id: session.officeId,
    site_id: rule.siteId,
    type: rule.type,
    target_id: rule.targetId ?? null,
    target_name: rule.targetName ?? null,
    commission_type: rule.commissionType,
    commission_value: Math.round(rule.commissionValue),
    effective_start: rule.effectiveStart,
    effective_end: rule.effectiveEnd,
    created_by_user_id: session.userId ?? null,
    updated_at: new Date().toISOString(),
  }
  if (!payload.id) delete payload.id

  const { data, error } = await supabaseAdmin
    .from("settlement_rules")
    .upsert([payload], { onConflict: "id" })
    .select("id, site_id, type, target_id, target_name, commission_type, commission_value, effective_start, effective_end")
    .single()

  if (error) return jsonError(error.message, 500)

  return NextResponse.json({
    rule: {
      id: data.id,
      siteId: data.site_id,
      type: data.type,
      targetId: data.target_id ?? undefined,
      targetName: data.target_name ?? undefined,
      commissionType: data.commission_type,
      commissionValue: data.commission_value,
      effectiveStart: data.effective_start,
      effectiveEnd: data.effective_end,
    },
  })
}

export async function DELETE(req: Request) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return jsonError("Unauthorized", 401)

  const url = new URL(req.url)
  const id = String(url.searchParams.get("id") ?? "").trim()
  if (!id) return jsonError("id is required", 400)

  const { error } = await supabaseAdmin
    .from("settlement_rules")
    .delete()
    .eq("office_id", session.officeId)
    .eq("id", id)

  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ ok: true })
}
