import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { z } from "zod"

import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { SESSION_COOKIE_NAME, verifySessionCookie } from "@/lib/server/session"

const PrefsSchema = z.object({
  notifyCheckIn: z.boolean().optional(),
  notifyBilling: z.boolean().optional(),
  notifyIssues: z.boolean().optional(),
  autoLogout: z.boolean().optional(),
  autoRefresh: z.boolean().optional(),
})

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET() {
  try {
    const cookieStore = await cookies()
    const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? ""
    const session = verifySessionCookie(raw)
    if (!session) return jsonError("Unauthorized", 401)

    const { data, error } = await supabaseAdmin
      .from("office_prefs")
      .select("office_id, prefs, updated_at")
      .eq("office_id", session.officeId)
      .maybeSingle()

    if (error) return jsonError(error.message ?? "Failed to load prefs", 500)

    return NextResponse.json({
      prefs: (data?.prefs ?? {}) as Record<string, unknown>,
      updatedAt: data?.updated_at ?? null,
    })
  } catch (e: any) {
    return jsonError(e?.message ?? "Unexpected error", 500)
  }
}

export async function PUT(req: Request) {
  try {
    const cookieStore = await cookies()
    const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? ""
    const session = verifySessionCookie(raw)
    if (!session) return jsonError("Unauthorized", 401)

    const body = await req.json().catch(() => ({}))
    const parsed = PrefsSchema.safeParse(body)
    if (!parsed.success) return jsonError("Invalid body", 400)

    // ✅ 부분 업데이트: 기존 prefs를 읽어 merge 후 저장
    const existing = await supabaseAdmin
      .from("office_prefs")
      .select("prefs")
      .eq("office_id", session.officeId)
      .maybeSingle()

    const currentPrefs = ((existing.data?.prefs ?? {}) as Record<string, unknown>)
    const nextPrefs = { ...currentPrefs, ...parsed.data }

    const { data, error } = await supabaseAdmin
      .from("office_prefs")
      .upsert(
        { office_id: session.officeId, prefs: nextPrefs, updated_at: new Date().toISOString() },
        { onConflict: "office_id" }
      )
      .select("office_id, prefs, updated_at")
      .single()

    if (error) return jsonError(error.message ?? "Failed to save prefs", 500)

    return NextResponse.json({ prefs: data.prefs, updatedAt: data.updated_at })
  } catch (e: any) {
    return jsonError(e?.message ?? "Unexpected error", 500)
  }
}
