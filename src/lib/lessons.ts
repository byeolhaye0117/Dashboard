/**
 * PT · 수업 (서버 전용)
 *
 * 수업 한 줄에 참석 여러 줄이 매달린다.
 * 1:1 PT 는 참석이 한 줄, 그룹수업은 여러 줄이다 — 구조는 하나다.
 *
 * 회차 차감은 "수업"이 아니라 "참석"에서 일어난다.
 * 그룹수업은 한 수업에서도 온 사람과 안 온 사람이 갈리기 때문이다.
 */
import { readSheet, appendRow, appendRows, updateRow } from "./sheets";
import { resolve, toSheetRow, get, type ColumnSpec } from "./columns";
import { now } from "./time";
import { patchTicket, listTickets } from "./members";
import { SHEET_L, SHEET_LA, usesCount, normalizeTime, KIND_PT } from "./lessonMeta";

export { SHEET_L, SHEET_LA } from "./lessonMeta";

const L_COLS: ColumnSpec = {
  수업번호: { names: ["수업 번호", "수업ID"], required: true },
  지점코드: { names: ["지점"], required: true },
  수업구분: { names: ["구분", "종류"] },
  상품코드: { names: ["상품"] },
  트레이너사번: { names: ["트레이너", "담당트레이너사번", "담당사번"], required: true },
  날짜: { names: ["수업일", "수업날짜"], required: true },
  시작시각: { names: ["시작", "시작시간"] },
  종료시각: { names: ["종료", "종료시간"] },
  정원: { names: ["최대인원", "정원수"] },
  진행상태: { names: ["상태"] },
  메모: { names: ["비고", "특이사항"] },
  등록일시: { names: [] },
  등록자: { names: [] },
  수정일시: { names: [] },
  수정자: { names: [] },
  삭제여부: { names: [] },
};

const LA_COLS: ColumnSpec = {
  참석번호: { names: ["참석 번호", "참석ID"], required: true },
  수업번호: { names: ["수업 번호"], required: true },
  회원번호: { names: ["회원 번호"], required: true },
  이용권번호: { names: ["이용권 번호"] },
  진행상태: { names: ["상태", "출결"] },
  차감회차: { names: ["차감", "사용회차"] },
  메모: { names: ["비고"] },
  등록일시: { names: [] },
  등록자: { names: [] },
  수정일시: { names: [] },
  수정자: { names: [] },
  삭제여부: { names: [] },
};

export type Lesson = {
  id: string;
  지점코드: string;
  수업구분: string;
  상품코드: string;
  트레이너사번: string;
  날짜: string;
  시작시각: string;
  종료시각: string;
  정원: number;
  진행상태: string;
  메모: string;
};

export type Join = {
  id: string;
  수업번호: string;
  회원번호: string;
  이용권번호: string;
  진행상태: string;
  차감회차: number;
  메모: string;
};

const int = (v: string, d = 0) => {
  const n = Number((v ?? "").toString().replace(/[^0-9-]/g, ""));
  return Number.isFinite(n) ? n : d;
};

