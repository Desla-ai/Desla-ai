import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/server/supabase-admin"

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

function normalizePhone(phone: string) {
  return (phone ?? "").replace(/\D/g, "")
}

function todayYYYYMMDD() {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC 기준)
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as null | {
      officeId?: string
      phone?: string
    }

    const officeId = body?.officeId ?? ""
    const phone = normalizePhone(body?.phone ?? "")

    if (!officeId) return jsonError("officeId is required", 400)
    if (phone.length < 10) return jsonError("phone is invalid", 400)

    // 1) worker 찾기 (office_id + phone)
    const { data: worker, error: findErr } = await supabaseAdmin
      .from("workers")
      .select("id, office_id, name, phone, status, last_attendance, assigned_site_id")
      .eq("office_id", officeId)
      .eq("phone", phone)
      .maybeSingle()

    if (findErr) return jsonError(findErr.message, 500)

    if (!worker) {
      return NextResponse.json({ ok: false, error: "WORKER_NOT_FOUND" }, { status: 404 })
    }

    const today = todayYYYYMMDD()

    // ✅ (1) 이미 배치된 사람 차단
    if (worker.assigned_site_id) {
      return NextResponse.json(
        { ok: false, error: "WORKER_ALREADY_ASSIGNED" },
        { status: 409 }
      )
    }

    // ✅ (2) 이미 출근한 사람 차단 (상태/날짜 둘 다 체크)
    const last = worker.last_attendance ? String(worker.last_attendance) : null
    const alreadyToday = last === today
    const alreadyByStatus = worker.status === "출근"

    if (alreadyToday || alreadyByStatus) {
      return NextResponse.json(
        { ok: false, error: "WORKER_ALREADY_CHECKED_IN" },
        { status: 409 }
      )
    }

    // 2) 출근 처리
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("workers")
      .update({
        status: "출근",
        last_attendance: today,
      })
      .eq("id", worker.id)
      .select("id, name, phone, status, last_attendance")
      .single()

    if (updErr) return jsonError(updErr.message, 500)

    return NextResponse.json({ ok: true, worker: updated }, { status: 200 })
  } catch (e) {
    console.error(e)
    return jsonError("Internal Server Error", 500)
  }
}
