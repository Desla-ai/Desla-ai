export interface Site {
  id: string
  name: string
  address: string
  startDate: string
  endDate: string
  plannedWorkers: number
  assignedWorkers: number
  todayRequired: number
  status: "미진행" | "배차대기" | "배차완료" | "금액확정"

  progress: number
  checkInTime: string
  officePhone: string
  defaultSettlementMode?: "직불" | "대불" | "팀"
}

export interface Worker {
  id: string
  name: string
  phone: string
  roles: Role[]
  team: "반장" | "팀원" | null
  teamLeaderId?: string
  teamMembers?: string[]
  status: "미출근" | "출근" | "배치"
  lastAttendance: string | null
  assignedSiteId?: string
  isFixed?: boolean
  fixedStartDate?: string
  fixedEndDate?: string
}

export interface Role {
  id: string
  name: string
  color: string
}

export interface Settlement {
  id: string
  type: "직불" | "대불" | "팀"
  siteName: string
  workerName?: string
  teamLeaderName?: string
  amount: number
  status: "지급대기" | "청구대기" | "미수금" | "완료"
  date: string
}

export interface Record {
  id: string
  timestamp: string
  siteId: string
  siteName: string
  workerId?: string
  workerName?: string
  eventType: "출근" | "퇴근" | "배치" | "정산" | "이슈"
  summary: string
  amount?: number
  status: "완료" | "처리중" | "오류"
}

export const defaultRoles: Role[] = [
  { id: "r1", name: "형틀", color: "#10b981" },
  { id: "r2", name: "철근", color: "#3b82f6" },
  { id: "r3", name: "콘크리트", color: "#f59e0b" },
  { id: "r4", name: "용접", color: "#ef4444" },
  { id: "r5", name: "비계", color: "#8b5cf6" },
  { id: "r6", name: "전기", color: "#ec4899" },
  { id: "r7", name: "배관", color: "#06b6d4" },
  { id: "r8", name: "도장", color: "#84cc16" },
]

export const mockSites: Site[] = [
  {
    id: "s1",
    name: "강남 오피스텔 신축현장",
    address: "서울 강남구 역삼동 123-45",
    startDate: "2025-01-15",
    endDate: "2026-06-30",
    plannedWorkers: 25,
    assignedWorkers: 18,
    todayRequired: 20,
    status: "배차완료",
    progress: 72,
    checkInTime: "07:00",
    officePhone: "0212345678",
    defaultSettlementMode: "직불",
  },
  {
    id: "s2",
    name: "판교 테크노밸리 2차",
    address: "경기 성남시 분당구 판교동 678",
    startDate: "2025-02-01",
    endDate: "2026-08-15",
    plannedWorkers: 40,
    assignedWorkers: 35,
    todayRequired: 38,
    status: "배차완료",
    progress: 45,
    checkInTime: "06:30",
    officePhone: "0319876543",
    defaultSettlementMode: "대불",
  },
  {
    id: "s3",
    name: "송파 아파트 리모델링",
    address: "서울 송파구 잠실동 234",
    startDate: "2024-11-01",
    endDate: "2025-03-31",
    plannedWorkers: 15,
    assignedWorkers: 15,
    todayRequired: 10,
    status: "금액확정",
    progress: 100,
    checkInTime: "08:00",
    officePhone: "0224681357",
    defaultSettlementMode: "직불",
  },
  {
    id: "s4",
    name: "인천 물류센터 증축",
    address: "인천 서구 검단동 456",
    startDate: "2025-03-01",
    endDate: "2026-12-31",
    plannedWorkers: 30,
    assignedWorkers: 8,
    todayRequired: 25,
    status: "배차대기",
    progress: 15,
    checkInTime: "07:30",
    officePhone: "0328527419",
    defaultSettlementMode: "팀",
  },
  {
    id: "s5",
    name: "수원 산업단지 공장",
    address: "경기 수원시 영통구 매탄동 789",
    startDate: "2025-01-20",
    endDate: "2025-09-30",
    plannedWorkers: 20,
    assignedWorkers: 16,
    todayRequired: 18,
    status: "배차완료",
    progress: 58,
    checkInTime: "07:00",
    officePhone: "0317539514",
    defaultSettlementMode: "직불",
  },
  {
    id: "s6",
    name: "미착공 현장 (테스트)",
    address: "서울 마포구 상암동 123",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    plannedWorkers: 50,
    assignedWorkers: 0,
    todayRequired: 0,
    status: "미진행",
    progress: 0,
    checkInTime: "07:00",
    officePhone: "0212340000",
  },
]

