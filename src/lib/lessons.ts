/**
 * PT · 수업 (서버 전용)
 *
 * 수업 한 줄에 참석 여러 줄이 매달린다.
 * 1:1 PT 는 참석이 한 줄, 그룹수업은 여러 줄이다 — 구조는 하나다.
 *
 * 회차 차감은 "수업"이 아니라 "참석"에서 일어난다.
 * 그룹수업은 한 수업에서도 온 사람과 안 온 사람이 갈리기 때문이다.
 */
import {
  readSheet, appendRow, appendRows, updateRow, updateRows, addColumns, type Row,
} from "./sheets";
import { resolve, toSheetRow, get, type ColumnSpec } from "./columns";
import { now } from "./time";
import { patchTicket, listTickets, listMembers, bumpTicketCounts } from "./members";
import { getProducts } from "./data";
import { readProduct } from "./productMeta";
import {
  SHEET_L, SHEET_LA, usesCount, normalizeTime, toMinutes, lastSlot, KIND_PT, KIND_GROUP,
} from "./lessonMeta";

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
  사진파일: { names: ["사진", "수업사진"] },
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
  판매트레이너사번: { names: ["판매자", "판매트레이너"] },
  이용권금액: { names: ["결제금액"] },
  총회차: { names: ["이용권총회차"] },
  결제회차: { names: ["상품결제회차"] },
  완료일시: { names: ["완료시각"] },
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
  /** 수업 후 사진 (구글 드라이브 파일 번호) — 그룹수업 보고에 쓴다 */
  사진파일: string;
};

export type Join = {
  id: string;
  수업번호: string;
  회원번호: string;
  이용권번호: string;
  진행상태: string;
  차감회차: number;
  메모: string;
  /** 이 이용권을 판 사람 — 수업을 한 사람과 다를 수 있다 (대타) */
  판매트레이너사번: string;
  /** 완료로 찍는 순간의 이용권 값. 나중에 가격이 바뀌어도 지난 정산은 안 흔들린다 */
  이용권금액: number;
  총회차: number;
  결제회차: number;
  완료일시: string;
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
      사진파일: get(r, lc, "사진파일"),
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
      판매트레이너사번: get(r, ac, "판매트레이너사번"),
      이용권금액: int(get(r, ac, "이용권금액")),
      총회차: int(get(r, ac, "총회차")),
      결제회차: int(get(r, ac, "결제회차")),
      완료일시: get(r, ac, "완료일시"),
    });
  });

  return { lessons, joins };
}

/**
 * 두 수업이 시간이 겹치는가
 *
 * 끝시각과 다음 시작시각이 같은 것은 겹친 것이 아니다 (10:00~11:00 과 11:00~12:00).
 * 시각이 안 적힌 수업은 겹침을 따지지 않는다 — 모르는 것을 막으면 아무것도 못 넣는다.
 */
function overlaps(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  const a1 = toMinutes(aFrom);
  const b1 = toMinutes(bFrom);
  if (a1 === null || b1 === null) return false;
  const a2 = toMinutes(aTo) ?? a1 + 1;
  const b2 = toMinutes(bTo) ?? b1 + 1;
  return a1 < b2 && b1 < a2;
}

/**
 * 같은 시간에 두 번 잡히는 것을 막는다
 *
 * 정산은 "수업 한 줄 = 실제로 있었던 수업 하나"를 믿고 센다.
 * 겹친 줄을 그냥 두면 없던 수업이 회차와 수당으로 잡힌다. 넣을 때 막는 편이
 * 나중에 찾아 지우는 것보다 훨씬 싸다.
 *
 * skipId 는 자기 자신 — 시간을 옮길 때 자기와 겹친다고 막으면 안 된다.
 */
