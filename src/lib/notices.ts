/**
 * 공지 · 업무 (서버 전용)
 *
 * 공지는 카톡방을 대신한다. 카톡은 스크롤에 묻히고 누가 읽었는지 알 수 없다.
 * 그래서 "읽음"을 남기는 것이 이 화면의 핵심이다.
 *
 * 업무는 매일 반복되는 일이다. 지점마다 목록이 다르고 담당자가 정해져 있다.
 * 정의(업무)와 기록(업무기록)을 나눠 둔다.
 */
import { readSheet, appendRow, appendRows, updateRow, updateRows, addColumns, type Row } from "./sheets";
import { resolve, toSheetRow, get, type ColumnSpec } from "./columns";
import { now, today } from "./time";
import { SHEET_N, SHEET_NR, SHEET_TASK, SHEET_TASKLOG, NO_PRIORITY } from "./noticeMeta";

export { SHEET_N, SHEET_NR, SHEET_TASK, SHEET_TASKLOG } from "./noticeMeta";

const N_COLS: ColumnSpec = {
  공지번호: { names: ["공지 번호"], required: true },
  지점코드: { names: ["지점"] },
  제목: { names: [], required: true },
  내용: { names: ["본문"] },
  중요: { names: ["고정"] },
  게시일: { names: ["작성일"] },
  마감일: { names: ["종료일"] },
  등록일시: { names: [] },
  등록자: { names: [] },
  수정일시: { names: [] },
  수정자: { names: [] },
  삭제여부: { names: [] },
};

const NR_COLS: ColumnSpec = {
  읽음번호: { names: [], required: true },
  공지번호: { names: [], required: true },
  사번: { names: [], required: true },
  읽은일시: { names: [] },
};

const TASK_COLS: ColumnSpec = {
  업무번호: { names: ["업무 번호"], required: true },
  지점코드: { names: ["지점"], required: true },
  업무명: { names: ["업무", "이름"], required: true },
  담당사번: { names: ["담당", "담당자"] },
  우선순위: { names: ["순위", "우선"] },
  순서: { names: ["정렬순서"] },
  메모: { names: ["비고"] },
  사용여부: { names: ["사용"] },
  등록일시: { names: [] },
  등록자: { names: [] },
  수정일시: { names: [] },
  수정자: { names: [] },
  삭제여부: { names: [] },
};

const LOG_COLS: ColumnSpec = {
  기록번호: { names: [], required: true },
  업무번호: { names: [], required: true },
  지점코드: { names: ["지점"] },
  날짜: { names: [], required: true },
  담당사번: { names: ["담당"] },
  처리자: { names: [] },
  처리일시: { names: [] },
  메모: { names: ["비고"] },
  삭제여부: { names: [] },
};

export type Notice = {
  id: string;
  지점코드: string;
  제목: string;
  내용: string;
  중요: boolean;
  게시일: string;
  마감일: string;
  등록자: string;
};

export type NoticeRead = { 공지번호: string; 사번: string; 읽은일시: string };

export type Task = {
  id: string;
  지점코드: string;
  업무명: string;
  담당사번: string;
  /** 1 · 2 · 3, 정해두지 않았으면 NO_PRIORITY */
  우선순위: number;
  순서: number;
  메모: string;
  /**
   * 지금 돌리고 있는 업무인가
   *
   * 계단 에어컨 점검은 겨울에 안 한다. 지워버리면 봄에 다시 적어 넣어야 하고
   * 지난 기록도 목록에서 떨어져 나간다. 꺼두고 두는 편이 낫다.
   */
  쓰는중: boolean;
};

export type TaskLog = {
  id: string;
  업무번호: string;
  날짜: string;
  처리자: string;
  처리일시: string;
};

const yes = (v: string) => (v ?? "").trim().toUpperCase() === "Y";
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

/* ── 읽기 ─────────────────────────────────── */

