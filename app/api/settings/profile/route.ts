import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { z } from "zod"

import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { SESSION_COOKIE_NAME, verifySessionCookie } from "@/lib/server/session"

const ProfileSchema = z.object({
  name: z.string().trim().max(100).optional().default(""),
  email: z.string().trim().max(255).optional().default(""),
  phone: z.string().trim().max(50).optional().default(""),
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
      .from("user_profiles")
      .select("user_id, office_id, name, email, phone, updated_at")
      .eq("user_id", session.userId)
      .eq("office_id", session.officeId)
      .maybeSingle()

    if (error) return jsonError(error.message ?? "Failed to load profile", 500)

    // 없으면 빈 값 반환(클라이언트는 그대로 입력 가능)
    return NextResponse.json({
      profile: data ?? {
        user_id: session.userId,
        office_id: session.officeId,
        name: "",
        email: "",
        phone: "",
        updated_at: null,
      },
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
    const parsed = ProfileSchema.safeParse(body)
    if (!parsed.success) return jsonError("Invalid body", 400)

    const payload = {
      user_id: session.userId,
      office_id: session.officeId,
      name: parsed.data.name ?? "",
      email: parsed.data.email ?? "",
      phone: parsed.data.phone ?? "",
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabaseAdmin
      .from("user_profiles")
      .upsert(payload, { onConflict: "user_id" })
      .select("user_id, office_id, name, email, phone, updated_at")
      .single()

    if (error) return jsonError(error.message ?? "Failed to save profile", 500)

    return NextResponse.json({ profile: data })
  } catch (e: any) {
    return jsonError(e?.message ?? "Unexpected error", 500)
  }
}
