import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { jsonError } from "@/lib/server/dto"
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session"

type Body = { status: "초안" | "발행" | "입금완료" }

function addDaysUTC(date: Date, days: number) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  d.setUTCDate(d.getUTCDate() + days)
  return d
}
function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

export async function POST(req: Request, ctx: any) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
    const session = verifySessionCookie(token)
    if (!session) return jsonError("Unauthorized", 401)

    const params = await ctx.params
    const id = params?.id as string
    if (!id) return jsonError("id is required", 400)

    const body = (await req.json()) as Body
    if (!body?.status) return jsonError("status is required", 400)

    const { data: current, error: curErr } = await supabaseAdmin
      .from("invoices")
      .select("id, status")
      .eq("office_id", session.officeId)
      .eq("id", id)
      .single()

    if (curErr) return jsonError(curErr.message, curErr.code === "PGRST116" ? 404 : 500)

    const from = current.status as Body["status"]
    const to = body.status

    const allowed =
      (from === "초안" && to === "발행") ||
      (from === "발행" && to === "입금완료")

    if (!allowed) return jsonError(`Invalid status transition: ${from} -> ${to}`, 400)

    const updates: any = { status: to, updated_at: new Date().toISOString() }
    if (to === "발행") {
      const today = new Date()
      updates.issue_date = isoDate(today)
      updates.due_date = isoDate(addDaysUTC(today, 30))
    }

    const { data: inv, error: updErr } = await supabaseAdmin
      .from("invoices")
      .update(updates)
      .eq("office_id", session.officeId)
      .eq("id", id)
      .select("*, sites(name), invoice_line_items(*)")
      .single()

    if (updErr) return jsonError(updErr.message, 500)

    return NextResponse.json({
      invoice: {
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        siteId: inv.site_id,
        siteName: inv.sites?.name ?? "",
        contractorName: inv.contractor_name,
        status: inv.status,
        issueDate: inv.issue_date ?? "",
        dueDate: inv.due_date ?? "",
        lineItems: (inv.invoice_line_items ?? []).map((it: any) => ({
          id: it.id,
          category: it.category,
          description: it.description ?? "",
          quantity: Number(it.quantity ?? 0),
          unitPrice: Number(it.unit_price ?? 0),
          amount: Number(it.amount ?? 0),
        })),
        subtotal: Number(inv.subtotal ?? 0),
        tax: Number(inv.tax ?? 0),
        total: Number(inv.total ?? 0),
        notes: inv.notes ?? "",
        attachments: inv.attachments ?? [],
        createdAt: inv.created_at,
        updatedAt: inv.updated_at,
      }
    })
  } catch (e: any) {
    return jsonError(e?.message ?? "Failed to update status", 500)
  }
}
