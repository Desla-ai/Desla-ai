import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session";

function jsonError(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

function asText(v: any) {
    return String(v ?? "").trim();
}

export type OfficeProfileDTO = {
    supplierName: string;
    bizNo: string;
    ceoName: string;
    address: string;
    bizType: string;
    bizItem: string;
    phone: string;
    bankName: string;
    bankAccount: string;
    bankHolder: string;
    updatedAt?: string;
};

function rowToDTO(row: any): OfficeProfileDTO {
    return {
        supplierName: String(row?.supplier_name ?? ""),
        bizNo: String(row?.biz_no ?? ""),
        ceoName: String(row?.ceo_name ?? ""),
        address: String(row?.address ?? ""),
        bizType: String(row?.biz_type ?? ""),
        bizItem: String(row?.biz_item ?? ""),
        phone: String(row?.phone ?? ""),
        bankName: String(row?.bank_name ?? ""),
        bankAccount: String(row?.bank_account ?? ""),
        bankHolder: String(row?.bank_holder ?? ""),
        updatedAt: row?.updated_at ? String(row.updated_at) : undefined,
    };
}

export async function GET() {
    try {
        const cookieStore = await cookies();
        const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? "";
        const session = verifySessionCookie(raw);
        if (!session) return jsonError("Unauthorized", 401);

        // row가 없을 수 있으니(초기 가입/이전 데이터) 기본 row를 먼저 보장
        const { error: initErr } = await supabaseAdmin
            .from("office_profiles")
            .upsert(
                {
                    office_id: session.officeId,
                    // 기본값은 테이블 default('')가 있으나 upsert에서 명시 안 해도 됨
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "office_id" }
            );

        if (initErr) throw initErr;

        const { data, error } = await supabaseAdmin
            .from("office_profiles")
            .select(
                "office_id, supplier_name, biz_no, ceo_name, address, biz_type, biz_item, phone, bank_name, bank_account, bank_holder, updated_at"
            )
            .eq("office_id", session.officeId)
            .single();

        if (error) throw error;

        return NextResponse.json(
            { ok: true, officeProfile: rowToDTO(data) },
            { status: 200 }
        );
    } catch (e) {
        console.error(e);
        return jsonError("Internal Server Error", 500);
    }
}

export async function PUT(req: Request) {
    try {
        const cookieStore = await cookies();
        const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? "";
        const session = verifySessionCookie(raw);
        if (!session) return jsonError("Unauthorized", 401);

        const body = await req.json().catch(() => ({}));

        const payload = {
            office_id: session.officeId,
            supplier_name: asText(body?.supplierName),
            biz_no: asText(body?.bizNo),
            ceo_name: asText(body?.ceoName),
            address: asText(body?.address),
            biz_type: asText(body?.bizType),
            biz_item: asText(body?.bizItem),
            phone: asText(body?.phone),
            bank_name: asText(body?.bankName),
            bank_account: asText(body?.bankAccount),
            bank_holder: asText(body?.bankHolder),
            updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabaseAdmin
            .from("office_profiles")
            .upsert(payload, { onConflict: "office_id" })
            .select(
                "office_id, supplier_name, biz_no, ceo_name, address, biz_type, biz_item, phone, bank_name, bank_account, bank_holder, updated_at"
            )
            .single();

        if (error) throw error;

        return NextResponse.json(
            { ok: true, officeProfile: rowToDTO(data) },
            { status: 200 }
        );
    } catch (e) {
        console.error(e);
        return jsonError("Internal Server Error", 500);
    }
}