export async function loadAll(): Promise<{
  notices: Notice[];
  reads: NoticeRead[];
  tasks: Task[];
  logs: TaskLog[];
}> {
  const [n, r, t, l] = await Promise.all([
    readSheet(SHEET_N),
    readSheet(SHEET_NR),
    readSheet(SHEET_TASK),
    readSheet(SHEET_TASKLOG),
  ]);

  const nc = resolve(SHEET_N, n.headers, N_COLS);
  const rc = resolve(SHEET_NR, r.headers, NR_COLS);
  const tc = resolve(SHEET_TASK, t.headers, TASK_COLS);
  const lc = resolve(SHEET_TASKLOG, l.headers, LOG_COLS);

  const notices: Notice[] = [];
  n.rows.forEach((row) => {
    if ((row["삭제여부"] ?? "").toUpperCase() === "Y") return;
    const id = get(row, nc, "공지번호");
    if (!id) return;
    notices.push({
      id,
      지점코드: get(row, nc, "지점코드"),
      제목: get(row, nc, "제목"),
      내용: get(row, nc, "내용"),
      중요: yes(get(row, nc, "중요")),
      게시일: get(row, nc, "게시일").slice(0, 10),
      마감일: get(row, nc, "마감일").slice(0, 10),
      등록자: get(row, nc, "등록자"),
    });
  });
  notices.sort((a, b) => (b.게시일 + b.id).localeCompare(a.게시일 + a.id));

  const reads: NoticeRead[] = r.rows
    .filter((row) => get(row, rc, "공지번호"))
    .map((row) => ({
      공지번호: get(row, rc, "공지번호"),
      사번: get(row, rc, "사번"),
      읽은일시: get(row, rc, "읽은일시"),
    }));

  const tasks: Task[] = [];
  t.rows.forEach((row) => {
    if ((row["삭제여부"] ?? "").toUpperCase() === "Y") return;
    const id = get(row, tc, "업무번호");
    if (!id) return;
    tasks.push({
      id,
      지점코드: get(row, tc, "지점코드"),
      업무명: get(row, tc, "업무명"),
      담당사번: get(row, tc, "담당사번"),
      우선순위: int(get(row, tc, "우선순위"), 0) || NO_PRIORITY,
      순서: int(get(row, tc, "순서"), 99),
      메모: get(row, tc, "메모"),
      // 빈 칸은 예전에 넣은 줄이다. 끄지 않은 것으로 본다
      쓰는중: yes(get(row, tc, "사용여부") || "Y"),
    });
  });
  // 순위가 먼저다. 순위 없는 것은 맨 뒤로 밀린다
  tasks.sort(
    (a, b) =>
      a.우선순위 - b.우선순위 || a.순서 - b.순서 || a.업무명.localeCompare(b.업무명, "ko")
  );

  const logs: TaskLog[] = [];
  l.rows.forEach((row) => {
    if ((row["삭제여부"] ?? "").toUpperCase() === "Y") return;
    const id = get(row, lc, "기록번호");
    if (!id) return;
    logs.push({
      id,
      업무번호: get(row, lc, "업무번호"),
      날짜: get(row, lc, "날짜").slice(0, 10),
      처리자: get(row, lc, "처리자"),
      처리일시: get(row, lc, "처리일시"),
    });
  });

  return { notices, reads, tasks, logs };
}

/* ── 공지 ─────────────────────────────────── */

export async function createNotice(
  input: { 지점코드: string; 제목: string; 내용: string; 중요: boolean; 마감일: string },
  byId: string
): Promise<string> {
  if (!input.제목.trim()) throw new Error("제목을 적어주세요.");

  const n = await readSheet(SHEET_N);
  const nc = resolve(SHEET_N, n.headers, N_COLS);
  const id = nextId("N", 5, n.rows.map((r) => get(r, nc, "공지번호")));
  const stamp = now();

  await appendRow(SHEET_N, n.headers, toSheetRow({
    공지번호: id,
    지점코드: input.지점코드 ?? "",
    제목: input.제목.trim(),
    내용: input.내용 ?? "",
    중요: input.중요 ? "Y" : "",
    게시일: today(),
    마감일: input.마감일 ?? "",
    등록일시: stamp,
    등록자: byId,
    수정일시: stamp,
    수정자: byId,
    삭제여부: "",
  }, nc));

  return id;
}

