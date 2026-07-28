import type {
  Branch, BranchInput, Channel, ConsultationRow, DashboardData, ExpiringRow,
  LowSessionRow, MemberDetail, MemberRow, NewMemberInput, Product, ProductInput,
  Staff, StaffInput, StaffRow,
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

  // ── 설정 ─────────────────────────────────────────────────────────
  // 지점·상품·직원은 관장이 직접 고칠 수 있어야 한다.
  // 가격 하나 바꾸려고 DB 화면에 들어가야 한다면 쓰지 않게 된다.

  /** 비활성 포함 전체 (설정 화면용) */
  listAllBranches(): Promise<(Branch & { isActive: boolean })[]>
  createBranch(input: BranchInput): Promise<void>
  updateBranch(id: string, input: BranchInput): Promise<void>

  listAllProducts(): Promise<Product[]>
  createProduct(input: ProductInput): Promise<void>
  updateProduct(id: string, input: ProductInput): Promise<void>

  listStaff(): Promise<StaffRow[]>
  updateStaff(id: string, input: StaffInput): Promise<void>

  createChannel(name: string): Promise<void>
}
