import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { createSessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session";

import { defaultRoles } from "@/lib/mock-data";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function asText(v: any) {
  return String(v ?? "").trim();
}

function requireText(v: any, fieldName: string) {
  const t = asText(v);
  if (!t) throw new Error(`VALIDATION:${fieldName}`);
  return t;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 0) ADMIN_SIGNUP_TOKEN 필수
    const adminSignupToken = String(body.adminSignupToken ?? "");
    if (!process.env.ADMIN_SIGNUP_TOKEN) {
      return jsonError("Server misconfigured: ADMIN_SIGNUP_TOKEN missing", 500);
    }
    if (adminSignupToken !== process.env.ADMIN_SIGNUP_TOKEN) {
      return jsonError("Forbidden", 403);
    }

    const mode = String(body.mode ?? "");
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");

    if (!username) return jsonError("username is required", 400);
    if (!password || password.length < 6) return jsonError("password must be at least 6 chars", 400);

    // 1) officeId 결정
    let officeId: string | null = null;

    if (mode === "create_office") {
      const officeName = String(body.officeName ?? "").trim();
      if (!officeName) return jsonError("officeName is required", 400);

      // ✅ create_office일 때만 회사정보 필수
      const officeProfile = body?.officeProfile ?? null;
      if (!officeProfile || typeof officeProfile !== "object") {
        return jsonError("officeProfile is required for create_office", 400);
      }

      // ✅ 최소 필수(공급자 박스 빈칸 방지)
      // - 상호, 등록번호, 대표자, 주소, 연락처
      const supplierName = asText(officeProfile.supplierName);
      const bizNo = asText(officeProfile.bizNo);
      const ceoName = asText(officeProfile.ceoName);
      const address = asText(officeProfile.address);
      const phone = asText(officeProfile.phone);

      if (!supplierName) return jsonError("officeProfile.supplierName is required", 400);
      if (!bizNo) return jsonError("officeProfile.bizNo is required", 400);
      if (!ceoName) return jsonError("officeProfile.ceoName is required", 400);
      if (!address) return jsonError("officeProfile.address is required", 400);
      if (!phone) return jsonError("officeProfile.phone is required", 400);

      const { data: office, error: officeErr } = await supabaseAdmin
        .from("offices")
        .insert({ name: officeName })
        .select("id")
        .single();

      if (officeErr) throw officeErr;
      officeId = office.id;

      // ✅ 기본 역할 시드
      const { error: seedErr } = await supabaseAdmin
        .from("roles")
        .upsert(
          defaultRoles.map((r) => ({
            office_id: officeId,
            name: r.name,
            color: r.color,
          })),
          { onConflict: "office_id,name" }
        );

      if (seedErr) throw seedErr;

      // ✅ office_profiles 저장 (가입 시점에 공급자 정보 보장)
      const nowIso = new Date().toISOString();
      const { error: profErr } = await supabaseAdmin
        .from("office_profiles")
        .upsert(
          {
            office_id: officeId,
            supplier_name: supplierName,
            biz_no: bizNo,
            ceo_name: ceoName,
            address,
            biz_type: asText(officeProfile.bizType),
            biz_item: asText(officeProfile.bizItem),
            phone,
            bank_name: asText(officeProfile.bankName),
            bank_account: asText(officeProfile.bankAccount),
            bank_holder: asText(officeProfile.bankHolder),
            updated_at: nowIso,
          },
          { onConflict: "office_id" }
        );

      if (profErr) throw profErr;

      // ✅ [추가] 기본 SMS 템플릿 시드 (오피스 생성 시 자동 삽입)
      // - sms_templates 스키마는 office_id(uuid), id(text), name(text), content(text), updated_at/created_at(timestamptz)
      // - onConflict는 (office_id,id) 복합키/유니크가 있어야 동작
      const defaultSmsTemplates = [
        {
          office_id: officeId,
          id: "default",
          name: "기본 템플릿",
          content: "내일 {출근시간}까지 {현장명}({주소})로 출근 부탁드립니다. 문의: {사무소번호}",
          updated_at: nowIso,
        },
        {
          office_id: officeId,
          id: "notice",
          name: "공지",
          content: "[공지] {현장명} 현장 안내드립니다.\n위치: {주소}\n출근시간: {출근시간}\n문의: {사무소번호}",
          updated_at: nowIso,
        },
        {
          office_id: officeId,
          id: "urgent",
          name: "긴급",
          content: "[긴급] {현장명} 현장 긴급 인력 요청\n출근시간: {출근시간}\n위치: {주소}\n연락처: {사무소번호}",
          updated_at: nowIso,
        },
        {
          office_id: officeId,
          id: "change",
          name: "현장 변경",
          content: "[현장변경] 내일 출근 현장이 변경되었습니다.\n변경현장: {현장명}\n주소: {주소}\n출근시간: {출근시간}\n문의: {사무소번호}",
          updated_at: nowIso,
        },
      ] as const;

      const { error: smsSeedErr } = await supabaseAdmin
        .from("sms_templates")
        .upsert(defaultSmsTemplates, { onConflict: "office_id,id" });

      if (smsSeedErr) throw smsSeedErr;

    } else if (mode === "invite") {
      const inviteCode = String(body.inviteCode ?? "").trim();
      if (!inviteCode) return jsonError("inviteCode is required", 400);

      // 1-1) 유효한 초대인지 확인
      const { data: invite, error: inviteErr } = await supabaseAdmin
        .from("invitations")
        .select("office_id, expires_at, used_at")
        .eq("invite_code", inviteCode)
        .maybeSingle();

      if (inviteErr) throw inviteErr;
      if (!invite) return jsonError("Invalid invite code", 400);
      if (invite.used_at) return jsonError("Invite already used", 400);
      if (invite.expires_at && new Date(invite.expires_at) <= new Date()) {
        return jsonError("Invite expired", 400);
      }

      officeId = invite.office_id;

      // ✅ 기본 역할 시드 (중복 안전 upsert)
      const { error: seedErr } = await supabaseAdmin
        .from("roles")
        .upsert(
          defaultRoles.map((r) => ({
            office_id: officeId,
            name: r.name,
            color: r.color,
          })),
          { onConflict: "office_id,name" }
        );

      if (seedErr) throw seedErr;

      // 1-2) 1회용 처리 (레이스 완화: used_at IS NULL 조건)
      const nowIso = new Date().toISOString();
      const { data: usedRows, error: usedErr } = await supabaseAdmin
        .from("invitations")
        .update({ used_at: nowIso })
        .eq("invite_code", inviteCode)
        .is("used_at", null)
        .select("invite_code");

      if (usedErr) throw usedErr;
      if (!usedRows || usedRows.length === 0) {
        return jsonError("Invite already used", 400);
      }
    } else {
      return jsonError("mode must be 'create_office' or 'invite'", 400);
    }

    if (!officeId) return jsonError("Failed to resolve office", 500);

    // 2) username 중복(office 단위)
    const { data: existing, error: existErr } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("office_id", officeId)
      .eq("username", username)
      .maybeSingle();

    if (existErr) throw existErr;
    if (existing) return jsonError("Username already exists", 409);

    // 3) 유저 생성
    const passwordHash = await bcrypt.hash(password, 12);

    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .insert({
        office_id: officeId,
        username,
        password_hash: passwordHash,
        is_active: true,
      })
      .select("id, office_id, username, is_active, created_at")
      .single();

    if (userErr) throw userErr;

    // 4) 가입 성공 시 자동 로그인(세션 쿠키 발급)
    const sessionCookie = createSessionCookie({
      userId: user.id,
      officeId: user.office_id,
      username: user.username,
    });

    // exp(초) -> maxAge(초)로 변환
    const nowSec = Math.floor(Date.now() / 1000);
    const maxAgeSec = Math.max(0, sessionCookie.exp - nowSec);

    const res = NextResponse.json(
      { ok: true, user: { id: user.id, officeId: user.office_id, username: user.username } },
      { status: 201 }
    );

    res.cookies.set({
      name: sessionCookie.name,
      value: sessionCookie.value,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: maxAgeSec,
    });

    return res;
  } catch (e: any) {
    console.error(e);

    // (선택) requireText같은 걸 쓸 경우를 대비한 패턴
    const msg = String(e?.message ?? "");
    if (msg.startsWith("VALIDATION:")) {
      const field = msg.replace("VALIDATION:", "");
      return jsonError(`${field} is required`, 400);
    }

    return jsonError("Internal Server Error", 500);
  }
}
