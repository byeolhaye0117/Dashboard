import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  Branch, Channel, ConsultationRow, Contract, DashboardData, ExpiringRow,
  LowSessionRow, MemberDetail, MemberRow, NewMemberInput, Payment, Product,
  ProductKind, SessionStatus, Staff, StaffRow,
} from '../lib/types'
import { addDays, addMonths, daysBetween, monthRange, prevComparableRange, ymd } from '../lib/format'
import type { DataSource } from './api'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null

function client(): SupabaseClient {
  if (!supabase) throw new Error('Supabase가 설정되지 않았습니다')
  return supabase
}

/** 실패를 조용히 삼키면 화면에 0이 뜬다. 0과 "못 가져옴"은 완전히 다르다. */
function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(friendly(res.error.message))
  if (res.data === null) throw new Error('데이터를 받지 못했습니다')
  return res.data
}

/**
 * DB가 뱉는 영어 오류를 사람이 읽을 수 있는 말로 바꾼다.
 *
 * "duplicate key value violates unique constraint products_name_common_uniq"
 * 를 그대로 띄우면 데스크는 무엇을 고쳐야 할지 알 수 없다.
 * 원문은 뒤에 붙여 남긴다 — 개발자가 볼 때 필요하다.
 */
function friendly(raw: string): string {
  const rules: [RegExp, string][] = [
    [/branches_code_key/, '같은 지점 코드가 이미 있습니다. 다른 코드를 쓰세요.'],
    [/products_name_(common|branch)_uniq/, '같은 이름의 상품이 이미 있습니다.'],
    [/acquisition_channels_name_key/, '같은 이름의 유입경로가 이미 있습니다.'],
    [/products_has_measure/, '기간(일) 또는 횟수 중 하나는 반드시 입력해야 합니다.'],
    [/payments_sign_ok/, '환불 금액은 음수로, 결제 금액은 양수로 넣어야 합니다.'],
    [/contracts_sessions_ok/, '사용 횟수가 총 횟수를 넘을 수 없습니다.'],
    [/violates foreign key/, '연결된 항목을 찾을 수 없습니다. 지점이나 상품을 다시 확인하세요.'],
    [/violates row-level security|permission denied/, '권한이 없습니다. 관장 계정으로 로그인했는지 확인하세요.'],
    [/duplicate key/, '이미 있는 값입니다.'],
    [/JWT|not authenticated/, '로그인이 만료되었습니다. 새로고침 후 다시 로그인하세요.'],
    [/Failed to fetch|NetworkError/, '서버에 연결하지 못했습니다. 인터넷 연결을 확인하세요.'],
  ]
  for (const [re, msg] of rules) if (re.test(raw)) return msg
  return raw
}

let branchCache: Branch[] | null = null
async function branches(): Promise<Branch[]> {
  if (!branchCache) {
    branchCache = unwrap(
      await client().from('branches').select('id, code, name')
        .eq('is_active', true).order('sort_order'),
    ) as Branch[]
  }
  return branchCache
}
const nameOf = (list: Branch[], id: string) => list.find((b) => b.id === id)?.name ?? ''

const monthStart = (m: string) => `${m.slice(0, 7)}-01`
const monthEnd = (m: string) => addMonths(monthStart(m), 1)

/*
 * 진행 중인 달은 "오늘까지"만 집계하고 전월 같은 기간과 비교한다.
 * 그래서 월 단위 뷰(v_monthly_revenue)가 아니라 원본 테이블을
 * 날짜 구간으로 직접 조회한다. 뷰는 지난 달 추이용으로만 쓴다.
 */
async function sumRevenueIn(branchId: string | null, from: string, to: string): Promise<number> {
  let q = client().from('payments').select('amount')
    .gte('paid_on', from).lte('paid_on', to)
  if (branchId) q = q.eq('branch_id', branchId)
  const rows = unwrap(await q) as { amount: number }[]
  return rows.reduce((s, r) => s + Number(r.amount), 0)
}

async function countNewMembersIn(branchId: string | null, from: string, to: string): Promise<number> {
  let q = client().from('members').select('id', { count: 'exact', head: true })
    .gte('first_registered_on', from).lte('first_registered_on', to)
    .is('anonymized_at', null)
  if (branchId) q = q.eq('branch_id', branchId)
  const { count, error } = await q
  if (error) throw new Error(friendly(error.message))
  return count ?? 0
}

