type RoleDTO = { id: string; name: string; color: string }

export function toWorkerDTO(worker: any) {
  if (!worker) return worker

  const joinedRolesRaw: RoleDTO[] =
    Array.isArray(worker.worker_roles)
      ? worker.worker_roles
          .map((wr: any) => wr?.roles ?? wr?.role)   // ✅ 여기
          .filter(Boolean)
          .map((r: any) => ({
            id: String(r.id),
            name: String(r.name ?? ""),
            color: String(r.color ?? "#64748b"),
          }))
      : []

  const joinedRoles: RoleDTO[] = Array.from(new Map(joinedRolesRaw.map((r) => [r.id, r])).values())

  const craftFallback: RoleDTO[] =
    !joinedRoles.length && worker.craft
      ? [{ id: `craft:${worker.craft}`, name: worker.craft, color: "#64748b" }]
      : []

  const roles = joinedRoles.length ? joinedRoles : craftFallback

  return {
    id: worker.id,
    officeId: worker.office_id,
    name: worker.name ?? "",
    phone: worker.phone ?? "",
    status: worker.status ?? "미출근",
    assignedSiteId: worker.assigned_site_id ?? null,
    isFixed: !!worker.is_fixed,
    fixedStartDate: worker.fixed_start_date ?? null,
    fixedEndDate: worker.fixed_end_date ?? null,
    lastAttendance: worker.last_attendance ?? null,

    roles,

    // ✅ 이제 DB에 컬럼 생김
    team: worker.team ?? null,
    teamLeaderId: worker.team_leader_id ?? null,
    teamMembers: worker.team_members ?? null,

    createdAt: worker.created_at ?? null,
    updatedAt: worker.updated_at ?? null,
  }
}
