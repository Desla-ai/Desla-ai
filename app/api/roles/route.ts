import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session"
import { supabaseAdmin } from "@/lib/server/supabase-admin"

export async function GET() {
  try {
    const cookieStore = await cookies()
    const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // ✅ roles.updated_at 컬럼이 없으므로 select에서 제거
    const { data, error } = await supabaseAdmin
      .from("roles")
      .select("id, office_id, name, color, created_at")
      .eq("office_id", session.officeId)
      .order("created_at", { ascending: true })

    if (error) {
      console.error("[/api/roles] supabase error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const roles = (data ?? []).map((r: any) => ({
      id: String(r.id),
      officeId: String(r.office_id),
      name: String(r.name ?? ""),
      color: String(r.color ?? "#64748b"),
      createdAt: r.created_at ?? null,
      // updatedAt은 테이블에 없으니 null 고정(프론트 호환)
      updatedAt: null,
    }))

    return NextResponse.json({ roles })
  } catch (e: any) {
    console.error("[/api/roles] unhandled:", e)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
