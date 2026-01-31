// lib/server/labor-invoice-agg.ts
import type { SupabaseClient } from "@supabase/supabase-js";

type LaborRoleRow = {
  role: string; // roles.name 기반 라벨
  byDate: Record<string, number>; // YYYY-MM-DD -> units
  totalUnits: number;
  gross: number; // 일당*공수 합
};

export type LaborInvoiceAgg = {
  kind: "LABOR_INVOICE";
  companyId: string;
  periodStart: string;
  periodEnd: string;
  siteId: string | null;
  siteName: string | null;

  dates: string[];
  roleRows: LaborRoleRow[];

  // 합계
  gross: number; // 세전(원 데이터 기준)
  totalUnits: number;
};

function safeStr(v: unknown) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function asNumber(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function roundHalf(u: number) {
  // work_units가 0.5 단위 가능하므로 0.5 단위로 정규화
  return Math.round(u * 2) / 2;
}

function buildDates(periodStart: string, periodEnd: string) {
  const out: string[] = [];
  const start = new Date(`${periodStart}T00:00:00Z`);
  const end = new Date(`${periodEnd}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;

  for (let d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export async function buildLaborInvoiceAgg(opts: {
  supabaseAdmin: SupabaseClient;
  officeId: string;

  companyId: string;
  periodStart: string;
  periodEnd: string;

  siteId?: string; // optional
}) : Promise<{ agg: LaborInvoiceAgg; sites: Array<{ id: string; name: string; company_id?: string | null }>; companyName: string }> {
  const { supabaseAdmin, officeId, companyId, periodStart, periodEnd } = opts;
  const siteId = safeStr(opts.siteId).trim();

  // 1) 회사 검증
  const { data: company, error: cErr } = await supabaseAdmin
    .from("companies")
    .select("id, office_id, name")
    .eq("id", companyId)
    .single();

  if (cErr || !company) throw new Error("Company not found");
  if (safeStr(company.office_id) !== safeStr(officeId)) throw new Error("Forbidden");

  // 2) sites 결정(회사 통합 vs 단일현장)
  let sites: any[] = [];
  if (siteId) {
    const { data: s, error: sErr } = await supabaseAdmin
      .from("sites")
      .select("id, name, company_id, office_id")
      .eq("id", siteId)
      .eq("office_id", officeId)
      .maybeSingle();

    if (sErr) throw new Error(sErr.message);
    if (!s) throw new Error("Site not found");
    if (safeStr(s.company_id ?? "") !== safeStr(companyId)) throw new Error("siteId does not belong to this company");
    sites = [s];
  } else {
    const { data: many, error: sErr } = await supabaseAdmin
      .from("sites")
      .select("id, name, company_id")
      .eq("office_id", officeId)
      .eq("company_id", companyId);

    if (sErr) throw new Error(sErr.message);
    sites = many ?? [];
  }

  const siteIds = sites.map((x: any) => safeStr(x.id)).filter(Boolean);
  if (siteIds.length === 0) throw new Error("No sites linked");

  // 3) 기간 내 정산 로드 (work_date + worker_id + wage/units)
  const { data: dsRows, error: dsErr } = await supabaseAdmin
    .from("daily_settlements")
    .select("site_id, worker_id, work_date, daily_wage, work_units")
    .eq("office_id", officeId)
    .in("site_id", siteIds)
    .gte("work_date", periodStart)
    .lte("work_date", periodEnd);

  if (dsErr) throw new Error(dsErr.message);

  if (!dsRows || dsRows.length === 0) throw new Error("No settlements in period");

  // workerId 모으기
  const workerIds = Array.from(
    new Set(dsRows.map((r: any) => safeStr(r.worker_id)).filter(Boolean))
  );

  // 4) worker_roles -> roles(name) 로딩
  // 주의: Supabase nested select는 배열로 올 수 있음.
  // worker_roles는 (worker_id, role_id) 다대다라서 worker당 여러개가 나올 수 있음.
  const { data: wrRows, error: wrErr } = await supabaseAdmin
    .from("worker_roles")
    .select("worker_id, roles(name)")
    .eq("office_id", officeId)
    .in("worker_id", workerIds);

  if (wrErr) throw new Error(wrErr.message);

  // workerId -> roleNames[]
  const roleNamesByWorker = new Map<string, string[]>();
  for (const row of (wrRows ?? []) as any[]) {
    const wid = safeStr(row.worker_id);
    if (!wid) continue;

    // roles(name)가:
    // - 단일 object { name } 로 올 수도 있고
    // - 배열 [{name}, ...] 로 올 수도 있음(설정/쿼리 형태에 따라)
    const rolesVal = row.roles;

    let names: string[] = [];
    if (Array.isArray(rolesVal)) {
      names = rolesVal.map((x) => safeStr(x?.name)).filter(Boolean);
    } else if (rolesVal && typeof rolesVal === "object") {
      const n = safeStr((rolesVal as any).name);
      if (n) names = [n];
    }

    const prev = roleNamesByWorker.get(wid) ?? [];
    roleNamesByWorker.set(wid, Array.from(new Set(prev.concat(names))));
  }

  // role label 결정: 우선순위는 "첫 role" (여러 직종이면 첫 번째)
  // 필요하면 향후: rules로 결정 / 복수 직종 표기 로직으로 확장
  function roleLabelForWorker(workerId: string) {
    const names = roleNamesByWorker.get(workerId) ?? [];
    return names[0] ?? "미분류";
  }

  // 5) 집계 (role x date)
  const dates = buildDates(periodStart, periodEnd);

  const roleMap = new Map<string, LaborRoleRow>();
  let grossTotal = 0;
  let unitsTotal = 0;

  for (const r of dsRows as any[]) {
    const wid = safeStr(r.worker_id);
    const role = roleLabelForWorker(wid);

    const workDate = safeStr(r.work_date); // YYYY-MM-DD
    const units = roundHalf(asNumber(r.work_units, 0));
    const dailyWage = asNumber(r.daily_wage, 0);

    if (!workDate || units <= 0) continue;

    const gross = Math.round(dailyWage * units);

    grossTotal += gross;
    unitsTotal += units;

    if (!roleMap.has(role)) {
      roleMap.set(role, { role, byDate: {}, totalUnits: 0, gross: 0 });
    }
    const agg = roleMap.get(role)!;
    agg.byDate[workDate] = roundHalf(asNumber(agg.byDate[workDate], 0) + units);
    agg.totalUnits = roundHalf(agg.totalUnits + units);
    agg.gross += gross;
  }

  if (grossTotal <= 0) throw new Error("No settlements in period");

  const roleRows = Array.from(roleMap.values())
    .sort((a, b) => b.gross - a.gross);

  const agg: LaborInvoiceAgg = {
    kind: "LABOR_INVOICE",
    companyId: safeStr(company.id),
    periodStart,
    periodEnd,
    siteId: siteId || null,
    siteName: siteId ? safeStr(sites?.[0]?.name ?? "") : null,
    dates,
    roleRows,
    gross: Math.round(grossTotal),
    totalUnits: roundHalf(unitsTotal),
  };

  return { agg, sites: sites.map((s: any) => ({ id: safeStr(s.id), name: safeStr(s.name), company_id: s.company_id ?? null })), companyName: safeStr(company.name) };
}
