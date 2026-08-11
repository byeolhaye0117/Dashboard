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
/** 저장해 두고 다시 꺼내 쓰는 업무 목록 (본보기) */
export const SHEET_PLAN = "업무목록";

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
  "업무번호", "지점코드", "업무명", "담당사번", "우선순위", "순서", "메모", "사용여부",
  "등록일시", "등록자", "수정일시", "수정자", "삭제여부",
];

/**
 * 우선순위
 *
 * 한 지점에 예순 개가 넘는 업무가 걸린다. 한 줄로 쭉 늘어놓으면
 * 무엇부터 손대야 하는지 알 수가 없어 목록 자체가 무시된다.
 * 1·2·3 세 단계면 충분하다 — 그 이상은 매기는 사람이 헷갈린다.
 */
export const PRIORITIES = [
  { v: 1, name: "1순위", tone: "bad" },
  { v: 2, name: "2순위", tone: "warn" },
  { v: 3, name: "3순위", tone: "" },
];

/** 정해두지 않은 것은 맨 뒤로 */
export const NO_PRIORITY = 9;

export function priorityName(v: number): string {
  return PRIORITIES.find((p) => p.v === v)?.name ?? "순위 없음";
}

export function priorityTone(v: number): string {
  return PRIORITIES.find((p) => p.v === v)?.tone ?? "";
}

/**
 * 저장해 둔 업무 목록
 *
 * 「4·5층 일일 점검」처럼 자주 쓰는 묶음을 통째로 담아 둔다. 내용은 붙여넣기
 * 창이 읽는 글 그대로다 — 그래야 불러와서 그 자리에서 고칠 수 있다.
 */
export const PLAN_HEADERS = [
  "목록번호", "목록명", "내용",
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
