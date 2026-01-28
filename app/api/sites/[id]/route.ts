import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

function mapSiteRow(s: any) {
  return { ...s, todayRequired: s?.today_required ?? 0 };
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const cookieStore = await cookies();
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const siteId = params.id;
  const body = await req.json();

  // 변경 가능한 필드만 업데이트
  const updates: any = {};
  if (typeof body?.name === "string") updates.name = body.name;
  if ("start_date" in body) updates.start_date = body.start_date ?? null;
  if ("end_date" in body) updates.end_date = body.end_date ?? null;

  if ("todayRequired" in body || "today_required" in body) {
    const v =
      typeof body.todayRequired === "number"
        ? body.todayRequired
        : typeof body.today_required === "number"
          ? body.today_required
          : 0;
    updates.today_required = v;
  }

  const { data, error } = await supabaseAdmin
    .from("sites")
    .update(updates)
    .eq("id", siteId)
    .eq("office_id", session.officeId) // ✅ office 스코프 강제
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ site: mapSiteRow(data) });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const cookieStore = await cookies();
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const siteId = params.id;

  const { error } = await supabaseAdmin
    .from("sites")
    .delete()
    .eq("id", siteId)
    .eq("office_id", session.officeId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
