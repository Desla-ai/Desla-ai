import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "@/lib/server/session";

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "node:fs/promises";
import path from "node:path";

import ExcelJS from "exceljs";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
    return NextResponse.json({ error: message }, { status });
}

function isYmd(v: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function ymdToYm(v: string) {
    return v.slice(0, 7);
}

function safeStr(v: unknown) {
    if (v === null || v === undefined) return "";
    return String(v);
}

function formatWon(amount: unknown) {
    const n = typeof amount === "number" ? amount : Number(amount ?? 0);
    if (!Number.isFinite(n)) return "0원";
    return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

function maskId(front6: string | null | undefined, back1: string | null | undefined) {
    const f = safeStr(front6);
    const b = safeStr(back1);
    if (!f || !b) return "";
    return `${f}-${b}******`;
}

function getSupabaseAdmin() {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl) throw new Error("Missing env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
    if (!serviceRoleKey) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");
    return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

// ---------------- PDF helpers (reuse style from invoices/[id]/pdf) ----------------
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 40;
const CONTENT_W = PAGE_W - M * 2;

const COLOR_TEXT = rgb(0.12, 0.12, 0.12);
const COLOR_MUTED = rgb(0.45, 0.45, 0.45);
const COLOR_LINE = rgb(0.85, 0.85, 0.85);
const COLOR_BOX = rgb(0.97, 0.97, 0.97);

const FONT_SIZE_TITLE = 18;
const FONT_SIZE = 11;
const FONT_SIZE_SM = 9;

function drawText(page: any, text: string, x: number, y: number, font: any, size: number, color = COLOR_TEXT) {
    page.drawText(text, { x, y, size, font, color });
}

function drawHLine(page: any, x: number, y: number, w: number) {
    page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness: 1, color: COLOR_LINE });
}

function drawBox(page: any, x: number, y: number, w: number, h: number) {
    page.drawRectangle({ x, y, width: w, height: h, color: COLOR_BOX, borderColor: COLOR_LINE, borderWidth: 1 });
}

function textWidth(text: string, font: any, size: number) {
    return font.widthOfTextAtSize(text, size);
}

function ellipsisText(text: string, font: any, fontSize: number, maxWidth: number) {
    const t = safeStr(text);
    if (!t) return "";
    if (textWidth(t, font, fontSize) <= maxWidth) return t;
    const E = "…";
    let out = "";
    for (const ch of t) {
        const cand = out + ch;
        if (textWidth(cand + E, font, fontSize) <= maxWidth) out = cand;
        else break;
    }
    return out ? out + E : E;
}

async function fetchFontBytes(relFromPublic: string) {
    const abs = path.join(process.cwd(), "public", relFromPublic);
    return fs.readFile(abs);
}

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
    return await res.arrayBuffer();
}

function isImageUrlOrPath(p: string) {
    const lower = p.toLowerCase();
    return lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp");
}

function kstDateYmd() {
    // KST "today" for document display
    const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
    // sv-SE gives YYYY-MM-DD
    return fmt.format(new Date());
}

// ---------------- Commission rule helpers (copied/compatible with existing settle logic) ----------------
function pickRule(rules: any[], args: { workerId: string; occupation: string; ym: string }) {
    const { workerId, occupation, ym } = args;
    const inPeriod = (r: any) => r.effectiveStart <= ym && ym <= r.effectiveEnd;

    const workerRule = rules.find((r) => r.type === "worker" && r.targetId === workerId && inPeriod(r));
    if (workerRule) return workerRule;

    const occRule = rules.find(
        (r) =>
            r.type === "occupation" && (r.targetId === occupation || r.targetName === occupation) && inPeriod(r)
    );
    if (occRule) return occRule;

    const siteRule = rules.find((r) => r.type === "site" && inPeriod(r));
    return siteRule ?? null;
}

function calcCommission(gross: number, rule: any | null) {
    if (!rule) return { commission: 0, ruleLabel: "규칙 없음" };
    if (rule.commissionType === "RATE") {
        const rate = Number(rule.commissionValue || 0);
        const c = Math.round((gross * rate) / 100);
        return { commission: c, ruleLabel: `${rate}% (${rule.type})` };
    }
    const fixed = Number(rule.commissionValue || 0);
    return { commission: fixed, ruleLabel: `${fixed}원 (${rule.type})` };
}

