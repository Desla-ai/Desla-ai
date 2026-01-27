"use client"

import { useState } from "react"
import { IconRail } from "@/components/layout/icon-rail"
import { TopBar } from "@/components/layout/top-bar"
import { SiteListPanel } from "@/components/sites/site-list-panel"
import { SiteControlPanel } from "@/components/sites/site-control-panel"
import { SitesKpiPanel } from "@/components/sites/sites-kpi-panel"
import { useAppStore } from "@/lib/app-store"
import { type Site } from "@/lib/mock-data"

export default function SitesPage() {
  const { state, addSite, deleteSite, setSelectedSiteId } = useAppStore()
  const [checkedSiteIds, setCheckedSiteIds] = useState<string[]>([])

  const selectedSite = state.sites.find((s) => s.id === state.uiState.selectedSiteId) || null

  const handleSelectSite = (siteId: string) => {
    setSelectedSiteId(siteId)
  }

  const handleAddSite = (newSite: Omit<Site, "id">) => {
    addSite(newSite)
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
      <aside className="w-80 shrink-0 border-r border-border bg-card overflow-hidden">
        <SiteListPanel
          sites={state.sites}
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
          <SitesKpiPanel
            workersPending={waitingWorkers}
            siteBillingPending={pendingBillings}
            supplyPending={pendingPayments}
            unresolvedIssues={unresolvedIssues}
          />
        </div>
      </div>
    </div>
  )
}
