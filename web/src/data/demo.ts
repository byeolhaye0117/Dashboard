/**
 * 데모 데이터 소스.
 *
 * Supabase 설정 없이도 화면을 그대로 볼 수 있게 하려고 만든 것이다.
 * 실제 운영에서는 supabase.ts 가 쓰인다. 숫자는 매번 같게 나오도록
 * 시드 난수를 쓴다 — 새로고침마다 매출이 바뀌면 화면을 검토할 수 없다.
 */
import type {
  Branch, Channel, ConsultationRow, ConsultResult, Contract, DashboardData,
  ExpiringRow, LowSessionRow, Member, MemberDetail, MemberRow, NewMemberInput,
  Payment, Product, SessionStatus, Staff,
} from '../lib/types'
import { addDays, addMonths, daysBetween, monthRange, prevComparableRange, ymd } from '../lib/format'
import type { DataSource } from './api'

// ── 시드 난수 ────────────────────────────────────────────────────────
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20260728)
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)] as T
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1))

const TODAY = ymd(new Date())

// ── 마스터 데이터 ────────────────────────────────────────────────────
const BRANCHES: Branch[] = [
  { id: 'br1', code: 'GN', name: '강남점' },
  { id: 'br2', code: 'SW', name: '수원점' },
  { id: 'br3', code: 'BC', name: '부천점' },
  { id: 'br4', code: 'IS', name: '일산점' },
  { id: 'br5', code: 'SD', name: '송도점' },
]

const CHANNELS: Channel[] = [
  { id: 'ch1', name: '네이버 블로그' },
  { id: 'ch2', name: '당근' },
  { id: 'ch3', name: '지인 소개' },
  { id: 'ch4', name: '간판 보고' },
  { id: 'ch5', name: '인스타그램' },
  { id: 'ch6', name: '재등록' },
]

const PRODUCTS: Product[] = [
  { id: 'p1', branchId: null, name: '헬스 1개월', kind: 'membership', durationDays: 30, sessionCount: null, listPrice: 90_000 },
  { id: 'p2', branchId: null, name: '헬스 3개월', kind: 'membership', durationDays: 90, sessionCount: null, listPrice: 240_000 },
  { id: 'p3', branchId: null, name: '헬스 6개월', kind: 'membership', durationDays: 180, sessionCount: null, listPrice: 420_000 },
  { id: 'p4', branchId: null, name: '헬스 12개월', kind: 'membership', durationDays: 365, sessionCount: null, listPrice: 690_000 },
  { id: 'p5', branchId: null, name: 'PT 10회', kind: 'pt', durationDays: null, sessionCount: 10, listPrice: 750_000 },
  { id: 'p6', branchId: null, name: 'PT 20회', kind: 'pt', durationDays: null, sessionCount: 20, listPrice: 1_400_000 },
  { id: 'p7', branchId: null, name: 'PT 30회', kind: 'pt', durationDays: null, sessionCount: 30, listPrice: 1_950_000 },
  { id: 'p8', branchId: null, name: '락커 3개월', kind: 'addon', durationDays: 90, sessionCount: null, listPrice: 60_000 },
  { id: 'p9', branchId: null, name: '운동복 3개월', kind: 'addon', durationDays: 90, sessionCount: null, listPrice: 45_000 },
  { id: 'p10', branchId: null, name: '필라테스 8회', kind: 'group', durationDays: null, sessionCount: 8, listPrice: 320_000 },
]

const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '전']
const GIVEN = ['민준', '서연', '지호', '서윤', '도윤', '지우', '예준', '하윤', '주원', '지민', '시우', '수아', '건우', '지아', '우진', '채원', '선우', '다은', '연우', '유진', '현우', 'soo', '민서', '준서', '지훈', '예은', '태윤', '가은']

const TRAINERS: Staff[] = BRANCHES.flatMap((b, bi) =>
  ['박', '이', '최'].map((s, i) => ({
    id: `tr${bi}${i}`,
    branchId: b.id,
    name: `${s}트레이너`,
    role: 'trainer' as const,
  })),
)

