import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { jsonError } from "@/lib/server/dto"
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session"

type InvoiceStatus = "초안" | "발행" | "입금완료"

type Attachment = {
  path: string
  // 나머지 필드는 프런트에서 들어올 수 있으나, 서버는 path 스코프만 검증
  [key: string]: any
}

type LineItemIn = {
  category: "인건비" | "장비" | "자재" | "기타"
  description?: string
  quantity: number
  unitPrice: number
  amount: number
}

function computeTotals(lineItems: { amount: number }[]) {
  const subtotal = Math.max(
    0,
    Math.round(lineItems.reduce((s, x) => s + Number(x.amount ?? 0), 0))
  )
  const tax = Math.round(subtotal * 0.1)
  const total = subtotal + tax
  return { subtotal, tax, total }
}

function assertAttachmentScope(officeId: string, attachments?: Attachment[]) {
  if (!attachments) return
  if (!Array.isArray(attachments)) throw new Error("attachments must be array")
  for (const a of attachments) {
    if (!a?.path?.startsWith(`${officeId}/`)) {
      throw new Error("Invalid attachment path scope")
    }
  }
}

function toInvoiceResponse(inv: any, lineItems: any[]) {
  return {
    id: inv.id,
    invoiceNumber: inv.invoice_number,
    siteId: inv.site_id,
    siteName: inv.sites?.name ?? "",
    contractorName: inv.contractor_name,
    status: inv.status as InvoiceStatus,
    issueDate: inv.issue_date ?? "",
    dueDate: inv.due_date ?? "",
    lineItems: (lineItems ?? []).map((it: any) => ({
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
}

export async function GET(req: Request, ctx: any) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
    const session = verifySessionCookie(token)
    if (!session) return jsonError("Unauthorized", 401)

    const params = await ctx.params
    const id = params?.id as string
    if (!id) return jsonError("id is required", 400)

    const { data: inv, error } = await supabaseAdmin
      .from("invoices")
      .select("*, sites(name), invoice_line_items(*)")
      .eq("office_id", session.officeId)
      .eq("id", id)
      .single()

    if (error) return jsonError(error.message, error.code === "PGRST116" ? 404 : 500)

    return NextResponse.json({
      invoice: toInvoiceResponse(inv, inv.invoice_line_items ?? []),
    })
  } catch (e: any) {
    return jsonError(e?.message ?? "Failed to load invoice", 500)
  }
}

export async function PATCH(req: Request, ctx: any) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
    const session = verifySessionCookie(token)
    if (!session) return jsonError("Unauthorized", 401)

    const params = await ctx.params
    const id = params?.id as string
    if (!id) return jsonError("id is required", 400)

    const body = await req.json()

    // 1) 현재 인보이스 로드 (권한/상태 체크용)
    const { data: current, error: curErr } = await supabaseAdmin
      .from("invoices")
      .select("*, invoice_line_items(*), sites(name)")
      .eq("office_id", session.officeId)
      .eq("id", id)
      .single()

    if (curErr) return jsonError(curErr.message, curErr.code === "PGRST116" ? 404 : 500)
    if ((current.status as InvoiceStatus) !== "초안") {
      return jsonError("Only draft invoices can be edited", 400)
    }

    // 2) 업데이트 필드 구성
    const updates: any = {}

    if (typeof body.contractorName === "string") {
      updates.contractor_name = body.contractorName.trim()
    }
    if (typeof body.notes === "string") {
      updates.notes = body.notes
    }
    if (body.attachments !== undefined) {
      assertAttachmentScope(session.officeId, body.attachments)
      updates.attachments = body.attachments
    }

    // 라인아이템은 "전체 교체" 정책
    let finalLineItems = current.invoice_line_items ?? []

    if (Array.isArray(body.lineItems)) {
      const itemsToSave = (body.lineItems as LineItemIn[]).map((li: any) => {
        const quantity = Number(li.quantity ?? 0)
        const unitPrice = Math.round(Number(li.unitPrice ?? 0))
        const amount = Math.round(Number(li.amount ?? quantity * unitPrice))
        return {
          category: li.category,
          description: li.description ?? "",
          quantity,
          unit_price: unitPrice,
          amount,
        }
      })

      const { subtotal, tax, total } = computeTotals(
        itemsToSave.map((x) => ({ amount: Number(x.amount) }))
      )
      updates.subtotal = subtotal
      updates.tax = tax
      updates.total = total

      // 3) 라인아이템 교체 (delete -> insert)
      const { error: delErr } = await supabaseAdmin
        .from("invoice_line_items")
        .delete()
        .eq("invoice_id", id)
      if (delErr) return jsonError(delErr.message, 500)

      const { data: newItems, error: insErr } = await supabaseAdmin
        .from("invoice_line_items")
        .insert(itemsToSave.map((x) => ({ invoice_id: id, ...x })))
        .select("*")
      if (insErr) return jsonError(insErr.message, 500)

      finalLineItems = newItems ?? []
    }

    // 4) invoice row 업데이트
    const { data: inv, error: updErr } = await supabaseAdmin
      .from("invoices")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("office_id", session.officeId)
      .eq("id", id)
      .select("*, sites(name)")
      .single()

    if (updErr) return jsonError(updErr.message, 500)

    return NextResponse.json({
      invoice: toInvoiceResponse(inv, finalLineItems),
    })
  } catch (e: any) {
    return jsonError(e?.message ?? "Failed to update invoice", 500)
  }
}

export async function DELETE(req: Request, ctx: any) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
    const session = verifySessionCookie(token)
    if (!session) return jsonError("Unauthorized", 401)

    const params = await ctx.params
    const id = params?.id as string
    if (!id) return jsonError("id is required", 400)

    const { data: current, error: curErr } = await supabaseAdmin
      .from("invoices")
      .select("id, status")
      .eq("office_id", session.officeId)
      .eq("id", id)
      .single()

    if (curErr) return jsonError(curErr.message, curErr.code === "PGRST116" ? 404 : 500)

    if ((current.status as InvoiceStatus) !== "초안") {
      return jsonError("Only draft invoices can be deleted", 400)
    }

    const { error: delErr } = await supabaseAdmin
      .from("invoices")
      .delete()
      .eq("office_id", session.officeId)
      .eq("id", id)

    if (delErr) return jsonError(delErr.message, 500)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return jsonError(e?.message ?? "Failed to delete invoice", 500)
  }
}
