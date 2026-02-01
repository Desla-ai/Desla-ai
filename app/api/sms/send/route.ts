import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session";
import { solapi, SOLAPI_FROM_PHONE } from "@/lib/server/solapi";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type SingleBody = {
  to: string;
  text: string;
  type?: "SMS" | "LMS"; // <- 입력으로 받아도 무시하고 LMS로 보냄
  subject?: string;
};

type BulkBySiteWorkersBody = {
  mode: "bySiteWorkers";
  siteIds: string[];
  template: string; // 한 템플릿(현장정보 치환)
  type?: "SMS" | "LMS"; // <- 입력으로 받아도 무시하고 LMS로 보냄
  subject?: string;
};

type Body = SingleBody | BulkBySiteWorkersBody;

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function normalizePhoneKR(raw: string) {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (digits.length < 9) return null;
  return digits;
}

function formatPhoneForTemplate(raw: string) {
  const digits = normalizePhoneKR(raw);
  if (!digits) return "";
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits;
}

function generateMessage(template: string, site: any) {
  return String(template ?? "")
    .replaceAll("{현장명}", String(site?.name ?? ""))
    .replaceAll("{주소}", String(site?.address ?? ""))
    .replaceAll("{출근시간}", String(site?.check_in_time ?? ""))
    .replaceAll("{사무소번호}", formatPhoneForTemplate(String(site?.office_phone ?? "")));
}