export async function patchNotice(
  id: string,
  changes: Record<string, string>,
  byId: string
): Promise<void> {
  const n = await readSheet(SHEET_N);
  const nc = resolve(SHEET_N, n.headers, N_COLS);
  const i = n.rows.findIndex((r) => get(r, nc, "공지번호") === id);
  if (i < 0) throw new Error("해당 공지를 찾지 못했습니다.");

  await updateRow(SHEET_N, n.rowNumbers[i], n.headers, {
    ...n.rows[i],
    ...toSheetRow({ ...changes, 수정일시: now(), 수정자: byId }, nc),
  });
}

export async function softDeleteNotice(id: string, byId: string): Promise<void> {
  await patchNotice(id, { 삭제여부: "Y" }, byId);
}

/**
 * 읽음 남기기
 *
 * 같은 사람이 여러 번 열어도 한 줄만 남긴다. 처음 읽은 시각이 중요하지
 * 몇 번 열었는지는 알 필요가 없다.
 */
export async function markRead(공지번호: string, 사번: string): Promise<void> {
  const r = await readSheet(SHEET_NR);
  const rc = resolve(SHEET_NR, r.headers, NR_COLS);

  const already = r.rows.some(
    (row) => get(row, rc, "공지번호") === 공지번호 && get(row, rc, "사번") === 사번
  );
  if (already) return;

  const id = nextId("NR", 6, r.rows.map((row) => get(row, rc, "읽음번호")));
  await appendRow(SHEET_NR, r.headers, toSheetRow({
    읽음번호: id,
    공지번호,
    사번,
    읽은일시: now(),
  }, rc));
}

/**
 * 이 공지의 읽음 기록을 모두 지운다
 *
 * 내용을 크게 고쳤으면 앞서 읽은 것은 다른 글을 읽은 것이다.
 * 그대로 두면 "다 읽었다"고 나오는데 정작 바뀐 내용은 아무도 못 본 상태가 된다.
 * 다만 늘 지우지는 않는다 — 오타 하나 고쳤다고 전원에게 다시 읽으라고 할 수는 없다.
 */
export async function clearReads(공지번호: string): Promise<void> {
  const r = await readSheet(SHEET_NR);
  const rc = resolve(SHEET_NR, r.headers, NR_COLS);

  const gone: { rowNumber: number; row: Row }[] = [];
  r.rows.forEach((row, i) => {
    if (get(row, rc, "공지번호") !== 공지번호) return;
    gone.push({ rowNumber: r.rowNumbers[i], row: { ...row, 공지번호: "", 사번: "" } });
  });
  await updateRows(SHEET_NR, r.headers, gone);
}

/* ── 업무 ─────────────────────────────────── */

/**
 * 우선순위 칸은 뒤늦게 생겼다
 *
 * 이미 업무를 넣어 쓰던 시트에는 그 칸이 없다. 없으면 만들고 다시 읽는다 —
 * 대표님께 "시트에 칸을 하나 추가해 주세요"라고 부탁할 일이 아니다.
 */
async function ensureTaskColumns(headers: string[]): Promise<boolean> {
  if (headers.includes("우선순위")) return false;
  await addColumns(SHEET_TASK, ["우선순위"]);
  return true;
}

