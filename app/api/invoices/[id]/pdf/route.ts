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
const PAGE_W = 595.28; // A4 portrait
const PAGE_H = 841.89;
const M = 40;
const CONTENT_W = PAGE_W - M * 2;

const COLOR_TEXT = rgb(0.12, 0.12, 0.12);
const COLOR_MUTED = rgb(0.45, 0.45, 0.45);
const COLOR_LINE = rgb(0.75, 0.75, 0.75);
const COLOR_LINE_SOFT = rgb(0.85, 0.85, 0.85);

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

function kstDateYmd() {
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
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

function drawHLine(page: any, x: number, y: number, w: number, thickness = 1, color = COLOR_LINE) {
  page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness, color });
}

function drawVLine(page: any, x: number, y0: number, y1: number, thickness = 1, color = COLOR_LINE) {
  page.drawLine({ start: { x, y: y0 }, end: { x, y: y1 }, thickness, color });
}

function drawRectBorder(page: any, x: number, y: number, w: number, h: number, color = COLOR_LINE) {
  page.drawRectangle({ x, y, width: w, height: h, borderColor: color, borderWidth: 1 });
}

function asNumber(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function dayOfMonth(ymdStr: string) {
  const dd = Number(String(ymdStr).slice(8, 10));
  return Number.isFinite(dd) ? dd : 0;
}

function fmtUnits(u: number) {
  if (!Number.isFinite(u) || u <= 0) return "";
  return u.toFixed(1); // 1 -> "1.0"
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

/**
 * LABOR_INVOICE PDF (월 노무비 청구서 템플릿형) — 전면 재작성 버전
 * - 목표: 엑셀 템플릿처럼 "고정 셀/병합 셀" 느낌으로 안정적으로 렌더링
 * - 문제 해결:
 *   1) 상단 우측 '합계금액' 과밀/겹침 -> 합계/계좌 줄 분리 + 고정 베이스라인
 *   2) '출력상황 + 기간'을 날짜 그리드의 1차 헤더 row(병합셀)로 강제 결합
 *   3) 우측 합계/총합계 박스를 표의 마지막 열로 붙여 "한 표"로 보이게
 *
 * 참고 템플릿(깔끔한 쪽): https://www.genspark.ai/api/files/s/yFmkyOAp [Source]
 * 문제 사례(현재 출력): https://www.genspark.ai/api/files/s/XnLkLrw8 [Source]
 */
// LABOR_INVOICE PDF (월 노무비 청구서) — renderLaborInvoicePDF 전면 재작성
// 템플릿 참고: https://www.genspark.ai/api/files/s/yFmkyOAp [Source]
// 현재 출력 참고: https://www.genspark.ai/api/files/s/Oh7MIHcA [Source]


export function renderLaborInvoicePDF({
  pdfDoc,
  fontReg,
  fontBold,
  fontStd,
  invoice,
  office,
  site,
  officeProfile,
  company,
}: {
  pdfDoc: any;
  fontReg: any;
  fontBold: any;
  fontStd: any;
  invoice: any;
  office: any;
  site: any;
  officeProfile: any;
  company: any;
}) {
  // A4 landscape
  const page = pdfDoc.addPage([842, 595]);

  // -------------------------
  // Constants / colors (use file-level constants if exist)
  // -------------------------
  const MM = 24;
  const W = page.getWidth();
  const H = page.getHeight();

  // IMPORTANT: create top margin for title so it NEVER overlaps top blocks
  const TITLE_H = 26;
  const TITLE_GAP = 8; // gap between title and top blocks

  // Top blocks
  const topH = 190;
  const leftW = 380;
  const gap = 10;
  const rightW = (W - MM * 2) - leftW - gap;

  const x0 = MM;
  const xRight = x0 + leftW + gap;

  // The y of the top blocks is shifted DOWN to avoid title overlap
  const topY = H - MM - TITLE_H - TITLE_GAP; // <- 핵심: 제목 영역 확보
  const yTopBox = topY - topH;

  // Grid block below top boxes
  const GRID_TOP = yTopBox - 12;
  const GRID_H = 320;
  const gridY = Math.max(MM, GRID_TOP - GRID_H);

  // -------------------------
  // Helpers
  // -------------------------
  const safe = (v: any, fb = "") => (typeof v === "string" && v.trim() ? v.trim() : fb);

  const isEllipsisLike = (v: any) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s === "..." || s === "…";
  };

  const cleanText = (v: any) => {
    if (v === null || v === undefined) return "";
    if (isEllipsisLike(v)) return "";
    return String(v);
  };

  const nnum = (v: any) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  // 숫자만 통과 (문자/…/… 등은 null)
  const toNumberOrNull = (v: any): number | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;

    if (typeof v === "string") {
      const s = v.trim();
      if (!s) return null;
      if (isEllipsisLike(s)) return null;
      if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // always show 1 decimal for units (1.0)
  const fmtUnits1 = (v: any) => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return "";
    return n.toFixed(1);
  };

  const formatWon = (v: any) => {
    const n = nnum(v);
    try {
      return Math.round(n).toLocaleString("ko-KR");
    } catch {
      return String(Math.round(n));
    }
  };

  const kstDateYmd = (d: any) => {
    const s = safe(d, "");
    if (!s) return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    try {
      const dt = new Date(s);
      if (Number.isNaN(dt.getTime())) return s;
      const k = new Date(dt.getTime() + 9 * 60 * 60 * 1000);
      const y = k.getUTCFullYear();
      const m = String(k.getUTCMonth() + 1).padStart(2, "0");
      const day = String(k.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    } catch {
      return s;
    }
  };

  const dayOfMonth = (d: any) => {
    const s = kstDateYmd(d);
    const m = s.match(/-(\d{2})$/);
    return m ? String(Number(m[1])) : "";
  };

  const textWidth = (text: string, font: any, size: number) => {
    try {
      return font.widthOfTextAtSize(text, size);
    } catch {
      return text.length * size * 0.5;
    }
  };

  const ellipsisText = (text: string, font: any, size: number, maxW: number) => {
    const t = cleanText(text);
    if (!t) return "";
    if (textWidth(t, font, size) <= maxW) return t;
    const E = "…";
    let out = "";
    for (const ch of t) {
      const cand = out + ch;
      if (textWidth(cand + E, font, size) <= maxW) out = cand;
      else break;
    }
    return out ? out + E : E;
  };

  const wrapTextByWidth = (text: string, font: any, size: number, maxW: number) => {
    const t = cleanText(text);
    if (!t) return [""];
    const words = t.split(/\s+/g);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (textWidth(next, font, size) <= maxW) cur = next;
      else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  };

  // Use file-level COLOR_LINE/COLOR_TEXT if available in your file.
  // If not, define locally:
  const COLOR_TEXT_LOCAL = typeof COLOR_TEXT !== "undefined" ? COLOR_TEXT : undefined;
  const COLOR_LINE_LOCAL = typeof COLOR_LINE !== "undefined" ? COLOR_LINE : undefined;

  const drawLine = (x1: number, y1: number, x2: number, y2: number, w = 0.6) => {
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: w,
      color: COLOR_LINE_LOCAL,
    });
  };

  // IMPORTANT: border only (no fill) to avoid black blocks
  const drawRect = (x: number, y: number, w: number, h: number, bw = 1) => {
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      borderWidth: bw,
      borderColor: COLOR_LINE_LOCAL,
    });
  };

  const drawTextCentered = (
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    opts?: { font?: any; size?: number; align?: "left" | "center" | "right"; padX?: number }
  ) => {
    const font = opts?.font ?? fontReg;
    const size = opts?.size ?? 10;
    const padX = opts?.padX ?? 4;
    const align = opts?.align ?? "left";

    const t = cleanText(text);
    const usableW = Math.max(0, w - padX * 2);
    const s = ellipsisText(t, font, size, usableW);

    const tw = textWidth(s, font, size);
    let tx = x + padX;
    if (align === "center") tx = x + (w - tw) / 2;
    if (align === "right") tx = x + w - padX - tw;

    const ty = y + (h - size) / 2 + 1;
    page.drawText(s, { x: tx, y: ty, size, font, color: COLOR_TEXT_LOCAL });
  };

  // -------------------------
  // Meta / totals (Option B)
  // -------------------------
  const meta = invoice?.meta ?? {};
  const kind = safe(meta.kind, safe(invoice?.kind, ""));

  const periodStart = meta.periodStart ?? invoice?.periodStart ?? meta.period?.start;
  const periodEnd = meta.periodEnd ?? invoice?.periodEnd ?? meta.period?.end;

  const periodLabel = (() => {
    const a = kstDateYmd(periodStart);
    const b = kstDateYmd(periodEnd);
    if (a && b) return `${a} ~ ${b}`;
    if (a) return a;
    if (b) return b;
    return "";
  })();

  const siteName = cleanText(meta.siteName || site?.name || company?.name || "");
  const dates: any[] = Array.isArray(meta.dates) ? meta.dates : [];
  const roleRows: any[] = Array.isArray(meta.roleRows) ? meta.roleRows : [];

  // Option B: 표(노무비)는 "세전", 우측/하단은 "부가세/합계(세후)" 분리
  const totalIncl = nnum(invoice?.total ?? meta.grandTotal ?? meta.total ?? 0);
  const tax = nnum(invoice?.tax ?? meta.tax ?? 0);
  const subtotal = nnum(invoice?.subtotal ?? meta.subtotal ?? 0);

  // fallback: if subtotal/tax missing but total exists, infer VAT 10%
  const inferredSubtotal = subtotal > 0 ? subtotal : (tax > 0 ? totalIncl - tax : Math.round(totalIncl / 1.1));
  const inferredTax = tax > 0 ? tax : Math.max(0, totalIncl - inferredSubtotal);

  // -------------------------
  // Title (no overlap)
  // -------------------------
  const monthTitle = (() => {
    const s = kstDateYmd(invoice?.issuedAt ?? invoice?.issue_date ?? invoice?.date ?? invoice?.created_at ?? periodEnd ?? periodStart);
    const m = s ? Number(s.slice(5, 7)) : undefined;
    return m ? `${m} 월 노무비 청구서` : "노무비 청구서";
  })();

  // Title area at very top, separated from blocks
  drawTextCentered(monthTitle, x0, H - MM - TITLE_H, W - MM * 2, TITLE_H, {
    font: fontBold,
    size: 16,
    align: "center",
  });

  // -------------------------
  // Top frames
  // -------------------------
  drawRect(x0, yTopBox, leftW, topH, 1);
  drawRect(xRight, yTopBox, rightW, topH, 1);

  // -------------------------
  // Left box content
  // -------------------------
  const L_PAD = 8;
  let ly = topY - 30;

  drawTextCentered(`일자: ${kstDateYmd(invoice?.issuedAt ?? invoice?.issue_date ?? invoice?.date ?? periodEnd ?? "")}`, x0 + L_PAD, ly, leftW - L_PAD * 2, 18, {
    font: fontReg,
    size: 10,
    align: "left",
  });
  ly -= 20;

  const recipient = cleanText(company?.name || meta.recipientName || "");
  const recipientAddr = cleanText(company?.address || meta.recipientAddress || "");

  drawTextCentered(`${recipient ? recipient + " 귀하" : "귀하"}`, x0 + L_PAD, ly, leftW - L_PAD * 2, 18, {
    font: fontBold,
    size: 12,
    align: "left",
  });
  ly -= 18;
  drawTextCentered(recipientAddr, x0 + L_PAD, ly, leftW - L_PAD * 2, 18, { font: fontReg, size: 10, align: "left" });
  ly -= 22;

  drawTextCentered(`현장: ${siteName}`, x0 + L_PAD, ly, leftW - L_PAD * 2, 18, { font: fontReg, size: 10, align: "left" });
  ly -= 18;
  drawTextCentered(periodLabel ? `기간: ${periodLabel}` : "", x0 + L_PAD, ly, leftW - L_PAD * 2, 18, { font: fontReg, size: 10, align: "left" });

  // -------------------------
  // Right box (7 blocks + Option B summary)
  // -------------------------
  const supplierBizNo = cleanText(officeProfile?.biz_no ?? "");
  const supplierName = cleanText(officeProfile?.supplier_name ?? office?.name ?? "");
  const supplierCeo = cleanText(officeProfile?.ceo_name ?? "");
  const supplierAddr = cleanText(officeProfile?.address ?? "");
  const bizType = cleanText(officeProfile?.biz_type ?? "");
  const bizItem = cleanText(officeProfile?.biz_item ?? "");
  const supplierPhone = cleanText(officeProfile?.phone ?? "");

  const bankName = cleanText(officeProfile?.bank_name ?? "");
  const bankAccount = cleanText(officeProfile?.bank_account ?? "");
  const bankHolder = cleanText(officeProfile?.bank_holder ?? "");

  const labelW = 86;
  const valueW = rightW - labelW;
  const halfValueW = valueW / 2;

  // row heights (sum == topH)
  const R_H1 = 22;
  const R_HA = 40;
  const R_HB = 40;
  const RH = [R_H1, R_H1, R_HA, R_H1, R_H1, R_HB, R_H1]; // 7 blocks
  const sumH = RH.reduce((a, b) => a + b, 0);
  const scale = topH / sumH;
  const RHs = RH.map((h) => Math.round(h * scale));
  RHs[RHs.length - 1] += topH - RHs.reduce((a, b) => a + b, 0);

  const drawRowBorder = (y: number, h: number) => {
    drawLine(xRight, y, xRight + rightW, y, 0.6);
    drawLine(xRight, y + h, xRight + rightW, y + h, 0.6);
    drawLine(xRight, y, xRight, y + h, 0.6);
    drawLine(xRight + rightW, y, xRight + rightW, y + h, 0.6);
    drawLine(xRight + labelW, y, xRight + labelW, y + h, 0.6);
  };

  const drawLabelValue1 = (y: number, h: number, label: string, value: string) => {
    drawRowBorder(y, h);
    drawTextCentered(label, xRight, y, labelW, h, { font: fontBold, size: 10, align: "center" });
    drawTextCentered(value, xRight + labelW, y, valueW, h, { font: fontReg, size: 10, align: "left", padX: 6 });
  };

  const drawLabelValueWrap2 = (y: number, h: number, label: string, value: string) => {
    drawRowBorder(y, h);
    drawTextCentered(label, xRight, y, labelW, h, { font: fontBold, size: 10, align: "center" });
    const lines = wrapTextByWidth(value, fontReg, 10, valueW - 12).slice(0, 2);
    const lineH = h / 2;
    drawTextCentered(lines[0] ?? "", xRight + labelW, y + lineH, valueW, lineH, { font: fontReg, size: 10, align: "left", padX: 6 });
    drawTextCentered(lines[1] ?? "", xRight + labelW, y, valueW, lineH, { font: fontReg, size: 10, align: "left", padX: 6 });
  };

  const drawLabelTwoCol = (y: number, h: number, label: string, leftLabel: string, leftVal: string, rightLabel: string, rightVal: string) => {
    drawRowBorder(y, h);

    // split between two value columns
    drawLine(xRight + labelW + halfValueW, y, xRight + labelW + halfValueW, y + h, 0.6);

    drawTextCentered(label, xRight, y, labelW, h, { font: fontBold, size: 10, align: "center" });

    const subLabelW = 40;

    // left sub split
    drawLine(xRight + labelW + subLabelW, y, xRight + labelW + subLabelW, y + h, 0.6);
    drawTextCentered(leftLabel, xRight + labelW, y, subLabelW, h, { font: fontReg, size: 9.5, align: "center" });
    drawTextCentered(leftVal, xRight + labelW + subLabelW, y, halfValueW - subLabelW, h, { font: fontReg, size: 10, align: "left", padX: 6 });

    // right sub split
    const rx = xRight + labelW + halfValueW;
    drawLine(rx + subLabelW, y, rx + subLabelW, y + h, 0.6);
    drawTextCentered(rightLabel, rx, y, subLabelW, h, { font: fontReg, size: 9.5, align: "center" });
    drawTextCentered(rightVal, rx + subLabelW, y, halfValueW - subLabelW, h, { font: fontReg, size: 10, align: "left", padX: 6 });
  };

  // 합계금액(세후) 대신 Option B: 공급가/부가세/합계 를 합계금액 셀 안에 2줄로
  // 단, 사용자가 "오른쪽 딱 정해줄게 ... 합계금액" 순서를 원했으니 "합계금액" 라벨은 유지하고, 값은 2줄 구성
  const drawSumRowOptionB = (y: number, h: number) => {
    drawRowBorder(y, h);
    drawTextCentered("합계금액", xRight, y, labelW, h, { font: fontBold, size: 10, align: "center" });

    const lineH = h / 2;
    const fs1 = 9.5;
    const fs2 = 11.5;

    const supply = `공급가: ${formatWon(inferredSubtotal)}원`;
    const vat = `부가세: ${formatWon(inferredTax)}원`;
    const totalLine = `합계: ${formatWon(totalIncl)}원`;

    // 위칸: 공급가/부가세 (좌측)
    drawTextCentered(`${supply}  ${vat}`, xRight + labelW, y + lineH, valueW, lineH, {
      font: fontReg,
      size: fs1,
      align: "left",
      padX: 6,
    });

    // 아래칸: 합계(우측 정렬, 굵게)
    drawTextCentered(totalLine, xRight + labelW, y, valueW, lineH, {
      font: fontBold,
      size: fs2,
      align: "right",
      padX: 6,
    });
  };

  // stack from top to bottom
  let ry = yTopBox + topH;
  const rowY = (h: number) => {
    ry -= h;
    return ry;
  };

  // 1) 등록번호
  drawLabelValue1(rowY(RHs[0]), RHs[0], "등록번호", supplierBizNo);

  // 2) 상호/대표자
  drawLabelTwoCol(rowY(RHs[1]), RHs[1], "상호/대표자", "상호", supplierName, "대표", supplierCeo);

  // 3) 주소
  drawLabelValueWrap2(rowY(RHs[2]), RHs[2], "주  소", supplierAddr);

  // 4) 업태/종목
  drawLabelTwoCol(rowY(RHs[3]), RHs[3], "업태/종목", "업태", bizType, "종목", bizItem);

  // 5) 연락처
  drawLabelValue1(rowY(RHs[4]), RHs[4], "연락처", supplierPhone);

  // 6) 계좌/예금주
  {
    const line1 = [bankName, bankAccount].filter(Boolean).join(" ");
    const line2 = bankHolder ? `예금주: ${bankHolder}` : "";
    drawLabelValueWrap2(rowY(RHs[5]), RHs[5], "계좌/예금주", [line1, line2].filter(Boolean).join(" "));
  }

  // 7) 합계금액 (Option B)
  drawSumRowOptionB(rowY(RHs[6]), RHs[6]);

  // -------------------------
  // MAIN GRID
  // -------------------------
  drawRect(x0, gridY, W - MM * 2, GRID_H, 1);

  const gridX = x0;
  const gridW = W - MM * 2;

  const header1H = 26;
  const header2H = 24;
  const rowH = 22;
  const footerH = 22;

  const colSiteW = 70;
  const colRoleW = 70;
  const colManDaysW = 44;
  const colUnitW = 62;
  const colSumW = 80;

  const dayCount = Math.max(0, dates.length);
  const daysAreaW = gridW - (colSiteW + colRoleW + colManDaysW + colUnitW + colSumW);
  const dayW = dayCount > 0 ? daysAreaW / dayCount : daysAreaW;

  const xSite = gridX + colSiteW;
  const xRole = xSite + colRoleW;
  const xDaysStart = xRole;
  const xDaysEnd = xDaysStart + daysAreaW;
  const xManDays = xDaysEnd;
  const xUnit = xDaysEnd + colManDaysW;
  const xSum = xDaysEnd + colManDaysW + colUnitW;

  // fixed vertical lines
  drawLine(xSite, gridY, xSite, gridY + GRID_H, 0.6);
  drawLine(xRole, gridY, xRole, gridY + GRID_H, 0.6);
  drawLine(xDaysEnd, gridY, xDaysEnd, gridY + GRID_H, 0.6);
  drawLine(xUnit, gridY, xUnit, gridY + GRID_H, 0.6);
  drawLine(xSum, gridY, xSum, gridY + GRID_H, 0.6);

  let gy = gridY + GRID_H;

  // Header row 1
  gy -= header1H;
  drawLine(gridX, gy, gridX + gridW, gy, 0.6);

  drawTextCentered("현장", gridX, gy, colSiteW, header1H, { font: fontBold, size: 10, align: "center" });
  drawTextCentered("구분", gridX + colSiteW, gy, colRoleW, header1H, { font: fontBold, size: 10, align: "center" });

  drawTextCentered("출력상황", xDaysStart, gy, daysAreaW, header1H, { font: fontBold, size: 11, align: "center" });
  drawTextCentered(periodLabel, xDaysStart, gy, daysAreaW, header1H, { font: fontReg, size: 9, align: "right", padX: 6 });

  // 출력공수 2줄
  drawTextCentered("출력", xManDays, gy + header1H / 2, colManDaysW, header1H / 2, { font: fontBold, size: 9.5, align: "center" });
  drawTextCentered("공수", xManDays, gy, colManDaysW, header1H / 2, { font: fontBold, size: 9.5, align: "center" });

  drawTextCentered("단가", xUnit, gy, colUnitW, header1H, { font: fontBold, size: 10, align: "center" });
  drawTextCentered("노무비", xSum, gy + header1H / 2, colSumW, header1H / 2, { font: fontBold, size: 9.5, align: "center" });
  drawTextCentered("총액", xSum, gy, colSumW, header1H / 2, { font: fontBold, size: 9.5, align: "center" });

  // Header row 2 (days)
  gy -= header2H;
  drawLine(gridX, gy, gridX + gridW, gy, 0.6);

  for (let i = 0; i < dayCount; i++) {
    const dx = xDaysStart + dayW * i;
    drawLine(dx, gy, dx, gridY + GRID_H, 0.3);
    drawTextCentered(dayOfMonth(dates[i]), dx, gy, dayW, header2H, { font: fontBold, size: 9.5, align: "center" });
  }
  drawLine(xDaysStart + dayW * dayCount, gy, xDaysStart + dayW * dayCount, gridY + GRID_H, 0.3);

  // ---- Extract day values with multi-fallback & "numbers only" policy ----
  const extractDayVals = (row: any): any[] => {
    if (Array.isArray(row?.days)) return row.days;
    if (Array.isArray(row?.values)) return row.values;

    const map =
      row?.byDate ||
      row?.daily ||
      row?.dateMap ||
      row?.dayMap ||
      row?.daysMap ||
      row?.dayValues;

    if (map && typeof map === "object" && !Array.isArray(map)) {
      return dates.map((d: any) => {
        const keyYmd = (typeof d === "string" ? d : kstDateYmd(d)).slice(0, 10);
        const keyDay = String(Number(keyYmd.slice(8, 10)));
        return (map as any)[keyYmd] ?? (map as any)[keyDay] ?? 0;
      });
    }

    const items = row?.items || row?.entries || row?.details;
    if (Array.isArray(items)) {
      const m = new Map<string, number>();
      for (const it of items) {
        const keyYmd = cleanText(it?.date ?? it?.ymd ?? it?.day ?? "").slice(0, 10);
        const units = nnum(it?.units ?? it?.value ?? it?.manDays ?? it?.count ?? 0);
        if (keyYmd) m.set(keyYmd, units);
      }
      return dates.map((d: any) => m.get((typeof d === "string" ? d : kstDateYmd(d)).slice(0, 10)) ?? 0);
    }

    return [];
  };

  // Body rows
  const maxBodyRows = Math.floor((GRID_H - header1H - header2H - footerH) / rowH);
  const rows = roleRows.slice(0, maxBodyRows);

  let sumManDays = 0;
  let sumAmountExVat = 0;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? {};
    gy -= rowH;
    drawLine(gridX, gy, gridX + gridW, gy, 0.3);

    // IMPORTANT: never allow "..." for text columns
    const roleName = cleanText(row.roleName ?? row.role ?? row.occupation ?? "");

    // unitPrice: wide field candidate set
    const unitPriceRaw = nnum(
      row.unitPrice ??
      row.unit_price ??
      row.unitCost ??
      row.unit_cost ??
      row.rate ??
      row.dailyWage ??
      row.daily_wage ??
      row.price ??
      row.unit ??
      0
    );

    const dayVals = extractDayVals(row);

    // 일별 출력상황: "숫자만" 찍고, 나머지는 빈칸
    let manDays = 0;

    for (let i = 0; i < dayCount; i++) {
      const raw = dayVals[i];
      const numOrNull = toNumberOrNull(raw);
      const num = numOrNull ?? 0;
      manDays += num;

      const dx = xDaysStart + dayW * i;
      const s = numOrNull && num !== 0 ? fmtUnits1(num) : "";
      drawTextCentered(s, dx, gy, dayW, rowH, { font: fontReg, size: 9, align: "center" });
    }

    // amountExVat: prefer meta amount/gross, else compute
    // NOTE: 여기서는 "세전(노무비)"로 표시 (옵션 B)
    const amountExVat = nnum(
      row.amountExVat ??
      row.amount_ex_vat ??
      row.amount ??
      row.totalAmount ??
      row.total_amount ??
      row.sum ??
      row.total ??
      row.gross ??
      (unitPriceRaw * manDays)
    );

    // unitPrice fallback: if unitPrice missing but amount & manDays exist
    const unitPrice = unitPriceRaw > 0 ? unitPriceRaw : (manDays > 0 ? Math.round(amountExVat / manDays) : 0);

    sumManDays += manDays;
    sumAmountExVat += amountExVat;

    // left columns
    drawTextCentered(siteName, gridX, gy, colSiteW, rowH, { font: fontReg, size: 9.5, align: "center" });
    drawTextCentered(roleName, gridX + colSiteW, gy, colRoleW, rowH, { font: fontReg, size: 9.5, align: "center" });

    // right fixed columns
    drawTextCentered(manDays ? fmtUnits1(manDays) : "", xManDays, gy, colManDaysW, rowH, { font: fontReg, size: 9.5, align: "center" });
    drawTextCentered(unitPrice ? formatWon(unitPrice) : "", xUnit, gy, colUnitW, rowH, { font: fontReg, size: 9.5, align: "right", padX: 6 });
    drawTextCentered(amountExVat ? formatWon(amountExVat) : "", xSum, gy, colSumW, rowH, { font: fontReg, size: 9.5, align: "right", padX: 6 });
  }

  // Footer sum row
  gy -= footerH;
  drawLine(gridX, gy, gridX + gridW, gy, 0.6);

  drawTextCentered("합계", gridX, gy, colSiteW + colRoleW, footerH, { font: fontBold, size: 10, align: "center" });

  // day sums (numbers only)
  const daySums: number[] = Array.from({ length: dayCount }, () => 0);
  for (const row of roleRows) {
    const vals = extractDayVals(row);
    for (let i = 0; i < dayCount; i++) {
      const num = toNumberOrNull(vals[i]) ?? 0;
      daySums[i] += num;
    }
  }
  for (let i = 0; i < dayCount; i++) {
    const dx = xDaysStart + dayW * i;
    const v = daySums[i];
    drawTextCentered(v ? fmtUnits1(v) : "", dx, gy, dayW, footerH, { font: fontBold, size: 9, align: "center" });
  }

  drawTextCentered(sumManDays ? fmtUnits1(sumManDays) : "", xManDays, gy, colManDaysW, footerH, { font: fontBold, size: 9.5, align: "center" });
  drawTextCentered("", xUnit, gy, colUnitW, footerH, { font: fontReg, size: 9.5, align: "center" });

  // 표의 "노무비 총액"은 세전 합계로 유지 (옵션 B)
  drawTextCentered(sumAmountExVat ? formatWon(sumAmountExVat) : "", xSum, gy, colSumW, footerH, {
    font: fontBold,
    size: 10,
    align: "right",
    padX: 6,
  });

  // Bottom-right grand total box (세후 total + 부가세 표시)
  const grandBoxW = 220;
  const grandBoxH = 40;
  const gx = gridX + gridW - grandBoxW;
  const gy2 = gridY - 44;

  drawRect(gx, gy2, grandBoxW, grandBoxH, 1);

  // 2-line in box: 공급가/부가세 on top, 총계 on bottom-right
  const lineH = grandBoxH / 2;
  drawTextCentered(`공급가 ${formatWon(inferredSubtotal)}원   부가세 ${formatWon(inferredTax)}원`, gx, gy2 + lineH, grandBoxW, lineH, {
    font: fontReg,
    size: 9.5,
    align: "left",
    padX: 8,
  });
  drawTextCentered(`총계  ${formatWon(totalIncl)}원`, gx, gy2, grandBoxW, lineH, {
    font: fontBold,
    size: 12,
    align: "right",
    padX: 8,
  });

  // kind guard
  if (kind && kind !== "LABOR_INVOICE") {
    drawTextCentered(`(주의) kind=${kind}`, x0, MM - 6, W - MM * 2, 14, { font: fontReg, size: 8, align: "left" });
  }

  

  return page;
}

