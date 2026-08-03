/**
 * 날짜 계산 (화면·서버 양쪽에서 쓴다)
 *
 * 시트나 구글 관련 코드를 부르지 않는다. 브라우저에서도 그대로 돌아야 한다.
 */

/**
 * 만료일 = 시작일 + 이용 개월 − 하루
 *
 * 3월 1일에 1개월을 끊으면 3월 31일까지다. 4월 1일이 아니다.
 * 말일 처리도 자바스크립트가 알아서 맞춘다 (1/31 + 1개월 → 2월 말).
 */
export function addMonths(startDate: string, months: number): string {
  const s = (startDate ?? "").slice(0, 10);
  if (!s || !months) return "";
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return "";
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCMonth(base.getUTCMonth() + months);
  base.setUTCDate(base.getUTCDate() - 1);
  return base.toISOString().slice(0, 10);
}

/** 오늘부터 며칠 남았는가 (지났으면 음수) */
export function daysLeft(endDate: string, todayStr: string): number {
  const a = (endDate ?? "").slice(0, 10);
  const b = (todayStr ?? "").slice(0, 10);
  if (!a || !b) return 0;
  const t = (v: string) => Date.UTC(...(v.split("-").map(Number) as [number, number, number]));
  return Math.round((t(a) - t(b)) / 86_400_000);
}
