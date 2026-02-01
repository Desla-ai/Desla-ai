import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { z } from "zod"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { SESSION_COOKIE_NAME, verifySessionCookie } from "@/lib/server/session"

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

const UpsertSchema = z.object({
  id: z.string().trim().min(1).max(50),     // ✅ enum 제거
  name: z.string().trim().min(1).max(50),
  content: z.string().default(""),
})

export async function GET() {
  try {
    const cookieStore = await cookies()
    const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? ""
    const session = verifySessionCookie(raw)
    if (!session) return jsonError("Unauthorized", 401)

    const { data, error } = await supabaseAdmin
      .from("sms_templates")
      .select("id, name, content, updated_at, created_at")
      .eq("office_id", session.officeId)
      .order("created_at", { ascending: true })

    if (error) return jsonError(error.message ?? "Failed to load templates", 500)
    return NextResponse.json({ templates: data ?? [] })
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
    const parsed = UpsertSchema.safeParse(body)
    if (!parsed.success) {
      // ✅ 디버깅에 도움 되는 메시지 (필요하면 parsed.error.format()도 내려줄 수 있음)
      return jsonError("Invalid body", 400)
    }

    const now = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from("sms_templates")
      .upsert(
        {
          office_id: session.officeId,
          id: parsed.data.id,
          name: parsed.data.name,
          content: parsed.data.content ?? "",
          updated_at: now,
        },
        { onConflict: "office_id,id" }
      )
      .select("id, name, content, updated_at, created_at")
      .single()

    if (error) return jsonError(error.message ?? "Failed to save template", 500)
    return NextResponse.json({ template: data })
  } catch (e: any) {
    return jsonError(e?.message ?? "Unexpected error", 500)
  }
}