async function renderGenericInvoicePDF(args: {
  pdfDoc: PDFDocument;
  fontReg: any;
  fontBold: any;
  fontStd: any;
  invoice: any;
  office: any;
  site: any;
  supabaseAdmin: any;
}) {
  const { pdfDoc, fontReg, fontBold, fontStd, invoice, office, site, supabaseAdmin } = args;

  // ---- Main page ----
  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M;

  drawText(page, "청구서", M, y - 18, fontBold, 18);
  y -= 34;

  const invoiceNo = safeStr(invoice.invoice_number || invoice.id);

  drawText(page, `청구번호: ${invoiceNo}`, M, y, fontReg, 11);
  drawText(page, `상태: ${safeStr(invoice.status)}`, M + 260, y, fontReg, 11);
  y -= 18;

  drawText(page, `발행일: ${ymd(invoice.issue_date)}`, M, y, fontReg, 11);
  drawText(page, `납기일: ${ymd(invoice.due_date)}`, M + 260, y, fontReg, 11);
  y -= 16;

  drawHLine(page, M, y, CONTENT_W, 1, COLOR_LINE_SOFT);
  y -= 18;

  // 간단 key/value 박스
  const kvBoxH = 120;
  const kvBoxY = y - kvBoxH;
  page.drawRectangle({ x: M, y: kvBoxY, width: CONTENT_W, height: kvBoxH, borderColor: COLOR_LINE_SOFT, borderWidth: 1 });

  drawText(page, `사무소: ${safeStr(office.name)}`, M + 12, y - 26, fontReg, 11);
  drawText(page, `현장명: ${safeStr(site.name)}`, M + 12, y - 46, fontReg, 11);
  drawText(page, `업체명: ${safeStr(invoice.contractor_name)}`, M + 12, y - 66, fontReg, 11);

  y = kvBoxY - 18;

  drawText(page, "총액", M, y, fontBold, 11);
  drawText(page, formatWon(invoice.total), M + 60, y, fontBold, 11);
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

  page.drawRectangle({ x: M, y: tableTopY - headerH, width: CONTENT_W, height: headerH, borderColor: COLOR_LINE_SOFT, borderWidth: 1 });

  drawText(page, "No", M + 8, tableTopY - 14, fontBold, 9, COLOR_MUTED);
  drawText(page, "내역", M + colNoW + 8, tableTopY - 14, fontBold, 9, COLOR_MUTED);
  drawText(page, "수량", M + colNoW + colDescW + 8, tableTopY - 14, fontBold, 9, COLOR_MUTED);
  drawText(page, "단가", M + colNoW + colDescW + colQtyW + 8, tableTopY - 14, fontBold, 9, COLOR_MUTED);
  drawText(page, "금액", M + colNoW + colDescW + colQtyW + colUnitW + 8, tableTopY - 14, fontBold, 9, COLOR_MUTED);

  y = tableTopY - headerH;

  const items = Array.isArray((invoice as any).line_items) ? (invoice as any).line_items : [];

  for (let i = 0; i < items.length; i++) {
    const li: any = items[i];

    page.drawRectangle({
      x: M,
      y: y - rowH,
      width: CONTENT_W,
      height: rowH,
      borderColor: COLOR_LINE_SOFT,
      borderWidth: 1,
    });

    const no = String(i + 1);
    const desc = ellipsisText(safeStr(li.description), fontReg, 11, colDescW - 16);
    const qty = safeStr(li.quantity ?? "");
    const unit = li.unit_price !== null && li.unit_price !== undefined ? formatWon(li.unit_price) : "";
    const amt = li.amount !== null && li.amount !== undefined ? formatWon(li.amount) : "";

    drawText(page, no, M + 8, y - 13, fontStd, 11, COLOR_TEXT);
    drawText(page, desc, M + colNoW + 8, y - 13, fontReg, 11, COLOR_TEXT);
    drawText(page, qty, M + colNoW + colDescW + 8, y - 13, fontReg, 11, COLOR_TEXT);
    drawText(page, unit, M + colNoW + colDescW + colQtyW + 8, y - 13, fontReg, 11, COLOR_TEXT);
    drawText(page, amt, M + colNoW + colDescW + colQtyW + colUnitW + 8, y - 13, fontReg, 11, COLOR_TEXT);

    y -= rowH;
  }

  // notes
  y -= 14;
  const memo = safeStr((invoice as any).notes);
  if (memo) {
    drawText(page, "비고", M, y, fontBold, 11);
    y -= 14;

    const memoLines = wrapTextByWidth(memo, fontReg, 11, CONTENT_W);
    for (const line of memoLines) {
      drawText(page, line, M, y, fontReg, 11, COLOR_TEXT);
      y -= 14;
      if (y < M + 40) break;
    }
  }

  // attachments (jsonb) - 이미지 첨부만
  const attachmentPaths = extractAttachmentPaths((invoice as any).attachments).filter(isImagePath);

  for (let i = 0; i < attachmentPaths.length; i++) {
    const storagePath = attachmentPaths[i];

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

    const frameTop = PAGE_H - M - 60;
    const frameBottom = M;
    const frameH = frameTop - frameBottom;
    const frameW = CONTENT_W;

    const scale = Math.min(frameW / img.width, frameH / img.height, 1);
    const drawW = img.width * scale;
    const drawH = img.height * scale;

    const x = M + (frameW - drawW) / 2;
    const yImg = frameBottom + (frameH - drawH) / 2;

    imgPage.drawRectangle({ x: M, y: frameBottom, width: frameW, height: frameH, borderColor: COLOR_LINE_SOFT, borderWidth: 1 });
    imgPage.drawImage(img, { x, y: yImg, width: drawW, height: drawH });
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { id } = await ctx.params;

    // invoice + line items + meta
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
        subtotal,
        tax,
        total,
        notes,
        attachments,
        meta,
        line_items:invoice_line_items ( id, description, quantity, unit_price, amount )
      `
      )
      .eq("id", id)
      .single();

    if (invErr || !invoice) {
      return NextResponse.json({ error: "Invoice not found", detail: invErr?.message ?? null }, { status: 404 });
    }

    const invoiceMeta = (invoice as any).meta ?? {};

    // office
    const { data: office, error: officeErr } = await supabaseAdmin
      .from("offices")
      .select("id, name")
      .eq("id", invoice.office_id)
      .single();

    if (officeErr || !office) {
      return NextResponse.json({ error: "Office not found", detail: officeErr?.message ?? null }, { status: 404 });
    }

    // site
    const { data: site, error: siteErr } = await supabaseAdmin
      .from("sites")
      .select("id, name, address, office_phone")
      .eq("id", invoice.site_id)
      .single();

    if (siteErr || !site) {
      return NextResponse.json({ error: "Site not found", detail: siteErr?.message ?? null }, { status: 404 });
    }

    // office profile(공급자 상세) - optional
    const { data: officeProfile, error: opErr } = await supabaseAdmin
      .from("office_profiles")
      .select("office_id, supplier_name, biz_no, ceo_name, address, biz_type, biz_item, phone, bank_name, bank_account, bank_holder, updated_at")
      .eq("office_id", invoice.office_id)
      .maybeSingle();

    if (opErr) {
      return NextResponse.json({ error: "Failed to load office profile", detail: opErr.message }, { status: 500 });
    }

    // company(청구대상 상세) - optional
    const companyId = String(invoiceMeta?.companyId ?? "").trim();
    let company: any = null;

    if (companyId) {
      const { data: comp, error: compErr } = await supabaseAdmin
        .from("companies")
        .select("id, name, biz_no, ceo_name, address, phone, office_id")
        .eq("id", companyId)
        .maybeSingle();

      if (compErr) {
        return NextResponse.json({ error: "Failed to load company", detail: compErr.message }, { status: 500 });
      }
      company = comp;
    }

    // ---- PDF ----
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const [fontRegBuf, fontBoldBuf] = await Promise.all([
      fetchFontBytes("fonts/NotoSansKR-Regular.ttf"),
      fetchFontBytes("fonts/NotoSansKR-Bold.ttf"),
    ]);

    const fontReg = await pdfDoc.embedFont(new Uint8Array(fontRegBuf), { subset: false });
    const fontBold = await pdfDoc.embedFont(new Uint8Array(fontBoldBuf), { subset: false });
    const fontStd = await pdfDoc.embedFont(StandardFonts.Helvetica);

    if (invoiceMeta?.kind === "LABOR_INVOICE") {
      renderLaborInvoicePDF({ pdfDoc, fontReg, fontBold, fontStd, invoice, office, site, officeProfile, company });
    } else {
      await renderGenericInvoicePDF({ pdfDoc, fontReg, fontBold, fontStd, invoice, office, site, supabaseAdmin });
    }

    const pdfBytes = await pdfDoc.save();
    const pdfArrayBuffer = new ArrayBuffer(pdfBytes.byteLength);
    new Uint8Array(pdfArrayBuffer).set(pdfBytes);

    const invoiceNo = safeStr((invoice as any).invoice_number || (invoice as any).id);
    const filename =
      invoiceMeta?.kind === "LABOR_INVOICE"
        ? `LABOR_INVOICE_${invoiceNo}.pdf`
        : `invoice-${invoiceNo}.pdf`;

    return new NextResponse(pdfArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to generate PDF", detail: safeStr(e?.message) },
      { status: 500 }
    );
  }
}
