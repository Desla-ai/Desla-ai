// app/api/invoices/[id]/pdf/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) throw new Error("Missing env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
  if (!serviceRoleKey) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

// ---- Layout constants ----
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

function safeStr(v: unknown) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function formatWon(amount: unknown) {
  const n = typeof amount === "number" ? amount : Number(amount ?? 0);
  if (!Number.isFinite(n)) return "0원";
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

function ymd(dateLike: unknown) {
  const s = safeStr(dateLike);
  return s ? s.slice(0, 10) : "";
}

// ---- Text measurement + wrapping ----
function textWidth(text: string, font: any, size: number) {
  return font.widthOfTextAtSize(text, size);
}

function wrapTextByWidth(text: string, font: any, fontSize: number, maxWidth: number) {
  const t = safeStr(text).replace(/\r/g, "");
  if (!t) return [""];

  const paragraphs = t.split("\n");
  const lines: string[] = [];

  for (const p of paragraphs) {
    const words = p.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (textWidth(candidate, font, fontSize) <= maxWidth) {
        line = candidate;
      } else {
        if (!line) {
          let chunk = "";
          for (const ch of w) {
            const cand2 = chunk + ch;
            if (textWidth(cand2, font, fontSize) <= maxWidth) chunk = cand2;
            else {
              if (chunk) lines.push(chunk);
              chunk = ch;
            }
          }
          if (chunk) lines.push(chunk);
          line = "";
        } else {
          lines.push(line);
          line = w;
        }
      }
    }
    if (line) lines.push(line);
  }

  return lines;
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

function drawText(page: any, text: string, x: number, y: number, font: any, size: number, color = COLOR_TEXT) {
  page.drawText(text, { x, y, size, font, color });
}

function drawHLine(page: any, x: number, y: number, w: number) {
  page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness: 1, color: COLOR_LINE });
}

function drawBox(page: any, x: number, y: number, w: number, h: number) {
  page.drawRectangle({ x, y, width: w, height: h, color: COLOR_BOX, borderColor: COLOR_LINE, borderWidth: 1 });
}

function drawKeyValueWrapped(opts: {
  page: any;
  x: number;
  yTop: number;
  w: number;
  key: string;
  value: string;
  keyFont: any;
  valueFont: any;
  fontSize: number;
  lineGap: number;
  keyW: number;
}) {
  const { page, x, yTop, w, key, value, keyFont, valueFont, fontSize, lineGap, keyW } = opts;

  const valueX = x + keyW;
  const valueW = w - keyW;

  drawText(page, safeStr(key), x, yTop, keyFont, fontSize, COLOR_MUTED);

  const lines = wrapTextByWidth(safeStr(value), valueFont, fontSize, valueW);
  let y = yTop;
  for (const line of lines) {
    drawText(page, line, valueX, y, valueFont, fontSize, COLOR_TEXT);
    y -= fontSize + lineGap;
  }
  return y + lineGap;
}

async function fetchFontBytes(relFromPublic: string) {
  const abs = path.join(process.cwd(), "public", relFromPublic);
  return fs.readFile(abs); // Buffer
}

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
  return await res.arrayBuffer();
}

function isImagePath(p: string) {
  const lower = p.toLowerCase();
  return lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp");
}

