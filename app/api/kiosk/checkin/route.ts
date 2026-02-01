import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/server/supabase-admin"

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

function normalizePhone(phone: string) {
  return (phone ?? "").replace(/\D/g, "")
}

// ✅ 한국 날짜(YYYY-MM-DD) 생성 (KST 기준)
function todayYYYYMMDDKST() {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
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
      .select("id, office_id, name, phone, status, last_attendance, last_attendance_at, assigned_site_id")
      .eq("office_id", officeId)
      .eq("phone", phone)
      .maybeSingle()

    if (findErr) return jsonError(findErr.message, 500)

    if (!worker) {
      return NextResponse.json({ ok: false, error: "WORKER_NOT_FOUND" }, { status: 404 })
    }

    // ✅ (1) 이미 배치된 사람 차단
    if (worker.assigned_site_id) {
      return NextResponse.json({ ok: false, error: "WORKER_ALREADY_ASSIGNED" }, { status: 409 })
    }

    // ✅ (2) 미출근일 때만 출근 허용 (last_attendance는 상관 없음)
    if (worker.status !== "미출근") {
      if (worker.status === "출근") {
        return NextResponse.json({ ok: false, error: "WORKER_ALREADY_CHECKED_IN" }, { status: 409 })
      }
      return NextResponse.json({ ok: false, error: "WORKER_NOT_ELIGIBLE" }, { status: 409 })
    }

    // ✅ 기록값
    const kstDate = todayYYYYMMDDKST()      // date 컬럼(한국 날짜)
    const nowIso = new Date().toISOString() // timestamptz 컬럼(시분초 포함, UTC 저장)

    // 3) 출근 처리
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("workers")
      .update({
        status: "출근",
        last_attendance: kstDate,
        // ⚠️ DB에 last_attendance_at 컬럼이 있어야 함 (timestamptz)
        last_attendance_at: nowIso,
      })
      .eq("id", worker.id)
      .select("id, name, phone, status, last_attendance, last_attendance_at")
      .single()

    if (updErr) return jsonError(updErr.message, 500)

    return NextResponse.json({ ok: true, worker: updated }, { status: 200 })
  } catch (e) {
    console.error(e)
    return jsonError("Internal Server Error", 500)
  }
}
