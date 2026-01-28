// app/api/payouts/[id]/mark-paid/route.ts
import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session"

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies()
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return jsonError("Unauthorized", 401)

  const { id } = await ctx.params
  if (!id) return jsonError("id is required", 400)

  // payout status PAID
  const { error: pErr } = await supabaseAdmin
    .from("payouts")
    .update({
      status: "PAID",
      paid_at: new Date().toISOString(),
      paid_by_user_id: session.userId ?? null,
    })
    .eq("office_id", session.officeId)
    .eq("id", id)

  if (pErr) return jsonError(pErr.message, 500)

  // item status PAID
  const { error: iErr } = await supabaseAdmin
    .from("payout_items")
    .update({ status: "PAID" })
    .eq("office_id", session.officeId)
    .eq("payout_id", id)

  if (iErr) return jsonError(iErr.message, 500)

  return NextResponse.json({ ok: true })
}
