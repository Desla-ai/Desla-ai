import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return jsonError("Unauthorized", 401);

  const url = new URL(req.url);
  const query = (url.searchParams.get("query") ?? "").trim();

  let q = supabaseAdmin
    .from("companies")
    .select("id,name,biz_no,ceo_name,address,phone,created_at,updated_at")
    .eq("office_id", session.officeId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (query) {
    // 이름/사업자번호로 검색
    q = q.or(`name.ilike.%${query}%,biz_no.ilike.%${query}%`);
  }

  const { data, error } = await q;
  if (error) return jsonError(error.message, 500);

  return NextResponse.json({ companies: data ?? [] });
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return jsonError("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));

  const name = String(body?.name ?? "").trim();
  const bizNo = String(body?.bizNo ?? "").trim(); // ✅ 필수
  const ceoName = String(body?.ceoName ?? "").trim();
  const address = String(body?.address ?? "").trim();
  const phone = String(body?.phone ?? "").trim();

  if (!name) return jsonError("name is required", 400);
  if (!bizNo) return jsonError("bizNo is required", 400);

  // (선택) 형식 느슨 검증: 숫자/하이픈만 허용
  if (!/^[0-9-]+$/.test(bizNo)) return jsonError("bizNo format is invalid", 400);

  const { data, error } = await supabaseAdmin
    .from("companies")
    .insert([
      {
        office_id: session.officeId,
        name,
        biz_no: bizNo,
        ceo_name: ceoName,
        address,
        phone,
      },
    ])
    .select("id,name,biz_no,ceo_name,address,phone,created_at,updated_at")
    .single();

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ company: data });
}
