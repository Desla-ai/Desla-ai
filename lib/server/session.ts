import crypto from "crypto";
import { cookies } from "next/headers"

const COOKIE_NAME = "desla_session";

type SessionPayload = {
  userId: string;
  officeId: string;
  username: string;
  exp: number; // unix seconds
};

function base64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function sign(data: string) {
  const secret = process.env.AUTH_COOKIE_SECRET!;
  return base64url(crypto.createHmac("sha256", secret).update(data).digest());
}

export function createSessionCookie(payload: Omit<SessionPayload, "exp">, ttlSeconds = 60 * 60 * 24 * 7) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body: SessionPayload = { ...payload, exp };
  const json = JSON.stringify(body);
  const b64 = base64url(json);
  const sig = sign(b64);
  return { name: COOKIE_NAME, value: `${b64}.${sig}`, exp , maxAge: ttlSeconds };
}

export function verifySessionCookie(cookieValue: string | undefined): SessionPayload | null {
  if (!cookieValue) return null;
  const [b64, sig] = cookieValue.split(".");
  if (!b64 || !sig) return null;
  if (sign(b64) !== sig) return null;

  const json = Buffer.from(b64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  const payload = JSON.parse(json) as SessionPayload;
  if (!payload?.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export async function getSession() {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value
  return verifySessionCookie(cookieValue)
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