async function conversionIn(branchId: string | null, from: string, to: string): Promise<number> {
  let q = client().from('consultations').select('result')
    .gte('consulted_on', from).lte('consulted_on', to)
  if (branchId) q = q.eq('branch_id', branchId)
  const rows = unwrap(await q) as { result: string }[]
  if (rows.length === 0) return 0
  return (rows.filter((r) => r.result === 'registered').length / rows.length) * 100
}

export const supabaseSource: DataSource = {
  mode: 'supabase',

  async listBranches() { return branches() },

  async listProducts(branchId) {
    let q = client().from('products')
      .select('id, branch_id, name, kind, duration_days, session_count, list_price, is_active')
      .eq('is_active', true).order('sort_order').order('list_price')
    if (branchId) q = q.or(`branch_id.is.null,branch_id.eq.${branchId}`)
    const rows = unwrap(await q) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as string, branchId: (r.branch_id as string) ?? null, name: r.name as string,
      kind: r.kind as ProductKind, durationDays: (r.duration_days as number) ?? null,
      sessionCount: (r.session_count as number) ?? null, listPrice: Number(r.list_price),
      isActive: r.is_active as boolean,
    })) satisfies Product[]
  },

  async listChannels() {
    const rows = unwrap(
      await client().from('acquisition_channels').select('id, name')
        .eq('is_active', true).order('sort_order'),
    ) as Channel[]
    return rows
  },

  async listTrainers(branchId) {
    let q = client().from('staff').select('id, branch_id, name, role')
      .eq('role', 'trainer').eq('is_active', true).order('name')
    if (branchId) q = q.eq('branch_id', branchId)
    const rows = unwrap(await q) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as string, branchId: (r.branch_id as string) ?? null,
      name: r.name as string, role: 'trainer' as const,
    })) satisfies Staff[]
  },

  async getDashboard(branchId, month) {
    const cur = monthRange(month)
    const prev = prevComparableRange(month)
    const brs = await branches()
    const trendFrom = addMonths(monthStart(month), -11)

    let trendQ = client().from('v_monthly_revenue').select('month, revenue')
      .gte('month', trendFrom).lte('month', monthStart(month))
    if (branchId) trendQ = trendQ.eq('branch_id', branchId)

    // 지점별은 조회 구간(진행 중인 달이면 오늘까지)으로 직접 집계한다
    let byBranchQ = client().from('payments').select('branch_id, amount')
      .gte('paid_on', cur.from).lte('paid_on', cur.to)
    if (branchId) byBranchQ = byBranchQ.eq('branch_id', branchId)

    const [rev, revPrev, nm, nmPrev, cv, cvPrev, expiring30, expiring7, low, trendRows, byBranchRows, holdDue] =
      await Promise.all([
        sumRevenueIn(branchId, cur.from, cur.to),
        sumRevenueIn(branchId, prev.from, prev.to),
        countNewMembersIn(branchId, cur.from, cur.to),
        countNewMembersIn(branchId, prev.from, prev.to),
        conversionIn(branchId, cur.from, cur.to),
        conversionIn(branchId, prev.from, prev.to),
        this.listExpiring(branchId, 30),
        this.listExpiring(branchId, 7),
        this.listLowSessions(branchId),
        trendQ.then((r) => unwrap(r) as { month: string; revenue: number }[]),
        byBranchQ.then((r) => unwrap(r) as { branch_id: string; amount: number }[]),
        (async () => {
          // 재연락일이 지난 지 7일 이내인 것만. 기한 없이 누적하면
          // 수백 건짜리 목록이 되어 아무도 손대지 않는다.
          const today = ymd(new Date())
          let q = client().from('consultations').select('id', { count: 'exact', head: true })
            .eq('result', 'hold')
            .gte('next_contact_on', addDays(today, -7))
            .lte('next_contact_on', today)
          if (branchId) q = q.eq('branch_id', branchId)
          const { count, error } = await q
          if (error) throw new Error(friendly(error.message))
          return count ?? 0
        })(),
      ])

    const trendMap = new Map<string, number>()
    for (const r of trendRows) {
      const k = String(r.month).slice(0, 7)
      trendMap.set(k, (trendMap.get(k) ?? 0) + Number(r.revenue))
    }
    // 진행 중인 달은 뷰(월 전체)가 아니라 오늘까지 값으로 덮어쓴다
    if (cur.partial) trendMap.set(month.slice(0, 7), rev)

    const branchMap = new Map<string, number>()
    for (const r of byBranchRows) {
      branchMap.set(r.branch_id, (branchMap.get(r.branch_id) ?? 0) + Number(r.amount))
    }

    return {
      month,
      partial: cur.partial,
      asOf: cur.partial ? cur.to : null,
      revenue: { value: rev, prev: revPrev },
      newMembers: { value: nm, prev: nmPrev },
      expiringSoon: expiring30.length,
      conversionRate: { value: cv, prev: cvPrev },
      byBranch: (branchId ? brs.filter((b) => b.id === branchId) : brs)
        .map((b) => ({ branchId: b.id, branchName: b.name, revenue: branchMap.get(b.id) ?? 0 }))
        .sort((a, b) => b.revenue - a.revenue),
      trend: Array.from({ length: 12 }, (_, i) => {
        const m = addMonths(monthStart(month), -(11 - i))
        return { month: m, revenue: trendMap.get(m.slice(0, 7)) ?? 0 }
      }),
      todo: {
        expiringIn7: expiring7.length,
        holdConsultDue: holdDue,
        lowSession: low.length,
      },
    } satisfies DashboardData
  },

  async listExpiring(branchId, withinDays) {
    const brs = await branches()
    let q = client().from('v_expiring_contracts')
      .select('contract_id, branch_id, member_id, member_name, member_phone, product_name, ends_on, days_left')
      .lte('days_left', withinDays).order('days_left')
    if (branchId) q = q.eq('branch_id', branchId)
    const rows = unwrap(await q) as Record<string, unknown>[]
    return rows.map((r) => ({
      contractId: r.contract_id as string, memberId: r.member_id as string,
      memberName: r.member_name as string, memberPhone: (r.member_phone as string) ?? null,
      branchName: nameOf(brs, r.branch_id as string), productName: r.product_name as string,
      endsOn: String(r.ends_on), daysLeft: Number(r.days_left),
    })) satisfies ExpiringRow[]
  },

  async listLowSessions(branchId) {
    const brs = await branches()
    let q = client().from('v_low_session_contracts')
      .select('contract_id, branch_id, member_id, member_name, member_phone, trainer_id, total_sessions, used_sessions, sessions_left')
      .order('sessions_left')
    if (branchId) q = q.eq('branch_id', branchId)
    const rows = unwrap(await q) as Record<string, unknown>[]
    const trainers = await this.listTrainers(null)
    return rows.map((r) => ({
      contractId: r.contract_id as string, memberId: r.member_id as string,
      memberName: r.member_name as string, memberPhone: (r.member_phone as string) ?? null,
      branchName: nameOf(brs, r.branch_id as string),
      trainerName: trainers.find((t) => t.id === r.trainer_id)?.name ?? null,
      totalSessions: Number(r.total_sessions), usedSessions: Number(r.used_sessions),
      sessionsLeft: Number(r.sessions_left),
    })) satisfies LowSessionRow[]
  },

  async listMembers(branchId, query) {
    const brs = await branches()
    const chs = await this.listChannels()
    let q = client().from('members')
      .select('id, branch_id, name, phone, gender, birth_year, acquisition_channel_id, first_registered_on, memo')
      .order('name').limit(300)
    if (branchId) q = q.eq('branch_id', branchId)
    const t = query.trim()
    if (t) q = q.or(`name.ilike.%${t}%,phone.ilike.%${t}%`)
    const rows = unwrap(await q) as Record<string, unknown>[]
    if (rows.length === 0) return []

    const ids = rows.map((r) => r.id as string)
    const [cts, pays] = await Promise.all([
      client().from('contracts')
        .select('id, member_id, branch_id, product_id, trainer_id, started_on, ends_on, total_sessions, used_sessions, contract_price, status, products(name)')
        .in('member_id', ids).eq('status', 'active')
        .then((r) => unwrap(r) as Record<string, unknown>[]),
      client().from('payments').select('member_id, amount')
        .in('member_id', ids)
        .then((r) => unwrap(r) as { member_id: string; amount: number }[]),
    ])

    const paidBy = new Map<string, number>()
    for (const p of pays) paidBy.set(p.member_id, (paidBy.get(p.member_id) ?? 0) + Number(p.amount))
    const today = ymd(new Date())

    return rows.map((r) => {
      const c = cts.find((x) => x.member_id === r.id)
      const endsOn = c?.ends_on ? String(c.ends_on) : null
      const total = c?.total_sessions as number | null | undefined
      return {
        id: r.id as string, branchId: r.branch_id as string, name: r.name as string,
        phone: (r.phone as string) ?? null, gender: (r.gender as MemberRow['gender']) ?? null,
        birthYear: (r.birth_year as number) ?? null,
        channelId: (r.acquisition_channel_id as string) ?? null,
        firstRegisteredOn: String(r.first_registered_on), memo: (r.memo as string) ?? null,
        branchName: nameOf(brs, r.branch_id as string),
        channelName: chs.find((x) => x.id === r.acquisition_channel_id)?.name ?? null,
        activeContract: c
          ? {
              productName: ((c.products as { name?: string } | null)?.name) ?? '',
              endsOn,
              daysLeft: endsOn ? daysBetween(today, endsOn) : null,
              sessionsLeft: total != null ? total - Number(c.used_sessions) : null,
            }
          : null,
        totalPaid: paidBy.get(r.id as string) ?? 0,
      } satisfies MemberRow
    })
  },

  async getMember(id) {
    const list = await this.listMembers(null, '')
    const row = list.find((m) => m.id === id)
    if (!row) return null

    const [cts, pays, sess] = await Promise.all([
      client().from('contracts')
        .select('id, member_id, branch_id, product_id, trainer_id, started_on, ends_on, total_sessions, used_sessions, contract_price, status, products(name, kind)')
        .eq('member_id', id).order('started_on', { ascending: false })
        .then((r) => unwrap(r) as Record<string, unknown>[]),
      client().from('payments')
        .select('id, contract_id, member_id, branch_id, kind, amount, paid_on, method')
        .eq('member_id', id).order('paid_on', { ascending: false })
        .then((r) => unwrap(r) as Record<string, unknown>[]),
      client().from('pt_sessions')
        .select('id, session_at, status, staff(name)')
        .eq('member_id', id).order('session_at', { ascending: false })
        .then((r) => unwrap(r) as Record<string, unknown>[]),
    ])

    return {
      member: row,
      contracts: cts.map((c) => ({
        id: c.id as string, memberId: c.member_id as string, branchId: c.branch_id as string,
        productId: c.product_id as string, trainerId: (c.trainer_id as string) ?? null,
        startedOn: String(c.started_on), endsOn: c.ends_on ? String(c.ends_on) : null,
        totalSessions: (c.total_sessions as number) ?? null,
        usedSessions: Number(c.used_sessions), contractPrice: Number(c.contract_price),
        status: c.status as Contract['status'],
        productName: ((c.products as { name?: string } | null)?.name) ?? '',
        productKind: (((c.products as { kind?: string } | null)?.kind) ?? 'membership') as ProductKind,
      })),
      payments: pays.map((p) => ({
        id: p.id as string, contractId: p.contract_id as string,
        memberId: p.member_id as string, branchId: p.branch_id as string,
        kind: p.kind as Payment['kind'], amount: Number(p.amount),
        paidOn: String(p.paid_on), method: p.method as Payment['method'],
      })),
      sessions: sess.map((s) => ({
        id: s.id as string, sessionAt: String(s.session_at),
        status: s.status as SessionStatus,
        trainerName: ((s.staff as { name?: string } | null)?.name) ?? '',
      })),
    } satisfies MemberDetail
  },

  async listConsultations(branchId, month) {
    const brs = await branches()
    const chs = await this.listChannels()
    let q = client().from('consultations')
      .select('id, branch_id, name, phone, acquisition_channel_id, consulted_on, result, registered_member_id, next_contact_on, memo')
      .gte('consulted_on', monthStart(month)).lt('consulted_on', monthEnd(month))
      .order('consulted_on', { ascending: false })
    if (branchId) q = q.eq('branch_id', branchId)
    const rows = unwrap(await q) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as string, branchId: r.branch_id as string, name: r.name as string,
      phone: (r.phone as string) ?? null,
      channelId: (r.acquisition_channel_id as string) ?? null,
      consultedOn: String(r.consulted_on), result: r.result as ConsultationRow['result'],
      registeredMemberId: (r.registered_member_id as string) ?? null,
      nextContactOn: r.next_contact_on ? String(r.next_contact_on) : null,
      memo: (r.memo as string) ?? null,
      branchName: nameOf(brs, r.branch_id as string),
      channelName: chs.find((c) => c.id === r.acquisition_channel_id)?.name ?? null,
    })) satisfies ConsultationRow[]
  },

  async createMemberWithContract(input: NewMemberInput) {
    // 회원·계약·결제·상담전환을 DB 함수 하나로 처리한다.
    // 앱에서 나눠 보내면 중간 실패 시 유령 회원이 남는다.
    const { data, error } = await client().rpc('register_member', {
      p_branch_id: input.branchId,
      p_name: input.name,
      p_product_id: input.productId,
      p_started_on: input.startedOn,
      p_contract_price: input.contractPrice,
      p_paid_amount: input.paidAmount,
      p_method: input.method,
      p_phone: input.phone || null,
      p_gender: input.gender,
      p_birth_year: input.birthYear,
      p_channel_id: input.channelId,
      p_memo: input.memo || null,
      p_trainer_id: input.trainerId,
      p_consultation_id: input.fromConsultationId ?? null,
    })
    if (error) throw new Error(friendly(error.message))
    return { memberId: data as string }
  },

  async setConsultationResult(id, result, nextContactOn) {
    const { error } = await client().from('consultations')
      .update({ result, next_contact_on: nextContactOn ?? null }).eq('id', id)
    if (error) throw new Error(friendly(error.message))
  },

  // ── 설정 ─────────────────────────────────────────────────────────
  async listAllBranches() {
    const rows = unwrap(
      await client().from('branches').select('id, code, name, is_active').order('sort_order'),
    ) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as string, code: r.code as string, name: r.name as string,
      isActive: r.is_active as boolean,
    }))
  },

  async createBranch(input) {
    const { error } = await client().from('branches')
      .insert({ code: input.code, name: input.name, is_active: input.isActive })
    if (error) throw new Error(friendly(error.message))
    branchCache = null
  },

  async updateBranch(id, input) {
    const { error } = await client().from('branches')
      .update({ code: input.code, name: input.name, is_active: input.isActive }).eq('id', id)
    if (error) throw new Error(friendly(error.message))
    branchCache = null
  },

  async listAllProducts() {
    const rows = unwrap(
      await client().from('products')
        .select('id, branch_id, name, kind, duration_days, session_count, list_price, is_active')
        .order('sort_order').order('list_price'),
    ) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as string, branchId: (r.branch_id as string) ?? null, name: r.name as string,
      kind: r.kind as Product['kind'], durationDays: (r.duration_days as number) ?? null,
      sessionCount: (r.session_count as number) ?? null, listPrice: Number(r.list_price),
      isActive: r.is_active as boolean,
    }))
  },

  async createProduct(input) {
    const { error } = await client().from('products').insert({
      branch_id: input.branchId, name: input.name, kind: input.kind,
      duration_days: input.durationDays, session_count: input.sessionCount,
      list_price: input.listPrice, is_active: input.isActive,
    })
    if (error) throw new Error(friendly(error.message))
  },

  async updateProduct(id, input) {
    const { error } = await client().from('products').update({
      branch_id: input.branchId, name: input.name, kind: input.kind,
      duration_days: input.durationDays, session_count: input.sessionCount,
      list_price: input.listPrice, is_active: input.isActive,
    }).eq('id', id)
    if (error) throw new Error(friendly(error.message))
  },

  async listStaff() {
    const brs = await branches()
    const rows = unwrap(
      await client().from('staff').select('id, branch_id, name, role, is_active').order('name'),
    ) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as string, branchId: (r.branch_id as string) ?? null,
      name: r.name as string, role: r.role as StaffRow['role'],
      isActive: r.is_active as boolean,
      branchName: r.branch_id ? nameOf(brs, r.branch_id as string) : null,
    }))
  },

  async updateStaff(id, input) {
    const { error } = await client().from('staff').update({
      branch_id: input.branchId, name: input.name,
      role: input.role, is_active: input.isActive,
    }).eq('id', id)
    if (error) throw new Error(friendly(error.message))
  },

  async createChannel(name) {
    const { error } = await client().from('acquisition_channels').insert({ name })
    if (error) throw new Error(friendly(error.message))
  },
}
