/**
 * 공지 · 업무 (서버 전용)
 *
 * 공지는 카톡방을 대신한다. 카톡은 스크롤에 묻히고 누가 읽었는지 알 수 없다.
 * 그래서 "읽음"을 남기는 것이 이 화면의 핵심이다.
 *
 * 업무는 매일 반복되는 일이다. 지점마다 목록이 다르고 담당자가 정해져 있다.
 * 정의(업무)와 기록(업무기록)을 나눠 둔다.
 */
import { readSheet, appendRow, appendRows, updateRow, updateRows, type Row } from "./sheets";
import { resolve, toSheetRow, get, type ColumnSpec } from "./columns";
import { now, today } from "./time";
import { SHEET_N, SHEET_NR, SHEET_TASK, SHEET_TASKLOG } from "./noticeMeta";

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
  순서: number;
  메모: string;
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
    if (!yes(get(row, tc, "사용여부") || "Y")) return;
    tasks.push({
      id,
      지점코드: get(row, tc, "지점코드"),
      업무명: get(row, tc, "업무명"),
      담당사번: get(row, tc, "담당사번"),
      순서: int(get(row, tc, "순서"), 99),
      메모: get(row, tc, "메모"),
    });
  });
  tasks.sort((a, b) => a.순서 - b.순서 || a.업무명.localeCompare(b.업무명, "ko"));

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

export async function createTask(
  input: { 지점코드: string; 업무명: string; 담당사번: string; 순서: number; 메모: string },
  byId: string
): Promise<string> {
  if (!input.업무명.trim()) throw new Error("업무 이름을 적어주세요.");
  if (!input.지점코드) throw new Error("어느 지점 업무인지 정해주세요.");

  const t = await readSheet(SHEET_TASK);
  const tc = resolve(SHEET_TASK, t.headers, TASK_COLS);
  const id = nextId("TK", 5, t.rows.map((r) => get(r, tc, "업무번호")));
  const stamp = now();

  await appendRow(SHEET_TASK, t.headers, toSheetRow({
    업무번호: id,
    지점코드: input.지점코드,
    업무명: input.업무명.trim(),
    담당사번: input.담당사번 ?? "",
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
