import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/server/supabase-admin"

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const officeId = searchParams.get("officeId") ?? ""

    if (!officeId) return jsonError("officeId is required", 400)

    // offices.name
    const { data: office, error: officeErr } = await supabaseAdmin
      .from("offices")
      .select("id, name")
      .eq("id", officeId)
      .maybeSingle()

    if (officeErr) return jsonError(officeErr.message, 500)
    if (!office) return jsonError("Office not found", 404)

    // office_profiles.phone (optional)
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("office_profiles")
      .select("phone")
      .eq("office_id", officeId)
      .maybeSingle()

    if (profileErr) return jsonError(profileErr.message, 500)

    return NextResponse.json(
      {
        ok: true,
        config: {
          officeId: office.id,
          orgName: office.name,
          officePhone: profile?.phone ?? null,
        },
      },
      { status: 200 }
    )
  } catch (e) {
    console.error(e)
    return jsonError("Internal Server Error", 500)
  }
}