export const mockWorkers: Worker[] = [
  {
    id: "w1",
    name: "김철수",
    phone: "01012345678",
    roles: [defaultRoles[0], defaultRoles[1]],
    team: "반장",
    teamMembers: ["w2", "w3", "w4"],
    status: "배치",
    lastAttendance: "2025-01-28",
    assignedSiteId: "s1",
    isFixed: true,
    fixedStartDate: "2025-01-15",
    fixedEndDate: "2025-03-31",
  },
  {
    id: "w2",
    name: "이영희",
    phone: "01023456789",
    roles: [defaultRoles[2]],
    team: "팀원",
    teamLeaderId: "w1",
    status: "배치",
    lastAttendance: "2025-01-28",
    assignedSiteId: "s1",
  },
  {
    id: "w3",
    name: "박민수",
    phone: "01034567890",
    roles: [defaultRoles[3], defaultRoles[6]],
    team: "팀원",
    teamLeaderId: "w1",
    status: "출근",
    lastAttendance: "2025-01-28",
  },
  {
    id: "w4",
    name: "정수진",
    phone: "01045678901",
    roles: [defaultRoles[5]],
    team: "팀원",
    teamLeaderId: "w1",
    status: "미출근",
    lastAttendance: "2025-01-27",
  },
  {
    id: "w5",
    name: "최동훈",
    phone: "01056789012",
    roles: [defaultRoles[4], defaultRoles[7]],
    team: null,
    status: "출근",
    lastAttendance: "2025-01-26",
  },
  {
    id: "w6",
    name: "한미영",
    phone: "01067890123",
    roles: [defaultRoles[0]],
    team: "반장",
    teamMembers: ["w7"],
    status: "배치",
    lastAttendance: "2025-01-28",
    assignedSiteId: "s2",
    isFixed: true,
    fixedStartDate: "2025-02-01",
    fixedEndDate: "2025-04-30",
  },
  {
    id: "w7",
    name: "윤재호",
    phone: "01078901234",
    roles: [defaultRoles[1], defaultRoles[2]],
    team: "팀원",
    teamLeaderId: "w6",
    status: "배치",
    lastAttendance: "2025-01-28",
    assignedSiteId: "s2",
  },
  {
    id: "w8",
    name: "송지현",
    phone: "01089012345",
    roles: [defaultRoles[5], defaultRoles[6]],
    team: null,
    status: "출근",
    lastAttendance: "2025-01-25",
  },
  {
    id: "w9",
    name: "임성민",
    phone: "01090123456",
    roles: [defaultRoles[3]],
    team: null,
    status: "미출근",
    lastAttendance: "2025-01-24",
  },
  {
    id: "w10",
    name: "강태우",
    phone: "01001234567",
    roles: [defaultRoles[4], defaultRoles[0]],
    team: null,
    status: "미출근",
    lastAttendance: "2025-01-23",
  },
]

export const mockSettlements: Settlement[] = [
  {
    id: "st1",
    type: "직불",
    siteName: "강남 오피스텔 신축현장",
    workerName: "김철수",
    amount: 250000,
    status: "지급대기",
    date: "2025-01-28",
  },
  {
    id: "st2",
    type: "대불",
    siteName: "판교 테크노밸리 2차",
    workerName: "이영희",
    amount: 180000,
    status: "청구대기",
    date: "2025-01-27",
  },
  {
    id: "st3",
    type: "팀",
    siteName: "강남 오피스텔 신축현장",
    teamLeaderName: "김철수",
    amount: 820000,
    status: "지급대기",
    date: "2025-01-28",
  },
  {
    id: "st4",
    type: "직불",
    siteName: "송파 아파트 리모델링",
    workerName: "박민수",
    amount: 12500000,
    status: "미수금",
    date: "2025-01-20",
  },
  {
    id: "st5",
    type: "대불",
    siteName: "인천 물류센터 증축",
    workerName: "최동훈",
    amount: 95000000,
    status: "청구대기",
    date: "2025-01-26",
  },
]

export const mockRecords: Record[] = [
  {
    id: "rec1",
    timestamp: "2025-01-28T09:15:00",
    siteId: "s1",
    siteName: "강남 오피스텔 신축현장",
    workerId: "w1",
    workerName: "김철수",
    eventType: "출근",
    summary: "정상 출근 확인",
    status: "완료",
  },
  {
    id: "rec2",
    timestamp: "2025-01-28T09:20:00",
    siteId: "s1",
    siteName: "강남 오피스텔 신축현장",
    workerId: "w2",
    workerName: "이영희",
    eventType: "출근",
    summary: "정상 출근 확인",
    status: "완료",
  },
  {
    id: "rec3",
    timestamp: "2025-01-28T08:30:00",
    siteId: "s2",
    siteName: "판교 테크노밸리 2차",
    workerId: "w6",
    workerName: "한미영",
    eventType: "배치",
    summary: "신규 인력 배치",
    status: "완료",
  },
  {
    id: "rec4",
    timestamp: "2025-01-27T18:00:00",
    siteId: "s1",
    siteName: "강남 오피스텔 신축현장",
    eventType: "정산",
    summary: "일일 정산 처리",
    amount: 2500000,
    status: "완료",
  },
  {
    id: "rec5",
    timestamp: "2025-01-27T14:30:00",
    siteId: "s3",
    siteName: "송파 아파트 리모델링",
    eventType: "이슈",
    summary: "자재 배송 지연",
    status: "처리중",
  },
  {
    id: "rec6",
    timestamp: "2025-01-26T17:45:00",
    siteId: "s4",
    siteName: "인천 물류센터 증축",
    workerId: "w5",
    workerName: "최동훈",
    eventType: "퇴근",
    summary: "조기 퇴근 (사유: 개인사정)",
    status: "완료",
  },
]

export const kpiData = {
  진행중현장: 3,
  배치완료현장: 1,
  오늘출근인원: 47,
  대기인력: 12,
  지급대기: 25430000,
  청구대기: 120500000,
  미수금: 82300000,
  미해결이슈: 3,
}
