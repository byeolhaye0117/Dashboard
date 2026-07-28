import type {
  Branch, Channel, ConsultationRow, DashboardData, ExpiringRow,
  LowSessionRow, MemberDetail, MemberRow, NewMemberInput, Product, Staff,
} from '../lib/types'

/**
 * 화면이 데이터를 얻는 유일한 통로.
 * 구현이 Supabase든 데모든 화면 코드는 달라지지 않는다.
 */
export interface DataSource {
  readonly mode: 'supabase' | 'demo'

  listBranches(): Promise<Branch[]>
  listProducts(branchId: string | null): Promise<Product[]>
  listChannels(): Promise<Channel[]>
  listTrainers(branchId: string | null): Promise<Staff[]>

  /** branchId가 null이면 전 지점 합산 */
  getDashboard(branchId: string | null, month: string): Promise<DashboardData>

  listExpiring(branchId: string | null, withinDays: number): Promise<ExpiringRow[]>
  listLowSessions(branchId: string | null): Promise<LowSessionRow[]>

  listMembers(branchId: string | null, query: string): Promise<MemberRow[]>
  getMember(id: string): Promise<MemberDetail | null>

  listConsultations(branchId: string | null, month: string): Promise<ConsultationRow[]>

  createMemberWithContract(input: NewMemberInput): Promise<{ memberId: string }>
  setConsultationResult(
    id: string,
    result: ConsultationRow['result'],
    nextContactOn?: string | null,
  ): Promise<void>
}
