import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session";

export async function GET() {
  const cookieStore = await cookies();
  const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  if (!session) return NextResponse.json({ user: null }, { status: 200 });
  return NextResponse.json({
    user: { id: session.userId, officeId: session.officeId, username: session.username },
  });
}