function nextId(prefix: string, width: number, existing: string[]): string {
  let max = 0;
  existing.forEach((v) => {
    const m = (v ?? "").match(new RegExp(`^${prefix}(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  });
  return prefix + String(max + 1).padStart(width, "0");
}

export async function listLessons(): Promise<{ lessons: Lesson[]; joins: Join[] }> {
  const [l, a] = await Promise.all([readSheet(SHEET_L), readSheet(SHEET_LA)]);
  const lc = resolve(SHEET_L, l.headers, L_COLS);
  const ac = resolve(SHEET_LA, a.headers, LA_COLS);

  const lessons: Lesson[] = [];
  l.rows.forEach((r) => {
    if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
    const id = get(r, lc, "수업번호");
    if (!id) return;
    lessons.push({
      id,
      지점코드: get(r, lc, "지점코드"),
      수업구분: get(r, lc, "수업구분") || KIND_PT,
      상품코드: get(r, lc, "상품코드"),
      트레이너사번: get(r, lc, "트레이너사번"),
      날짜: get(r, lc, "날짜").slice(0, 10),
      시작시각: normalizeTime(get(r, lc, "시작시각")),
      종료시각: normalizeTime(get(r, lc, "종료시각")),
      정원: int(get(r, lc, "정원"), 1) || 1,
      진행상태: get(r, lc, "진행상태") || "예정",
      메모: get(r, lc, "메모"),
    });
  });

  const joins: Join[] = [];
  a.rows.forEach((r) => {
    if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
    const id = get(r, ac, "참석번호");
    if (!id) return;
    joins.push({
      id,
      수업번호: get(r, ac, "수업번호"),
      회원번호: get(r, ac, "회원번호"),
      이용권번호: get(r, ac, "이용권번호"),
      진행상태: get(r, ac, "진행상태") || "예정",
      차감회차: int(get(r, ac, "차감회차")),
      메모: get(r, ac, "메모"),
    });
  });

  return { lessons, joins };
}

export type NewLesson = {
  지점코드: string;
  수업구분: string;
  상품코드: string;
  트레이너사번: string;
  날짜: string;
  시작시각: string;
  종료시각: string;
  정원: number;
  메모: string;
  /** 참석시킬 사람들 — 1:1 이면 한 명 */
  members: { 회원번호: string; 이용권번호: string }[];
};

/**
 * 수업을 잡는다
 *
 * 잡는 순간에는 회차를 빼지 않는다. 완료로 찍을 때 뺀다.
 * 미리 빼두면 취소할 때마다 되돌려야 하고, 되돌리기를 한 번만 빠뜨려도
 * 회원의 남은 횟수가 조용히 줄어든다.
 */
export async function createLesson(input: NewLesson, byId: string): Promise<string> {
  if (!input.날짜) throw new Error("수업 날짜를 정해주세요.");
  if (!input.트레이너사번) throw new Error("담당 트레이너를 정해주세요.");
  if (input.members.length === 0) throw new Error("수업에 넣을 회원을 한 명 이상 골라주세요.");

  const cap = Math.max(1, input.정원 || 1);
  if (input.members.length > cap) {
    throw new Error(`정원이 ${cap}명인데 ${input.members.length}명을 넣으려 합니다.`);
  }

  // 쓸 수 없는 이용권으로 수업을 잡으면 나중에 완료로 찍을 때 회차가 안 빠진다
  const tickets = await listTickets();
  const byTicket = new Map(tickets.map((t) => [t.id, t]));
  input.members.forEach((m) => {
    if (!m.이용권번호) return;
    const t = byTicket.get(m.이용권번호);
    if (!t) throw new Error(`이용권 ${m.이용권번호} 을(를) 찾지 못했습니다.`);
    if (int(t.잔여횟수) <= 0) throw new Error("남은 횟수가 없는 이용권입니다. 먼저 재등록해주세요.");
    if (t.종료일 && t.종료일.slice(0, 10) < input.날짜) {
      throw new Error(`이용권이 ${t.종료일} 에 끝납니다. 그 뒤 날짜로는 잡을 수 없습니다.`);
    }
  });

  const l = await readSheet(SHEET_L);
  const lc = resolve(SHEET_L, l.headers, L_COLS);
  const id = nextId("L", 6, l.rows.map((r) => get(r, lc, "수업번호")));
  const stamp = { 등록일시: now(), 등록자: byId, 수정일시: now(), 수정자: byId, 삭제여부: "" };

  await appendRow(SHEET_L, l.headers, toSheetRow({
    수업번호: id,
    지점코드: input.지점코드,
    수업구분: input.수업구분 || KIND_PT,
    상품코드: input.상품코드,
    트레이너사번: input.트레이너사번,
    날짜: input.날짜,
    시작시각: normalizeTime(input.시작시각),
    종료시각: normalizeTime(input.종료시각),
    정원: String(cap),
    진행상태: "예정",
    메모: input.메모 ?? "",
    ...stamp,
  }, lc));

  const a = await readSheet(SHEET_LA);
  const ac = resolve(SHEET_LA, a.headers, LA_COLS);
  // 한 번에 여러 줄을 넣으므로 번호를 미리 세어둔다 (LA000007, LA000008 …)
  const seed = nextId("LA", 6, a.rows.map((r) => get(r, ac, "참석번호")));
  const base = Number(seed.slice(2));
  await appendRows(SHEET_LA, a.headers, input.members.map((m, i) => {
    return toSheetRow({
      참석번호: "LA" + String(base + i).padStart(6, "0"),
      수업번호: id,
      회원번호: m.회원번호,
      이용권번호: m.이용권번호 ?? "",
      진행상태: "예정",
      차감회차: "0",
      메모: "",
      ...stamp,
    }, ac);
  }));

  return id;
}

/**
 * 참석 한 줄의 결과를 바꾼다 — 여기서만 회차가 움직인다
 *
 * 차감회차 칸에 "실제로 뺀 회수"를 적어둔다. 그래서 완료 → 노쇼로
 * 되돌리면 정확히 그만큼만 돌려준다. 잘못 찍어도 되돌릴 수 있다.
 */
export async function setJoinState(joinId: string, state: string, byId: string): Promise<void> {
  const a = await readSheet(SHEET_LA);
  const ac = resolve(SHEET_LA, a.headers, LA_COLS);
  const i = a.rows.findIndex((r) => get(r, ac, "참석번호") === joinId);
  if (i < 0) throw new Error("해당 참석 기록을 찾지 못했습니다.");

  const row = a.rows[i];
  const ticket = get(row, ac, "이용권번호");
  const already = int(get(row, ac, "차감회차"));
  const should = usesCount(state) ? 1 : 0;
  const delta = should - already;

  if (delta !== 0 && ticket) {
    const tickets = await listTickets();
    const t = tickets.find((x) => x.id === ticket);
    if (!t) throw new Error(`이용권 ${ticket} 을(를) 찾지 못했습니다.`);
    const left = int(t.잔여횟수);
    if (delta > 0 && left <= 0) {
      throw new Error("남은 횟수가 없어 완료로 바꿀 수 없습니다. 이용권을 먼저 확인해주세요.");
    }
    await patchTicket(ticket, { 잔여횟수: String(Math.max(0, left - delta)) }, byId);
  }

  await updateRow(SHEET_LA, a.rowNumbers[i], a.headers, {
    ...row,
    ...toSheetRow({
      진행상태: state,
      차감회차: String(should),
      수정일시: now(),
      수정자: byId,
    }, ac),
  });
}

/** 수업 자체를 고친다 (시간 옮기기 · 메모 · 취소) */
export async function patchLesson(
  id: string,
  changes: Record<string, string>,
  byId: string
): Promise<void> {
  const l = await readSheet(SHEET_L);
  const lc = resolve(SHEET_L, l.headers, L_COLS);
  const i = l.rows.findIndex((r) => get(r, lc, "수업번호") === id);
  if (i < 0) throw new Error("해당 수업을 찾지 못했습니다.");

  const next = { ...changes };
  if (next.시작시각) next.시작시각 = normalizeTime(next.시작시각);
  if (next.종료시각) next.종료시각 = normalizeTime(next.종료시각);

  await updateRow(SHEET_L, l.rowNumbers[i], l.headers, {
    ...l.rows[i],
    ...toSheetRow({ ...next, 수정일시: now(), 수정자: byId }, lc),
  });
}

/**
 * 수업을 지운다
 *
 * 이미 완료로 찍혀 회차가 빠진 사람이 있으면 먼저 돌려준다.
 * 안 돌려주면 회원의 남은 횟수가 조용히 사라진다.
 */
export async function softDeleteLesson(id: string, byId: string): Promise<void> {
  const a = await readSheet(SHEET_LA);
  const ac = resolve(SHEET_LA, a.headers, LA_COLS);

  for (let i = 0; i < a.rows.length; i++) {
    const r = a.rows[i];
    if (get(r, ac, "수업번호") !== id) continue;
    if ((r["삭제여부"] ?? "").toUpperCase() === "Y") continue;
    await setJoinState(get(r, ac, "참석번호"), "취소", byId);
  }

  const fresh = await readSheet(SHEET_LA);
  const fc = resolve(SHEET_LA, fresh.headers, LA_COLS);
  for (let i = 0; i < fresh.rows.length; i++) {
    const r = fresh.rows[i];
    if (get(r, fc, "수업번호") !== id) continue;
    await updateRow(SHEET_LA, fresh.rowNumbers[i], fresh.headers, {
      ...r,
      ...toSheetRow({ 삭제여부: "Y", 수정일시: now(), 수정자: byId }, fc),
    });
  }

  const l = await readSheet(SHEET_L);
  const lc = resolve(SHEET_L, l.headers, L_COLS);
  const j = l.rows.findIndex((r) => get(r, lc, "수업번호") === id);
  if (j < 0) throw new Error("해당 수업을 찾지 못했습니다.");
  await updateRow(SHEET_L, l.rowNumbers[j], l.headers, {
    ...l.rows[j],
    ...toSheetRow({ 삭제여부: "Y", 수정일시: now(), 수정자: byId }, lc),
  });
}
