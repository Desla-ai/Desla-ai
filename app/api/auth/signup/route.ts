import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { createSessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session";

function jsonError(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
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

            const { data: office, error: officeErr } = await supabaseAdmin
                .from("offices")
                .insert({ name: officeName })
                .select("id")
                .single();

            if (officeErr) throw officeErr;
            officeId = office.id;
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
                // 누군가 먼저 사용 처리했을 가능성
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

        // 4) 가입 성공 시 자동 로그인(세션 쿠키 발급) — 로그인/세션 패턴 유지 [Source](https://www.genspark.ai/api/files/s/yvWmFvhF)
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
            name: sessionCookie.name,     // ✅ 타입 일치
            value: sessionCookie.value,   // ✅ 타입 일치
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/",
            maxAge: maxAgeSec,            // ✅ 여기서 TS 에러 해결
        });

        return res;
    } catch (e) {
        console.error(e);
        return jsonError("Internal Server Error", 500);
    }
}
