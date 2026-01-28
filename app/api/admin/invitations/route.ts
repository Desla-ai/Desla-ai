import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";

import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function generateInviteCode() {
  // 16 bytes => 32 hex chars
  return crypto.randomBytes(16).toString("hex");
}

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
    const session = token ? verifySessionCookie(token) : null;

    if (!session?.officeId || !session?.userId) return jsonError("Unauthorized", 401);

    // ✅ Rate Limit: 유저당 분당 5개
    const since = new Date(Date.now() - 60 * 1000).toISOString();

    const { count, error: countErr } = await supabaseAdmin
      .from("invitations")
      .select("id", { count: "exact", head: true })
      .eq("office_id", session.officeId)
      // invitations에 created_by_user_id 컬럼이 없다면 아래 조건은 적용 불가.
      // => 아래 "스키마 보완" 섹션 참고(권장 컬럼 추가).
      .eq("created_by_user_id", session.userId)
      .gte("created_at", since);

    if (countErr) {
      // created_by_user_id 컬럼이 없으면 여기서 에러가 날 수 있음
      // 그 경우, 아래 '스키마 보완(권장)'의 ALTER TABLE을 먼저 적용해줘.
      throw countErr;
    }

    if ((count ?? 0) >= 5) {
      return jsonError("Rate limit exceeded: max 5 invites per minute per user", 429);
    }

    // 충돌 가능성은 낮지만, 유니크 제약 때문에 retry로 안전하게 처리
    for (let attempt = 0; attempt < 5; attempt++) {
      const inviteCode = generateInviteCode();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabaseAdmin
        .from("invitations")
        .insert({
          office_id: session.officeId,
          invite_code: inviteCode,
          expires_at: expiresAt,
          // ✅ 누가 발급했는지 저장(유저당 rate limit 근거)
          created_by_user_id: session.userId,
        })
        .select("invite_code, expires_at, created_at")
        .single();

      if (!error && data) {
        return NextResponse.json(
          { inviteCode: data.invite_code, expiresAt: data.expires_at },
          { status: 201 }
        );
      }

      const msg = String(error?.message ?? "").toLowerCase();
      const isUnique = msg.includes("duplicate") || msg.includes("unique");
      if (!isUnique) throw error;
    }

    return jsonError("Failed to generate invite code (retry exhausted)", 500);
  } catch (e) {
    console.error(e);
    return jsonError("Internal Server Error", 500);
  }
}