export async function createTask(
  input: {
    지점코드: string; 업무명: string; 담당사번: string;
    우선순위: number; 순서: number; 메모: string;
  },
  byId: string
): Promise<string> {
  if (!input.업무명.trim()) throw new Error("업무 이름을 적어주세요.");
  if (!input.지점코드) throw new Error("어느 지점 업무인지 정해주세요.");

  let t = await readSheet(SHEET_TASK);
  if (await ensureTaskColumns(t.headers)) t = await readSheet(SHEET_TASK);
  const tc = resolve(SHEET_TASK, t.headers, TASK_COLS);
  const id = nextId("TK", 5, t.rows.map((r) => get(r, tc, "업무번호")));
  const stamp = now();

  await appendRow(SHEET_TASK, t.headers, toSheetRow({
    업무번호: id,
    지점코드: input.지점코드,
    업무명: input.업무명.trim(),
    담당사번: input.담당사번 ?? "",
    우선순위: input.우선순위 > 0 && input.우선순위 < NO_PRIORITY ? String(input.우선순위) : "",
    순서: String(input.순서 || 99),
    메모: input.메모 ?? "",
    사용여부: "Y",
    등록일시: stamp,
    등록자: byId,
    수정일시: stamp,
    수정자: byId,
    삭제여부: "",
  }, tc));

  return id;
}

/**
 * 여러 업무를 한 번에 배정한다
 *
 * 지점마다 열 개 남짓을 한 줄씩 넣게 하면 마흔 번을 누르게 된다.
 * 목록을 붙여넣고 한 번에 만든다. 줄 순서가 그대로 화면 순서가 된다.
 *
 * 여러 지점에 같은 목록을 넣는 일이 흔하므로 지점을 여럿 받는다.
 */
export async function createTasks(
  지점들: string[],
  items: { 업무명: string; 담당사번: string; 우선순위: number; 메모: string }[],
  byId: string
): Promise<number> {
  const clean = items.filter((x) => x.업무명.trim());
  if (clean.length === 0) throw new Error("만들 업무가 없습니다.");
  if (지점들.length === 0) throw new Error("어느 지점에 넣을지 골라주세요.");

  let t = await readSheet(SHEET_TASK);
  if (await ensureTaskColumns(t.headers)) t = await readSheet(SHEET_TASK);
  const tc = resolve(SHEET_TASK, t.headers, TASK_COLS);
  const seed = nextId("TK", 5, t.rows.map((r) => get(r, tc, "업무번호")));
  let n = Number(seed.slice(2));
  const stamp = now();

  /*
    이미 있는 것 뒤에 붙인다

    늘 10부터 매기면, 스물한 개가 있는 1순위에 하나를 더 넣었을 때 그것이
    맨 위로 올라간다. 새로 넣은 일이 첫 번째 할 일이 될 이유가 없다.
    지점과 순위가 같은 것들 중 가장 큰 번호를 찾아 그 다음부터 매긴다.
  */
  const tail = new Map<string, number>();
  t.rows.forEach((r) => {
    if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
    if (!get(r, tc, "업무번호")) return;
    const key = `${get(r, tc, "지점코드")}|${int(get(r, tc, "우선순위"), 0)}`;
    tail.set(key, Math.max(tail.get(key) ?? 0, int(get(r, tc, "순서"), 0)));
  });
  const nextOrder = (지점코드: string, 순위: number) => {
    const key = `${지점코드}|${순위}`;
    const v = (tail.get(key) ?? 0) + 10;
    tail.set(key, v);
    return v;
  };

  const rows: Row[] = [];
  지점들.forEach((지점코드) => {
    clean.forEach((x) => {
      const 순위 = x.우선순위 > 0 && x.우선순위 < NO_PRIORITY ? x.우선순위 : 0;
      rows.push(toSheetRow({
        업무번호: "TK" + String(n++).padStart(5, "0"),
        지점코드,
        업무명: x.업무명.trim(),
        담당사번: x.담당사번 ?? "",
        우선순위: 순위 ? String(순위) : "",
        // 붙여넣은 차례가 곧 화면에 나오는 차례다
        순서: String(nextOrder(지점코드, 순위)),
        메모: x.메모 ?? "",
        사용여부: "Y",
        등록일시: stamp,
        등록자: byId,
        수정일시: stamp,
        수정자: byId,
        삭제여부: "",
      }, tc));
    });
  });

  await appendRows(SHEET_TASK, t.headers, rows);
  return rows.length;
}

