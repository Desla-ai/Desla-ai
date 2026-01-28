import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const cookieStore = await cookies();
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workerId = params.id;
  const body = await req.json();

  const updates: any = {};
  if (typeof body?.name === "string") updates.name = body.name;
  if ("phone" in body) updates.phone = body.phone ?? null;
  if ("craft" in body) updates.craft = body.craft ?? null;
  if ("status" in body) updates.status = body.status ?? "미출근";
  if ("is_fixed" in body) updates.is_fixed = !!body.is_fixed;
  if ("assigned_site_id" in body) updates.assigned_site_id = body.assigned_site_id ?? null;

  const { data, error } = await supabaseAdmin
    .from("workers")
    .update(updates)
    .eq("id", workerId)
    .eq("office_id", session.officeId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ worker: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const cookieStore = await cookies();
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workerId = params.id;

  const { error } = await supabaseAdmin
    .from("workers")
    .delete()
    .eq("id", workerId)
    .eq("office_id", session.officeId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