function extractAttachmentPaths(attachments: any): string[] {
  if (!attachments) return [];
  if (Array.isArray(attachments)) {
    return attachments
      .map((x) => {
        if (typeof x === "string") return x;
        if (x && typeof x === "object") return x.path || x.storage_path || x.storagePath || x.key || "";
        return "";
      })
      .map((s) => safeStr(s))
      .filter(Boolean);
  }
  if (attachments && typeof attachments === "object") {
    const maybe = (attachments.items || attachments.files || []) as any;
    if (Array.isArray(maybe)) return extractAttachmentPaths(maybe);
  }
  return [];
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { id } = await ctx.params;

    const { data: invoice, error: invErr } = await supabaseAdmin
      .from("invoices")
      .select(
        `
        id,
        office_id,
        site_id,
        invoice_number,
        contractor_name,
        status,
        issue_date,
        due_date,
        total,
        notes,
        attachments,
        line_items:invoice_line_items ( id, description, quantity, unit_price, amount )
      `
      )
      .eq("id", id)
      .single();

    if (invErr || !invoice) {
      return NextResponse.json({ error: "Invoice not found", invErr: invErr?.message ?? null }, { status: 404 });
    }

    const { data: office, error: officeErr } = await supabaseAdmin
      .from("offices")
      .select("id, name")
      .eq("id", invoice.office_id)
      .single();

    if (officeErr || !office) {
      return NextResponse.json({ error: "Office not found", officeErr: officeErr?.message ?? null }, { status: 404 });
    }

    const { data: site, error: siteErr } = await supabaseAdmin
      .from("sites")
      .select("id, name")
      .eq("id", invoice.site_id)
      .single();

    if (siteErr || !site) {
      return NextResponse.json({ error: "Site not found", siteErr: siteErr?.message ?? null }, { status: 404 });
    }

    // ---- PDF ----
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const [fontRegBuf, fontBoldBuf] = await Promise.all([
      fetchFontBytes("fonts/NotoSansKR-Regular.ttf"),
      fetchFontBytes("fonts/NotoSansKR-Bold.ttf"),
    ]);

    // ✅ 핵심: subset 끔 + 입력을 Uint8Array로 고정
    const fontReg = await pdfDoc.embedFont(new Uint8Array(fontRegBuf), { subset: false });
    const fontBold = await pdfDoc.embedFont(new Uint8Array(fontBoldBuf), { subset: false });

    const fontStd = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // ---- Main page ----
    let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - M;

    drawText(page, "청구서", M, y - FONT_SIZE_TITLE, fontBold, FONT_SIZE_TITLE);
    y -= 34;

    const invoiceNo = safeStr(invoice.invoice_number || invoice.id);

    drawText(page, `청구번호: ${invoiceNo}`, M, y, fontReg, FONT_SIZE);
    drawText(page, `상태: ${safeStr(invoice.status)}`, M + 260, y, fontReg, FONT_SIZE);
    y -= 18;

    drawText(page, `발행일: ${ymd(invoice.issue_date)}`, M, y, fontReg, FONT_SIZE);
    drawText(page, `납기일: ${ymd(invoice.due_date)}`, M + 260, y, fontReg, FONT_SIZE);
    y -= 16;

    drawHLine(page, M, y, CONTENT_W);
    y -= 18;

    const kvBoxH = 120;
    const kvBoxY = y - kvBoxH;
    drawBox(page, M, kvBoxY, CONTENT_W, kvBoxH);

    let kvY = y - 18;
    const keyW = 92;
    const lineGap = 3;

    kvY =
      drawKeyValueWrapped({
        page,
        x: M + 12,
        yTop: kvY,
        w: CONTENT_W - 24,
        key: "사무소",
        value: safeStr(office.name),
        keyFont: fontBold,
        valueFont: fontReg,
        fontSize: FONT_SIZE,
        lineGap,
        keyW,
      }) - 6;

    kvY =
      drawKeyValueWrapped({
        page,
        x: M + 12,
        yTop: kvY,
        w: CONTENT_W - 24,
        key: "현장명",
        value: safeStr(site.name),
        keyFont: fontBold,
        valueFont: fontReg,
        fontSize: FONT_SIZE,
        lineGap,
        keyW,
      }) - 6;

    kvY =
      drawKeyValueWrapped({
        page,
        x: M + 12,
        yTop: kvY,
        w: CONTENT_W - 24,
        key: "업체명",
        value: safeStr(invoice.contractor_name),
        keyFont: fontBold,
        valueFont: fontReg,
        fontSize: FONT_SIZE,
        lineGap,
        keyW,
      }) - 6;

    y = kvBoxY - 18;

    drawText(page, "총액", M, y, fontBold, FONT_SIZE);
    drawText(page, formatWon(invoice.total), M + 60, y, fontBold, FONT_SIZE);
    y -= 16;

    // ---- Table ----
    const tableTopY = y;
    const rowH = 18;
    const headerH = 20;

    const colNoW = 32;
    const colDescW = 290;
    const colQtyW = 48;
    const colUnitW = 80;
    const colAmtW = CONTENT_W - (colNoW + colDescW + colQtyW + colUnitW);

    drawBox(page, M, tableTopY - headerH, CONTENT_W, headerH);
    drawText(page, "No", M + 8, tableTopY - 14, fontBold, FONT_SIZE_SM, COLOR_MUTED);
    drawText(page, "내역", M + colNoW + 8, tableTopY - 14, fontBold, FONT_SIZE_SM, COLOR_MUTED);
    drawText(page, "수량", M + colNoW + colDescW + 8, tableTopY - 14, fontBold, FONT_SIZE_SM, COLOR_MUTED);
    drawText(page, "단가", M + colNoW + colDescW + colQtyW + 8, tableTopY - 14, fontBold, FONT_SIZE_SM, COLOR_MUTED);
    drawText(page, "금액", M + colNoW + colDescW + colQtyW + colUnitW + 8, tableTopY - 14, fontBold, FONT_SIZE_SM, COLOR_MUTED);

    y = tableTopY - headerH;

    const items = Array.isArray((invoice as any).line_items) ? (invoice as any).line_items : [];
    const bottomLimit = M + 120;

    for (let i = 0; i < items.length; i++) {
      const li: any = items[i];

      if (y - rowH < bottomLimit) {
        page = pdfDoc.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - M;

        drawText(page, "내역", M, y - 18, fontBold, 14);
        y -= 30;

        drawBox(page, M, y - headerH, CONTENT_W, headerH);
        drawText(page, "No", M + 8, y - 14, fontBold, FONT_SIZE_SM, COLOR_MUTED);
        drawText(page, "내역", M + colNoW + 8, y - 14, fontBold, FONT_SIZE_SM, COLOR_MUTED);
        drawText(page, "수량", M + colNoW + colDescW + 8, y - 14, fontBold, FONT_SIZE_SM, COLOR_MUTED);
        drawText(page, "단가", M + colNoW + colDescW + colQtyW + 8, y - 14, fontBold, FONT_SIZE_SM, COLOR_MUTED);
        drawText(page, "금액", M + colNoW + colDescW + colQtyW + colUnitW + 8, y - 14, fontBold, FONT_SIZE_SM, COLOR_MUTED);

        y -= headerH;
      }

      page.drawRectangle({
        x: M,
        y: y - rowH,
        width: CONTENT_W,
        height: rowH,
        borderColor: COLOR_LINE,
        borderWidth: 1,
      });

      const no = String(i + 1);
      const desc = ellipsisText(safeStr(li.description), fontReg, FONT_SIZE, colDescW - 16);
      const qty = safeStr(li.quantity ?? "");
      const unit = li.unit_price !== null && li.unit_price !== undefined ? formatWon(li.unit_price) : "";
      const amt = li.amount !== null && li.amount !== undefined ? formatWon(li.amount) : "";

      drawText(page, no, M + 8, y - 13, fontStd, FONT_SIZE, COLOR_TEXT);
      drawText(page, desc, M + colNoW + 8, y - 13, fontReg, FONT_SIZE, COLOR_TEXT);
      drawText(page, qty, M + colNoW + colDescW + 8, y - 13, fontReg, FONT_SIZE, COLOR_TEXT);
      drawText(page, unit, M + colNoW + colDescW + colQtyW + 8, y - 13, fontReg, FONT_SIZE, COLOR_TEXT);
      drawText(page, amt, M + colNoW + colDescW + colQtyW + colUnitW + 8, y - 13, fontReg, FONT_SIZE, COLOR_TEXT);

      y -= rowH;
    }

    y -= 18;

    // notes
    const memo = safeStr((invoice as any).notes);
    if (memo) {
      drawText(page, "비고", M, y, fontBold, FONT_SIZE);
      y -= 14;

      const memoLines = wrapTextByWidth(memo, fontReg, FONT_SIZE, CONTENT_W);
      for (const line of memoLines) {
        if (y < M + 40) {
          page = pdfDoc.addPage([PAGE_W, PAGE_H]);
          y = PAGE_H - M;
        }
        drawText(page, line, M, y, fontReg, FONT_SIZE, COLOR_TEXT);
        y -= FONT_SIZE + 3;
      }
    }

    // attachments (jsonb)
    const attachmentPaths = extractAttachmentPaths((invoice as any).attachments).filter(isImagePath);

    for (let i = 0; i < attachmentPaths.length; i++) {
      const storagePath = attachmentPaths[i];
      const fileName = storagePath.split("/").pop() || `attachment-${i + 1}`;

      const { data: signed, error: signErr } = await supabaseAdmin.storage
        .from("invoice_attachments")
        .createSignedUrl(storagePath, 60 * 10);

      if (signErr || !signed?.signedUrl) continue;

      let ab: ArrayBuffer;
      try {
        ab = await fetchArrayBuffer(signed.signedUrl);
      } catch {
        continue;
      }

      let img;
      try {
        const lower = storagePath.toLowerCase();
        if (lower.endsWith(".png")) img = await pdfDoc.embedPng(ab);
        else img = await pdfDoc.embedJpg(ab);
      } catch {
        continue;
      }

      const imgPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
      drawText(imgPage, "첨부파일", M, PAGE_H - M - 18, fontBold, 14);
      drawText(imgPage, ellipsisText(fileName, fontReg, FONT_SIZE, CONTENT_W), M, PAGE_H - M - 36, fontReg, FONT_SIZE, COLOR_MUTED);

      const frameTop = PAGE_H - M - 60;
      const frameBottom = M;
      const frameH = frameTop - frameBottom;
      const frameW = CONTENT_W;

      const scale = Math.min(frameW / img.width, frameH / img.height, 1);
      const drawW = img.width * scale;
      const drawH = img.height * scale;

      const x = M + (frameW - drawW) / 2;
      const yImg = frameBottom + (frameH - drawH) / 2;

      imgPage.drawRectangle({ x: M, y: frameBottom, width: frameW, height: frameH, borderColor: COLOR_LINE, borderWidth: 1 });
      imgPage.drawImage(img, { x, y: yImg, width: drawW, height: drawH });
    }

    // ---- Output ----
    const pdfBytes = await pdfDoc.save(); // Uint8Array

    // SharedArrayBuffer 회피: 순수 ArrayBuffer 복사
    const pdfArrayBuffer = new ArrayBuffer(pdfBytes.byteLength);
    new Uint8Array(pdfArrayBuffer).set(pdfBytes);

    const filename = `invoice-${invoiceNo}.pdf`;

    return new NextResponse(pdfArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to generate PDF", detail: safeStr(e?.message) }, { status: 500 });
  }
}