async function checkClash(
  next: { 트레이너사번: string; 날짜: string; 시작시각: string; 종료시각: string },
  members: string[],
  skipId: string,
  nameOf: Map<string, string>
): Promise<void> {
  const { lessons, joins } = await listLessons();
  const sameDay = lessons.filter(
    (l) => l.날짜 === next.날짜 && l.id !== skipId && l.진행상태 !== "취소"
  );

  const hit = sameDay.filter((l) =>
    overlaps(next.시작시각, next.종료시각, l.시작시각, l.종료시각)
  );
  if (hit.length === 0) return;

  const mine = hit.find((l) => l.트레이너사번 === next.트레이너사번);
  if (mine) {
    throw new Error(
      `이 트레이너는 ${mine.시작시각}~${mine.종료시각} 에 이미 수업이 있습니다. 시간을 겹쳐 잡을 수 없습니다.`
    );
  }

  const busy = new Set(members);
  for (const l of hit) {
    for (const j of joins) {
      if (j.수업번호 !== l.id) continue;
      if (j.진행상태 === "취소") continue;
      if (!busy.has(j.회원번호)) continue;
      throw new Error(
        `${nameOf.get(j.회원번호) ?? j.회원번호} 님은 ${l.시작시각}~${l.종료시각} 에 이미 다른 수업이 있습니다.`
      );
    }
  }
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

  await checkClash(
    {
      트레이너사번: input.트레이너사번,
      날짜: input.날짜,
      시작시각: input.시작시각,
      종료시각: input.종료시각,
    },
    input.members.map((m) => m.회원번호),
    "",
    await memberNames()
  );

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

  const preA = await readSheet(SHEET_LA);
  const grewA = await ensurePayColumns(preA.headers);
  const a = grewA ? await readSheet(SHEET_LA) : preA;
  const ac = resolve(SHEET_LA, a.headers, LA_COLS);
  // 한 번에 여러 줄을 넣으므로 번호를 미리 세어둔다 (LA000007, LA000008 …)
  const seed = nextId("LA", 6, a.rows.map((r) => get(r, ac, "참석번호")));
  const base = Number(seed.slice(2));
  await appendRows(SHEET_LA, a.headers, input.members.map((m, i) => {
    // 판 사람은 잡을 때 박아둔다. 나중에 이용권의 담당이 바뀌어도 지난 정산은 안 흔들린다
    const t = byTicket.get(m.이용권번호);
    return toSheetRow({
      참석번호: "LA" + String(base + i).padStart(6, "0"),
      수업번호: id,
      회원번호: m.회원번호,
      이용권번호: m.이용권번호 ?? "",
      진행상태: "예정",
      차감회차: "0",
      메모: "",
      판매트레이너사번: t?.담당트레이너사번 ?? "",
      ...stamp,
    }, ac);
  }));

  /*
   * 이용권에 담당 트레이너를 채워 준다
   *
   * 회원 화면의 「담당 트레이너」는 살아 있는 수강권·케어권에 적힌 사람을
   * 본다. 그런데 PT 를 팔 때 트레이너를 안 고르고 나중에 정하는 일이 흔해서,
   * 수업을 잡아 놓고도 회원 목록에는 「-」로 남아 있었다.
   *
   * 이미 적힌 사람이 있으면 손대지 않는다. 하루 대신 봐 준 수업 때문에
   * 회원의 담당이 통째로 넘어가면 그게 더 큰 사고다. 바꾸실 일이 있으면
   * 이용권 고치기에서 직접 고르시면 된다.
   */
  for (const m of input.members) {
    if (!m.이용권번호) continue;
    const t = byTicket.get(m.이용권번호);
    if (!t || (t.담당트레이너사번 ?? "").trim()) continue;
    try {
      await patchTicket(m.이용권번호, { 담당트레이너사번: input.트레이너사번 }, byId);
    } catch {
      /* 여기서 실패해도 수업은 이미 잡혔다. 되돌리지 않는다 —
         담당을 못 적은 것과 수업이 없는 것은 무게가 다르다 */
    }
  }

  return id;
}

/**
 * 참석 한 줄의 결과를 바꾼다 — 여기서만 회차가 움직인다
 *
 * 차감회차 칸에 "실제로 뺀 회수"를 적어둔다. 그래서 완료 → 노쇼로
 * 되돌리면 정확히 그만큼만 돌려준다. 잘못 찍어도 되돌릴 수 있다.
 */
