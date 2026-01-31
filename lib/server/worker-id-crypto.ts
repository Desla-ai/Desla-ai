import crypto from "crypto";

const ENC_KEY = process.env.WORKER_ID_ENC_KEY!; // base64(32 bytes)
const HMAC_KEY = process.env.WORKER_ID_HMAC_KEY!;

function getKey() {
  const key = Buffer.from(ENC_KEY, "base64");
  if (key.length !== 32) throw new Error("WORKER_ID_ENC_KEY must be 32 bytes (base64).");
  return key;
}

// AES-256-GCM
export function encryptText(plain: string) {
  const iv = crypto.randomBytes(12);
  const key = getKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

// office 단위 중복 방지(해시)
export function hmacIdentity(officeId: string, front6: string, back1: string) {
  return crypto.createHmac("sha256", HMAC_KEY).update(`${officeId}:${front6}:${back1}`).digest("hex");
}
