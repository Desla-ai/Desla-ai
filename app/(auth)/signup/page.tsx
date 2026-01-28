"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "create_office" | "invite";

export default function SignupPage() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("create_office");
  const [adminSignupToken, setAdminSignupToken] = useState("");

  const [officeName, setOfficeName] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!adminSignupToken.trim()) return false;
    if (!username.trim()) return false;
    if (!password || password.length < 6) return false;
    if (mode === "create_office") return !!officeName.trim();
    if (mode === "invite") return !!inviteCode.trim();
    return false;
  }, [adminSignupToken, username, password, mode, officeName, inviteCode]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const payload: any = {
        adminSignupToken,
        mode,
        username: username.trim(),
        password,
      };

      if (mode === "create_office") payload.officeName = officeName.trim();
      if (mode === "invite") payload.inviteCode = inviteCode.trim();

      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json?.error ?? `가입 실패 (${res.status})`);
        return;
      }

      // 가입 성공: 서버에서 세션 쿠키 설정됨 → 앱으로 이동
      router.replace("/");
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "알 수 없는 오류");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>회원가입</h1>

      <p style={{ opacity: 0.8, marginTop: 8 }}>
        ADMIN_SIGNUP_TOKEN이 있어야 가입할 수 있어요.
      </p>

      <form onSubmit={onSubmit} style={{ marginTop: 16, display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>가입 방식</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            disabled={isSubmitting}
          >
            <option value="create_office">신규 오피스 생성 + 가입</option>
            <option value="invite">초대코드로 기존 오피스 합류</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>ADMIN_SIGNUP_TOKEN (필수)</span>
          <input
            value={adminSignupToken}
            onChange={(e) => setAdminSignupToken(e.target.value)}
            placeholder="관리자 토큰"
            disabled={isSubmitting}
            autoComplete="off"
          />
        </label>

        {mode === "create_office" ? (
          <label style={{ display: "grid", gap: 6 }}>
            <span>오피스 이름</span>
            <input
              value={officeName}
              onChange={(e) => setOfficeName(e.target.value)}
              placeholder="예: 래미안 1팀"
              disabled={isSubmitting}
            />
          </label>
        ) : (
          <label style={{ display: "grid", gap: 6 }}>
            <span>초대코드</span>
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="관리자가 발급한 초대코드"
              disabled={isSubmitting}
              autoComplete="off"
            />
          </label>
        )}

        <label style={{ display: "grid", gap: 6 }}>
          <span>아이디(username)</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="예: admin"
            disabled={isSubmitting}
            autoComplete="username"
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>비밀번호(password)</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="6자 이상"
            disabled={isSubmitting}
            autoComplete="new-password"
          />
        </label>

        {error ? (
          <div style={{ padding: 12, background: "#fee2e2", color: "#991b1b", borderRadius: 8 }}>
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit || isSubmitting}
          style={{
            height: 44,
            borderRadius: 10,
            border: "1px solid #111827",
            background: isSubmitting ? "#e5e7eb" : "#111827",
            color: isSubmitting ? "#111827" : "white",
            cursor: isSubmitting ? "default" : "pointer",
            fontWeight: 800,
          }}
        >
          {isSubmitting ? "가입 중..." : "가입하기"}
        </button>

        <button
          type="button"
          onClick={() => router.push("/login")}
          disabled={isSubmitting}
          style={{
            height: 44,
            borderRadius: 10,
            border: "1px solid #d1d5db",
            background: "white",
            cursor: "pointer",
          }}
        >
          로그인으로 이동
        </button>
      </form>
    </div>
  );
}
