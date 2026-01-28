"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react"
import {
  type Site,
  type Worker,
  type Settlement,
  type Role,
  mockSites,
  mockWorkers,
  mockSettlements,
  defaultRoles,
} from "@/lib/mock-data"

// Snapshot interface for saving/restoring entire state
export interface AppSnapshot {
  id: string
  title: string
  timestamp: string
  data: AppState
  metrics: {
    siteCount: number
    waitingWorkers: number
    assignedWorkers: number
    pendingPayments: number
    pendingBillings: number
  }
}

// Settlement record with full details for restoration
export interface SettlementRecord {
  id: string
  mode: "직불" | "대불" | "팀"
  siteId: string
  siteName: string
  payTargetType: "노동자" | "반장" | "건설사직접"
  workerId?: string
  workerName?: string
  teamLeaderId?: string
  teamLeaderName?: string
  teamMemberIds?: string[]
  lineItems: {
    id: string
    name: string
    type: "add" | "deduct"
    valueType: "fixed" | "percent"
    value: number
  }[]
  baseDailyWage: number
  grossAmount: number
  netAmount: number
  status: "지급대기" | "청구대기" | "미수금" | "완료"
  date: string
}

// SMS template interface
export interface SmsTemplate {
  id: string
  name: string
  content: string
  type: "기본" | "공지" | "긴급" | "현장변경"
}

// Per-worker settlement override (stored per site)
export interface WorkerSettlementOverride {
  workerId: string
  siteId: string
  useDefault: boolean // if true, use site default
  mode?: "직불" | "대불" | "팀"
  payTarget?: "노동자" | "반장" | "건설사직접"
  baseDailyWage?: number
  lineItems?: {
    id: string
    name: string
    type: "add" | "deduct"
    value: number
  }[]
}

// Assignment mapping
export interface SiteAssignment {
  siteId: string
  waitingWorkerIds: string[]
  assignedWorkerIds: string[]
  fixedWorkerIds: string[]
  todayRequired: number
}

// Full app state
export interface AppState {
  sites: Site[]
  workers: Worker[]
  settlements: Settlement[]
  settlementRecords: SettlementRecord[]
  workerSettlementOverrides: WorkerSettlementOverride[]
  roles: Role[]
  smsTemplates: SmsTemplate[]
  lastUsedTemplateId: string | null
  assignments: SiteAssignment[]
  settlementConfig: {
    mode: "직불" | "대불" | "팀"
    baseDailyWage: number
    additionalItems: { id: string; name: string; type: "add"; valueType: "fixed" | "percent"; value: number }[]
    deductionItems: { id: string; name: string; type: "deduct"; valueType: "fixed" | "percent"; value: number }[]
  }
  uiState: {
    selectedSiteId: string | null
  }
}

// Default SMS templates
const defaultSmsTemplates: SmsTemplate[] = [
  {
    id: "tpl1",
    name: "기본 안내",
    content: "[{siteName}] {date} 출근 안내\n\n집합 장소: {address}\n집합 시간: {checkInTime}\n\n문의: {officePhone}",
    type: "기본",
  },
  {
    id: "tpl2",
    name: "공지사항",
    content: "[{siteName}] 공지사항\n\n{message}\n\n문의: {officePhone}",
    type: "공지",
  },
  {
    id: "tpl3",
    name: "긴급 연락",
    content: "[긴급] [{siteName}]\n\n{message}\n\n즉시 확인 부탁드립니다.\n문의: {officePhone}",
    type: "긴급",
  },
  {
    id: "tpl4",
    name: "현장 변경",
    content: "[현장변경] {date}\n\n기존: {oldSiteName}\n변경: {siteName}\n\n집합 시간: {checkInTime}\n문의: {officePhone}",
    type: "현장변경",
  },
]

const USE_DB = true; // DB 적용 단계에서는 true