// ── 생성 ─────────────────────────────────────────────────────────────
const members: Member[] = []
const contracts: Contract[] = []
const payments: Payment[] = []
const sessions: { id: string; contractId: string; memberId: string; branchId: string; trainerId: string; sessionAt: string; status: SessionStatus; deducted: boolean }[] = []
const consultations: ConsultationRow[] = []

let seq = 0
const id = (p: string) => `${p}${++seq}`

/** 지점마다 체급이 다르다. 전부 똑같으면 지점 비교 화면이 의미가 없다. */
const BRANCH_WEIGHT: Record<string, number> = { br1: 1.35, br2: 1.0, br3: 0.85, br4: 0.95, br5: 0.7 }

for (const br of BRANCHES) {
  const weight = BRANCH_WEIGHT[br.id] ?? 1
  const memberCount = Math.round(150 * weight)
  const brTrainers = TRAINERS.filter((t) => t.branchId === br.id)

  for (let i = 0; i < memberCount; i++) {
    const mid = id('m')
    // 최초 등록: 최근 18개월 사이
    const firstOn = addDays(TODAY, -int(5, 540))
    const m: Member = {
      id: mid,
      branchId: br.id,
      name: `${pick(SURNAMES)}${pick(GIVEN)}`,
      phone: `010-${String(int(1000, 9999))}-${String(int(1000, 9999))}`,
      gender: rnd() < 0.52 ? 'F' : 'M',
      birthYear: int(1968, 2006),
      channelId: pick(CHANNELS).id,
      firstRegisteredOn: firstOn,
      memo: null,
    }
    members.push(m)

    // 계약 1~3건 — 재등록을 표현하기 위해 이어서 붙인다
    const n = rnd() < 0.35 ? 2 : rnd() < 0.12 ? 3 : 1
    let cursor = firstOn
    for (let k = 0; k < n; k++) {
      const prod = rnd() < 0.72
        ? pick(PRODUCTS.filter((p) => p.kind === 'membership'))
        : rnd() < 0.75
          ? pick(PRODUCTS.filter((p) => p.kind === 'pt'))
          : pick(PRODUCTS.filter((p) => p.kind === 'addon' || p.kind === 'group'))

      const startedOn = cursor
      const endsOn = prod.durationDays ? addDays(startedOn, prod.durationDays) : null
      const discount = rnd() < 0.3 ? Math.round((prod.listPrice * int(5, 15)) / 100 / 1000) * 1000 : 0
      const price = prod.listPrice - discount

      const isLast = k === n - 1
      const expired = endsOn ? daysBetween(endsOn, TODAY) > 0 : false
      const cid = id('c')

      const totalSessions = prod.sessionCount
      let used = 0
      const trainerId = prod.kind === 'pt' && brTrainers.length > 0
        ? (pick(brTrainers).id)
        : null

      if (totalSessions) {
        // 오래된 계약일수록 많이 소진돼 있다
        const age = daysBetween(startedOn, TODAY)
        const ratio = Math.min(1, Math.max(0, age / 150) * (0.6 + rnd() * 0.6))
        used = Math.min(totalSessions, Math.round(totalSessions * ratio))
      }

      const status: Contract['status'] =
        !isLast ? 'completed'
          : totalSessions ? (used >= totalSessions ? 'completed' : 'active')
            : expired ? 'expired' : 'active'

      contracts.push({
        id: cid, memberId: mid, branchId: br.id, productId: prod.id,
        trainerId, startedOn, endsOn, totalSessions, usedSessions: used,
        contractPrice: price, status,
      })

      // 결제 — 30%는 2회 분할
      if (rnd() < 0.3) {
        const first = Math.round(price * 0.6 / 10_000) * 10_000
        payments.push({ id: id('pay'), contractId: cid, memberId: mid, branchId: br.id, kind: 'payment', amount: first, paidOn: startedOn, method: 'card' })
        payments.push({ id: id('pay'), contractId: cid, memberId: mid, branchId: br.id, kind: 'payment', amount: price - first, paidOn: addDays(startedOn, int(20, 40)), method: rnd() < 0.5 ? 'transfer' : 'card' })
      } else {
        payments.push({ id: id('pay'), contractId: cid, memberId: mid, branchId: br.id, kind: 'payment', amount: price, paidOn: startedOn, method: rnd() < 0.75 ? 'card' : rnd() < 0.6 ? 'cash' : 'transfer' })
      }
      // 3% 중도 환불
      if (rnd() < 0.03) {
        const refund = -Math.round(price * (0.3 + rnd() * 0.4) / 10_000) * 10_000
        payments.push({ id: id('pay'), contractId: cid, memberId: mid, branchId: br.id, kind: 'refund', amount: refund, paidOn: addDays(startedOn, int(20, 70)), method: 'card' })
      }

      // PT 세션 기록
      if (totalSessions && trainerId) {
        for (let s = 0; s < used; s++) {
          const st: SessionStatus = rnd() < 0.06 ? 'noshow' : 'completed'
          sessions.push({
            id: id('s'), contractId: cid, memberId: mid, branchId: br.id, trainerId,
            sessionAt: addDays(startedOn, Math.round((s + 1) * (rnd() * 3 + 3))),
            status: st, deducted: true,
          })
        }
      }

      cursor = endsOn ? addDays(endsOn, int(0, 25)) : addDays(startedOn, int(60, 120))
      if (daysBetween(cursor, TODAY) < 0) break
    }
  }

  // 상담 — 최근 14개월
  for (let mo = 13; mo >= 0; mo--) {
    const monthStart = addMonths(TODAY.slice(0, 7) + '-01', -mo)
    const count = Math.round(int(18, 34) * weight)
    for (let i = 0; i < count; i++) {
      const day = int(1, 28)
      const consultedOn = `${monthStart.slice(0, 7)}-${String(day).padStart(2, '0')}`
      if (daysBetween(consultedOn, TODAY) < 0) continue
      const r = rnd()
      const result: ConsultResult =
        r < 0.36 ? 'registered' : r < 0.58 ? 'hold' : r < 0.86 ? 'lost' : 'pending'
      const ch = pick(CHANNELS)
      consultations.push({
        id: id('cs'), branchId: br.id, name: `${pick(SURNAMES)}${pick(GIVEN)}`,
        phone: `010-${String(int(1000, 9999))}-${String(int(1000, 9999))}`,
        channelId: ch.id, consultedOn, result, registeredMemberId: null,
        nextContactOn: result === 'hold' ? addDays(consultedOn, int(3, 30)) : null,
        memo: null, branchName: br.name, channelName: ch.name,
      })
    }
  }
}

