import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { SESSION_COOKIE_NAME, verifySessionCookie } from "@/lib/server/session";

const BUCKET = "worker-ids";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { paths, expiresIn } = (await req.json()) as { paths: string[]; expiresIn?: number };
  const exp = Math.min(Math.max(expiresIn ?? 300, 60), 60 * 30); // 1~30분

  const prefix = `${session.officeId}/workers/`;

  const signed: Array<{ path: string; url: string | null }> = [];
  for (const p0 of paths ?? []) {
    const p = String(p0 ?? "");

    // ✅ office 스코프 검증 (중요)
    if (!p || !p.startsWith(prefix)) {
      signed.push({ path: p, url: null });
      continue;
    }

    const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(p, exp);
    signed.push({ path: p, url: error ? null : (data?.signedUrl ?? null) });
  }

  return NextResponse.json({ signed });
}