export async function setJoinState(joinId: string, state: string, byId: string): Promise<void> {
  const pre = await readSheet(SHEET_LA);
  const grew = await ensurePayColumns(pre.headers);
  const a = grew ? await readSheet(SHEET_LA) : pre;
  const ac = resolve(SHEET_LA, a.headers, LA_COLS);
  const i = a.rows.findIndex((r) => get(r, ac, "참석번호") === joinId);
  if (i < 0) throw new Error("해당 참석 기록을 찾지 못했습니다.");

  const row = a.rows[i];
  const ticket = get(row, ac, "이용권번호");
  const already = int(get(row, ac, "차감회차"));
  const should = usesCount(state) ? 1 : 0;
  const delta = should - already;

  /*
   * 수업료를 계산할 때 쓸 값을 완료로 찍는 순간에 박아둔다
   *
   * 계산할 때 이용권을 다시 읽으면, 그 사이에 가격이 바뀌거나 이용권이 지워졌을 때
   * 지난달 정산 결과가 조용히 달라진다. 정산은 "그때 그랬다"가 남아야 한다.
   * 단가를 여기서 계산하지 않고 재료(금액 · 총회차 · 결제회차)만 남기는 이유는,
   * 서비스 회차를 단가에 넣을지 아직 정하지 않았기 때문이다. 어느 쪽으로 정하든
   * 이 세 값이면 나중에 계산할 수 있다.
   */
  const snap: Record<string, string> = {};
  if (delta !== 0 && ticket) {
    const tickets = await listTickets();
    const t = tickets.find((x) => x.id === ticket);
    if (!t) throw new Error(`이용권 ${ticket} 을(를) 찾지 못했습니다.`);
    const left = int(t.잔여횟수);
    if (delta > 0 && left <= 0) {
      throw new Error("남은 횟수가 없어 완료로 바꿀 수 없습니다. 이용권을 먼저 확인해주세요.");
    }
    await patchTicket(ticket, { 잔여횟수: String(Math.max(0, left - delta)) }, byId);

    if (should > 0) {
      const products = await getProducts();
      const p = products.find((x) => x.code === t.상품코드);
      const meta = p ? readProduct(p) : null;
      snap.이용권금액 = String(int(t.금액));
      snap.총회차 = String(int(t.총횟수) || meta?.count || 0);
      // 결제회차 = 돈을 낸 만큼. 서비스로 얹어준 회차는 뺀다
      snap.결제회차 = String(payCount(p) || int(t.총횟수) || 0);
      snap.완료일시 = now();
      if (!get(row, ac, "판매트레이너사번")) snap.판매트레이너사번 = t.담당트레이너사번 ?? "";
    } else {
      // 되돌리면 그때 박아둔 값도 지운다. 남겨두면 안 한 수업이 정산에 잡힌다
      snap.완료일시 = "";
    }
  }

  await updateRow(SHEET_LA, a.rowNumbers[i], a.headers, {
    ...row,
    ...toSheetRow({
      진행상태: state,
      차감회차: String(should),
      ...snap,
      수정일시: now(),
      수정자: byId,
    }, ac),
  });
}

/** 상품에서 "돈 낸 회차"를 꺼낸다. 못 찾으면 0 */
function payCount(product: any): number {
  if (!product) return 0;
  const meta = readProduct(product);
  const paid = Number((product["결제횟수"] ?? "").toString().replace(/[^0-9]/g, ""));
  if (Number.isFinite(paid) && paid > 0) return paid;
  return meta.count;
}

/**
 * 정산에 쓰는 칸이 없으면 만든다
 *
 * 이 칸들은 뒤늦게 생긴 것이라, 먼저 만든 시트에는 없다. 없는 칸에 적으면
 * 조용히 사라진다 — 저장은 된 것처럼 보이는데 정산할 때 값이 비어 있다.
 * 돈이 걸린 값이라 조용히 잃는 쪽이 제일 나쁘다.
 */
const PAY_COLUMNS = ["판매트레이너사번", "이용권금액", "총회차", "결제회차", "완료일시"];

async function ensurePayColumns(headers: string[]): Promise<boolean> {
  const missing = PAY_COLUMNS.filter((c) => !headers.includes(c));
  if (missing.length === 0) return false;
  await addColumns(SHEET_LA, missing);
  return true;
}

/** 사진 칸도 뒤늦게 생긴 것이라 같은 이유로 직접 만든다 */
async function ensurePhotoColumn(headers: string[]): Promise<boolean> {
  if (headers.includes("사진파일")) return false;
  await addColumns(SHEET_L, ["사진파일"]);
  return true;
}

/** 겹침을 알릴 때 회원 이름을 쓰려면 이름표가 필요하다 */
async function memberNames(): Promise<Map<string, string>> {
  const { items } = await listMembers();
  return new Map(items.map((m) => [m.id, m.이름]));
}