// ── 조회 헬퍼 ────────────────────────────────────────────────────────
const branchName = (bid: string) => BRANCHES.find((b) => b.id === bid)?.name ?? ''
const productOf = (pid: string) => PRODUCTS.find((p) => p.id === pid)
const inBranch = <T extends { branchId: string }>(rows: T[], bid: string | null) =>
  bid ? rows.filter((r) => r.branchId === bid) : rows

const inRange = (d: string, from: string, to: string) => d >= from && d <= to

function revenueIn(bid: string | null, from: string, to: string): number {
  return inBranch(payments, bid)
    .filter((p) => inRange(p.paidOn, from, to))
    .reduce((s, p) => s + p.amount, 0)
}

function newMembersIn(bid: string | null, from: string, to: string): number {
  return inBranch(members, bid)
    .filter((m) => inRange(m.firstRegisteredOn, from, to)).length
}

function conversionIn(bid: string | null, from: string, to: string): number {
  const rows = inBranch(consultations, bid).filter((c) => inRange(c.consultedOn, from, to))
  if (rows.length === 0) return 0
  return (rows.filter((c) => c.result === 'registered').length / rows.length) * 100
}

const revenueOfMonth = (bid: string | null, month: string) =>
  revenueIn(bid, monthRange(month).from, monthRange(month).to)

