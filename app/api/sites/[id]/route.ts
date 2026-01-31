import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session";
import { toSiteDTO } from "@/lib/server/site-dto";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return jsonError("Unauthorized", 401);

  const { id: siteId } = await params;
  if (!siteId) return jsonError("Missing site id", 400);

  const body = await req.json().catch(() => ({}));
  const updates: any = {};

  // 안전한 field-delta (존재할 때만 업데이트)
  if (typeof body?.name === "string") updates.name = body.name;
  if ("address" in body) updates.address = body.address ?? "";
  if ("status" in body) updates.status = body.status ?? "미진행";

  // 날짜: camel/snake 둘 다 수용
  if ("start_date" in body || "startDate" in body) updates.start_date = body.start_date ?? body.startDate ?? null;
  if ("end_date" in body || "endDate" in body) updates.end_date = body.end_date ?? body.endDate ?? null;

  if ("planned_workers" in body || "plannedWorkers" in body) {
    const v = body.planned_workers ?? body.plannedWorkers;
    updates.planned_workers = Number(v ?? 0);
  }

  if ("today_required" in body || "todayRequired" in body) {
    const v = body.today_required ?? body.todayRequired;
    updates.today_required = Number(v ?? 0);
  }

  if ("check_in_time" in body || "checkInTime" in body) {
    updates.check_in_time = body.check_in_time ?? body.checkInTime ?? "";
  }

  if ("office_phone" in body || "officePhone" in body) {
    updates.office_phone = body.office_phone ?? body.officePhone ?? "";
  }

  if ("default_settlement_mode" in body || "defaultSettlementMode" in body) {
    updates.default_settlement_mode =
      body.default_settlement_mode ?? body.defaultSettlementMode ?? null;
  }

  // ✅ companyId 변경 허용(회사 변경)하되, 비우기는 금지(필수 정책)
  if ("companyId" in body || "company_id" in body) {
    const companyId = String(body.companyId ?? body.company_id ?? "").trim();
    if (!companyId) return jsonError("companyId cannot be empty", 400);
    updates.company_id = companyId;
  }

  if (Object.keys(updates).length === 0) {
    return jsonError("No fields to update", 400);
  }

  const { data, error } = await supabaseAdmin
    .from("sites")
    .update(updates)
    .eq("id", siteId)
    .eq("office_id", session.officeId)
    .select("*")
    .single();

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Not found", 404);

  return NextResponse.json({ site: toSiteDTO(data) });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return jsonError("Unauthorized", 401);

  const { id: siteId } = await params;
  if (!siteId) return jsonError("Missing site id", 400);

  const { error } = await supabaseAdmin
    .from("sites")
    .delete()
    .eq("id", siteId)
    .eq("office_id", session.officeId);

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
