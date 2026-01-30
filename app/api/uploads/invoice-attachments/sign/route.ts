import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { jsonError } from "@/lib/server/dto"
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session"

const BUCKET = "invoice_attachments"

type Body = {
  paths: string[]
  expiresIn?: number
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
    const session = verifySessionCookie(token)
    if (!session) return jsonError("Unauthorized", 401)

    const body = (await req.json()) as Body
    const paths = body?.paths ?? []
    const expiresIn = Math.min(Math.max(body?.expiresIn ?? 60 * 30, 60), 60 * 60)

    if (!Array.isArray(paths) || paths.length === 0) {
      return jsonError("paths is required", 400)
    }

    for (const p of paths) {
      if (!p.startsWith(`${session.officeId}/`)) {
        return jsonError("Invalid attachment path scope", 400)
      }
    }

    const signed = []
    for (const p of paths) {
      const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(p, expiresIn)
      if (error) return jsonError(error.message, 500)
      signed.push({ path: p, url: data?.signedUrl })
    }

    return NextResponse.json({ signed })
  } catch (e: any) {
    return jsonError(e?.message ?? "Failed to sign urls", 500)
  }
}
