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


// LABOR_INVOICE PDF (월 노무비 청구서) — 11월 레퍼런스(zW35ouFC) 기준 재작성
// Reference: https://www.genspark.ai/api/files/s/zW35ouFC [Source]
// Current bug example: https://www.genspark.ai/api/files/s/vLAN2Dps [Source]

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
  // =========================
  // 0) Page: A4 Portrait
  // =========================
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);

  // =========================
  // 1) Styling / utils
  // =========================
  const C_TEXT = rgb(0.12, 0.12, 0.12);
  const C_MUTED = rgb(0.45, 0.45, 0.45);
  const C_LINE = rgb(0.70, 0.70, 0.70);
  const C_LINE_SOFT = rgb(0.88, 0.88, 0.88);
  const C_SUM_FILL = rgb(1.0, 0.98, 0.80);

  const TH_OUTER = 1.0;
  const TH_MAJOR = 0.8;
  const TH_MINOR = 0.5;

  const M = 20;
  const W = PAGE_W;
  const H = PAGE_H;
  const CONTENT_W = W - M * 2;

  const safe = (v: any, fb = "") => {
    if (v === null || v === undefined) return fb;
    const s = String(v);
    return s.trim() ? s.trim() : fb;
  };

  const kstYmd = (d: any) => {
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

  const dayOfMonthNum = (d: any) => {
    const s = kstYmd(d);
    if (!s) return 0;
    const dd = Number(s.slice(8, 10));
    return Number.isFinite(dd) ? dd : 0;
  };

  const nnum = (v: any) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const formatWonNum = (v: any) => {
    const n = nnum(v);
    try {
      return Math.round(n).toLocaleString("ko-KR");
    } catch {
      return String(Math.round(n));
    }
  };

  const textWidth = (t: string, font: any, size: number) => {
    try {
      return font.widthOfTextAtSize(t, size);
    } catch {
      return t.length * size * 0.52;
    }
  };

  const ellipsis = (t: string, font: any, size: number, maxW: number) => {
    const s = safe(t, "");
    if (!s) return "";
    if (textWidth(s, font, size) <= maxW) return s;
    const E = "…";
    let out = "";
    for (const ch of s) {
      const cand = out + ch;
      if (textWidth(cand + E, font, size) <= maxW) out = cand;
      else break;
    }
    return out ? out + E : E;
  };

  const drawLine = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    th = TH_MINOR,
    color = C_LINE
  ) => {
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: th,
      color,
    });
  };

  const drawRect = (
    x: number,
    y: number,
    w: number,
    h: number,
    th = TH_MAJOR,
    color = C_LINE
  ) => {
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      borderWidth: th,
      borderColor: color,
    });
  };

  const fillRect = (x: number, y: number, w: number, h: number, color: any) => {
    page.drawRectangle({ x, y, width: w, height: h, color });
  };

  const drawTextInCell = (
    t: string,
    x: number,
    y: number,
    w: number,
    h: number,
    opts?: {
      font?: any;
      size?: number;
      align?: "left" | "center" | "right";
      padX?: number;
      color?: any;
      noEllipsis?: boolean;
    }
  ) => {
    const font = opts?.font ?? fontReg;
    const size = opts?.size ?? 9.5;
    const align = opts?.align ?? "center";
    const padX = opts?.padX ?? 2;
    const color = opts?.color ?? C_TEXT;

    const raw = safe(t, "");
    const s = opts?.noEllipsis
      ? raw
      : ellipsis(raw, font, size, Math.max(0, w - padX * 2));

    const tw = textWidth(s, font, size);

    let tx = x + padX;
    if (align === "center") tx = x + (w - tw) / 2;
    if (align === "right") tx = x + w - padX - tw;

    const ty = y + (h - size) / 2 + 1;
    page.drawText(s, { x: tx, y: ty, font, size, color });
  };

  // ✅ 멀티라인 헤더 중앙정렬(출력\n공수 쏠림 방지) [Source](https://www.genspark.ai/api/files/s/rrpEfMQh)
  const drawMultilineCentered = (
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    font: any,
    size: number,
    color: any
  ) => {
    const lines = String(text).split("\n");
    const lineGap = 1;
    const totalTextH = lines.length * size + (lines.length - 1) * lineGap;

    let cy = y + (h + totalTextH) / 2 - size;
    for (const ln of lines) {
      const t = ln.trim();
      const tw = textWidth(t, font, size);
      const tx = x + (w - tw) / 2;
      page.drawText(t, { x: tx, y: cy, font, size, color });
      cy -= size + lineGap;
    }
  };

  // ✅ 1~31 헤더 숫자: ellipsis 금지
  const drawDayHeaderNumber = (n: number, x: number, y: number, w: number, h: number) => {
    const t = String(n);
    const size = 6.2;
    const tw = textWidth(t, fontBold, size);
    const tx = x + (w - tw) / 2;
    const ty = y + (h - size) / 2 + 1;
    page.drawText(t, { x: tx, y: ty, font: fontBold, size, color: C_TEXT });
  };

  // ✅ day 값(공수) 전용: ellipsis 절대 금지 + 패딩 0에 가까운 중앙정렬
  // -> "1.0"이 "…" / "..." 로 변하는 상황을 원천 차단 [Source](https://www.genspark.ai/api/files/s/rrpEfMQh)
  const drawDayValue = (val: number, x: number, y: number, w: number, h: number) => {
    if (!val) return;
    const t = Number.isFinite(val) ? val.toFixed(1) : "";
    if (!t) return;
    const size = 6.2;
    const tw = textWidth(t, fontReg, size);
    const tx = x + (w - tw) / 2;
    const ty = y + (h - size) / 2 + 1;
    page.drawText(t, { x: tx, y: ty, font: fontReg, size, color: C_TEXT });
  };

  const isEllipsisLike = (v: any) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s === "..." || s === "…";
  };

  const toNumberOrNull = (v: any): number | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string") {
      const s = v.trim();
      if (!s || isEllipsisLike(s)) return null;
      if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // =========================
  // 2) Meta / period / totals
  // =========================
  const meta = invoice?.meta ?? {};
  const kind = safe(meta.kind, safe(invoice?.kind, "LABOR_INVOICE"));

  const periodStart = meta.periodStart ?? invoice?.periodStart ?? meta.period?.start;
  const periodEnd = meta.periodEnd ?? invoice?.periodEnd ?? meta.period?.end;

  const periodLabel = (() => {
    const a = kstYmd(periodStart);
    const b = kstYmd(periodEnd);
    if (a && b) return `${a} ~ ${b}`;
    if (a) return a;
    if (b) return b;
    return "";
  })();

  const issued = kstYmd(
    invoice?.issuedAt ??
    invoice?.issue_date ??
    invoice?.date ??
    invoice?.created_at ??
    periodEnd ??
    periodStart
  );

  const monthTitle = (() => {
    const m = issued ? Number(issued.slice(5, 7)) : NaN;
    return Number.isFinite(m) ? `${m} 월 노무비 청구서` : "노무비 청구서";
  })();

  const siteName = safe(meta.siteName || site?.name || "");
  const recipientName = safe(company?.name || meta.recipientName || invoice?.contractor_name || "");
  const recipientAddr = safe(company?.address || meta.recipientAddress || "");

  const dates: any[] = Array.isArray(meta.dates) ? meta.dates : [];
  const roleRows: any[] = Array.isArray(meta.roleRows) ? meta.roleRows : [];

  const totalIncl = nnum(invoice?.total ?? meta.grandTotal ?? meta.total ?? 0);

  // =========================
  // 3) Layout blocks (상단: 너가 좋다고 한 부분 유지)
  // =========================
  const titleH = 26;
  const titleTop = H - M;
  const topBlockH = 160;
  const gapAfterTop = 10;

  // Title
  drawTextInCell(monthTitle, M, titleTop - titleH, CONTENT_W, titleH, {
    font: fontBold,
    size: 14,
    align: "center",
    noEllipsis: true,
  });

  // Top area box
  const topBoxTopY = titleTop - titleH - 6;
  const topBoxY = topBoxTopY - topBlockH;

  drawRect(M, topBoxY, CONTENT_W, topBlockH, TH_OUTER);

  // Split top into left/right
  const leftW = Math.round(CONTENT_W * 0.58);
  const rightW = CONTENT_W - leftW;

  const xL = M;
  const xR = M + leftW;

  drawLine(xR, topBoxY, xR, topBoxY + topBlockH, TH_MAJOR);

  // Left top: date/company/site/period + phrase
  // ✅ left-top block: label column width 고정
  const LEFT_LABEL_W = 92;   // 핵심: 모든 줄 동일
  const LEFT_ROW_H = 20;
  const LEFT_PAD_X = 6;

  let ly = topBoxY + topBlockH - 30;

  const drawLeftKV = (label: string, value: string, opts?: { valueFont?: any; valueSize?: number }) => {
    drawTextInCell(label, xL, ly, LEFT_LABEL_W, LEFT_ROW_H, {
      font: fontReg,
      size: 9.5,
      align: "left",
      padX: LEFT_PAD_X,
      color: C_MUTED,
      noEllipsis: true,
    });

    drawTextInCell(value, xL + LEFT_LABEL_W, ly, leftW - LEFT_LABEL_W, LEFT_ROW_H, {
      font: opts?.valueFont ?? fontReg,
      size: opts?.valueSize ?? 9.5,
      align: "left",
      padX: LEFT_PAD_X,
    });

    ly -= LEFT_ROW_H;
  };

  drawLeftKV("일자", issued);
  drawLeftKV("회사명", recipientName, { valueFont: fontBold, valueSize: 11 });
  drawLeftKV("소재지", recipientAddr);
  drawLeftKV("현장", siteName);
  drawLeftKV("기간", periodLabel);


  drawTextInCell(`아래와 같이 계산 청구합니다`, xL, topBoxY + 8, leftW, 18, {
    font: fontReg,
    size: 9.5,
    align: "center",
    color: C_MUTED,
    noEllipsis: true,
  });

  // Right top: supplier info (2칸/1칸 혼합) + 합계금액(겹침 방지 분리)
  const supplierBizNo = safe(officeProfile?.biz_no ?? "");
  const supplierName = safe(officeProfile?.supplier_name ?? office?.name ?? "");
  const supplierCeo = safe(officeProfile?.ceo_name ?? "");
  const supplierAddr = safe(officeProfile?.address ?? "");
  const supplierPhone = safe(officeProfile?.phone ?? "");
  const bizType = safe(officeProfile?.biz_type ?? "");
  const bizItem = safe(officeProfile?.biz_item ?? "");
  const bankName = safe(officeProfile?.bank_name ?? "");
  const bankAccount = safe(officeProfile?.bank_account ?? "");
  const bankHolder = safe(officeProfile?.bank_holder ?? "");

  const rX = xR;
  const rY = topBoxY;
  const rH = topBlockH;

  const sumRowH = 24;         // 합계금액 고정
  const infoH = rH - sumRowH; // 정보영역
  drawRect(rX, rY, rightW, rH, TH_MAJOR, C_LINE);
  drawLine(rX, rY + sumRowH, rX + rightW, rY + sumRowH, TH_MAJOR);

  const labelW = 44;

  const drawInfoPair = (x: number, y: number, w: number, h: number, label: string, value: string) => {
    drawLine(x + labelW, y, x + labelW, y + h, TH_MINOR, C_LINE_SOFT);
    drawTextInCell(label, x, y, labelW, h, { font: fontReg, size: 8.8, align: "center", color: C_MUTED, noEllipsis: true });
    drawTextInCell(value, x + labelW, y, w - labelW, h, { font: fontReg, size: 8.8, align: "left", padX: 5 });
  };

  type InfoRow =
    | { type: "single"; label: string; value: string }
    | { type: "double"; leftLabel: string; leftValue: string; rightLabel: string; rightValue: string };

  const infoRows: InfoRow[] = [
    { type: "double", leftLabel: "등록번호", leftValue: supplierBizNo, rightLabel: "연락처", rightValue: supplierPhone },
    { type: "double", leftLabel: "상  호", leftValue: supplierName, rightLabel: "대  표", rightValue: supplierCeo },
    { type: "single", label: "주  소", value: supplierAddr },
    { type: "double", leftLabel: "업  태", leftValue: bizType, rightLabel: "종  목", rightValue: bizItem },
  ];

  if (bankName || bankAccount || bankHolder) {
    const bankLine = [bankName, bankAccount].filter(Boolean).join(" ");
    const holderLine = bankHolder ? `예금주:${bankHolder}` : "";
    infoRows.push({ type: "single", label: "계  좌", value: [bankLine, holderLine].filter(Boolean).join(" / ") });
  }

  const infoRowH = Math.floor(infoH / infoRows.length);
  const infoAreaTop = rY + rH;
  for (let i = 0; i < infoRows.length; i++) {
    const yRow = infoAreaTop - (i + 1) * infoRowH;
    drawLine(rX, yRow, rX + rightW, yRow, TH_MINOR, C_LINE_SOFT);

    const row = infoRows[i];
    if (row.type === "single") {
      drawInfoPair(rX, yRow, rightW, infoRowH, row.label, row.value);
    } else {
      const halfW = rightW / 2;
      drawLine(rX + halfW, yRow, rX + halfW, yRow + infoRowH, TH_MINOR, C_LINE_SOFT);
      drawInfoPair(rX, yRow, halfW, infoRowH, row.leftLabel, row.leftValue);
      drawInfoPair(rX + halfW, yRow, halfW, infoRowH, row.rightLabel, row.rightValue);
    }
  }

  // 합계금액(하단 고정 영역)
  const sumLabelW = 60;
  drawLine(rX + sumLabelW, rY, rX + sumLabelW, rY + sumRowH, TH_MAJOR, C_LINE_SOFT);
  drawTextInCell("합계금액", rX, rY, sumLabelW, sumRowH, { font: fontReg, size: 9, align: "center", color: C_MUTED, noEllipsis: true });
  drawTextInCell(`${formatWonNum(totalIncl)}원`, rX + sumLabelW, rY, rightW - sumLabelW, sumRowH, { font: fontBold, size: 10.5, align: "left", padX: 6, noEllipsis: true });

  // =========================
  // 4) Main Grid (표) — 아래 문제(공수 … / 헤더 쏠림 / 칸구분선) 해결 버전
  // =========================
  const gridTop = topBoxY - gapAfterTop;
  const bottomReserve = 18 + 38;
  const gridBottom = M + bottomReserve;

  const gridX = M;
  const gridY = gridBottom;
  const gridW = CONTENT_W;
  const gridH = gridTop - gridBottom;

  drawRect(gridX, gridY, gridW, gridH, TH_OUTER);

  // column widths (dayW 확보 위주)
  const colSiteW = 42;
  const colRoleW = 42;
  const colOutW = 40;
  const colUnitW = 55;
  const colSumW = 65;
  const daysAreaW = gridW - (colSiteW + colRoleW + colOutW + colUnitW + colSumW);

  const DAY_COLS = 31;
  const dayW = daysAreaW / DAY_COLS;

  const xSiteEnd = gridX + colSiteW;
  const xRoleEnd = xSiteEnd + colRoleW;
  const xDaysStart = xRoleEnd;
  const xDaysEnd = xDaysStart + daysAreaW;
  const xOut = xDaysEnd;
  const xUnit = xOut + colOutW;
  const xSum = xUnit + colUnitW;

  // header heights
  const h1 = 22;
  const h2 = 20;
  const rowH = 18;
  const footerH = 18;

  // visibility for day grid lines
  const C_DAY_LINE = rgb(0.84, 0.84, 0.84);
  const TH_DAY = 0.55;

  // major verticals
  drawLine(xSiteEnd, gridY, xSiteEnd, gridY + gridH, TH_MAJOR);
  drawLine(xRoleEnd, gridY, xRoleEnd, gridY + gridH, TH_MAJOR);
  drawLine(xDaysEnd, gridY, xDaysEnd, gridY + gridH, TH_MAJOR);
  drawLine(xOut, gridY, xOut, gridY + gridH, TH_MAJOR);
  drawLine(xUnit, gridY, xUnit, gridY + gridH, TH_MAJOR);
  drawLine(xSum, gridY, xSum, gridY + gridH, TH_MAJOR);

  let y = gridY + gridH;

  // header row 1 (merged 출력상황)
  y -= h1;
  drawLine(gridX, y, gridX + gridW, y, TH_MAJOR);

  drawTextInCell("현장", gridX, y, colSiteW, h1, { font: fontBold, size: 9.5, align: "center", noEllipsis: true });
  drawTextInCell("구분", gridX + colSiteW, y, colRoleW, h1, { font: fontBold, size: 9.5, align: "center", noEllipsis: true });

  drawTextInCell("출력상황", xDaysStart, y, daysAreaW, h1, { font: fontBold, size: 9.5, align: "center", noEllipsis: true });
  drawTextInCell(periodLabel, xDaysStart, y, daysAreaW, h1, { font: fontReg, size: 8, align: "right", padX: 4, color: C_MUTED });

  // ✅ 멀티라인 중앙정렬로 쏠림 제거 [Source](https://www.genspark.ai/api/files/s/rrpEfMQh)
  drawMultilineCentered("출력\n공수", xOut, y, colOutW, h1, fontBold, 8.5, C_TEXT);
  drawTextInCell("단가", xUnit, y, colUnitW, h1, { font: fontBold, size: 9.5, align: "center", noEllipsis: true });
  drawMultilineCentered("노무비\n총액", xSum, y, colSumW, h1, fontBold, 8.5, C_TEXT);

  // header row 2 (1~31)
  y -= h2;
  drawLine(gridX, y, gridX + gridW, y, TH_MAJOR);

  // ✅ 핵심: day 세로선은 병합헤더(h1)에 올라오면 안 됨
  // -> 숫자 헤더(h2) 아래 영역부터만 세로선을 내려준다. [Source](https://www.genspark.ai/api/files/s/rrpEfMQh)
  const yDayGridTop = y + h2;

  // day vertical lines (칸 구분 확실히) - 마지막 경계 포함
  for (let i = 0; i <= DAY_COLS; i++) {
    const dx = xDaysStart + dayW * i;
    drawLine(dx, gridY, dx, yDayGridTop, TH_DAY, C_DAY_LINE);
  }

  // day numbers
  for (let i = 0; i < DAY_COLS; i++) {
    const dx = xDaysStart + dayW * i;
    drawDayHeaderNumber(i + 1, dx, y, dayW, h2);
  }

  // ---- day extraction helpers ----
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
        const keyYmd = (typeof d === "string" ? d : kstYmd(d)).slice(0, 10);
        const keyDay = String(Number(keyYmd.slice(8, 10)));
        return (map as any)[keyYmd] ?? (map as any)[keyDay] ?? 0;
      });
    }

    const items = row?.items || row?.entries || row?.details;
    if (Array.isArray(items)) {
      const m = new Map<number, number>();
      for (const it of items) {
        const ymdKey = safe(it?.date ?? it?.ymd ?? it?.day ?? "", "").slice(0, 10);
        const day = Number(ymdKey.slice(8, 10));
        const units = nnum(it?.units ?? it?.value ?? it?.manDays ?? it?.count ?? 0);
        if (day >= 1 && day <= 31) m.set(day, (m.get(day) ?? 0) + units);
      }
      return dates.map((d: any) => m.get(dayOfMonthNum(d)) ?? 0);
    }

    return [];
  };

  const normalizeDayVals31 = (row: any) => {
    const out = Array.from({ length: 31 }, () => 0);
    const raw = extractDayVals(row) ?? [];

    if (dates.length && raw.length) {
      const n = Math.min(dates.length, raw.length);
      for (let i = 0; i < n; i++) {
        const day = dayOfMonthNum(dates[i]);
        const v = toNumberOrNull(raw[i]) ?? 0;
        if (day >= 1 && day <= 31) out[day - 1] += v;
      }
      return out;
    }

    if (raw.length === 31) {
      for (let i = 0; i < 31; i++) out[i] = toNumberOrNull(raw[i]) ?? 0;
      return out;
    }

    // fallback: try parse sequential days if raw length matches day count (rare)
    if (raw.length > 0 && raw.length <= 31) {
      for (let i = 0; i < raw.length; i++) out[i] = toNumberOrNull(raw[i]) ?? 0;
    }
    return out;
  };

  const fmtUnits1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "");

  // =========================
  // 5) Body rows + Footer
  // =========================
  const bodyTopY = y;
  const availableBodyH = (bodyTopY - gridY) - footerH;
  const maxBodyRows = Math.max(1, Math.floor(availableBodyH / rowH));
  const rows = roleRows.slice(0, maxBodyRows);

  let sumManDays = 0;
  let sumAmountExVat = 0;

  // 바디 행: 가로선으로 구분
  for (let r = 0; r < maxBodyRows; r++) {
    y -= rowH;
    drawLine(gridX, y, gridX + gridW, y, TH_MINOR, C_LINE_SOFT);

    const row = rows[r];
    if (!row) continue;

    const roleName = safe(row.roleName ?? row.role ?? row.occupation ?? "");

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

    const vals31 = normalizeDayVals31(row);

    let manDays = 0;
    for (let i = 0; i < 31; i++) manDays += (typeof vals31[i] === "number" ? vals31[i] : 0);

    const amountExVat = nnum(
      row.amountExVat ??
      row.amount_ex_vat ??
      row.amount ??
      row.totalAmount ??
      row.total_amount ??
      row.sum ??
      row.total ??
      row.gross ??
      unitPriceRaw * manDays
    );

    const unitPrice = unitPriceRaw > 0 ? unitPriceRaw : manDays > 0 ? Math.round(amountExVat / manDays) : 0;

    sumManDays += manDays;
    sumAmountExVat += amountExVat;

    // left columns
    drawTextInCell(siteName, gridX, y, colSiteW, rowH, { font: fontReg, size: 7.0, align: "center" });
    drawTextInCell(roleName, gridX + colSiteW, y, colRoleW, rowH, { font: fontReg, size: 7.0, align: "center" });

    // ✅ day columns: 숫자(공수) 전용 렌더러로만 출력 -> "..."로 바뀌는 현상 원천 차단 [Source](https://www.genspark.ai/api/files/s/rrpEfMQh)
    for (let i = 0; i < 31; i++) {
      const dx = xDaysStart + dayW * i;
      const v = typeof vals31[i] === "number" && Number.isFinite(vals31[i]) ? vals31[i] : 0;
      drawDayValue(v, dx, y, dayW, rowH);
    }

    // right columns
    drawTextInCell(manDays ? fmtUnits1(manDays) : "", xOut, y, colOutW, rowH, {
      font: fontReg,
      size: 7.0,
      align: "center",
      noEllipsis: true,
    });
    drawTextInCell(unitPrice ? formatWonNum(unitPrice) : "", xUnit, y, colUnitW, rowH, {
      font: fontReg,
      size: 7.0,
      align: "right",
      padX: 4,
    });
    drawTextInCell(amountExVat ? formatWonNum(amountExVat) : "", xSum, y, colSumW, rowH, {
      font: fontReg,
      size: 7.0,
      align: "right",
      padX: 4,
    });
  }

  // Footer(합계) 배경 음영
  y -= footerH;
  fillRect(gridX, y, gridW, footerH, C_SUM_FILL);
  drawLine(gridX, y, gridX + gridW, y, TH_MAJOR);

  drawTextInCell("합계", gridX, y, colSiteW + colRoleW, footerH, {
    font: fontBold,
    size: 8.5,
    align: "center",
    noEllipsis: true,
  });

  const daySums = Array.from({ length: 31 }, () => 0);
  for (const row of roleRows) {
    const v31 = normalizeDayVals31(row);
    for (let i = 0; i < 31; i++) daySums[i] += typeof v31[i] === "number" ? v31[i] : 0;
  }

  // day sums도 전용 렌더러 사용
  for (let i = 0; i < 31; i++) {
    const dx = xDaysStart + dayW * i;
    drawDayValue(daySums[i], dx, y, dayW, footerH);
  }

  drawTextInCell(sumManDays ? fmtUnits1(sumManDays) : "", xOut, y, colOutW, footerH, {
    font: fontBold,
    size: 7.0,
    align: "center",
    noEllipsis: true,
  });
  drawTextInCell("", xUnit, y, colUnitW, footerH, { font: fontReg, size: 7.0, align: "center" });
  drawTextInCell(sumAmountExVat ? formatWonNum(sumAmountExVat) : "", xSum, y, colSumW, footerH, {
    font: fontBold,
    size: 8.5,
    align: "right",
    padX: 4,
  });

  // Outer bottom line
  drawLine(gridX, gridY, gridX + gridW, gridY, TH_OUTER);

  // =========================
  // 6) Bottom total box (우하단)
  // =========================
  const boxW = 190;
  const boxH = 34;
  const bx = M + CONTENT_W - boxW;
  const by = M + 12;

  drawRect(bx, by, boxW, boxH, TH_MAJOR, C_LINE);
  drawTextInCell("총합계", bx, by, 55, boxH, { font: fontBold, size: 9, align: "center", noEllipsis: true });
  drawTextInCell(`₩${formatWonNum(totalIncl)}`, bx + 55, by, boxW - 55, boxH, {
    font: fontBold,
    size: 10.5,
    align: "right",
    padX: 6,
    noEllipsis: true,
  });

  // (선택) kind debug
  if (kind && kind !== "LABOR_INVOICE") {
    drawTextInCell(`(주의) kind=${kind}`, M, M - 2, CONTENT_W, 12, {
      font: fontReg,
      size: 7,
      align: "left",
      color: C_MUTED,
      noEllipsis: true,
    });
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
