/**
 * 매출
 *
 * 결제 탭이 원장이다. 이 파일은 거기서 읽은 것을 달·지점·유형별로 묶기만 한다.
 * 숫자를 새로 만들어내지 않는다.
 */
import { readSheet } from "./sheets";
import { resolve, get } from "./columns";

export const SHEET_GOAL = "월매출목표";

const GOAL_COLS = {
  지점코드: { names: ["지점", "지점명"], required: true },
  연월: { names: ["년월", "월", "기준월", "대상월"], required: true },
  목표금액: { names: ["목표", "목표액", "월목표"], required: true },
};

export type Goal = { 지점코드: string; 연월: string; 목표금액: number };

const won = (v: string) => Number((v ?? "").replace(/[^0-9-]/g, "")) || 0;

/** 2026-08 / 2026.08 / 202608 / 2026년 8월 을 모두 2026-08 로 맞춘다 */
export function normalizeMonth(v: string): string {
  const digits = (v ?? "").replace(/[^0-9]/g, "");
  if (digits.length < 6) return "";
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
}

/**
 * 지점별 월 매출 목표
 *
 * 탭이 없거나 비어 있어도 매출 화면은 그대로 보여야 하므로 빈 값을 돌려준다.
 */
export async function getGoals(): Promise<Goal[]> {
  try {
    const { headers, rows } = await readSheet(SHEET_GOAL);
    const cols = resolve(SHEET_GOAL, headers, GOAL_COLS);
    return rows
      .filter((r) => (r["삭제여부"] ?? "").toUpperCase() !== "Y")
      .map((r) => ({
        지점코드: get(r, cols, "지점코드"),
        연월: normalizeMonth(get(r, cols, "연월")),
        목표금액: won(get(r, cols, "목표금액")),
      }))
      .filter((g) => g.지점코드 && g.연월);
  } catch {
    return [];
  }
}