// ---------------- Data types ----------------
type OfficeProfile = {
    supplier_name: string;
    biz_no: string;
    ceo_name: string;
    address: string;
    biz_type: string;
    biz_item: string;
    phone: string;
    bank_name: string;
    bank_account: string;
    bank_holder: string;
};

type InvoiceRoleAgg = {
    role: string;
    // daily totals for date grid
    byDate: Map<string, number>; // ymd -> units
    totalUnits: number;
    gross: number; // sum(work_units*daily_wage)
};

type WageLedgerWorkerRow = {
    workerId: string;
    name: string;
    phone: string;
    role: string;
    idMasked: string;
    idCopyPhotoUrl: string;

    workUnits: number;
    gross: number;
    commission: number;
    net: number;
};

// ---------------- Main handler ----------------
export async function GET(req: NextRequest) {
    const sp = req.nextUrl.searchParams;
    const companyId = String(sp.get("companyId") ?? "").trim();
    const periodStart = String(sp.get("periodStart") ?? "").trim();
    const periodEnd = String(sp.get("periodEnd") ?? "").trim();
    const docType = String(sp.get("docType") ?? "").toUpperCase();
    const format = String(sp.get("format") ?? "").toLowerCase();

    if (!companyId) return jsonError("companyId is required", 400);
    if (!isYmd(periodStart) || !isYmd(periodEnd)) return jsonError("periodStart/periodEnd must be YYYY-MM-DD", 400);
    if (periodStart > periodEnd) return jsonError("periodStart must be <= periodEnd", 400);
    if (docType !== "INVOICE" && docType !== "WAGE_LEDGER") return jsonError("docType must be INVOICE|WAGE_LEDGER", 400);
    if (format !== "pdf" && format !== "xlsx") return jsonError("format must be pdf|xlsx", 400);

    // Auth
    const cookieStore = await cookies();
    const session = verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
    if (!session) return jsonError("Unauthorized", 401);

    const supabaseAdmin = getSupabaseAdmin();

    // Company belongs to office?
    const { data: company, error: cErr } = await supabaseAdmin
        .from("companies")
        .select("id, office_id, name")
        .eq("id", companyId)
        .single();
    if (cErr || !company) return jsonError("Company not found", 404);
    if (String(company.office_id) !== String(session.officeId)) return jsonError("Forbidden", 403);

    // Load office + profile
    const { data: office, error: oErr } = await supabaseAdmin
        .from("offices")
        .select("id, name")
        .eq("id", session.officeId)
        .single();
    if (oErr || !office) return jsonError("Office not found", 404);

    const { data: profile } = await supabaseAdmin
        .from("office_profiles")
        .select(
            "supplier_name,biz_no,ceo_name,address,biz_type,biz_item,phone,bank_name,bank_account,bank_holder"
        )
        .eq("office_id", session.officeId)
        .maybeSingle();

    const officeProfile: OfficeProfile = {
        supplier_name: profile?.supplier_name ?? office.name ?? "",
        biz_no: profile?.biz_no ?? "",
        ceo_name: profile?.ceo_name ?? "",
        address: profile?.address ?? "",
        biz_type: profile?.biz_type ?? "",
        biz_item: profile?.biz_item ?? "",
        phone: profile?.phone ?? "",
        bank_name: profile?.bank_name ?? "",
        bank_account: profile?.bank_account ?? "",
        bank_holder: profile?.bank_holder ?? "",
    };

    // Sites under company
    const { data: sites, error: sErr } = await supabaseAdmin
        .from("sites")
        .select("id,name,company_id")
        .eq("office_id", session.officeId)
        .eq("company_id", companyId);
    if (sErr) return jsonError(sErr.message, 500);

    const siteIds = (sites ?? []).map((x: any) => String(x.id));
    if (siteIds.length === 0) return jsonError("No sites linked to this company", 409);

    // Daily settlements in period for these sites
    const { data: dsRows, error: dsErr } = await supabaseAdmin
        .from("daily_settlements")
        .select("site_id, worker_id, work_date, daily_wage, work_units")
        .eq("office_id", session.officeId)
        .in("site_id", siteIds)
        .gte("work_date", periodStart)
        .lte("work_date", periodEnd);
    if (dsErr) return jsonError(dsErr.message, 500);

    // Load workers (basic fields only)
    const { data: workers, error: wErr } = await supabaseAdmin
        .from("workers")
        .select("id, name, phone, id_front6, id_back1, id_copy_photo_url")
        .eq("office_id", session.officeId);
    if (wErr) return jsonError(wErr.message, 500);

    // Load worker_roles + roles names separately (avoid nested select typing issues)
    const workerIds = (workers ?? []).map((w: any) => String(w.id));

    const { data: workerRoleRows, error: wrErr } = await supabaseAdmin
        .from("worker_roles")
        .select("worker_id, roles(name)")
        .in("worker_id", workerIds);
    if (wrErr) return jsonError(wrErr.message, 500);

    function formatRoleLabel(roleNames: string[], max = 3) {
        if (roleNames.length === 0) return "일반";
        if (roleNames.length <= max) return roleNames.join(", ");
        return `${roleNames.slice(0, max).join(", ")} 외 ${roleNames.length - max}개`;
    }

    // worker_id -> roleNames[]
    const roleNamesByWorkerId = new Map<string, string[]>();

    for (const row of workerRoleRows ?? []) {
        const workerId = String((row as any).worker_id);

        // roles는 조인 결과가 object든 array든 방어
        const roles = (row as any).roles;
        let roleName: string | null = null;

        if (roles && typeof roles === "object" && !Array.isArray(roles)) {
            roleName = typeof roles.name === "string" ? roles.name : null;
        } else if (Array.isArray(roles) && typeof roles?.[0]?.name === "string") {
            roleName = roles[0].name;
        }

        if (!roleName) continue;

        const prev = roleNamesByWorkerId.get(workerId) ?? [];
        if (!prev.includes(roleName)) prev.push(roleName);
        roleNamesByWorkerId.set(workerId, prev);
    }

    const workerById = new Map<string, any>();
    for (const w of workers ?? []) {
        const workerId = String((w as any).id);
        const roleNames: string[] = roleNamesByWorkerId.get(workerId) ?? [];
        const roleLabel = formatRoleLabel(roleNames, 3);

        workerById.set(workerId, { ...w, roleNames, roleLabel });
    }


    // --- Branch by docType ---
    if (docType === "INVOICE") {
        // Role aggregation + daily date grid
        const roleAggByName = new Map<string, InvoiceRoleAgg>();

        for (const r of dsRows ?? []) {
            const workerId = String((r as any).worker_id);
            const w = workerById.get(workerId);
            const role = w?.roleLabel ?? "일반";

            const dateStr = String((r as any).work_date).slice(0, 10); // date from DB
            const units = Number((r as any).work_units ?? 0);
            const wage = Number((r as any).daily_wage ?? 0);
            const gross = wage * units;

            const agg = roleAggByName.get(role) ?? { role, byDate: new Map(), totalUnits: 0, gross: 0 };
            agg.totalUnits += units;
            agg.gross += gross;
            agg.byDate.set(dateStr, (agg.byDate.get(dateStr) ?? 0) + units);
            roleAggByName.set(role, agg);
        }

        const roleAggs = Array.from(roleAggByName.values()).sort((a, b) => b.gross - a.gross);

        if (format === "xlsx") {
            const wb = new ExcelJS.Workbook();
            wb.creator = "desla";
            wb.created = new Date();

            const ws = wb.addWorksheet("노무비청구서");

            ws.addRow(["회사(청구대상)", company.name]);
            ws.addRow(["기간", `${periodStart} ~ ${periodEnd}`]);
            ws.addRow(["공급자(사무소)", officeProfile.supplier_name]);
            ws.addRow([]);

            // Header
            const header = ["직종", "공수합", "단가(가중평균)", "노무비(총액)"];
            ws.addRow(header);

            for (const a of roleAggs) {
                const unitPrice = a.totalUnits > 0 ? Math.round(a.gross / a.totalUnits) : 0;
                ws.addRow([a.role, a.totalUnits, unitPrice, Math.round(a.gross)]);
            }

            ws.columns = [
                { width: 18 },
                { width: 12 },
                { width: 16 },
                { width: 18 },
            ];

            const buf = await wb.xlsx.writeBuffer();
            const filename = `INVOICE_${periodStart}_${periodEnd}.xlsx`;
            return new NextResponse(buf as ArrayBuffer, {
                status: 200,
                headers: {
                    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "Cache-Control": "no-store",
                    "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
                },
            });
        }

        // PDF
        const pdfDoc = await PDFDocument.create();
        pdfDoc.registerFontkit(fontkit);

        const [fontRegBuf, fontBoldBuf] = await Promise.all([
            fetchFontBytes("fonts/NotoSansKR-Regular.ttf"),
            fetchFontBytes("fonts/NotoSansKR-Bold.ttf"),
        ]);

        const fontReg = await pdfDoc.embedFont(new Uint8Array(fontRegBuf), { subset: false });
        const fontBold = await pdfDoc.embedFont(new Uint8Array(fontBoldBuf), { subset: false });
        const fontStd = await pdfDoc.embedFont(StandardFonts.Helvetica);

        const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
        let y = PAGE_H - M;

        drawText(page, "노무비 청구서", M, y - FONT_SIZE_TITLE, fontBold, FONT_SIZE_TITLE);
        y -= 34;

        drawText(page, `출력일자(KST): ${kstDateYmd()}`, M, y, fontReg, FONT_SIZE);
        drawText(page, `기간: ${periodStart} ~ ${periodEnd}`, M + 260, y, fontReg, FONT_SIZE);
        y -= 18;

        drawHLine(page, M, y, CONTENT_W);
        y -= 18;

        // Left block: company
        const leftW = (CONTENT_W - 12) / 2;
        const rightW = leftW;
        const boxH = 150;
        const boxY = y - boxH;

        drawBox(page, M, boxY, leftW, boxH);
        drawBox(page, M + leftW + 12, boxY, rightW, boxH);

        let ly = y - 18;
        drawText(page, "청구 대상(건설사)", M + 12, ly, fontBold, FONT_SIZE, COLOR_MUTED);
        ly -= 16;
        drawText(page, safeStr(company.name), M + 12, ly, fontBold, 13);
        ly -= 18;
        drawText(page, "(좌측 블록은 회사명만 사용)", M + 12, ly, fontReg, FONT_SIZE_SM, COLOR_MUTED);

        let ry = y - 18;
        const rx = M + leftW + 12 + 12;
        drawText(page, "공급자(사무소)", rx, ry, fontBold, FONT_SIZE, COLOR_MUTED);
        ry -= 16;
        const kv = [
            ["상호", officeProfile.supplier_name],
            ["등록번호", officeProfile.biz_no],
            ["대표", officeProfile.ceo_name],
            ["주소", officeProfile.address],
            ["업태/종목", `${officeProfile.biz_type} / ${officeProfile.biz_item}`.trim()],
            ["연락처", officeProfile.phone],
            ["계좌", `${officeProfile.bank_name} ${officeProfile.bank_account} (${officeProfile.bank_holder})`.trim()],
        ];

        for (const [k, v] of kv) {
            drawText(page, safeStr(k), rx, ry, fontBold, FONT_SIZE_SM, COLOR_MUTED);
            drawText(page, ellipsisText(safeStr(v), fontReg, FONT_SIZE_SM, rightW - 90), rx + 70, ry, fontReg, FONT_SIZE_SM);
            ry -= 13;
        }

        y = boxY - 18;

        // Summary
        const totalGross = roleAggs.reduce((s, a) => s + a.gross, 0);
        drawText(page, "합계", M, y, fontBold, FONT_SIZE);
        drawText(page, formatWon(totalGross), M + 60, y, fontBold, FONT_SIZE);
        y -= 16;

        // Table
        const headerH = 20;
        const rowH = 18;

        const colRoleW = 120;
        const colUnitsW = 70;
        const colUnitPriceW = 100;
        const colGrossW = CONTENT_W - (colRoleW + colUnitsW + colUnitPriceW);

        drawBox(page, M, y - headerH, CONTENT_W, headerH);
        drawText(page, "직종", M + 8, y - 14, fontBold, FONT_SIZE_SM, COLOR_MUTED);
        drawText(page, "공수", M + colRoleW + 8, y - 14, fontBold, FONT_SIZE_SM, COLOR_MUTED);
        drawText(page, "단가", M + colRoleW + colUnitsW + 8, y - 14, fontBold, FONT_SIZE_SM, COLOR_MUTED);
        drawText(page, "노무비", M + colRoleW + colUnitsW + colUnitPriceW + 8, y - 14, fontBold, FONT_SIZE_SM, COLOR_MUTED);

        y -= headerH;

        for (const a of roleAggs) {
            if (y - rowH < M + 80) break; // keep single page for now

            page.drawRectangle({ x: M, y: y - rowH, width: CONTENT_W, height: rowH, borderColor: COLOR_LINE, borderWidth: 1 });
            const unitPrice = a.totalUnits > 0 ? Math.round(a.gross / a.totalUnits) : 0;

            drawText(page, ellipsisText(a.role, fontReg, FONT_SIZE, colRoleW - 16), M + 8, y - 13, fontReg, FONT_SIZE);
            drawText(page, String(a.totalUnits), M + colRoleW + 8, y - 13, fontReg, FONT_SIZE);
            drawText(page, formatWon(unitPrice), M + colRoleW + colUnitsW + 8, y - 13, fontReg, FONT_SIZE);
            drawText(page, formatWon(Math.round(a.gross)), M + colRoleW + colUnitsW + colUnitPriceW + 8, y - 13, fontReg, FONT_SIZE);

            y -= rowH;
        }

        const pdfBytes = await pdfDoc.save();
        const pdfArrayBuffer = new ArrayBuffer(pdfBytes.byteLength);
        new Uint8Array(pdfArrayBuffer).set(pdfBytes);

        const filename = `INVOICE_${periodStart}_${periodEnd}.pdf`;
        return new NextResponse(pdfArrayBuffer, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Cache-Control": "no-store",
                "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
            },
        });
    }

    // ---------------- WAGE_LEDGER ----------------
    // Load rules per site (because rules are site-scoped)
    const { data: ruleRows, error: ruleErr } = await supabaseAdmin
        .from("settlement_rules")
        .select("id, site_id, type, target_id, target_name, commission_type, commission_value, effective_start, effective_end")
        .eq("office_id", session.officeId)
        .in("site_id", siteIds);
    if (ruleErr) return jsonError(ruleErr.message, 500);

    const rulesBySiteId = new Map<string, any[]>();
    for (const r of ruleRows ?? []) {
        const sid = String((r as any).site_id);
        const arr = rulesBySiteId.get(sid) ?? [];
        arr.push({
            id: (r as any).id,
            siteId: sid,
            type: (r as any).type,
            targetId: (r as any).target_id ?? undefined,
            targetName: (r as any).target_name ?? undefined,
            commissionType: (r as any).commission_type,
            commissionValue: (r as any).commission_value,
            effectiveStart: (r as any).effective_start,
            effectiveEnd: (r as any).effective_end,
        });
        rulesBySiteId.set(sid, arr);
    }

    // Aggregate by (worker, site, ym) so month boundary applies correctly.
    type Key = string;
    const keyOf = (workerId: string, siteId: string, ym: string) => `${workerId}__${siteId}__${ym}`;

    const agg = new Map<Key, { workerId: string; siteId: string; ym: string; gross: number; workUnits: number }>();

    for (const r of dsRows ?? []) {
        const workerId = String((r as any).worker_id);
        const siteId = String((r as any).site_id);
        const workDate = String((r as any).work_date).slice(0, 10);
        const ym = ymdToYm(workDate);

        const units = Number((r as any).work_units ?? 0);
        const wage = Number((r as any).daily_wage ?? 0);
        const gross = wage * units;

        const k = keyOf(workerId, siteId, ym);
        const prev = agg.get(k) ?? { workerId, siteId, ym, gross: 0, workUnits: 0 };
        agg.set(k, { ...prev, gross: prev.gross + gross, workUnits: prev.workUnits + units });
    }

    // Sum per worker
    const workerTotals = new Map<string, { gross: number; commission: number; net: number; workUnits: number }>();
    const workerRuleNotes = new Map<string, string[]>(); // for debugging/auditing (optional)

    for (const item of agg.values()) {
        const w = workerById.get(item.workerId);
        if (!w) continue;

        const roleNames: string[] = Array.isArray(w?.roleNames) ? w.roleNames : [];
        const rules = rulesBySiteId.get(item.siteId) ?? [];

        // 정책(B): "룰이 존재하는 직종" 우선 선택
        let occupation = "일반";

        // 1) 후보 직종(roleNames) 중에서 pickRule이 occupation-rule로 매칭되는 것을 먼저 찾기
        for (const cand of roleNames) {
            const found = rules.find(
                (rr) =>
                    rr.type === "occupation" &&
                    (rr.targetId === cand || rr.targetName === cand) &&
                    rr.effectiveStart <= item.ym &&
                    item.ym <= rr.effectiveEnd
            );
            if (found) {
                occupation = cand;
                break;
            }
        }

        // 2) 그래도 없으면, roleNames[0] (대표) 사용 (없으면 일반)
        if (occupation === "일반" && roleNames.length > 0) {
            occupation = roleNames[0];
        }

        // 기존 흐름 유지: 최종 rule 선택은 pickRule로 (worker > occupation > site)
        const rule = pickRule(rules, { workerId: item.workerId, occupation, ym: item.ym });

        const { commission, ruleLabel } = calcCommission(Math.round(item.gross), rule);
        const net = Math.max(0, Math.round(item.gross) - commission);

        const prev = workerTotals.get(item.workerId) ?? { gross: 0, commission: 0, net: 0, workUnits: 0 };
        workerTotals.set(item.workerId, {
            gross: prev.gross + Math.round(item.gross),
            commission: prev.commission + commission,
            net: prev.net + net,
            workUnits: prev.workUnits + item.workUnits,
        });

        const notes = workerRuleNotes.get(item.workerId) ?? [];
        notes.push(`${item.siteId}/${item.ym}: ${ruleLabel}`);
        workerRuleNotes.set(item.workerId, notes);
    }

    const wageRows: WageLedgerWorkerRow[] = [];
    for (const [workerId, t] of workerTotals.entries()) {
        const w = workerById.get(workerId);
        if (!w) continue;

        wageRows.push({
            workerId,
            name: safeStr(w?.name),
            phone: safeStr(w?.phone),
            role: safeStr(w?.roleLabel ?? "일반"),
            idMasked: maskId(w?.id_front6, w?.id_back1),
            idCopyPhotoUrl: safeStr(w?.id_copy_photo_url),
            workUnits: Number(t.workUnits ?? 0),
            gross: Number(t.gross ?? 0),
            commission: Number(t.commission ?? 0),
            net: Number(t.net ?? 0),
        });
    }

    wageRows.sort((a, b) => b.net - a.net);

    if (format === "xlsx") {
        const wb = new ExcelJS.Workbook();
        wb.creator = "desla";
        wb.created = new Date();

        const ws = wb.addWorksheet("노임대장");

        ws.addRow(["회사(청구대상)", company.name]);
        ws.addRow(["기간", `${periodStart} ~ ${periodEnd}`]);
        ws.addRow(["출력일자(KST)", kstDateYmd()]);
        ws.addRow([]);

        ws.addRow(["성명", "연락처", "직종", "공수", "총지급", "공제(수수료)", "실지급", "신분증", "신분증사본URL"]);

        for (const r of wageRows) {
            ws.addRow([
                r.name,
                r.phone,
                r.role,
                r.workUnits,
                r.gross,
                r.commission,
                r.net,
                r.idMasked,
                r.idCopyPhotoUrl,
            ]);
        }

        ws.columns = [
            { width: 14 },
            { width: 16 },
            { width: 12 },
            { width: 10 },
            { width: 14 },
            { width: 14 },
            { width: 14 },
            { width: 18 },
            { width: 40 },
        ];

        const buf = await wb.xlsx.writeBuffer();
        const filename = `WAGE_LEDGER_${periodStart}_${periodEnd}.xlsx`;
        return new NextResponse(buf as ArrayBuffer, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Cache-Control": "no-store",
                "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
            },
        });
    }

    // PDF for WAGE_LEDGER
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const [fontRegBuf, fontBoldBuf] = await Promise.all([
        fetchFontBytes("fonts/NotoSansKR-Regular.ttf"),
        fetchFontBytes("fonts/NotoSansKR-Bold.ttf"),
    ]);

    const fontReg = await pdfDoc.embedFont(new Uint8Array(fontRegBuf), { subset: false });
    const fontBold = await pdfDoc.embedFont(new Uint8Array(fontBoldBuf), { subset: false });
    const fontStd = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // 1) Main list page
    {
        const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
        let y = PAGE_H - M;

        drawText(page, "노임대장", M, y - FONT_SIZE_TITLE, fontBold, FONT_SIZE_TITLE);
        y -= 34;

        drawText(page, `회사: ${safeStr(company.name)}`, M, y, fontReg, FONT_SIZE);
        drawText(page, `기간: ${periodStart} ~ ${periodEnd}`, M + 260, y, fontReg, FONT_SIZE);
        y -= 16;
        drawText(page, `출력일자(KST): ${kstDateYmd()}`, M, y, fontReg, FONT_SIZE);
        y -= 16;

        drawHLine(page, M, y, CONTENT_W);
        y -= 14;

        // Table header
        const headerH = 20;
        const rowH = 18;

        const colNameW = 70;
        const colPhoneW = 90;
        const colRoleW = 60;
        const colUnitsW = 45;
        const colGrossW = 80;
        const colComW = 70;
        const colNetW = CONTENT_W - (colNameW + colPhoneW + colRoleW + colUnitsW + colGrossW + colComW);

        drawBox(page, M, y - headerH, CONTENT_W, headerH);
        drawText(page, "성명", M + 6, y - 14, fontBold, FONT_SIZE_SM, COLOR_MUTED);
        drawText(page, "연락처", M + colNameW + 6, y - 14, fontBold, FONT_SIZE_SM, COLOR_MUTED);
        drawText(page, "직종", M + colNameW + colPhoneW + 6, y - 14, fontBold, FONT_SIZE_SM, COLOR_MUTED);
        drawText(page, "공수", M + colNameW + colPhoneW + colRoleW + 6, y - 14, fontBold, FONT_SIZE_SM, COLOR_MUTED);
        drawText(page, "총지급", M + colNameW + colPhoneW + colRoleW + colUnitsW + 6, y - 14, fontBold, FONT_SIZE_SM, COLOR_MUTED);
        drawText(page, "공제", M + colNameW + colPhoneW + colRoleW + colUnitsW + colGrossW + 6, y - 14, fontBold, FONT_SIZE_SM, COLOR_MUTED);
        drawText(page, "실지급", M + colNameW + colPhoneW + colRoleW + colUnitsW + colGrossW + colComW + 6, y - 14, fontBold, FONT_SIZE_SM, COLOR_MUTED);

        y -= headerH;

        const bottomLimit = M + 120;
        for (const r of wageRows) {
            if (y - rowH < bottomLimit) break;

            page.drawRectangle({ x: M, y: y - rowH, width: CONTENT_W, height: rowH, borderColor: COLOR_LINE, borderWidth: 1 });

            drawText(page, ellipsisText(r.name, fontReg, FONT_SIZE, colNameW - 12), M + 6, y - 13, fontReg, FONT_SIZE);
            drawText(page, ellipsisText(r.phone, fontStd, FONT_SIZE, colPhoneW - 12), M + colNameW + 6, y - 13, fontStd, FONT_SIZE);
            drawText(page, ellipsisText(r.role, fontReg, FONT_SIZE, colRoleW - 12), M + colNameW + colPhoneW + 6, y - 13, fontReg, FONT_SIZE);
            drawText(page, String(r.workUnits), M + colNameW + colPhoneW + colRoleW + 6, y - 13, fontReg, FONT_SIZE);
            drawText(page, formatWon(r.gross), M + colNameW + colPhoneW + colRoleW + colUnitsW + 6, y - 13, fontReg, FONT_SIZE);
            drawText(page, formatWon(r.commission), M + colNameW + colPhoneW + colRoleW + colUnitsW + colGrossW + 6, y - 13, fontReg, FONT_SIZE);
            drawText(page, formatWon(r.net), M + colNameW + colPhoneW + colRoleW + colUnitsW + colGrossW + colComW + 6, y - 13, fontReg, FONT_SIZE);

            y -= rowH;
        }

        y -= 14;
        drawText(page, "별첨: 신분증 사본", M, y, fontBold, FONT_SIZE);
        drawText(page, "(각 인력 1명당 1페이지, 비율 유지)", M + 120, y, fontReg, FONT_SIZE_SM, COLOR_MUTED);
    }

    // 2) Attach ID copy pages (one page per worker)
    for (const r of wageRows) {
        const imgUrl = safeStr(r.idCopyPhotoUrl);

        const imgPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
        drawText(imgPage, "[별첨] 신분증 사본", M, PAGE_H - M - 18, fontBold, 14);

        const topY = PAGE_H - M - 36;
        drawText(imgPage, `성명: ${safeStr(r.name)}   직종: ${safeStr(r.role)}`, M, topY, fontReg, FONT_SIZE);
        drawText(imgPage, `연락처: ${safeStr(r.phone)}`, M, topY - 16, fontReg, FONT_SIZE);
        drawText(imgPage, `신분증: ${safeStr(r.idMasked)}`, M, topY - 32, fontReg, FONT_SIZE);

        const frameTop = PAGE_H - M - 80;
        const frameBottom = M;
        const frameH = frameTop - frameBottom;
        const frameW = CONTENT_W;

        imgPage.drawRectangle({ x: M, y: frameBottom, width: frameW, height: frameH, borderColor: COLOR_LINE, borderWidth: 1 });

        if (!imgUrl || !isImageUrlOrPath(imgUrl)) {
            drawText(imgPage, "(신분증 사본 이미지가 없거나 형식이 지원되지 않습니다: JPG/PNG)", M + 10, frameTop - 24, fontReg, FONT_SIZE_SM, COLOR_MUTED);
            continue;
        }

        let ab: ArrayBuffer;
        try {
            ab = await fetchArrayBuffer(imgUrl);
        } catch {
            drawText(imgPage, "(이미지를 불러오지 못했습니다)", M + 10, frameTop - 24, fontReg, FONT_SIZE_SM, COLOR_MUTED);
            continue;
        }

        let img: any;
        try {
            const lower = imgUrl.toLowerCase();
            if (lower.endsWith(".png")) img = await pdfDoc.embedPng(ab);
            else img = await pdfDoc.embedJpg(ab);
        } catch {
            drawText(imgPage, "(이미지 embed에 실패했습니다)", M + 10, frameTop - 24, fontReg, FONT_SIZE_SM, COLOR_MUTED);
            continue;
        }

        const scale = Math.min(frameW / img.width, frameH / img.height, 1);
        const drawW = img.width * scale;
        const drawH = img.height * scale;

        const x = M + (frameW - drawW) / 2;
        const yImg = frameBottom + (frameH - drawH) / 2;

        imgPage.drawImage(img, { x, y: yImg, width: drawW, height: drawH });
    }

    const pdfBytes = await pdfDoc.save();
    const pdfArrayBuffer = new ArrayBuffer(pdfBytes.byteLength);
    new Uint8Array(pdfArrayBuffer).set(pdfBytes);

    const filename = `WAGE_LEDGER_${periodStart}_${periodEnd}.pdf`;
    return new NextResponse(pdfArrayBuffer, {
        status: 200,
        headers: {
            "Content-Type": "application/pdf",
            "Cache-Control": "no-store",
            "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        },
    });
}
