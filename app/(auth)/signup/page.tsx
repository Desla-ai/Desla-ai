"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "create_office" | "invite";

type OfficeProfileInput = {
  supplierName: string;
  bizNo: string;
  ceoName: string;
  address: string;
  bizType: string;
  bizItem: string;
  phone: string;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
};

function emptyOfficeProfile(): OfficeProfileInput {
  return {
    supplierName: "",
    bizNo: "",
    ceoName: "",
    address: "",
    bizType: "",
    bizItem: "",
    phone: "",
    bankName: "",
    bankAccount: "",
    bankHolder: "",
  };
}

export default function SignupPage() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("create_office");
  const [adminSignupToken, setAdminSignupToken] = useState("");

  const [officeName, setOfficeName] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // ✅ create_office 전용: 회사(공급자) 기본정보
  const [officeProfile, setOfficeProfile] = useState<OfficeProfileInput>(() => emptyOfficeProfile());

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!adminSignupToken.trim()) return false;
    if (!username.trim()) return false;
    if (!password || password.length < 6) return false;

    if (mode === "invite") return !!inviteCode.trim();

    if (mode === "create_office") {
      if (!officeName.trim()) return false;

      // ✅ 최소 필수(추천): 공급자 박스 “빈칸 방지”
      if (!officeProfile.supplierName.trim()) return false;
      if (!officeProfile.bizNo.trim()) return false;
      if (!officeProfile.ceoName.trim()) return false;
      if (!officeProfile.address.trim()) return false;
      if (!officeProfile.phone.trim()) return false;

      return true;
    }

    return false;
  }, [adminSignupToken, username, password, mode, officeName, inviteCode, officeProfile]);

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

      if (mode === "create_office") {
        payload.officeName = officeName.trim();
        payload.officeProfile = {
          supplierName: officeProfile.supplierName.trim(),
          bizNo: officeProfile.bizNo.trim(),
          ceoName: officeProfile.ceoName.trim(),
          address: officeProfile.address.trim(),
          bizType: officeProfile.bizType.trim(),
          bizItem: officeProfile.bizItem.trim(),
          phone: officeProfile.phone.trim(),
          bankName: officeProfile.bankName.trim(),
          bankAccount: officeProfile.bankAccount.trim(),
          bankHolder: officeProfile.bankHolder.trim(),
        };
      }
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

      router.replace("/");
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "알 수 없는 오류");
    } finally {
      setIsSubmitting(false);
    }
  }

  const field = (label: string, input: React.ReactNode) => (
    <label style={{ display: "grid", gap: 6 }}>
      <span>{label}</span>
      {input}
    </label>
  );

  return (
    <div style={{ maxWidth: 560, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>회원가입</h1>

      <p style={{ opacity: 0.8, marginTop: 8 }}>
        ADMIN_SIGNUP_TOKEN이 있어야 가입할 수 있어요.
      </p>

      <form onSubmit={onSubmit} style={{ marginTop: 16, display: "grid", gap: 12 }}>
        {field(
          "가입 방식",
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            disabled={isSubmitting}
            style={{ height: 40, borderRadius: 10, border: "1px solid #d1d5db", padding: "0 12px" }}
          >
            <option value="create_office">신규 오피스 생성 + 가입</option>
            <option value="invite">초대코드로 기존 오피스 합류</option>
          </select>
        )}

        {field(
          "ADMIN_SIGNUP_TOKEN (필수)",
          <input
            value={adminSignupToken}
            onChange={(e) => setAdminSignupToken(e.target.value)}
            placeholder="관리자 토큰"
            disabled={isSubmitting}
            autoComplete="off"
            style={{ height: 40, borderRadius: 10, border: "1px solid #d1d5db", padding: "0 12px" }}
          />
        )}

        {mode === "create_office" ? (
          <>
            {field(
              "오피스 이름",
              <input
                value={officeName}
                onChange={(e) => setOfficeName(e.target.value)}
                placeholder="예: 래미안 1팀"
                disabled={isSubmitting}
                style={{ height: 40, borderRadius: 10, border: "1px solid #d1d5db", padding: "0 12px" }}
              />
            )}

            <div style={{ marginTop: 8, padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", background: "#fafafa" }}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>회사 정보(공급자)</div>
              <div style={{ display: "grid", gap: 12 }}>
                {field(
                  "상호 (필수)",
                  <input
                    value={officeProfile.supplierName}
                    onChange={(e) => setOfficeProfile((p) => ({ ...p, supplierName: e.target.value }))}
                    placeholder="예: 대한인력"
                    disabled={isSubmitting}
                    style={{ height: 40, borderRadius: 10, border: "1px solid #d1d5db", padding: "0 12px" }}
                  />
                )}

                {field(
                  "등록번호(사업자등록번호) (필수)",
                  <input
                    value={officeProfile.bizNo}
                    onChange={(e) => setOfficeProfile((p) => ({ ...p, bizNo: e.target.value }))}
                    placeholder="예: 111-22-33333"
                    disabled={isSubmitting}
                    style={{ height: 40, borderRadius: 10, border: "1px solid #d1d5db", padding: "0 12px" }}
                  />
                )}

                {field(
                  "대표자 (필수)",
                  <input
                    value={officeProfile.ceoName}
                    onChange={(e) => setOfficeProfile((p) => ({ ...p, ceoName: e.target.value }))}
                    placeholder="예: 홍길동"
                    disabled={isSubmitting}
                    style={{ height: 40, borderRadius: 10, border: "1px solid #d1d5db", padding: "0 12px" }}
                  />
                )}

                {field(
                  "주소 (필수)",
                  <input
                    value={officeProfile.address}
                    onChange={(e) => setOfficeProfile((p) => ({ ...p, address: e.target.value }))}
                    placeholder="예: 서울시 ..."
                    disabled={isSubmitting}
                    style={{ height: 40, borderRadius: 10, border: "1px solid #d1d5db", padding: "0 12px" }}
                  />
                )}

                {field(
                  "연락처 (필수)",
                  <input
                    value={officeProfile.phone}
                    onChange={(e) => setOfficeProfile((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="예: 02-555-7788 / 010-1234-5678"
                    disabled={isSubmitting}
                    style={{ height: 40, borderRadius: 10, border: "1px solid #d1d5db", padding: "0 12px" }}
                  />
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {field(
                    "업태(선택)",
                    <input
                      value={officeProfile.bizType}
                      onChange={(e) => setOfficeProfile((p) => ({ ...p, bizType: e.target.value }))}
                      placeholder="예: 서비스"
                      disabled={isSubmitting}
                      style={{ height: 40, borderRadius: 10, border: "1px solid #d1d5db", padding: "0 12px" }}
                    />
                  )}
                  {field(
                    "종목(선택)",
                    <input
                      value={officeProfile.bizItem}
                      onChange={(e) => setOfficeProfile((p) => ({ ...p, bizItem: e.target.value }))}
                      placeholder="예: 잡역청소"
                      disabled={isSubmitting}
                      style={{ height: 40, borderRadius: 10, border: "1px solid #d1d5db", padding: "0 12px" }}
                    />
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {field(
                    "은행명(선택)",
                    <input
                      value={officeProfile.bankName}
                      onChange={(e) => setOfficeProfile((p) => ({ ...p, bankName: e.target.value }))}
                      placeholder="예: 농협"
                      disabled={isSubmitting}
                      style={{ height: 40, borderRadius: 10, border: "1px solid #d1d5db", padding: "0 12px" }}
                    />
                  )}
                  {field(
                    "예금주(선택)",
                    <input
                      value={officeProfile.bankHolder}
                      onChange={(e) => setOfficeProfile((p) => ({ ...p, bankHolder: e.target.value }))}
                      placeholder="예: 대한민"
                      disabled={isSubmitting}
                      style={{ height: 40, borderRadius: 10, border: "1px solid #d1d5db", padding: "0 12px" }}
                    />
                  )}
                </div>

                {field(
                  "계좌번호(선택)",
                  <input
                    value={officeProfile.bankAccount}
                    onChange={(e) => setOfficeProfile((p) => ({ ...p, bankAccount: e.target.value }))}
                    placeholder="예: 111-22-333"
                    disabled={isSubmitting}
                    style={{ height: 40, borderRadius: 10, border: "1px solid #d1d5db", padding: "0 12px" }}
                  />
                )}

                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  이 정보는 노무비 청구서 PDF의 ‘공급자’ 영역에 사용됩니다.
                </div>
              </div>
            </div>
          </>
        ) : (
          field(
            "초대코드",
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="관리자가 발급한 초대코드"
              disabled={isSubmitting}
              autoComplete="off"
              style={{ height: 40, borderRadius: 10, border: "1px solid #d1d5db", padding: "0 12px" }}
            />
          )
        )}

        {field(
          "아이디(username)",
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="예: admin"
            disabled={isSubmitting}
            autoComplete="username"
            style={{ height: 40, borderRadius: 10, border: "1px solid #d1d5db", padding: "0 12px" }}
          />
        )}

        {field(
          "비밀번호(password)",
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="6자 이상"
            disabled={isSubmitting}
            autoComplete="new-password"
            style={{ height: 40, borderRadius: 10, border: "1px solid #d1d5db", padding: "0 12px" }}
          />
        )}

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
