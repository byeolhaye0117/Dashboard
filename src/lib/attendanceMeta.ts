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

/** 근태 탭을 새로 만들 때 쓰는 제목 줄 */
export const T_HEADERS = [
  "근태번호", "사번", "지점코드", "날짜", "출근시각", "퇴근시각",
  "근무구분", "지각분", "조퇴분", "메모",
  "등록일시", "등록자", "수정일시", "수정자", "삭제여부",
];

/** 근무구분을 한 글자로 — 달력 칸에 들어가야 한다 */
export const KIND_MARK: Record<string, string> = {
  정상: "○", 지각: "지", 조퇴: "조", 결근: "결", 휴무: "휴", 연차: "연", 반차: "반",
};
