import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

/**
 * DB row(snake_case) -> Front row(camelCase)
 */
function mapSiteRow(s: any) {
  return {
    ...s,
    todayRequired: s?.today_required ?? 0,
  };
}

/**
 * Front payload(camelCase) -> DB insert/update payload(snake_case)
 */
function mapSitePayload(body: any, officeId: string) {
  const todayRequired =
    typeof body?.todayRequired === "number"
      ? body.todayRequired
      : typeof body?.today_required === "number"
        ? body.today_required
        : 0;

  return {
    office_id: officeId,
    name: body?.name,
    start_date: body?.start_date ?? null,
    end_date: body?.end_date ?? null,
    today_required: todayRequired,
  };
}

export async function GET() {
  const cookieStore = await cookies();
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("sites")
    .select("*")
    .eq("office_id", session.officeId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sites = (data ?? []).map(mapSiteRow);
  return NextResponse.json({ sites });
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // 최소 검증
  if (!body?.name || String(body.name).trim() === "") {
    return NextResponse.json({ error: "name은 필수입니다." }, { status: 400 });
  }

  const payload = mapSitePayload(body, session.officeId);

  const { data, error } = await supabaseAdmin
    .from("sites")
    .insert(payload)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ site: mapSiteRow(data) });
}
