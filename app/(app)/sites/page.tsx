"use client"

import { useState } from "react"
import { IconRail } from "@/components/layout/icon-rail"
import { TopBar } from "@/components/layout/top-bar"
import { SiteListPanel } from "@/components/sites/site-list-panel"
import { SiteControlPanel } from "@/components/sites/site-control-panel"
import { SitesKpiPanel } from "@/components/sites/sites-kpi-panel"
import { useAppStore } from "@/lib/app-store"
import { type Site } from "@/lib/mock-data"
import { toast } from "sonner"

export default function SitesPage() {
  const { state, addSite, deleteSite, setSelectedSiteId } = useAppStore()
  const [checkedSiteIds, setCheckedSiteIds] = useState<string[]>([])

  const selectedSite = state.sites.find((s) => s.id === state.uiState.selectedSiteId) || null

  const handleSelectSite = (siteId: string) => {
    setSelectedSiteId(siteId)
  }

  const handleAddSite = async (newSite: any) => {
    try {
      // ✅ 필수: 회사 연결
      if (!newSite?.companyId) {
        // site-list-panel에서 이미 막지만 2중 방어
        throw new Error("건설사(업체)를 선택해 주세요.")
      }

      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSite),
      })

      const json = await res.json().catch(() => ({} as any))
      if (!res.ok) throw new Error(json?.error ?? "현장 등록 실패")

      // 서버가 내려준 site를 store에 반영 (서버 응답 키가 site인지 확인 필요)
      // 보통 { site: {...} } 형태로 맞추는 걸 추천
      const created = json?.site ?? null
      if (!created) {
        // fallback: 기존 흐름 유지(최소한 스토어에는 들어가게)
        addSite(newSite)
      } else {
        // store는 Omit<Site,'id'>만 받는 구조라면,
        // created를 그 형태로 다시 매핑해서 넣어줘야 함.
        // (id를 store가 자동 생성하는 구조일 가능성 때문)
        addSite({
          name: created.name,
          address: created.address,
          officePhone: created.officePhone ?? created.office_phone ?? "",
          checkInTime: created.checkInTime ?? created.check_in_time ?? "07:00",
          startDate: created.startDate ?? created.start_date ?? "",
          endDate: created.endDate ?? created.end_date ?? "",
          status: created.status,
          plannedWorkers: created.plannedWorkers ?? created.planned_workers ?? 0,
          assignedWorkers: created.assignedWorkers ?? 0,
          todayRequired: created.todayRequired ?? created.today_required ?? 0,
          progress: created.progress ?? 0,
          companyId: created.companyId ?? created.company_id ?? newSite.companyId, // ✅ store에도 보관(필요 시)
        } as any)
      }
    } catch (e: any) {
      // SitesPage는 toast import가 없으니, 여기서는 alert로 최소 처리하거나
      // TopBar/전역 toast를 붙여도 됨.
      console.error(e)
      toast.error(e?.message ?? "현장 등록 실패")
    }
  }


  const handleDeleteSite = (siteId: string) => {
    deleteSite(siteId)
    setSelectedSiteId(null)
  }

  // Calculate KPI values from state
  const waitingWorkers = state.workers.filter((w) => w.status === "미출근").length
  const pendingBillings = state.settlements
    .filter((s) => s.status === "청구대기")
    .reduce((sum, s) => sum + s.amount, 0)
  const pendingPayments = state.settlements
    .filter((s) => s.status === "지급대기")
    .reduce((sum, s) => sum + s.amount, 0)
  const unresolvedIssues = state.settlements.filter((s) => s.status === "미수금").length

  return (
    <div className="flex h-screen bg-background">
      <IconRail />
      <aside className="w-80 lg:w-[400px] shrink-0 border-r border-border bg-card overflow-hidden">
        <SiteListPanel
          sites={state.sites}
          workers={state.workers}
          selectedSiteId={state.uiState.selectedSiteId}
          onSelectSite={handleSelectSite}
          checkedSiteIds={checkedSiteIds}
          onCheckedSiteIdsChange={setCheckedSiteIds}
          onAddSite={handleAddSite}
        />
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="현장" />
        <div className="flex flex-1 overflow-hidden">
          <SiteControlPanel
            site={selectedSite}
            isOpen={!!state.uiState.selectedSiteId}
            onDeleteSite={handleDeleteSite}
          />
        </div>
      </div>
    </div>
  )
}
