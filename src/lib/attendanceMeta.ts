/**
 * 근태에 쓰는 이름들
 *
 * 화면(브라우저)과 서버가 같이 쓰는 값이라 여기 따로 둔다.
 * attendance.ts 안에 두면 화면 코드가 구글 접속 코드까지 끌고 들어가 빌드가 깨진다.
 */

import { weekdayIndex } from "./time";

export const SHEET_T = "근태";

/** 하루가 어떤 날이었는지 */
export const WORK_KINDS = ["정상", "지각", "조퇴", "결근", "휴무", "연차", "반차"] as const;
export type WorkKind = (typeof WORK_KINDS)[number];

/**
 * 근태 탭 제목 줄
 *
 * 한 줄이 하루가 아니라 "한 번의 근무 구간"이다.
 * 오전에 갔다가 저녁에 다시 오면 그날 두 줄이 된다. (회차 1, 2)
 * 그날 전체의 판정(근무구분·지각·조퇴)은 회차 1 줄에만 적는다.
 * 여러 줄에 같은 값을 적어두면 언젠가 서로 어긋난다.
 */
export const T_HEADERS = [
  "근태번호", "사번", "지점코드", "날짜", "회차",
  "출근시각", "퇴근시각", "휴게시작", "휴게분", "휴게내역",
  "근무구분", "지각분", "조퇴분", "메모",
  "등록일시", "등록자", "수정일시", "수정자", "삭제여부",
];

/** 일요일이 0 — weekdayIndex 와 자리를 맞춘다 */
export const DAY_LETTERS = ["일", "월", "화", "수", "목", "금", "토"] as const;
export const WEEKDAYS = "월화수목금";
export const WEEKEND = "토일";

/** "월화수목금" → 근무하는 요일인지 본다. 비어 있으면 "모르는 것"이라 다 근무일로 친다 */
export function worksOn(days: string, dateStr: string): boolean {
  if (!days.trim()) return true;
  const w = weekdayIndex(dateStr);
  if (w < 0) return true;
  return days.includes(DAY_LETTERS[w]);
}

/** "월화수목금" → "주중" 처럼 짧게 */
export function daysText(days: string): string {
  const d = days.trim();
  if (!d) return "요일 정하지 않음";
  if (d === WEEKDAYS) return "주중 (월~금)";
  if (d === WEEKEND || d === "일토") return "주말 (토·일)";
  if (DAY_LETTERS.every((x) => d.includes(x))) return "매일";
  return DAY_LETTERS.filter((x) => d.includes(x)).join("·");
}

/** 근무구분을 한 글자로 — 달력 칸에 들어가야 한다 */
export const KIND_MARK: Record<string, string> = {
  정상: "○", 지각: "지", 조퇴: "조", 결근: "결", 휴무: "휴", 연차: "연", 반차: "반",
};

/**
 * 시각을 "HH:MM" 한 가지 모양으로 맞춘다
 *
 * 구글 시트는 06:00 을 시각 값으로 바꿔버려서, 읽을 때 "오전 6:00:00" 이나
 * "6:00:00 AM" 처럼 돌아온다. 그대로 두면 시각 입력칸이 못 읽어 빈칸으로 보이고,
 * 쓰는 분 눈에는 값이 사라진 것처럼 된다. 어떤 모양으로 오든 여기서 되돌린다.
 */
export function normalizeTime(v: string): string {
  const raw = (v ?? "").trim();
  if (!raw) return "";

  const pm = /오후|PM/i.test(raw);
  const am = /오전|AM/i.test(raw);
  const m = raw.match(/(\d{1,2}):(\d{2})/);
  if (!m) return "";

  let h = Number(m[1]);
  const i = Number(m[2]);
  if (!Number.isFinite(h) || i > 59) return "";
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  if (h > 23) return "";

  return `${String(h).padStart(2, "0")}:${String(i).padStart(2, "0")}`;
}

/** "09:30" → 570분. 못 읽으면 null */
export function toMinutes(hhmm: string): number | null {
  const t = normalizeTime(hhmm);
  if (!t) return null;
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

/** 90 → "1시간 30분" */
export function hourText(min: number): string {
  if (min <= 0) return "0분";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? (m > 0 ? `${h}시간 ${m}분` : `${h}시간`) : `${m}분`;
}
