/**
 * 지금 이 사람이 볼 수 있는 지점
 *
 * ── 왜 쿠키를 그냥 믿지 않는가 ─────────────────────────────
 * 로그인할 때 「지점 범위」를 쿠키에 굳혀 둔다. 그것만 믿으면, 대표님이
 * 직급의 지점 범위를 좁혀도 그 사람이 다시 로그인할 때까지 계속 전 지점을
 * 본다. 권한(보기·등록·수정·삭제)은 이미 화면을 열 때마다 다시 읽고 있다.
 * 지점도 같은 규칙으로 읽는다 — 한쪽만 즉시 반영되면 그게 더 헷갈린다.
 *
 * 읽는 값은 둘이다.
 *   직급표의 「지점범위」  — 전체인가, 담당 지점만인가
 *   직원담당지점 탭       — 이 사람이 실제로 근무하는 지점
 *
 * 둘 다 요청 하나 안에서는 한 번만 읽는다(data.ts 의 cache).
 */
import { getRoles, getStaffBranches, getStaffAll, type Branch } from "./data";

/** 전 지점을 보는 범위를 시트에서 뭐라고 적는가 */
export const SCOPE_ALL = "전체";
export const SCOPE_MINE = "담당지점";

export type Scoped = {
  /** 전 지점을 보는 사람인가 */
  all: boolean;
  /** 볼 수 있는 지점 코드. all 이면 빈 배열이고 대신 all 을 본다 */
  codes: string[];
};

type Who = { staffId: string; roleCode: string; currentBranch?: string };

/**
 * 지점 범위를 지금 다시 잰다
 *
 * 직급표에 「지점범위」 칸이 아예 없거나 비어 있으면 담당 지점만으로 본다.
 * 넓은 쪽을 기본으로 두면, 칸 하나 빠뜨렸을 때 조용히 전 지점이 열린다.
 */
export async function scopeOf(who: Who): Promise<Scoped> {
  const [roles, branchMap, staff] = await Promise.all([
    getRoles(),
    getStaffBranches(),
    getStaffAll(),
  ]);

  const scope = (roles.find((r) => r.code === who.roleCode)?.scope ?? SCOPE_MINE).trim();
  if (scope === SCOPE_ALL) return { all: true, codes: [] };

  const me = staff.find((s) => s.id === who.staffId);
  const codes = [...(branchMap.get(who.staffId) ?? [])];
  /* 담당 지점 표에 안 적혀 있어도 소속 지점은 본인 지점이다 */
  if (me?.mainBranch && !codes.includes(me.mainBranch)) codes.push(me.mainBranch);
  /* 지금 골라 둔 지점이 담당에서 빠졌다면 그건 이미 못 보는 것이 맞다 */
  return { all: false, codes };
}

/** 이 지점을 볼 수 있는가 */
export async function canSee(who: Who): Promise<(branch: string) => boolean> {
  const s = await scopeOf(who);
  return (branch: string) => s.all || s.codes.includes(branch);
}

/** 화면에 그릴 지점 목록 */
export async function myBranchesOf(who: Who, branches: Branch[]): Promise<Branch[]> {
  const s = await scopeOf(who);
  return s.all ? branches : branches.filter((b) => s.codes.includes(b.code));
}

/**
 * 이 화면이 보여줄 지점
 *
 * ── 왜 따로 두나 ────────────────────────────────────────────
 * 「볼 수 있는 지점」과 「지금 보고 있는 지점」은 다르다. 대표님은 네 지점을
 * 다 볼 수 있지만, 머리 위에서 두정점을 고르셨으면 그 화면은 두정점 이야기여야
 * 한다. 지점을 골라 놓고도 다른 지점 것이 같이 뜨면, 무엇을 보고 있는지
 * 화면이 두 가지로 말하는 셈이다.
 *
 * 머리 위에서 「전 지점」을 고르시면 볼 수 있는 지점 전부다.
 * 고른 지점이 볼 수 없는 곳이면(권한이 좁아진 뒤라면) 무시하고 전부를 준다 —
 * 화면이 통째로 비는 것보다 낫다.
 */
export async function viewBranches(who: Who, all: Set<string>): Promise<Set<string>> {
  const here = (who.currentBranch ?? "").trim();
  if (!here) return all;
  return all.has(here) ? new Set([here]) : all;
}