function expiringRows(bid: string | null, withinDays: number): ExpiringRow[] {
  return inBranch(contracts, bid)
    .filter((c) => c.status === 'active' && c.endsOn)
    .map((c) => ({ c, daysLeft: daysBetween(TODAY, c.endsOn!) }))
    .filter(({ daysLeft }) => daysLeft >= 0 && daysLeft <= withinDays)
    .map(({ c, daysLeft }) => {
      const m = members.find((x) => x.id === c.memberId)!
      return {
        contractId: c.id, memberId: m.id, memberName: m.name, memberPhone: m.phone,
        branchName: branchName(c.branchId), productName: productOf(c.productId)?.name ?? '',
        endsOn: c.endsOn!, daysLeft,
      }
    })
    .sort((a, b) => a.daysLeft - b.daysLeft)
}

function lowSessionRows(bid: string | null): LowSessionRow[] {
  return inBranch(contracts, bid)
    .filter((c) => c.status === 'active' && c.totalSessions !== null)
    .map((c) => {
      const left = (c.totalSessions ?? 0) - c.usedSessions
      const m = members.find((x) => x.id === c.memberId)!
      return {
        contractId: c.id, memberId: m.id, memberName: m.name, memberPhone: m.phone,
        branchName: branchName(c.branchId),
        trainerName: TRAINERS.find((t) => t.id === c.trainerId)?.name ?? null,
        totalSessions: c.totalSessions ?? 0, usedSessions: c.usedSessions, sessionsLeft: left,
      }
    })
    .filter((r) => r.sessionsLeft >= 0 && r.sessionsLeft <= 2)
    .sort((a, b) => a.sessionsLeft - b.sessionsLeft)
}

const sleep = () => new Promise((r) => setTimeout(r, 60))

