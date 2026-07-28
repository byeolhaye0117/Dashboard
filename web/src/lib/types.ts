// DB 스키마(supabase/migrations/0001_init.sql)와 1:1로 맞춘 타입

export type Role = 'owner' | 'manager' | 'desk' | 'trainer'
export type ProductKind = 'membership' | 'pt' | 'group' | 'addon'
export type ContractStatus =
  | 'active' | 'suspended' | 'completed' | 'expired'
  | 'cancelled' | 'refunded' | 'transferred_out'
export type PayMethod = 'card' | 'cash' | 'transfer' | 'other'
export type SessionStatus = 'completed' | 'noshow' | 'cancelled'
export type ConsultResult = 'pending' | 'registered' | 'hold' | 'lost'

export interface Branch {
  id: string
  code: string
  name: string
}

export interface Staff {
  id: string
  branchId: string | null
  name: string
  role: Role
}

export interface Product {
  id: string
  branchId: string | null
  name: string
  kind: ProductKind
  durationDays: number | null
  sessionCount: number | null
  listPrice: number
  isActive: boolean
}

/** 설정 화면에서 지점·상품·직원을 고칠 때 쓰는 모양 */
export interface BranchInput {
  code: string
  name: string
  isActive: boolean
}

export interface ProductInput {
  branchId: string | null
  name: string
  kind: ProductKind
  durationDays: number | null
  sessionCount: number | null
  listPrice: number
  isActive: boolean
}

export interface StaffRow extends Staff {
  isActive: boolean
  branchName: string | null
}

export interface StaffInput {
  branchId: string | null
  name: string
  role: Role
  isActive: boolean
}

export interface Member {
  id: string
  branchId: string
  name: string
  phone: string | null
  gender: 'M' | 'F' | 'other' | null
  birthYear: number | null
  channelId: string | null
  firstRegisteredOn: string
  memo: string | null
}

export interface Contract {
  id: string
  memberId: string
  branchId: string
  productId: string
  trainerId: string | null
  startedOn: string
  endsOn: string | null
  totalSessions: number | null
  usedSessions: number
  contractPrice: number
  status: ContractStatus
}

export interface Payment {
  id: string
  contractId: string
  memberId: string
  branchId: string
  kind: 'payment' | 'refund'
  amount: number
  paidOn: string
  method: PayMethod
}

export interface Consultation {
  id: string
  branchId: string
  name: string
  phone: string | null
  channelId: string | null
  consultedOn: string
  result: ConsultResult
  registeredMemberId: string | null
  nextContactOn: string | null
  memo: string | null
}

export interface Channel {
  id: string
  name: string
}

// ── 화면이 실제로 요구하는 모양 ────────────────────────────────────

/** 전월 대비를 함께 담는다. 숫자 하나만으로는 판단이 안 되기 때문이다. */
export interface Kpi {
  value: number
  prev: number
}

export interface DashboardData {
  month: string
  /**
   * 조회한 달이 아직 진행 중인가.
   * 7월 28일에 7월을 보면 28일치와 지난달 31일치를 비교하게 되는데,
   * 그러면 매출이 항상 폭락한 것처럼 보인다. 그래서 진행 중인 달은
   * 전월 같은 기간(1일~28일)과 비교하고, 화면에도 그 사실을 밝힌다.
   */
  partial: boolean
  /** 진행 중인 달일 때 비교 기준일 (예: '2026-07-28') */
  asOf: string | null
  revenue: Kpi
  newMembers: Kpi
  expiringSoon: number
  conversionRate: Kpi
  byBranch: { branchId: string; branchName: string; revenue: number }[]
  trend: { month: string; revenue: number }[]
  todo: {
    expiringIn7: number
    holdConsultDue: number
    lowSession: number
  }
}

export interface ExpiringRow {
  contractId: string
  memberId: string
  memberName: string
  memberPhone: string | null
  branchName: string
  productName: string
  endsOn: string
  daysLeft: number
}

export interface LowSessionRow {
  contractId: string
  memberId: string
  memberName: string
  memberPhone: string | null
  branchName: string
  trainerName: string | null
  totalSessions: number
  usedSessions: number
  sessionsLeft: number
}

export interface MemberRow extends Member {
  branchName: string
  channelName: string | null
  activeContract: {
    productName: string
    endsOn: string | null
    daysLeft: number | null
    sessionsLeft: number | null
  } | null
  totalPaid: number
}

export interface MemberDetail {
  member: MemberRow
  contracts: (Contract & { productName: string; productKind: ProductKind })[]
  payments: Payment[]
  sessions: { id: string; sessionAt: string; status: SessionStatus; trainerName: string }[]
}

export interface ConsultationRow extends Consultation {
  branchName: string
  channelName: string | null
}

export interface NewMemberInput {
  branchId: string
  name: string
  phone: string
  gender: 'M' | 'F' | 'other' | null
  birthYear: number | null
  channelId: string | null
  memo: string
  productId: string
  startedOn: string
  contractPrice: number
  paidAmount: number
  method: PayMethod
  trainerId: string | null
  /** 상담에서 전환된 경우 그 상담 id */
  fromConsultationId?: string | null
}
