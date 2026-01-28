import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export async function GET() {
  const cookieStore = await cookies();
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("workers")
    .select("*")
    .eq("office_id", session.officeId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workers: data ?? [] });
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json(); // { name, craft, phone, status, is_fixed, assigned_site_id }
  const payload = {
    office_id: session.officeId,
    name: body.name,
    craft: body.craft ?? null,
    phone: body.phone ?? null,
    status: body.status ?? "미출근",
    is_fixed: body.is_fixed ?? false,
    assigned_site_id: body.assigned_site_id ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from("workers")
    .insert(payload)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ worker: data });
}
