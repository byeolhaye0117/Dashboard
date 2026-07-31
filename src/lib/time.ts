/**
 * 시각 다루기
 *
 * 서버는 세계표준시로 돌지만 우리는 한국 시각으로 기록해야 한다.
 * 그래서 저장할 때도 보여줄 때도 항상 한국 시각으로 맞춘다.
 */
const TZ = "Asia/Seoul";

function parts(d: Date) {
  const f = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  // sv-SE 형식은 "2026-07-31 14:05:09" 로 나온다
  return f.format(d).replace(" ", "T");
}

/** 2026-07-31 */
export function today(): string {
  return parts(new Date()).slice(0, 10);
}

/** 2026-07-31 14:05 */
export function now(): string {
  return parts(new Date()).slice(0, 16).replace("T", " ");
}

/** 오늘로부터 n일 뒤 (음수면 이전) */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  d.setDate(d.getDate() + n);
  return parts(d).slice(0, 10);
}

/** 두 날짜 사이의 일수. b가 a보다 뒤면 양수 */
export function daysBetween(a: string, b: string): number {
  const x = new Date(`${a}T00:00:00+09:00`).getTime();
  const y = new Date(`${b}T00:00:00+09:00`).getTime();
  return Math.round((y - x) / 86400000);
}

/** 7월 31일 (금) */
export function korDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const w = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${w})`;
}

/** 이번 달의 첫날 */
export function monthStart(): string {
  return today().slice(0, 8) + "01";
}
