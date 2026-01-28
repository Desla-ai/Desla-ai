import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session";
import { solapi, SOLAPI_FROM_PHONE } from "@/lib/server/solapi";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type Body = {
  to: string;
  text: string;
  type?: "SMS" | "LMS";
  subject?: string; // LMS에서 제목처럼 쓰고 싶을 때(옵션)
};

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as Body;
  const { to, text } = body;

  if (!to || !text) {
    return NextResponse.json({ error: "to/text는 필수입니다." }, { status: 400 });
  }

  // SOLAPI는 messageType(SMS/LMS)로 구분하는 패턴이 일반적
  const messageType: "SMS" | "LMS" = body.type ?? (text.length > 90 ? "LMS" : "SMS");

  // 로그 먼저 PENDING
  const { data: logRow, error: logErr } = await supabaseAdmin
    .from("sms_logs")
    .insert({
      office_id: session.officeId,
      created_by_user_id: session.userId,
      provider: "solapi",
      message_type: messageType,
      from_phone: SOLAPI_FROM_PHONE,
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
      from: SOLAPI_FROM_PHONE,
      text,
      // LMS일 때 제목을 쓰고 싶으면 subject 사용(옵션)
      ...(messageType === "LMS" && body.subject ? { subject: body.subject } : {}),
      type: messageType,
    });

    await supabaseAdmin
      .from("sms_logs")
      .update({
        status: "SENT",
        provider_message_id: (result as any)?.messageId ?? null,
      })
      .eq("id", logRow.id);

    return NextResponse.json({ ok: true, result });
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
