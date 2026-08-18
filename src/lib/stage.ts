/**
 * 상담 진행 상태 규칙 (화면·서버 양쪽에서 쓴다)
 *
 * 이 규칙이 두 군데에 따로 적혀 있으면 한쪽만 고쳐서 숫자가 어긋난다.
 * 상담 화면과 매출 화면이 같은 등록실패율을 말해야 하므로 여기 하나로 둔다.
 */

export const STAGES = ["예약", "약속전환", "등록", "미등록"] as const;
export type Stage = (typeof STAGES)[number];

/** 등록으로 끝난 상태 — 이 값 하나로 「등록인가」를 판단한다 */
export const DONE_STAGE: Stage = "등록";

/** 예전에 쓰던 7단계 값을 지금 4단계로 맞춘다 */
const OLD: Record<string, Stage> = {
  신규: "예약", 연락중: "예약", 약속대기: "예약",
  예약확정: "약속전환", 방문완료: "약속전환", 등록완료: "등록",
};

/** 시트에서 읽은 상담 한 줄 — 필요한 칸만 본다 */
export type StageRow = Record<string, string | undefined>;

/** 시트에 적힌 상태를 4단계로 */
export function stageOf(r: StageRow): Stage {
  const t = (r.진행상태 ?? "").trim();
  if ((STAGES as readonly string[]).includes(t)) return t as Stage;
  return OLD[t] ?? "예약";
}

/**
 * 이 상담을 몇 월 실적으로 볼 것인가
 *
 * 약속을 잡은 건은 약속 날짜, 아직 없는 건은 문의가 들어온 날.
 * 실제로 영업이 이뤄진 달에 숫자가 붙게 하기 위해서다.
 */
export function baseDate(r: StageRow): string {
  return ((r.약속일시 ?? "").trim() || (r.상담날짜 ?? "")).slice(0, 10);
}

export const monthOf = (r: StageRow): string => baseDate(r).slice(0, 7);

/** 결론이 난 건인가 */
export const isSettled = (r: StageRow): boolean =>
  ["등록", "미등록"].includes(stageOf(r));

/**
 * 화면에 보여줄 진짜 상태 — 달 단위로 마감한다
 *
 * 같은 달 안에서는 며칠 늦게 등록해도 등록으로 인정하고,
 * 달이 넘어가도록 결론이 없으면 미등록으로 마감한다.
 */
export function stageNow(r: StageRow, todayStr: string): Stage {
  if (isSettled(r)) return stageOf(r);
  const m = monthOf(r);
  return m && m < todayStr.slice(0, 7) ? "미등록" : stageOf(r);
}
