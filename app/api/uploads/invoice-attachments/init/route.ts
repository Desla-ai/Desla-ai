import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import crypto from "crypto"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { jsonError } from "@/lib/server/dto"
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session"

export const runtime = "nodejs"

const BUCKET = "invoice_attachments"

type Body = {
  fileName: string
  mime: string
  size: number
}

function safeName(original: string) {
  const name = (original ?? "").trim()
  const lastDot = name.lastIndexOf(".")
  const base = lastDot > 0 ? name.slice(0, lastDot) : name
  const ext = lastDot > 0 ? name.slice(lastDot) : ""

  const cleanedBase =
    base
      .normalize("NFKD")
      .replace(/[^\w\-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "file"

  const cleanedExt = ext
    .toLowerCase()
    .replace(/[^\.a-z0-9]/g, "")
    .slice(0, 10)

  return `${cleanedBase}${cleanedExt}`
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
    const session = verifySessionCookie(token)
    if (!session) return jsonError("Unauthorized", 401)

    const body = (await req.json()) as Body
    if (!body?.fileName) return jsonError("fileName is required", 400)

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const ym = now.slice(0, 7)
    const path = `${session.officeId}/invoices/${ym}/${id}_${safeName(body.fileName)}`

    const { data, error } = await (supabaseAdmin as any).storage
      .from(BUCKET)
      .createSignedUploadUrl(path)

    if (error) return jsonError(error.message, 500)

    return NextResponse.json({
      uploadUrl: data?.signedUrl,
      attachmentDraft: {
        id,
        name: body.fileName,
        mime: body.mime,
        size: body.size,
        path,
        url: null,
        createdAt: now,
      },
    })
  } catch (e: any) {
    return jsonError(e?.message ?? "Failed to init upload", 500)
  }
}
