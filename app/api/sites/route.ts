import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { toSiteDTO } from "@/lib/server/site-dto";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function normalizeSiteName(name: string) {
  return String(name ?? "")
    .trim()
    .replace(/\s+/g, " ");
}


/**
 * Front payload(camelCase) -> DB insert payload(snake_case)
 * - camelCase/snake_case 모두 받기
 * - 0/false/''도 유효값이므로 in 연산자로 처리
 * - companyId는 필수 (현장 생성 정책)
 */
function mapSitePayload(body: any, officeId: string) {
  const payload: any = { office_id: officeId };

  // 필수 name
  payload.name = String(body?.name ?? "").trim();

  // ✅ company_id (필수) - camel/snake 둘 다 받기
  const companyId = String(body?.companyId ?? body?.company_id ?? "").trim();
  payload.company_id = companyId;

  // address
  if ("address" in body) payload.address = body.address ?? "";

  // status
  if ("status" in body) payload.status = body.status ?? "미진행";

  // 날짜: camel/snake 모두 허용
  if ("startDate" in body || "start_date" in body) {
    payload.start_date = body.start_date ?? body.startDate ?? null;
  }
  if ("endDate" in body || "end_date" in body) {
    payload.end_date = body.end_date ?? body.endDate ?? null;
  }

  // planned_workers: 0도 유효값
  if ("plannedWorkers" in body || "planned_workers" in body) {
    const v = body.planned_workers ?? body.plannedWorkers;
    payload.planned_workers = Number(v ?? 0);
  }

  // today_required: 0도 유효값
  if ("todayRequired" in body || "today_required" in body) {
    const v = body.today_required ?? body.todayRequired;
    payload.today_required = Number(v ?? 0);
  } else {
    payload.today_required = 0;
  }

  // check_in_time: 빈 문자열도 유효
  if ("checkInTime" in body || "check_in_time" in body) {
    payload.check_in_time = body.check_in_time ?? body.checkInTime ?? "";
  }

  // office_phone: 빈 문자열도 유효
  if ("officePhone" in body || "office_phone" in body) {
    payload.office_phone = body.office_phone ?? body.officePhone ?? "";
  }

  // default_settlement_mode: null도 가능
  if ("defaultSettlementMode" in body || "default_settlement_mode" in body) {
    payload.default_settlement_mode =
      body.default_settlement_mode ?? body.defaultSettlementMode ?? null;
  }

  return payload;
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return jsonError("Unauthorized", 401);

  const { data, error } = await supabaseAdmin
    .from("sites")
    .select("*")
    .eq("office_id", session.officeId)
    .order("created_at", { ascending: false });

  if (error) return jsonError(error.message, 500);

  const sites = (data ?? []).map(toSiteDTO);
  return NextResponse.json({ sites });
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return jsonError("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));

  // 최소 검증
  const name = String(body?.name ?? "").trim();
  if (!name) return jsonError("name은 필수입니다.", 400);

  // ✅ companyId 필수 (정책 LOCK)
  const companyId = String(body?.companyId ?? body?.company_id ?? "").trim();
  if (!companyId) return jsonError("companyId is required", 400);

  const payload = mapSitePayload(body, session.officeId);

  // ✅ name 정규화(서버 기준 통일)
  payload.name = normalizeSiteName(payload.name);

  // ✅ companyId도 정규화(혹시 공백 들어오는 케이스 방지)
  payload.company_id = String(payload.company_id ?? "").trim();

  // ✅ 멱등성 가드(정책 2번):
  // 같은 office_id + company_id + name 이면 "이미 있는 현장"으로 보고 기존 반환
  const { data: existing, error: exErr } = await supabaseAdmin
    .from("sites")
    .select("*")
    .eq("office_id", session.officeId)
    .eq("company_id", payload.company_id)
    .eq("name", payload.name)
    .maybeSingle();

  if (exErr) return jsonError(exErr.message, 500);

  if (existing) {
    return NextResponse.json({ site: toSiteDTO(existing), deduped: true });
  }

  // 없으면 새로 생성
  const { data, error } = await supabaseAdmin
    .from("sites")
    .insert(payload)
    .select("*")
    .single();


  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Failed to create site", 500);

  // 응답은 DTO로 통일
  return NextResponse.json({ site: toSiteDTO(data) });
}
