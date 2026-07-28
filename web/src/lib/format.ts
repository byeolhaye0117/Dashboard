/** 4820만 / 1억2340만 처럼 헬스장 실무에서 읽는 방식으로 줄인다. */
export function money(won: number): string {
  const neg = won < 0
  const n = Math.abs(won)
  let s: string
  if (n >= 100_000_000) {
    const eok = Math.floor(n / 100_000_000)
    const man = Math.floor((n % 100_000_000) / 10_000)
    s = man > 0 ? `${eok}억 ${man.toLocaleString()}만` : `${eok}억`
  } else if (n >= 10_000) {
    s = `${Math.floor(n / 10_000).toLocaleString()}만`
  } else {
    s = n.toLocaleString()
  }
  return (neg ? '-' : '') + s
}

/** 정확한 금액이 필요한 자리(상세·입력 확인)용 */
export function wonExact(won: number): string {
  return `${won.toLocaleString()}원`
}

export function pct(n: number, digits = 0): string {
  return `${n.toFixed(digits)}%`
}

/** 전월 대비 증감률. 이전이 0이면 비율을 낼 수 없으므로 null. */
export function delta(cur: number, prev: number): number | null {
  if (prev === 0) return null
  return ((cur - prev) / Math.abs(prev)) * 100
}

export function ymd(d: Date | string): string {
  const t = typeof d === 'string' ? new Date(d) : d
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
}

export function monthLabel(iso: string): string {
  const [y, m] = iso.split('-')
  return `${y}년 ${Number(m)}월`
}

export function shortMonth(iso: string): string {
  const parts = iso.split('-')
  return `${Number(parts[1])}월`
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00')
  const b = new Date(to + 'T00:00:00')
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return ymd(d)
}

export function addMonths(iso: string, months: number): string {
  const [y, m] = iso.split('-').map(Number)
  const d = new Date((y ?? 2026), (m ?? 1) - 1 + months, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function lastDayOfMonth(monthIso: string): string {
  const [y, m] = monthIso.split('-').map(Number)
  return ymd(new Date((y ?? 2026), (m ?? 1), 0))
}

export function isCurrentMonth(monthIso: string): boolean {
  return monthIso.slice(0, 7) === ymd(new Date()).slice(0, 7)
}

/**
 * 조회 구간.
 * 진행 중인 달이면 오늘까지만 본다. 아직 오지 않은 날을 0으로 채워
 * 매출이 폭락한 것처럼 보이게 하지 않는다.
 */
export function monthRange(monthIso: string): { from: string; to: string; partial: boolean } {
  const from = `${monthIso.slice(0, 7)}-01`
  if (isCurrentMonth(monthIso)) return { from, to: ymd(new Date()), partial: true }
  return { from, to: lastDayOfMonth(monthIso), partial: false }
}

/**
 * 비교 대상 구간 — 전월의 "같은 기간".
 * 7월 1~28일은 6월 1~28일과 비교해야 한다. 6월 전체와 비교하면
 * 매달 말일까지는 항상 마이너스로 보인다.
 */
export function prevComparableRange(monthIso: string): { from: string; to: string } {
  const cur = monthRange(monthIso)
  const prevMonth = addMonths(`${monthIso.slice(0, 7)}-01`, -1)
  const from = prevMonth
  const day = Number(cur.to.slice(8, 10))
  const prevLast = lastDayOfMonth(prevMonth)
  const prevLastDay = Number(prevLast.slice(8, 10))
  const to = `${prevMonth.slice(0, 7)}-${String(Math.min(day, prevLastDay)).padStart(2, '0')}`
  return { from, to }
}

/** 동명이인 구분용. 헬스장에서 이름만으로는 구분이 안 된다. */
export function phoneTail(phone: string | null): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  return digits.slice(-4)
}

export function maskPhone(phone: string | null): string {
  if (!phone) return '-'
  const d = phone.replace(/\D/g, '')
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  return phone
}