// Initial state builder
function buildInitialState(): AppState {
  const assignments: SiteAssignment[] = mockSites.map((site) => {
    const siteWorkers = mockWorkers.filter((w) => w.assignedSiteId === site.id)
    const fixed = siteWorkers.filter((w) => w.isFixed).map((w) => w.id)
    const assigned = siteWorkers.filter((w) => !w.isFixed).map((w) => w.id)
    return {
      siteId: site.id,
      waitingWorkerIds: [],
      assignedWorkerIds: assigned,
      fixedWorkerIds: fixed,
      todayRequired: site.todayRequired,
    }
  })

  // Workers not assigned to any site go to a global waiting pool
  const assignedWorkerIds = new Set(mockWorkers.filter((w) => w.assignedSiteId).map((w) => w.id))
  const waitingWorkerIds = mockWorkers.filter((w) => !assignedWorkerIds.has(w.id)).map((w) => w.id)

  // Add waiting workers to first site's waiting pool for demo
  if (assignments.length > 0) {
    assignments[0].waitingWorkerIds = waitingWorkerIds
  }

  return {
    sites: mockSites,
    workers: mockWorkers,
    settlements: mockSettlements,
    settlementRecords: [],
    workerSettlementOverrides: [],
    roles: defaultRoles,
    smsTemplates: defaultSmsTemplates,
    lastUsedTemplateId: null,
    assignments,
    settlementConfig: {
      mode: "직불",
      baseDailyWage: 200000,
      additionalItems: [{ id: "a1", name: "식대", type: "add", valueType: "fixed", value: 10000 }],
      deductionItems: [{ id: "d1", name: "수수료", type: "deduct", valueType: "percent", value: 5 }],
    },
    uiState: {
      selectedSiteId: null,
    },
  }
}

// Context type
interface AppStoreContextType {
  state: AppState
  addSite: (site: Omit<Site, "id">) => Promise<void>
  updateSite: (site: Site) => Promise<void>
  deleteSite: (siteId: string) => Promise<void>

  addWorker: (worker: Omit<Worker, "id">) => Promise<void>
  updateWorker: (worker: Worker) => Promise<void>
  deleteWorker: (workerId: string) => Promise<void>
  // Assignments
  updateAssignment: (assignment: SiteAssignment) => void
  moveWorkerToWaiting: (workerId: string, siteId: string) => void
  moveWorkerToAssigned: (workerId: string, siteId: string) => void
  moveWorkerToFixed: (workerId: string, siteId: string) => void
  // Settlement
  updateSettlementConfig: (config: Partial<AppState["settlementConfig"]>) => void
  addSettlementRecord: (record: Omit<SettlementRecord, "id">) => void
  // Worker Settlement Overrides
  setWorkerSettlementOverride: (override: WorkerSettlementOverride) => void
  bulkSetWorkerSettlementOverrides: (overrides: WorkerSettlementOverride[]) => void
  removeWorkerSettlementOverride: (workerId: string, siteId: string) => void
  getWorkerSettlementOverride: (workerId: string, siteId: string) => WorkerSettlementOverride | undefined
  // SMS Templates
  updateSmsTemplate: (template: SmsTemplate) => void
  setLastUsedTemplate: (templateId: string) => void
  // UI State
  setSelectedSiteId: (siteId: string | null) => void
  // Snapshots
  saveSnapshot: (title: string) => Promise<AppSnapshot>
  loadSnapshot: (snapshot: AppSnapshot) => Promise<void>
  getSnapshots: () => Promise<AppSnapshot[]>
  deleteSnapshot: (snapshotId: string) => Promise<void>
}

const AppStoreContext = createContext<AppStoreContextType | undefined>(undefined)

