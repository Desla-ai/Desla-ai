import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return jsonError("Unauthorized", 401);

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  if (!id) return jsonError("id is required", 400);
  if (!name) return jsonError("name is required", 400);

  // ensure company belongs to this office
  const { data: existing, error: exErr } = await supabaseAdmin
    .from("companies")
    .select("id")
    .eq("id", id)
    .eq("office_id", session.officeId)
    .single();
  if (exErr || !existing) return jsonError("Not found", 404);

  const { data, error } = await supabaseAdmin
    .from("companies")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id,name,created_at,updated_at")
    .single();

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ company: data });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return jsonError("Unauthorized", 401);

  const { id } = await ctx.params;
  if (!id) return jsonError("id is required", 400);

  // ensure company belongs to this office
  const { data: existing, error: exErr } = await supabaseAdmin
    .from("companies")
    .select("id")
    .eq("id", id)
    .eq("office_id", session.officeId)
    .single();
  if (exErr || !existing) return jsonError("Not found", 404);

  // block delete if sites are linked
  const { count, error: cntErr } = await supabaseAdmin
    .from("sites")
    .select("id", { count: "exact", head: true })
    .eq("company_id", id);
  if (cntErr) return jsonError(cntErr.message, 500);
  if ((count ?? 0) > 0) return jsonError("Cannot delete: sites are linked", 409);

  const { error } = await supabaseAdmin
    .from("companies")
    .delete()
    .eq("id", id)
    .eq("office_id", session.officeId);

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
