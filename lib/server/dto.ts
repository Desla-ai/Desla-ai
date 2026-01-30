// lib/server/dto.ts

import { NextResponse } from "next/server"

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export function toWorkerDTO(row: any) {
  if (!row) return row

  // Supabase join 결과가 어떤 이름으로 오든(roles 또는 worker_roles[0].roles) 대비
  const rolesFromJoin =
    Array.isArray(row.roles)
      ? row.roles
      : Array.isArray(row.worker_roles)
        ? row.worker_roles.map((wr: any) => wr.roles).filter(Boolean)
        : []

  return {
    id: row.id,
    name: row.name ?? "",
    phone: row.phone ?? "",

    status: row.status ?? "미출근",
    lastAttendance: row.last_attendance ?? null,

    assignedSiteId: row.assigned_site_id ?? undefined,
    isFixed: row.is_fixed ?? false,
    fixedStartDate: row.fixed_start_date ?? undefined,
    fixedEndDate: row.fixed_end_date ?? undefined,

    // ✅ UI가 기대하는 핵심
    roles: rolesFromJoin.map((r: any) => ({
      id: r.id,
      name: r.name,
      color: r.color,
    })),

    // ✅ 팀은 다음 단계(teams/team_members 조인)에서 채울 것.
    // 지금은 크래시 방지용 기본값
    team: null,
    teamLeaderId: undefined,
    teamMembers: undefined,
  }
}