const STORAGE_KEY = "desla-app-state"
const SNAPSHOTS_KEY = "desla-snapshots"

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(buildInitialState)
  const [isHydrated, setIsHydrated] = useState(false)

  // Hydrate from localStorage on mount
  useEffect(() => {
    const hydrate = async () => {
      try {
        if (!USE_DB) {
          const stored = localStorage.getItem(STORAGE_KEY)
          if (stored) setState(JSON.parse(stored) as AppState)
          setIsHydrated(true)
          return
        }

        // DB 모드: 기본 뼈대는 유지하고 sites/workers만 서버에서 주입
        const [sitesRes, workersRes, rolesRes] = await Promise.all([
          fetch("/api/sites", { method: "GET" }),
          fetch("/api/workers", { method: "GET" }),
          fetch("/api/roles", { method: "GET" }),
        ])

        if (!sitesRes.ok || !workersRes.ok || !rolesRes.ok) throw new Error("DB fetch failed")

        const sitesJson = await sitesRes.json()
        const workersJson = await workersRes.json()
        const rolesJson = await rolesRes.json()

        setState((prev) => ({
          ...prev,
          sites: sitesJson.sites ?? [],
          workers: workersJson.workers ?? [],
          roles: rolesJson.roles ?? [], // ✅ 이 한 줄 때문에 UI 역할이 살아남
          // assignments는 다음 단계에서 DB로 옮김 (지금은 prev 유지)
        }))
      } catch {
        // 실패하면 기존 mock으로라도 화면이 뜨게 유지
      } finally {
        setIsHydrated(true)
      }
    }

    hydrate()
  }, [])

  // Persist to localStorage on change
  useEffect(() => {
    if (!USE_DB && isHydrated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    }
  }, [state, isHydrated])

  // Sites
  const addSite = useCallback(async (siteData: Omit<Site, "id">) => {
    const res = await fetch("/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(siteData),
    });
    if (!res.ok) return;

    const { site } = await res.json();
    setState((prev) => ({
      ...prev,
      sites: [site, ...prev.sites],
      assignments: [
        {
          siteId: site.id,
          waitingWorkerIds: [],
          assignedWorkerIds: [],
          fixedWorkerIds: [],
          todayRequired: site.todayRequired ?? 0,
        },
        ...prev.assignments,
      ],
    }));
  }, []);



  const updateSite = useCallback(async (site: Site) => {
    const res = await fetch(`/api/sites/${site.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: site.name,
        address: site.address,
        status: site.status,

        // 날짜 (YYYY-MM-DD)
        start_date: site.startDate ?? null,
        end_date: site.endDate ?? null,

        // 인원 (number)
        planned_workers: Number(site.plannedWorkers ?? 0),
        today_required: Number(site.todayRequired ?? 0),

        // 시간/전화 (string)
        check_in_time: site.checkInTime ?? "",
        office_phone: site.officePhone ?? "",
      }),
    });
    if (!res.ok) return;

    const { site: updated } = await res.json();
    setState((prev) => ({
      ...prev,
      sites: prev.sites.map((s) => (s.id === updated.id ? updated : s)),
      assignments: prev.assignments.map((a) =>
        a.siteId === updated.id ? { ...a, todayRequired: updated.todayRequired ?? 0 } : a
      ),
    }));
  }, []);


  const deleteSite = useCallback(async (siteId: string) => {
    const res = await fetch(`/api/sites/${siteId}`, { method: "DELETE" });
    if (!res.ok) return;

    setState((prev) => ({
      ...prev,
      sites: prev.sites.filter((s) => s.id !== siteId),
      assignments: prev.assignments.filter((a) => a.siteId !== siteId),
    }));
  }, []);

  // Workers
  const addWorker = useCallback(async (workerData: Omit<Worker, "id">) => {
    const res = await fetch("/api/workers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workerData),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error ?? "인력 등록 실패")

    const worker = json.worker
    setState((prev) => ({ ...prev, workers: [worker, ...prev.workers] }))
  }, [])



  const updateWorker = useCallback(async (worker: Worker) => {
    const res = await fetch(`/api/workers/${worker.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: worker.name,
        phone: (worker as any).phone ?? null,
        status: (worker as any).status ?? "미출근",
        is_fixed: (worker as any).isFixed ?? (worker as any).is_fixed ?? false,
        assigned_site_id: (worker as any).assignedSiteId ?? (worker as any).assigned_site_id ?? null,

        // ✅ 역할 저장(서버 PATCH가 role_ids 처리 이미 하고 있음)
        role_ids: (worker.roles ?? []).map((r: any) => r.id),
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error ?? "worker update failed");

    const updated = json.worker;
    setState((prev) => ({
      ...prev,
      workers: prev.workers.map((w) => (w.id === updated.id ? updated : w)),
    }));
  }, []);


  const deleteWorker = useCallback(async (workerId: string) => {
    const res = await fetch(`/api/workers/${workerId}`, { method: "DELETE" });
    if (!res.ok) return;

    setState((prev) => ({
      ...prev,
      workers: prev.workers.filter((w) => w.id !== workerId),
      assignments: prev.assignments.map((a) => ({
        ...a,
        waitingWorkerIds: a.waitingWorkerIds.filter((id) => id !== workerId),
        assignedWorkerIds: a.assignedWorkerIds.filter((id) => id !== workerId),
        fixedWorkerIds: a.fixedWorkerIds.filter((id) => id !== workerId),
      })),
    }));
  }, []);

  // Assignments
  const updateAssignment = useCallback((assignment: SiteAssignment) => {
    setState((prev) => ({
      ...prev,
      assignments: prev.assignments.map((a) =>
        a.siteId === assignment.siteId ? assignment : a
      ),
    }))
  }, [])

  const moveWorkerToWaiting = useCallback((workerId: string, siteId: string) => {
    setState((prev) => ({
      ...prev,
      workers: prev.workers.map((w) =>
        w.id === workerId ? { ...w, status: "출근" as const, assignedSiteId: undefined, isFixed: false } : w
      ),
      assignments: prev.assignments.map((a) => {
        if (a.siteId === siteId) {
          return {
            ...a,
            waitingWorkerIds: [...a.waitingWorkerIds.filter((id) => id !== workerId), workerId],
            assignedWorkerIds: a.assignedWorkerIds.filter((id) => id !== workerId),
            fixedWorkerIds: a.fixedWorkerIds.filter((id) => id !== workerId),
          }
        }
        return a
      }),
    }))
  }, [])

  const moveWorkerToAssigned = useCallback((workerId: string, siteId: string) => {
    setState((prev) => ({
      ...prev,
      workers: prev.workers.map((w) =>
        w.id === workerId ? { ...w, status: "배치" as const, assignedSiteId: siteId, isFixed: false } : w
      ),
      assignments: prev.assignments.map((a) => {
        if (a.siteId === siteId) {
          return {
            ...a,
            waitingWorkerIds: a.waitingWorkerIds.filter((id) => id !== workerId),
            assignedWorkerIds: [...a.assignedWorkerIds.filter((id) => id !== workerId), workerId],
            fixedWorkerIds: a.fixedWorkerIds.filter((id) => id !== workerId),
          }
        }
        return {
          ...a,
          waitingWorkerIds: a.waitingWorkerIds.filter((id) => id !== workerId),
          assignedWorkerIds: a.assignedWorkerIds.filter((id) => id !== workerId),
          fixedWorkerIds: a.fixedWorkerIds.filter((id) => id !== workerId),
        }
      }),
    }))
  }, [])

  const moveWorkerToFixed = useCallback((workerId: string, siteId: string) => {
    setState((prev) => ({
      ...prev,
      workers: prev.workers.map((w) =>
        w.id === workerId ? { ...w, status: "배치" as const, assignedSiteId: siteId, isFixed: true } : w
      ),
      assignments: prev.assignments.map((a) => {
        if (a.siteId === siteId) {
          return {
            ...a,
            waitingWorkerIds: a.waitingWorkerIds.filter((id) => id !== workerId),
            assignedWorkerIds: a.assignedWorkerIds.filter((id) => id !== workerId),
            fixedWorkerIds: [...a.fixedWorkerIds.filter((id) => id !== workerId), workerId],
          }
        }
        return {
          ...a,
          waitingWorkerIds: a.waitingWorkerIds.filter((id) => id !== workerId),
          assignedWorkerIds: a.assignedWorkerIds.filter((id) => id !== workerId),
          fixedWorkerIds: a.fixedWorkerIds.filter((id) => id !== workerId),
        }
      }),
    }))
  }, [])

  // Settlement
  const updateSettlementConfig = useCallback(
    (config: Partial<AppState["settlementConfig"]>) => {
      setState((prev) => ({
        ...prev,
        settlementConfig: { ...prev.settlementConfig, ...config },
      }))
    },
    []
  )

  const addSettlementRecord = useCallback((recordData: Omit<SettlementRecord, "id">) => {
    const newRecord: SettlementRecord = { ...recordData, id: `sr${Date.now()}` }
    setState((prev) => ({
      ...prev,
      settlementRecords: [newRecord, ...prev.settlementRecords],
    }))
  }, [])

  // Worker Settlement Overrides
  const setWorkerSettlementOverride = useCallback((override: WorkerSettlementOverride) => {
    setState((prev) => {
      const existing = prev.workerSettlementOverrides.findIndex(
        (o) => o.workerId === override.workerId && o.siteId === override.siteId
      )
      if (existing >= 0) {
        const updated = [...prev.workerSettlementOverrides]
        updated[existing] = override
        return { ...prev, workerSettlementOverrides: updated }
      }
      return { ...prev, workerSettlementOverrides: [...prev.workerSettlementOverrides, override] }
    })
  }, [])

  const bulkSetWorkerSettlementOverrides = useCallback((overrides: WorkerSettlementOverride[]) => {
    setState((prev) => {
      const updatedOverrides = [...prev.workerSettlementOverrides]
      for (const override of overrides) {
        const existing = updatedOverrides.findIndex(
          (o) => o.workerId === override.workerId && o.siteId === override.siteId
        )
        if (existing >= 0) {
          updatedOverrides[existing] = override
        } else {
          updatedOverrides.push(override)
        }
      }
      return { ...prev, workerSettlementOverrides: updatedOverrides }
    })
  }, [])

  const removeWorkerSettlementOverride = useCallback((workerId: string, siteId: string) => {
    setState((prev) => ({
      ...prev,
      workerSettlementOverrides: prev.workerSettlementOverrides.filter(
        (o) => !(o.workerId === workerId && o.siteId === siteId)
      ),
    }))
  }, [])

  const getWorkerSettlementOverride = useCallback(
    (workerId: string, siteId: string) => {
      return state.workerSettlementOverrides.find(
        (o) => o.workerId === workerId && o.siteId === siteId
      )
    },
    [state.workerSettlementOverrides]
  )

  // SMS Templates
  const updateSmsTemplate = useCallback((template: SmsTemplate) => {
    setState((prev) => ({
      ...prev,
      smsTemplates: prev.smsTemplates.map((t) => (t.id === template.id ? template : t)),
    }))
  }, [])

  const setLastUsedTemplate = useCallback((templateId: string) => {
    setState((prev) => ({
      ...prev,
      lastUsedTemplateId: templateId,
    }))
  }, [])

  // UI State
  const setSelectedSiteId = useCallback((siteId: string | null) => {
    setState((prev) => ({
      ...prev,
      uiState: { ...prev.uiState, selectedSiteId: siteId },
    }))
  }, [])

  // Snapshots
  const SNAPSHOT_LIMIT = 100

  const getSnapshots = useCallback(async () => {
    const res = await fetch("/api/snapshots", { method: "GET" })
    if (!res.ok) return []
    const json = await res.json()
    return json.snapshots ?? []
  }, [])

  const saveSnapshot = useCallback(
    async (title: string) => {
      // metrics는 기존 코드처럼 state로 계산 (원하면 기존 로직 그대로 복사)
      const waitingWorkers = state.workers.filter((w: any) => w.status === "미출근").length
      const assignedWorkers = state.workers.filter((w: any) => w.status === "배치").length
      const pendingPayments = 0
      const pendingBillings = 0

      const payload = {
        title,
        data: state, // ✅ AppState 전부 포함(네 요구사항)
        metrics: {
          siteCount: state.sites.length,
          waitingWorkers,
          assignedWorkers,
          pendingPayments,
          pendingBillings,
        },
      }

      const res = await fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error("snapshot save failed")
      const json = await res.json()
      return json.snapshot
    },
    [state]
  )

  const loadSnapshot = useCallback(async (snapshot: any) => {
    const res = await fetch(`/api/snapshots/${snapshot.id}`, { method: "GET" })
    if (!res.ok) throw new Error("snapshot load failed")
    const json = await res.json()
    setState(json.snapshot.data)
  }, [])

  const deleteSnapshot = useCallback(async (snapshotId: string) => {
    const res = await fetch(`/api/snapshots/${snapshotId}`, { method: "DELETE" })
    if (!res.ok) throw new Error("snapshot delete failed")
  }, [])


  // Don't render children until hydrated to avoid hydration mismatch
  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground">데이터 불러오는 중...</p>
        </div>
      </div>
    )
  }

  return (
    <AppStoreContext.Provider
      value={{
        state,
        addSite,
        updateSite,
        deleteSite,
        addWorker,
        updateWorker,
        deleteWorker,
        updateAssignment,
        moveWorkerToWaiting,
        moveWorkerToAssigned,
        moveWorkerToFixed,
        updateSettlementConfig,
        addSettlementRecord,
        setWorkerSettlementOverride,
        bulkSetWorkerSettlementOverrides,
        removeWorkerSettlementOverride,
        getWorkerSettlementOverride,
        updateSmsTemplate,
        setLastUsedTemplate,
        setSelectedSiteId,
        saveSnapshot,
        loadSnapshot,
        getSnapshots,
        deleteSnapshot,
      }}
    >
      {children}
    </AppStoreContext.Provider>
  )
}

export function useAppStore() {
  const context = useContext(AppStoreContext)
  if (!context) {
    throw new Error("useAppStore must be used within AppStoreProvider")
  }
  return context
}