/**
 * 고른 업무 여럿을 한꺼번에 바꾼다
 *
 * 예순 개짜리 목록에서 담당자가 바뀌거나 지점을 잘못 골랐을 때, 한 줄씩
 * 창을 여닫게 하면 아무도 안 고친다. 쓰기도 한 번에 몰아 보낸다 —
 * 예순 번을 나눠 보내면 중간에 끊겼을 때 절반만 바뀐 상태로 남는다.
 *
 * 바꿀 수 있는 칸을 몇 개로 묶어 둔 것은 화면이 보낸 이름을 그대로 시트에
 * 쓰지 않기 위해서다.
 */
const BATCH_FIELDS = ["담당사번", "우선순위", "사용여부", "삭제여부", "지점코드"];

export async function batchTasks(
  ids: string[],
  changes: Record<string, string>,
  byId: string
): Promise<number> {
  if (ids.length === 0) throw new Error("업무를 골라주세요.");
  const keys = Object.keys(changes).filter((k) => BATCH_FIELDS.includes(k));
  if (keys.length === 0) throw new Error("바꿀 내용이 없습니다.");

  let t = await readSheet(SHEET_TASK);
  if (await ensureTaskColumns(t.headers)) t = await readSheet(SHEET_TASK);
  const tc = resolve(SHEET_TASK, t.headers, TASK_COLS);

  const want = new Set(ids);
  const stamp = now();
  const items: { rowNumber: number; row: Row }[] = [];

  t.rows.forEach((row, i) => {
    if (!want.has(get(row, tc, "업무번호"))) return;
    const patch: Record<string, string> = { 수정일시: stamp, 수정자: byId };
    keys.forEach((k) => (patch[k] = changes[k]));
    items.push({ rowNumber: t.rowNumbers[i], row: { ...row, ...toSheetRow(patch, tc) } });
  });

  if (items.length === 0) throw new Error("고르신 업무를 찾지 못했습니다.");
  await updateRows(SHEET_TASK, t.headers, items);
  return items.length;
}

/**
 * 고른 업무를 다른 지점에도 깔아 준다
 *
 * 지점마다 목록이 조금씩 다르다. 통째로 복사한 뒤 몇 줄만 고치는 편이
 * 처음부터 다시 적는 것보다 빠르다. 순위와 순서는 그대로 옮겨 온다.
 */
export async function copyTasks(
  ids: string[],
  지점들: string[],
  byId: string
): Promise<number> {
  if (ids.length === 0) throw new Error("업무를 골라주세요.");
  if (지점들.length === 0) throw new Error("어느 지점에 넣을지 골라주세요.");

  let t = await readSheet(SHEET_TASK);
  if (await ensureTaskColumns(t.headers)) t = await readSheet(SHEET_TASK);
  const tc = resolve(SHEET_TASK, t.headers, TASK_COLS);

  const want = new Set(ids);
  const src = t.rows.filter((r) => want.has(get(r, tc, "업무번호")));
  if (src.length === 0) throw new Error("고르신 업무를 찾지 못했습니다.");

  const seed = nextId("TK", 5, t.rows.map((r) => get(r, tc, "업무번호")));
  let n = Number(seed.slice(2));
  const stamp = now();

  const rows: Row[] = [];
  지점들.forEach((지점코드) => {
    src.forEach((r) => {
      rows.push(toSheetRow({
        업무번호: "TK" + String(n++).padStart(5, "0"),
        지점코드,
        업무명: get(r, tc, "업무명"),
        담당사번: get(r, tc, "담당사번"),
        우선순위: get(r, tc, "우선순위"),
        순서: get(r, tc, "순서"),
        메모: get(r, tc, "메모"),
        사용여부: "Y",
        등록일시: stamp,
        등록자: byId,
        수정일시: stamp,
        수정자: byId,
        삭제여부: "",
      }, tc));
    });
  });

  await appendRows(SHEET_TASK, t.headers, rows);
  return rows.length;
}

