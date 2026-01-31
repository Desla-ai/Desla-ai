import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { toWorkerDTO } from "@/lib/server/worker-dto";
import { encryptText, hmacIdentity } from "@/lib/server/worker-id-crypto";

const WORKER_SELECT_WITH_ROLES = `
  *,
  worker_roles (
    role_id,
    roles ( id, name, color ),
    role:roles ( id, name, color )
  )
`;

function assertIdParts(front6: string, back1: string) {
  if (!/^\d{6}$/.test(front6)) {
    throw new Error("주민/외국인등록번호 앞 6자리는 숫자 6자리여야 합니다.");
  }
  if (!/^\d{1}$/.test(back1)) {
    throw new Error("주민/외국인등록번호 뒤 1자리는 숫자 1자리여야 합니다.");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: workerId } = await params;
  if (!workerId) return NextResponse.json({ error: "Missing worker id" }, { status: 400 });

  const body = await req.json();

  // 1) 기본 updates
  const updates: any = {};

  if (typeof body?.name === "string") updates.name = body.name;

  if ("phone" in body) updates.phone = body.phone ?? null;
  if ("status" in body) updates.status = body.status ?? "미출근";

  if ("assignedSiteId" in body || "assigned_site_id" in body) {
    updates.assigned_site_id = body.assignedSiteId ?? body.assigned_site_id ?? null;
  }

  if ("isFixed" in body || "is_fixed" in body) {
    updates.is_fixed = !!(body.isFixed ?? body.is_fixed);
  }

  if ("fixedStartDate" in body || "fixed_start_date" in body) {
    updates.fixed_start_date = body.fixedStartDate ?? body.fixed_start_date ?? null;
  }

  if ("fixedEndDate" in body || "fixed_end_date" in body) {
    updates.fixed_end_date = body.fixedEndDate ?? body.fixed_end_date ?? null;
  }

  if ("lastAttendance" in body || "last_attendance" in body) {
    updates.last_attendance = body.lastAttendance ?? body.last_attendance ?? null;
  }

  // 1-b) ✅ 신분증 변경(부분 변경 불가: 4개 세트로만)
  const hasAnyIdField =
    ("idFront6" in body) ||
    ("id_front6" in body) ||
    ("idBack1" in body) ||
    ("id_back1" in body) ||
    ("idCopyFrontPath" in body) ||
    ("id_copy_front_path" in body) ||
    ("idCopyBackPath" in body) ||
    ("id_copy_back_path" in body);

  if (hasAnyIdField) {
    const idFront6 = String(body?.idFront6 ?? body?.id_front6 ?? "").trim();
    const idBack1 = String(body?.idBack1 ?? body?.id_back1 ?? "").trim();

    const idCopyFrontPath = String(body?.idCopyFrontPath ?? body?.id_copy_front_path ?? "").trim();
    const idCopyBackPath = String(body?.idCopyBackPath ?? body?.id_copy_back_path ?? "").trim();

    // ✅ 부분 변경 불가: 하나라도 시도하면 4개 모두 필수
    if (!idFront6 || !idBack1 || !idCopyFrontPath || !idCopyBackPath) {
      return NextResponse.json(
        { error: "신분증 변경은 앞6/뒤1 + 사본(앞/뒤) 2장을 모두 함께 제출해야 합니다." },
        { status: 400 }
      );
    }

    try {
      assertIdParts(idFront6, idBack1);
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? "invalid id parts" }, { status: 400 });
    }

    // ✅ 업로드 init이 만드는 규칙 강제: {officeId}/workers/{workerId}/...
    const expectedPrefix = `${session.officeId}/workers/${workerId}/`;
    if (!idCopyFrontPath.startsWith(expectedPrefix) || !idCopyBackPath.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { error: "Invalid id copy path (office/worker scope mismatch)." },
        { status: 403 }
      );
    }

    updates.id_front6 = encryptText(idFront6);
    updates.id_back1 = encryptText(idBack1);
    updates.id_hash = hmacIdentity(session.officeId, idFront6, idBack1);

    updates.id_copy_front_path = idCopyFrontPath;
    updates.id_copy_back_path = idCopyBackPath;
    updates.id_copy_uploaded_at = new Date().toISOString();
  }

  // 2) workers 업데이트
  const hasWorkerUpdates = Object.keys(updates).length > 0;
  if (hasWorkerUpdates) {
    const { error: updErr } = await supabaseAdmin
      .from("workers")
      .update(updates)
      .eq("id", workerId)
      .eq("office_id", session.officeId);

    if (updErr) {
      const anyErr = updErr as any;
      if (anyErr?.code === "23505") {
        return NextResponse.json(
          { error: "이미 등록된 인력입니다(주민/외국인번호 중복)." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
  }

  // 3) 역할 교체
  if ("role_ids" in body) {
    if (!Array.isArray(body.role_ids)) {
      return NextResponse.json({ error: "role_ids must be an array" }, { status: 400 });
    }

    const { error: delErr } = await supabaseAdmin
      .from("worker_roles")
      .delete()
      .eq("worker_id", workerId)
      .eq("office_id", session.officeId);

    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    if (body.role_ids.length > 0) {
      const rows = body.role_ids.map((roleId: string) => ({
        office_id: session.officeId,
        worker_id: workerId,
        role_id: roleId,
      }));

      const { error: insErr } = await supabaseAdmin.from("worker_roles").insert(rows);
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  // 4) 재조회
  const { data: joined, error: joinErr } = await supabaseAdmin
    .from("workers")
    .select(WORKER_SELECT_WITH_ROLES)
    .eq("id", workerId)
    .eq("office_id", session.officeId)
    .single();

  if (joinErr) return NextResponse.json({ error: joinErr.message }, { status: 500 });
  if (!joined) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ worker: toWorkerDTO(joined) });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: workerId } = await params;
  if (!workerId) return NextResponse.json({ error: "Missing worker id" }, { status: 400 });

  await supabaseAdmin
    .from("worker_roles")
    .delete()
    .eq("worker_id", workerId)
    .eq("office_id", session.officeId);

  const { error } = await supabaseAdmin
    .from("workers")
    .delete()
    .eq("id", workerId)
    .eq("office_id", session.officeId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