// ── DataSource 구현 ──────────────────────────────────────────────────
export const demoSource: DataSource = {
  mode: 'demo',

  async listBranches() { await sleep(); return BRANCHES },
  async listProducts() { await sleep(); return PRODUCTS },
  async listChannels() { await sleep(); return CHANNELS },
  async listTrainers(branchId) {
    await sleep()
    return branchId ? TRAINERS.filter((t) => t.branchId === branchId) : TRAINERS
  },

  async getDashboard(branchId, month) {
    await sleep()
    const cur = monthRange(month)
    const prev = prevComparableRange(month)
    return {
      month,
      partial: cur.partial,
      asOf: cur.partial ? cur.to : null,
      revenue: {
        value: revenueIn(branchId, cur.from, cur.to),
        prev: revenueIn(branchId, prev.from, prev.to),
      },
      newMembers: {
        value: newMembersIn(branchId, cur.from, cur.to),
        prev: newMembersIn(branchId, prev.from, prev.to),
      },
      expiringSoon: expiringRows(branchId, 30).length,
      conversionRate: {
        value: conversionIn(branchId, cur.from, cur.to),
        prev: conversionIn(branchId, prev.from, prev.to),
      },
      byBranch: (branchId ? BRANCHES.filter((b) => b.id === branchId) : BRANCHES)
        .map((b) => ({ branchId: b.id, branchName: b.name, revenue: revenueOfMonth(b.id, month) }))
        .sort((a, b) => b.revenue - a.revenue),
      trend: Array.from({ length: 12 }, (_, i) => {
        const m = addMonths(month, -(11 - i))
        return { month: m, revenue: revenueOfMonth(branchId, m) }
      }),
      todo: {
        expiringIn7: expiringRows(branchId, 7).length,
        // 재연락일이 지난 지 7일 이내인 것만 "오늘 할 일"로 본다.
        // 기한 없이 누적하면 수백 건이 쌓여서 아무도 손대지 않는 목록이 된다.
        holdConsultDue: inBranch(consultations, branchId).filter((c) => {
          if (c.result !== 'hold' || !c.nextContactOn) return false
          const past = daysBetween(c.nextContactOn, TODAY)
          return past >= 0 && past <= 7
        }).length,
        lowSession: lowSessionRows(branchId).length,
      },
    } satisfies DashboardData
  },

  async listExpiring(branchId, withinDays) { await sleep(); return expiringRows(branchId, withinDays) },
  async listLowSessions(branchId) { await sleep(); return lowSessionRows(branchId) },

  async listMembers(branchId, query) {
    await sleep()
    const q = query.trim().toLowerCase()
    return inBranch(members, branchId)
      .filter((m) => !q || m.name.toLowerCase().includes(q) || (m.phone ?? '').includes(q))
      .map((m) => {
        const mine = contracts.filter((c) => c.memberId === m.id)
        const active = mine.find((c) => c.status === 'active')
        const paid = payments.filter((p) => p.memberId === m.id).reduce((s, p) => s + p.amount, 0)
        return {
          ...m,
          branchName: branchName(m.branchId),
          channelName: CHANNELS.find((c) => c.id === m.channelId)?.name ?? null,
          activeContract: active
            ? {
                productName: productOf(active.productId)?.name ?? '',
                endsOn: active.endsOn,
                daysLeft: active.endsOn ? daysBetween(TODAY, active.endsOn) : null,
                sessionsLeft: active.totalSessions !== null ? active.totalSessions - active.usedSessions : null,
              }
            : null,
          totalPaid: paid,
        } satisfies MemberRow
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .slice(0, 300)
  },

  async getMember(mid) {
    await sleep()
    const m = members.find((x) => x.id === mid)
    if (!m) return null
    const rows = await this.listMembers(null, '')
    const row = rows.find((r) => r.id === mid)
    const mine = contracts.filter((c) => c.memberId === mid)
    return {
      member: row ?? ({ ...m, branchName: branchName(m.branchId), channelName: null, activeContract: null, totalPaid: 0 } as MemberRow),
      contracts: mine.map((c) => ({
        ...c,
        productName: productOf(c.productId)?.name ?? '',
        productKind: productOf(c.productId)?.kind ?? 'membership',
      })),
      payments: payments.filter((p) => p.memberId === mid).sort((a, b) => b.paidOn.localeCompare(a.paidOn)),
      sessions: sessions
        .filter((s) => s.memberId === mid)
        .sort((a, b) => b.sessionAt.localeCompare(a.sessionAt))
        .map((s) => ({
          id: s.id, sessionAt: s.sessionAt, status: s.status,
          trainerName: TRAINERS.find((t) => t.id === s.trainerId)?.name ?? '',
        })),
    } satisfies MemberDetail
  },

  async listConsultations(branchId, month) {
    await sleep()
    return inBranch(consultations, branchId)
      .filter((c) => c.consultedOn.slice(0, 7) === month.slice(0, 7))
      .sort((a, b) => b.consultedOn.localeCompare(a.consultedOn))
  },

  async createMemberWithContract(input: NewMemberInput) {
    await sleep()
    const mid = id('m')
    members.push({
      id: mid, branchId: input.branchId, name: input.name, phone: input.phone,
      gender: input.gender, birthYear: input.birthYear, channelId: input.channelId,
      firstRegisteredOn: input.startedOn, memo: input.memo || null,
    })
    const prod = productOf(input.productId)
    const cid = id('c')
    contracts.push({
      id: cid, memberId: mid, branchId: input.branchId, productId: input.productId,
      trainerId: input.trainerId,
      startedOn: input.startedOn,
      endsOn: prod?.durationDays ? addDays(input.startedOn, prod.durationDays) : null,
      totalSessions: prod?.sessionCount ?? null, usedSessions: 0,
      contractPrice: input.contractPrice, status: 'active',
    })
    if (input.paidAmount > 0) {
      payments.push({
        id: id('pay'), contractId: cid, memberId: mid, branchId: input.branchId,
        kind: 'payment', amount: input.paidAmount, paidOn: input.startedOn, method: input.method,
      })
    }
    if (input.fromConsultationId) {
      const cs = consultations.find((c) => c.id === input.fromConsultationId)
      if (cs) { cs.result = 'registered'; cs.registeredMemberId = mid }
    }
    return { memberId: mid }
  },

  async setConsultationResult(csId, result, nextContactOn) {
    await sleep()
    const cs = consultations.find((c) => c.id === csId)
    if (cs) {
      cs.result = result
      cs.nextContactOn = nextContactOn ?? null
    }
  },
}
