import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { SESSION_COOKIE_NAME, verifySessionCookie } from "@/lib/server/session";

const BUCKET = "worker-ids";

type Side = "front" | "back";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function safeFileName(fileName: string) {
  return String(fileName ?? "")
    .trim()
    .replace(/[^\w.\- ()가-힣]/g, "_")
    .slice(0, 160);
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return jsonError("Unauthorized", 401);

  const body = await req.json();

  const {
    workerId,
    tempKey,
    side,
    fileName,
    mime,
    size,
  } = body as {
    workerId?: string;
    tempKey?: string;
    side: Side;
    fileName: string;
    mime?: string;
    size?: number;
  };

  if (side !== "front" && side !== "back") return jsonError("side invalid", 400);
  if (!fileName) return jsonError("fileName required", 400);

  const hasWorkerId = !!String(workerId ?? "").trim();
  const hasTempKey = !!String(tempKey ?? "").trim();

  // ✅ A안: 신규 등록에서는 workerId가 없으니 tempKey를 요구
  if (!hasWorkerId && !hasTempKey) {
    return jsonError("workerId or tempKey required", 400);
  }

  // ✅ workerId가 있으면 office 범위 검증(기존 로직 유지)
  if (hasWorkerId) {
    const { data: w, error: wErr } = await supabaseAdmin
      .from("workers")
      .select("id, office_id")
      .eq("id", workerId)
      .single();

    if (wErr || !w || w.office_id !== session.officeId) {
      return jsonError("Invalid worker", 403);
    }
  }

  const safeName = safeFileName(fileName);
  const token = randomUUID();

  // ✅ 경로 규칙
  // - 기존(수정): {officeId}/workers/{workerId}/...
  // - 신규(등록 전): {officeId}/workers/_pending/{tempKey}/...
  let path = "";
  if (hasWorkerId) {
    path = `${session.officeId}/workers/${workerId}/id_${side}_${token}_${safeName}`;
  } else {
    // tempKey는 UUID 권장. 최소한 안전하게 sanitize.
    const tk = String(tempKey).trim().replace(/[^\w.\-]/g, "_").slice(0, 80);
    path = `${session.officeId}/workers/_pending/${tk}/id_${side}_${token}_${safeName}`;
  }

  // signed upload url
  const { data, error } = await (supabaseAdmin as any).storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error) return jsonError(error.message, 500);

  return NextResponse.json({
    path,
    uploadUrl: data?.signedUrl,
  });
}
