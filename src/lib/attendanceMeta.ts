/**
 * 근태에 쓰는 이름들
 *
 * 화면(브라우저)과 서버가 같이 쓰는 값이라 여기 따로 둔다.
 * attendance.ts 안에 두면 화면 코드가 구글 접속 코드까지 끌고 들어가 빌드가 깨진다.
 */

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
  "출근시각", "퇴근시각", "휴게시작", "휴게분",
  "근무구분", "지각분", "조퇴분", "메모",
  "등록일시", "등록자", "수정일시", "수정자", "삭제여부",
];

/** 근무구분을 한 글자로 — 달력 칸에 들어가야 한다 */
export const KIND_MARK: Record<string, string> = {
  정상: "○", 지각: "지", 조퇴: "조", 결근: "결", 휴무: "휴", 연차: "연", 반차: "반",
};

/** "09:30" → 570분. 못 읽으면 null */
export function toMinutes(hhmm: string): number | null {
  const m = (hhmm ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const i = Number(m[2]);
  if (h > 23 || i > 59) return null;
  return h * 60 + i;
}

/** 90 → "1시간 30분" */
export function hourText(min: number): string {
  if (min <= 0) return "0분";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? (m > 0 ? `${h}시간 ${m}분` : `${h}시간`) : `${m}분`;
}