function isBulkBySiteWorkersBody(body: Body): body is BulkBySiteWorkersBody {
  return (body as any)?.mode === "bySiteWorkers";
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as Body;

  // 공통: 발신번호 필수 가드 (from_phone NOT NULL 방지)
  const fromPhone = String(SOLAPI_FROM_PHONE ?? "").trim();
  if (!fromPhone) {
    return NextResponse.json(
      { error: "SOLAPI_FROM_PHONE 환경변수가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  // ✅ 정책: 무조건 LMS로 발송
  const FORCE_MESSAGE_TYPE: "LMS" = "LMS";

  // =========================
  // Bulk mode: 현장 배치 인원 전체 발송
  // =========================
  if ((body as any)?.mode === "bySiteWorkers") {
    const b = body as BulkBySiteWorkersBody;

    const siteIds = Array.isArray(b.siteIds) ? b.siteIds.map(String).filter(Boolean) : [];
    if (siteIds.length === 0) {
      return NextResponse.json({ error: "siteIds는 필수입니다." }, { status: 400 });
    }

    const template = String(b.template ?? "").trim();
    if (!template) {
      return NextResponse.json({ error: "template는 필수입니다." }, { status: 400 });
    }

    // 1) sites 로드 (office scope)
    const { data: sites, error: siteErr } = await supabaseAdmin
      .from("sites")
      .select("id, office_id, name, address, check_in_time, office_phone")
      .eq("office_id", session.officeId)
      .in("id", siteIds);

    if (siteErr) {
      return NextResponse.json({ error: "sites 조회 실패", detail: siteErr.message }, { status: 500 });
    }

    const siteMap = new Map<string, any>();
    for (const s of sites ?? []) siteMap.set(String((s as any).id), s);

    // 2) workers 로드 (office scope + assigned_site_id)
    const { data: workers, error: wErr } = await supabaseAdmin
      .from("workers")
      .select("id, office_id, name, phone, assigned_site_id")
      .eq("office_id", session.officeId)
      .in("assigned_site_id", siteIds);

    if (wErr) {
      return NextResponse.json({ error: "workers 조회 실패", detail: wErr.message }, { status: 500 });
    }

    // 3) 집계/중복 방지
    let totalTargets = 0;          // 실제 전송 시도한 unique phone 수
    let sent = 0;
    let failed = 0;
    let skippedNoPhone = 0;

    // ✅ 전 현장 통합 중복 방지 (같은 번호 1회만)
    let skippedDuplicatePhone = 0;
    const sentPhonesGlobal = new Set<string>();

    // site별 workers grouping
    const workersBySite = new Map<string, any[]>();
    for (const w of workers ?? []) {
      const sid = String((w as any).assigned_site_id ?? "");
      if (!sid) continue;
      if (!workersBySite.has(sid)) workersBySite.set(sid, []);
      workersBySite.get(sid)!.push(w);
    }

    // 4) 발송: 현장별 치환된 text를 해당 현장 배치 인원에게 발송
    for (const sid of siteIds) {
      const site = siteMap.get(sid);
      if (!site) continue;

      // ✅ site 기준으로 text는 1번만 생성 (섞임 방지)
      const textForSite = generateMessage(template, site);
      const list = workersBySite.get(sid) ?? [];

      const normalizedPhones = list.map((w) => normalizePhoneKR(String((w as any).phone ?? "")));

      // skippedNoPhone은 여기서 집계 (filter(Boolean) 이전)
      skippedNoPhone += normalizedPhones.filter((p) => !p).length;

      const phoneList = uniq(normalizedPhones.filter(Boolean) as string[]);

      for (const to of phoneList) {
        // 전역 중복 번호는 1번만 발송
        if (sentPhonesGlobal.has(to)) {
          skippedDuplicatePhone += 1;
          continue;
        }
        sentPhonesGlobal.add(to);

        totalTargets += 1;

        // 로그 먼저 PENDING
        const { data: logRow, error: logErr } = await supabaseAdmin
          .from("sms_logs")
          .insert({
            office_id: session.officeId,
            created_by_user_id: session.userId,
            provider: "solapi",
            message_type: FORCE_MESSAGE_TYPE, // ✅ 무조건 LMS
            from_phone: fromPhone,
            to_phone: to,
            text: textForSite,
            status: "PENDING",
          })
          .select("id")
          .single();

        if (logErr) {
          failed += 1;
          continue;
        }

        try {
          const result = await solapi.sendOne({
            to,
            from: fromPhone,
            text: textForSite,
            // LMS subject는 선택(없으면 생략)
            ...(b.subject ? { subject: b.subject } : {}),
            type: FORCE_MESSAGE_TYPE, // ✅ 무조건 LMS
          });

          await supabaseAdmin
            .from("sms_logs")
            .update({
              status: "SENT",
              provider_message_id: (result as any)?.messageId ?? null,
            })
            .eq("id", logRow.id);

          sent += 1;
        } catch (e: any) {
          await supabaseAdmin
            .from("sms_logs")
            .update({
              status: "FAILED",
              error_message: e?.message ?? String(e),
            })
            .eq("id", logRow.id);

          failed += 1;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      mode: "bySiteWorkers",
      siteCount: siteIds.length,
      totalTargets,
      sent,
      failed,
      skippedNoPhone,
      skippedDuplicatePhone,
      messageType: FORCE_MESSAGE_TYPE, // ✅ 디버그/확인용
    });
  }

  // =========================
  // Single mode: to/text (기존 호환)
  // =========================
  if (isBulkBySiteWorkersBody(body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const to = String(body.to ?? "").trim();
  const text = String(body.text ?? "").trim();

  if (!to || !text) {
    return NextResponse.json({ error: "to/text는 필수입니다." }, { status: 400 });
  }

  // ✅ 단건도 무조건 LMS
  const singleType: "LMS" = "LMS";

  const { data: logRow, error: logErr } = await supabaseAdmin
    .from("sms_logs")
    .insert({
      office_id: session.officeId,
      created_by_user_id: session.userId,
      provider: "solapi",
      message_type: singleType,
      from_phone: fromPhone,
      to_phone: to,
      text,
      status: "PENDING",
    })
    .select("id")
    .single();

  if (logErr) {
    return NextResponse.json({ error: "sms_logs 저장 실패", detail: logErr.message }, { status: 500 });
  }

  try {
    const result = await solapi.sendOne({
      to,
      from: fromPhone,
      text,
      ...(body.subject ? { subject: body.subject } : {}),
      type: singleType,
    });

    await supabaseAdmin
      .from("sms_logs")
      .update({
        status: "SENT",
        provider_message_id: (result as any)?.messageId ?? null,
      })
      .eq("id", logRow.id);

    return NextResponse.json({ ok: true, result, messageType: singleType });
  } catch (e: any) {
    await supabaseAdmin
      .from("sms_logs")
      .update({
        status: "FAILED",
        error_message: e?.message ?? String(e),
      })
      .eq("id", logRow.id);

    return NextResponse.json({ ok: false, error: e?.message ?? "발송 실패" }, { status: 500 });
  }
}