/**
 * 그룹수업 하루치를 보고한다
 *
 * 그룹수업은 담당 직원과 시간이 이미 정해져 있다. 회원을 고르고 정원을 적는
 * 절차가 필요 없다 — 그날 어느 타임을 했는지만 남기면 된다.
 *
 * 사진은 고른 타임 중 가장 늦은 하나에만 붙인다. 타임마다 찍으라고 하면
 * 하루에 세 번 사진을 올려야 하고, 그러면 안 하게 된다.
 *
 * 같은 날 다시 보고하면 그날 것을 지우고 새로 쓴다. 두 번 눌러도 겹치지 않고,
 * 타임을 잘못 골랐을 때 고쳐 보낼 수 있다.
 */
export async function reportGroup(input: {
  사번: string;
  지점코드: string;
  날짜: string;
  slots: string[];
  사진파일: string;
  메모: string;
}, byId: string): Promise<number> {
  const slots = [...new Set(input.slots.map(normalizeTime).filter(Boolean))].sort();
  if (slots.length === 0) throw new Error("수업한 시간대를 하나 이상 골라주세요.");
  if (!input.사진파일) throw new Error("수업 후 사진을 올려야 보고할 수 있습니다.");

  const preL = await readSheet(SHEET_L);
  const grewL = await ensurePhotoColumn(preL.headers);
  const l = grewL ? await readSheet(SHEET_L) : preL;
  const lc = resolve(SHEET_L, l.headers, L_COLS);
  const stamp = now();

  // 그날 그 사람의 그룹수업 줄을 먼저 지운다 — 다시 보고하면 새 것만 남는다
  const old: { rowNumber: number; row: Row }[] = [];
  l.rows.forEach((r, i) => {
    if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
    if (get(r, lc, "수업구분") !== KIND_GROUP) return;
    if (get(r, lc, "트레이너사번") !== input.사번) return;
    if (get(r, lc, "날짜").slice(0, 10) !== input.날짜) return;
    old.push({
      rowNumber: l.rowNumbers[i],
      row: { ...r, ...toSheetRow({ 삭제여부: "Y", 수정일시: stamp, 수정자: byId }, lc) },
    });
  });
  await updateRows(SHEET_L, l.headers, old);

  const seed = nextId("L", 6, l.rows.map((r) => get(r, lc, "수업번호")));
  const base = Number(seed.slice(1));
  const last = lastSlot(slots);

  await appendRows(
    SHEET_L,
    l.headers,
    slots.map((t, i) =>
      toSheetRow({
        수업번호: "L" + String(base + i).padStart(6, "0"),
        지점코드: input.지점코드,
        수업구분: KIND_GROUP,
        상품코드: "",
        트레이너사번: input.사번,
        날짜: input.날짜,
        시작시각: t,
        종료시각: "",
        정원: "",
        진행상태: "완료",
        메모: input.메모 ?? "",
        // 사진은 마지막 타임 한 줄에만
        사진파일: t === last ? input.사진파일 : "",
        등록일시: stamp,
        등록자: byId,
        수정일시: stamp,
        수정자: byId,
        삭제여부: "",
      }, lc)
    )
  );

  return slots.length;
}

/**
 * 그룹수업 보고를 지운다
 *
 * 줄을 실제로 없애지 않고 삭제 표시만 남긴다. 언제 무엇을 보고했다가 지웠는지가
 * 시트에 남아야, 나중에 "그날 보고가 왜 없냐"를 따질 수 있다.
 */
export async function deleteGroupReport(
  사번: string,
  날짜: string,
  byId: string
): Promise<number> {
  const l = await readSheet(SHEET_L);
  const lc = resolve(SHEET_L, l.headers, L_COLS);
  const stamp = now();

  const gone: { rowNumber: number; row: Row }[] = [];
  l.rows.forEach((r, i) => {
    if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
    if (get(r, lc, "수업구분") !== KIND_GROUP) return;
    if (get(r, lc, "트레이너사번") !== 사번) return;
    if (get(r, lc, "날짜").slice(0, 10) !== 날짜) return;
    gone.push({
      rowNumber: l.rowNumbers[i],
      row: { ...r, ...toSheetRow({ 삭제여부: "Y", 수정일시: stamp, 수정자: byId }, lc) },
    });
  });

  if (gone.length === 0) throw new Error("지울 보고가 없습니다.");
  await updateRows(SHEET_L, l.headers, gone);
  return gone.length;
}

