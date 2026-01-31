// lib/server/site-dto.ts
export function toSiteDTO(s: any) {
  if (!s) return s

  return {
    id: s.id,
    officeId: s.office_id,

    // ✅ 회사(건설사) 연결 (필수 정책)
    companyId: s.company_id ?? null,

    name: s.name ?? "",
    address: s.address ?? "",

    startDate: s.start_date ?? "",
    endDate: s.end_date ?? "",

    plannedWorkers: s.planned_workers ?? 0,
    assignedWorkers: s.assigned_workers ?? 0,
    todayRequired: s.today_required ?? 0,

    status: s.status ?? "미진행",
    progress: s.progress ?? 0,

    checkInTime: s.check_in_time ?? "",
    officePhone: s.office_phone ?? "",

    defaultSettlementMode: s.default_settlement_mode ?? null,

    createdAt: s.created_at ?? null,
    updatedAt: s.updated_at ?? null,
  }
}
