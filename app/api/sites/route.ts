import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { toSiteDTO } from "@/lib/server/site-dto";

/**
 * DB row(snake_case) -> Front row(camelCase)
 * (현재는 toSiteDTO를 쓰고 있으니 사실상 이 함수는 POST 응답용으로만 필요)
 */
function mapSiteRow(s: any) {
  if (!s) return s;

  return {
    id: s.id,
    officeId: s.office_id,

    name: s.name ?? "",
    address: s.address ?? "",

    startDate: s.start_date ?? "",
    endDate: s.end_date ?? "",

    plannedWorkers: s.planned_workers ?? 0,
    assignedWorkers: s.assigned_workers ?? 0,
    todayRequired: s.today_required ?? 0,

    status: s.status ?? "미진행",
    progress: s.progress ?? 0,

    checkInTime: s.check_in_time ?? "",
    officePhone: s.office_phone ?? "",

    defaultSettlementMode: s.default_settlement_mode ?? null,

    createdAt: s.created_at ?? null,
    updatedAt: s.updated_at ?? null,
  };
}

/**
 * Front payload(camelCase) -> DB insert/update payload(snake_case)
 * - camelCase/snake_case 모두 받기
 * - "값이 0/false/''이어도" 누락되지 않게 in 연산자로 처리
 */
function mapSitePayload(body: any, officeId: string) {
  const payload: any = {
    office_id: officeId,
  };

  // 필수 name
  payload.name = String(body?.name ?? "").trim();

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

  // check_in_time: 빈 문자열도 유효(사용자 입력 결과)
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

export async function GET() {
  const cookieStore = await cookies();
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("sites")
    .select("*")
    .eq("office_id", session.officeId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sites = (data ?? []).map(toSiteDTO);
  return NextResponse.json({ sites });
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // 최소 검증
  if (!body?.name || String(body.name).trim() === "") {
    return NextResponse.json({ error: "name은 필수입니다." }, { status: 400 });
  }

  const payload = mapSitePayload(body, session.officeId);

  const { data, error } = await supabaseAdmin
    .from("sites")
    .insert(payload)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 응답은 DTO로 통일하는 게 가장 깔끔함
  return NextResponse.json({ site: toSiteDTO(data) });
  // (원하면 mapSiteRow(data)도 되지만, 이미 toSiteDTO를 쓰는 흐름이므로 통일 권장)
}