/**
 * 수업 한 타임을 통째로 완료 처리한다
 *
 * 그룹수업은 참석자가 여럿이라 한 명씩 찍으면 손이 너무 많이 간다.
 * 「수업 완료」 한 번으로 아직 안 찍은 사람을 전부 완료로 만든다.
 * 안 온 사람이 있으면 그 사람만 따로 노쇼로 바꾸면 된다.
 *
 * 이미 노쇼·취소로 찍어둔 사람은 건드리지 않는다. 먼저 손으로 정한 것을
 * 나중에 누른 단추가 덮으면, 찍어둔 사람 입장에서는 값이 멋대로 바뀐 것이다.
 *
 * 처리한 사람 수를 돌려준다.
 */
export async function completeLesson(id: string, byId: string): Promise<number> {
  const pre = await readSheet(SHEET_LA);
  const grew = await ensurePayColumns(pre.headers);
  const a = grew ? await readSheet(SHEET_LA) : pre;
  const ac = resolve(SHEET_LA, a.headers, LA_COLS);

  const targets: { i: number; ticket: string }[] = [];
  a.rows.forEach((r, i) => {
    if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
    if (get(r, ac, "수업번호") !== id) return;
    if ((get(r, ac, "진행상태") || "예정") !== "예정") return;
    targets.push({ i, ticket: get(r, ac, "이용권번호") });
  });

  if (targets.length > 0) {
    const [tickets, products] = await Promise.all([listTickets(), getProducts()]);
    const byTicket = new Map(tickets.map((t) => [t.id, t]));
    const stamp = now();

    // 남은 횟수가 없는 사람은 빼고 간다. 여기서 통째로 막으면 나머지도 못 찍는다
    const ok = targets.filter(({ ticket }) => {
      if (!ticket) return true;
      const t = byTicket.get(ticket);
      return t ? int(t.잔여횟수) > 0 : false;
    });
    if (ok.length === 0) {
      throw new Error("남은 횟수가 있는 참석자가 없습니다. 이용권을 먼저 확인해주세요.");
    }

    await bumpTicketCounts(
      ok.filter((x) => x.ticket).map((x) => ({ id: x.ticket, delta: 1 })),
      byId
    );

    await updateRows(
      SHEET_LA,
      a.headers,
      ok.map(({ i, ticket }) => {
        const t = byTicket.get(ticket);
        const p = t ? products.find((x) => x.code === t.상품코드) : null;
        return {
          rowNumber: a.rowNumbers[i],
          row: {
            ...a.rows[i],
            ...toSheetRow(
              {
                진행상태: "완료",
                차감회차: ticket ? "1" : "0",
                이용권금액: String(int(t?.금액 ?? "")),
                총회차: String(int(t?.총횟수 ?? "")),
                결제회차: String(payCount(p) || int(t?.총횟수 ?? "")),
                완료일시: stamp,
                판매트레이너사번:
                  get(a.rows[i], ac, "판매트레이너사번") || t?.담당트레이너사번 || "",
                수정일시: stamp,
                수정자: byId,
              },
              ac
            ),
          },
        };
      })
    );
  }

  await patchLesson(id, { 진행상태: "완료" }, byId);
  return targets.length;
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

  // 시간을 옮길 때도 겹침을 본다. 잡을 때만 막으면 옮겨서 겹치게 만들 수 있다
  const moved = next.날짜 || next.시작시각 || next.종료시각 || next.트레이너사번;
  if (moved) {
    const cur = l.rows[i];
    const { joins } = await listLessons();
    await checkClash(
      {
        트레이너사번: next.트레이너사번 || get(cur, lc, "트레이너사번"),
        날짜: (next.날짜 || get(cur, lc, "날짜")).slice(0, 10),
        시작시각: next.시작시각 || normalizeTime(get(cur, lc, "시작시각")),
        종료시각: next.종료시각 || normalizeTime(get(cur, lc, "종료시각")),
      },
      joins.filter((j) => j.수업번호 === id && j.진행상태 !== "취소").map((j) => j.회원번호),
      id,
      await memberNames()
    );
  }

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
