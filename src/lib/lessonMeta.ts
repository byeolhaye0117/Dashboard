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
  "진행상태", "메모", "사진파일",
  "등록일시", "등록자", "수정일시", "수정자", "삭제여부",
];

/**
 * 그룹수업 시간대를 한 줄 글로 다룬다
 *
 * "06:00,10:00,19:00" 처럼 시트에 적어두고, 화면에서는 단추로 고른다.
 * 직원마다 맡는 타임이 정해져 있어서 매번 시각을 입력할 이유가 없다.
 */
export function parseSlots(v: string): string[] {
  return (v ?? "")
    .split(/[,·\s]+/)
    .map((x) => normalizeTime(x))
    .filter(Boolean)
    .filter((x, i, all) => all.indexOf(x) === i)
    .sort();
}

export function slotsText(v: string): string {
  const list = parseSlots(v);
  return list.length === 0 ? "정하지 않음" : list.join(" · ");
}

/** 고른 시간대 중 가장 늦은 것 — 사진은 여기에 붙는다 */
export function lastSlot(slots: string[]): string {
  return [...slots].sort().slice(-1)[0] ?? "";
}

/**
 * 참석 한 줄 = "그 수업에 이 회원이" 한 칸
 *
 * 회차 차감은 수업이 아니라 여기서 일어난다. 그룹수업은 한 수업에서
 * 어떤 사람은 오고 어떤 사람은 안 오기 때문이다.
 */
export const LA_HEADERS = [
  "참석번호", "수업번호", "회원번호", "이용권번호",
  "진행상태", "차감회차", "메모",
  // ↓ 수업료를 계산할 때 쓰는 값들. 완료로 찍는 순간의 사실을 그대로 박아둔다
  "판매트레이너사번", "이용권금액", "총회차", "결제회차", "완료일시",
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

/**
 * 이 상품이 이 수업에 쓸 수 있는가
 *
 * ── 왜 필요해졌나 ────────────────────────────────────────────
 * 수업 화면은 상품분류가 「1:1PT」 「그룹수업」이라고 적혀 있을 때만 알아봤다.
 * 그런데 상품 관리 화면의 카테고리는 「회원권 · 수강권 · 케어권 · 부가상품권 ·
 * 서비스」다. 그래서 수강권으로 만든 PT 상품이 수업 잡기에서 하나도 안 걸렸고,
 * 「쓸 수 있는 이용권이 없습니다」만 떴다.
 *
 * 옛 이름과 새 이름을 둘 다 알아듣게 한다. 「수강권」은 PT 와 그룹수업을
 * 같이 담는 이름이라 이름으로 한 번 더 가른다 — 상품 이름에 「그룹」이
 * 들어 있으면 그룹수업으로, 아니면 1:1 로 본다.
 *
 * 「케어권」은 여기 안 넣는다. 수업 시간표에 걸어 두고 도는 일이 아니라서
 * 섞으면 고르는 목록만 길어진다 — 대표님과 정한 것이다.
 */
export function fitsKind(productKind: string, name: string, kind: string): boolean {
  const k = (productKind ?? "").replace(/\s/g, "");
  const n = (name ?? "").replace(/\s/g, "");
  const 그룹이름 = /그룹|단체|GX/i.test(n);

  /* 케어권은 수업 잡기에 안 띄운다 — 대표님과 정한 것. 케어는 시간표에
     걸어 두고 도는 일이 아니라서, 여기 섞이면 목록만 길어진다 */
  if (kind === KIND_PT) {
    if (["1:1PT", "PT", "개인레슨", "퍼스널"].includes(k)) return true;
    return k === "수강권" && !그룹이름;
  }
  if (kind === KIND_GROUP) {
    if (["그룹수업", "수업", "레슨", "GX"].includes(k)) return true;
    return k === "수강권" && 그룹이름;
  }
  return k === kind;
}
