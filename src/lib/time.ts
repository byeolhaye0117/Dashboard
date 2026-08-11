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

/**
 * 지금 몇 시인가 — 한국 기준
 *
 * 서버는 세계표준시로 돈다. new Date().getHours() 를 그냥 부르면
 * 아침 여덟 시에 스물세 시가 나온다.
 */
export function hourNow(): number {
  return Number(parts(new Date()).slice(11, 13));
}

/** 지금 몇 분인가 — 한국 기준 */
export function minuteNow(): number {
  return Number(parts(new Date()).slice(14, 16));
}

/**
 * 날짜 글자를 세계표준시 자정에 붙든다
 *
 * 「2026-08-12」에는 시각이 없다. 그러니 어느 시간대에서 열어도 8월 12일이어야
 * 한다. 한국 자정으로 붙들어 놓고 세계표준시로 되읽으면 아홉 시간이 밀려
 * 하루가 어긋난다 — 화살표가 안 먹던 것도, 서버에서 요일이 하루씩 밀리던 것도
 * 전부 이 한 가지 때문이었다.
 *
 * 날짜만 다루는 계산은 전부 이 문을 통해서 한다.
 */
function anchor(dateStr: string): Date {
  return new Date(`${(dateStr ?? "").slice(0, 10)}T00:00:00Z`);
}

/** 오늘로부터 n일 뒤 (음수면 이전) */
export function addDays(dateStr: string, n: number): string {
  const d = anchor(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 두 날짜 사이의 일수. b가 a보다 뒤면 양수 */
export function daysBetween(a: string, b: string): number {
  const x = anchor(a).getTime();
  const y = anchor(b).getTime();
  if (Number.isNaN(x) || Number.isNaN(y)) return 0;
  return Math.round((y - x) / 86400000);
}

/** 일요일이 0 — 요일을 세는 곳은 전부 이 자리를 쓴다. 못 읽으면 -1 */
export function weekdayIndex(dateStr: string): number {
  const d = anchor(dateStr);
  return Number.isNaN(d.getTime()) ? -1 : d.getUTCDay();
}

/** 7월 31일 (금) */
export function korDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = anchor(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const w = ["일", "월", "화", "수", "목", "금", "토"][d.getUTCDay()];
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${w})`;
}

/** 이번 달의 첫날 */
export function monthStart(): string {
  return today().slice(0, 8) + "01";
}
