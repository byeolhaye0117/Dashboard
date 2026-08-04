/**
 * PT · 수업에 쓰는 이름들
 *
 * 화면(브라우저)과 서버가 같이 쓰는 값이라 여기 따로 둔다.
 * lessons.ts 안에 두면 화면 코드가 구글 접속 코드까지 끌고 들어가 빌드가 깨진다.
 */

export const SHEET_L = "수업";
export const SHEET_LA = "수업참석";

/**
 * 수업 한 줄 = "언제 · 누가 · 몇 시에" 한 칸
 *
 * 1:1 PT 도 그룹수업도 똑같이 한 줄이다. 다른 것은 참석자 수뿐이다.
 * 1:1 을 따로 다루면 코드가 두 벌이 되고, 두 벌은 반드시 어긋난다.
 */
export const L_HEADERS = [
  "수업번호", "지점코드", "수업구분", "상품코드", "트레이너사번",
  "날짜", "시작시각", "종료시각", "정원",
  "진행상태", "메모",
  "등록일시", "등록자", "수정일시", "수정자", "삭제여부",
];

/**
 * 참석 한 줄 = "그 수업에 이 회원이" 한 칸
 *
 * 회차 차감은 수업이 아니라 여기서 일어난다. 그룹수업은 한 수업에서
 * 어떤 사람은 오고 어떤 사람은 안 오기 때문이다.
 */
export const LA_HEADERS = [
  "참석번호", "수업번호", "회원번호", "이용권번호",
  "진행상태", "차감회차", "메모",
  "등록일시", "등록자", "수정일시", "수정자", "삭제여부",
];

/** 수업 전체가 어떻게 됐는가 */
export const LESSON_STATES = ["예정", "완료", "취소"] as const;

/** 그 수업에 이 사람이 어떻게 됐는가 */
export const JOIN_STATES = ["예정", "완료", "노쇼", "취소"] as const;

/** 1:1 은 정원이 1로 고정이다 */
export const KIND_PT = "1:1PT";
export const KIND_GROUP = "그룹수업";

/**
 * 회차를 뺄 상태인가
 *
 * 대표님과 정한 것: 완료만 뺀다. 노쇼는 기록만 남기고 회차는 그대로 둔다.
 * 여기 한 곳만 고치면 정책이 바뀐다 — 화면과 서버가 같이 이 함수를 본다.
 */
export function usesCount(state: string): boolean {
  return state === "완료";
}

/** "14:30" 같은 모양으로 맞춘다. 못 읽으면 빈 값 */
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

/** "14:30" → 870분. 못 읽으면 null */
export function toMinutes(hhmm: string): number | null {
  const t = normalizeTime(hhmm);
  if (!t) return null;
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

/** 시작시각 + 분 → 종료시각 */
export function addMinutes(hhmm: string, add: number): string {
  const m = toMinutes(hhmm);
  if (m === null) return "";
  const t = (m + add) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** 예정 · 완료 · 노쇼 · 취소 → 화면에 붙일 색 이름 */
export const STATE_TONE: Record<string, string> = {
  예정: "wait", 완료: "done", 노쇼: "miss", 취소: "gone",
};