export async function patchTask(
  id: string,
  changes: Record<string, string>,
  byId: string
): Promise<void> {
  const t = await readSheet(SHEET_TASK);
  const tc = resolve(SHEET_TASK, t.headers, TASK_COLS);
  const i = t.rows.findIndex((r) => get(r, tc, "업무번호") === id);
  if (i < 0) throw new Error("해당 업무를 찾지 못했습니다.");

  await updateRow(SHEET_TASK, t.rowNumbers[i], t.headers, {
    ...t.rows[i],
    ...toSheetRow({ ...changes, 수정일시: now(), 수정자: byId }, tc),
  });
}

export async function softDeleteTask(id: string, byId: string): Promise<void> {
  await patchTask(id, { 삭제여부: "Y" }, byId);
}

/**
 * 오늘 이 업무를 했다 / 안 했다로 바꾼다
 *
 * 했다 = 기록 한 줄, 안 했다 = 그 줄에 삭제 표시.
 * 줄을 실제로 지우지 않는 이유는 다른 곳과 같다 — 누가 체크했다 풀었는지가 남아야 한다.
 */
export async function setTaskDone(
  업무번호: string,
  날짜: string,
  done: boolean,
  byId: string
): Promise<void> {
  const [l, t] = await Promise.all([readSheet(SHEET_TASKLOG), readSheet(SHEET_TASK)]);
  const lc = resolve(SHEET_TASKLOG, l.headers, LOG_COLS);
  const tc = resolve(SHEET_TASK, t.headers, TASK_COLS);

  const task = t.rows.find((r) => get(r, tc, "업무번호") === 업무번호);
  if (!task) throw new Error("해당 업무를 찾지 못했습니다.");

  const hit: { rowNumber: number; row: Row }[] = [];
  l.rows.forEach((r, i) => {
    if (get(r, lc, "업무번호") !== 업무번호) return;
    if (get(r, lc, "날짜").slice(0, 10) !== 날짜) return;
    hit.push({ rowNumber: l.rowNumbers[i], row: r });
  });

  const stamp = now();

  if (!done) {
    await updateRows(
      SHEET_TASKLOG,
      l.headers,
      hit.map(({ rowNumber, row }) => ({
        rowNumber,
        row: { ...row, ...toSheetRow({ 삭제여부: "Y", 처리자: byId, 처리일시: stamp }, lc) },
      }))
    );
    return;
  }

  // 이미 살아 있는 기록이 있으면 그대로 둔다 (두 번 눌러도 한 줄)
  const alive = hit.find(({ row }) => (row["삭제여부"] ?? "").toUpperCase() !== "Y");
  if (alive) return;

  const back = hit[0];
  if (back) {
    await updateRow(SHEET_TASKLOG, back.rowNumber, l.headers, {
      ...back.row,
      ...toSheetRow({ 삭제여부: "", 처리자: byId, 처리일시: stamp }, lc),
    });
    return;
  }

  const id = nextId("TL", 6, l.rows.map((r) => get(r, lc, "기록번호")));
  await appendRow(SHEET_TASKLOG, l.headers, toSheetRow({
    기록번호: id,
    업무번호,
    지점코드: get(task, tc, "지점코드"),
    날짜,
    담당사번: get(task, tc, "담당사번"),
    처리자: byId,
    처리일시: stamp,
    메모: "",
    삭제여부: "",
  }, lc));
}
