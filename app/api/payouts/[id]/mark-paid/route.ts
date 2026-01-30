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
  const s = session

  const { id } = await ctx.params
  const payoutId = String(id ?? "").trim()
  if (!payoutId) return jsonError("payoutId is required", 400)

  // payout 조회
  const { data: payout, error: pErr } = await supabaseAdmin
    .from("payouts")
    .select("id, settlement_batch_id, status")
    .eq("office_id", s.officeId)
    .eq("id", payoutId)
    .single()

  if (pErr) return jsonError(pErr.message, 500)
  if (!payout?.id) return jsonError("Payout not found", 404)

  if (payout.status === "PAID") {
    return NextResponse.json({ ok: true, payoutId, alreadyPaid: true, batchPaidUpdated: false })
  }

  const nowIso = new Date().toISOString()

  // payout을 PAID로
  const { error: upPayoutErr } = await supabaseAdmin
    .from("payouts")
    .update({ status: "PAID", paid_at: nowIso, paid_by_user_id: s.userId })
    .eq("office_id", s.officeId)
    .eq("id", payoutId)

  if (upPayoutErr) return jsonError(upPayoutErr.message, 500)

  // 연결된 payout_items도 PAID로
  const { error: upItemsErr } = await supabaseAdmin
    .from("payout_items")
    .update({ status: "PAID" })
    .eq("office_id", s.officeId)
    .eq("payout_id", payoutId)

  if (upItemsErr) return jsonError(upItemsErr.message, 500)

  // ✅ 엄격 락: payout 하나라도 PAID되면 배치를 즉시 PAID로 마감
  let batchPaidUpdated = false

  if (payout.settlement_batch_id) {
    const batchId = String(payout.settlement_batch_id)

    const { error: upBatchErr } = await supabaseAdmin
      .from("settlement_batches")
      .update({ status: "PAID", paid_at: nowIso })
      .eq("office_id", s.officeId)
      .eq("id", batchId)
      .neq("status", "PAID") // 이미 PAID면 idempotent

    if (upBatchErr) return jsonError(upBatchErr.message, 500)
    batchPaidUpdated = true
  }

  return NextResponse.json({
    ok: true,
    payoutId,
    alreadyPaid: false,
    batchPaidUpdated,
  })
}
