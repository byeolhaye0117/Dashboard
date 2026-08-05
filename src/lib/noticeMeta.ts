/**
 * 공지 · 업무에 쓰는 이름들
 *
 * 화면(브라우저)과 서버가 같이 쓰는 값이라 여기 따로 둔다.
 * notices.ts 안에 두면 화면 코드가 구글 접속 코드까지 끌고 들어가 빌드가 깨진다.
 */

export const SHEET_N = "공지";
export const SHEET_NR = "공지읽음";
export const SHEET_TASK = "업무";
export const SHEET_TASKLOG = "업무기록";

export const N_HEADERS = [
  "공지번호", "지점코드", "제목", "내용", "중요", "게시일", "마감일",
  "등록일시", "등록자", "수정일시", "수정자", "삭제여부",
];

export const NR_HEADERS = ["읽음번호", "공지번호", "사번", "읽은일시"];

/**
 * 반복 업무의 "정의"
 *
 * 정의와 기록을 나눈다. 정의만 있으면 오늘 했는지를 모르고,
 * 기록만 있으면 매일 목록을 새로 적어야 한다.
 */
export const TASK_HEADERS = [
  "업무번호", "지점코드", "업무명", "담당사번", "순서", "메모", "사용여부",
  "등록일시", "등록자", "수정일시", "수정자", "삭제여부",
];

/** 날짜별로 누가 언제 체크했는지 */
export const TASKLOG_HEADERS = [
  "기록번호", "업무번호", "지점코드", "날짜", "담당사번",
  "처리자", "처리일시", "메모", "삭제여부",
];

/** 공지가 아직 유효한가 — 마감일이 지나면 목록 아래로 내린다 */
export function isLive(마감일: string, today: string): boolean {
  const d = (마감일 ?? "").slice(0, 10);
  return !d || d >= today;
}
