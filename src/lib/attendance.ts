/**
 * 근태 — 출퇴근 기록
 *
 * 직원이 스스로 「출근」·「퇴근」을 누른다. 시각은 서버가 적으므로 직원이 고칠 수 없다.
 * 잘못 찍힌 건은 점장·대표가 고친다. 고친 사람과 시각이 시트에 남는다.
 *
 * 한 줄은 하루가 아니라 "한 번의 근무 구간"이다.
 * 오전에 갔다가 저녁에 다시 오면 그날 두 줄이 된다.
 *
 * 지각·조퇴는 직원 탭의 `출근기준시각`·`퇴근기준시각`을 쓴다.
 * 비어 있으면 판정하지 않고 시각만 남긴다. 없는 규칙을 지어내지 않는다.
 */
import { readSheet, appendRow, updateRow, addColumns } from "./sheets";
import { resolve, toSheetRow, get, type ColumnSpec } from "./columns";
import { now, today } from "./time";
import { SHEET_T, toMinutes, normalizeTime, type WorkKind } from "./attendanceMeta";

export { SHEET_T, WORK_KINDS, T_HEADERS, toMinutes, hourText, normalizeTime } from "./attendanceMeta";

const T_COLS: ColumnSpec = {
  근태번호: { names: ["근태 번호", "근태ID"], required: true },
  사번: { names: ["직원사번", "직원"], required: true },
  지점코드: { names: ["지점"], required: true },
  날짜: { names: ["근무일", "근무날짜"], required: true },
  회차: { names: ["순번"] },
  출근시각: { names: ["출근"] },
  퇴근시각: { names: ["퇴근"] },
  휴게시작: { names: ["휴게시작시각"] },
  휴게분: { names: ["휴게(분)", "휴게시간"] },
  휴게내역: { names: ["휴게기록"] },
  근무구분: { names: ["구분", "근태구분"] },
  지각분: { names: ["지각(분)", "지각시간"] },
  조퇴분: { names: ["조퇴(분)", "조퇴시간"] },
  메모: { names: ["비고"] },
  등록일시: { names: [] },
  등록자: { names: [] },
  수정일시: { names: [] },
  수정자: { names: [] },
  삭제여부: { names: [] },
};

export type Attendance = {
  id: string;
  사번: string;
  지점코드: string;
  날짜: string;
  회차: number;
  출근시각: string;
  퇴근시각: string;
  휴게시작: string;
  휴게분: string;
  /** "09:30~10:05 · 12:40~13:00" — 언제 쉬었는지 그대로 남긴다 */
  휴게내역: string;
  근무구분: string;
  지각분: string;
  조퇴분: string;
  메모: string;
};

export async function listAttendance(): Promise<Attendance[]> {
  const { headers, rows } = await readSheet(SHEET_T);
  const cols = resolve(SHEET_T, headers, T_COLS);
  const out: Attendance[] = [];
  rows.forEach((r) => {
    if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
    const id = get(r, cols, "근태번호");
    if (!id) return;
    out.push({
      id,
      사번: get(r, cols, "사번"),
      지점코드: get(r, cols, "지점코드"),
      날짜: get(r, cols, "날짜").slice(0, 10),
      회차: Number(get(r, cols, "회차")) || 1,
      출근시각: normalizeTime(get(r, cols, "출근시각")),
      퇴근시각: normalizeTime(get(r, cols, "퇴근시각")),
      휴게시작: normalizeTime(get(r, cols, "휴게시작")),
      휴게분: get(r, cols, "휴게분"),
      휴게내역: get(r, cols, "휴게내역"),
      근무구분: get(r, cols, "근무구분"),
      지각분: get(r, cols, "지각분"),
      조퇴분: get(r, cols, "조퇴분"),
      메모: get(r, cols, "메모"),
    });
  });
  return out.sort((a, b) => a.날짜.localeCompare(b.날짜) || a.회차 - b.회차);
}

function nextId(existing: string[]): string {
  let max = 0;
  existing.forEach((v) => {
    const m = (v ?? "").match(/^T(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return "T" + String(max + 1).padStart(6, "0");
}

/** "09:30~10:05" 를 기존 기록 뒤에 잇는다 */
function joinSpan(prev: string, from: string, to: string): string {
  const one = `${from}~${to}`;
  return prev ? `${prev} · ${one}` : one;
}

/** 지각인지 본다 — 기준 시각이 없으면 판정하지 않는다 */
export function judge(punchIn: string, baseline: string): { kind: WorkKind; late: number } {
  const a = toMinutes(punchIn);
  const b = toMinutes(baseline);
  if (a === null || b === null || a <= b) return { kind: "정상", late: 0 };
  return { kind: "지각", late: a - b };
}

/** 일찍 갔는지 본다 — 기준 시각이 없으면 판정하지 않는다 */
export function judgeOut(punchOut: string, baseline: string): number {
  const a = toMinutes(punchOut);
  const b = toMinutes(baseline);
  if (a === null || b === null || a >= b) return 0;
  return b - a;
}

/** 오늘 이 사람의 줄들을 찾는다 (시트 줄번호를 함께 들고 다닌다) */
function findDay(
  rows: Record<string, string>[],
  rowNumbers: number[],
  cols: any,
  staffId: string,
  day: string
) {
  const out: { r: Record<string, string>; n: number }[] = [];
  rows.forEach((r, i) => {
    if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
    if (get(r, cols, "사번") !== staffId) return;
    if (get(r, cols, "날짜").slice(0, 10) !== day) return;
    out.push({ r, n: rowNumbers[i] });
  });
  return out.sort((a, b) => (Number(get(a.r, cols, "회차")) || 1) - (Number(get(b.r, cols, "회차")) || 1));
}

/**
 * 출근 찍기
 *
 * 시각은 서버가 정한다. 화면에서 보낸 시각은 믿지 않는다.
 * 아직 퇴근을 안 찍었으면 또 찍지 못한다.
 * 퇴근까지 마친 뒤 다시 찍으면 그날 다음 회차가 된다. (오전 → 저녁)
 * 지각은 첫 회차에만 본다. 저녁에 다시 온 것을 지각이라 할 수 없다.
 */
export async function punchIn(
  staffId: string,
  branchCode: string,
  baseline: string
): Promise<{ time: string; kind: WorkKind; late: number; round: number }> {
  const { headers, rows, rowNumbers } = await readSheet(SHEET_T);
  const cols = resolve(SHEET_T, headers, T_COLS);
  const day = today();
  const mine = findDay(rows, rowNumbers, cols, staffId, day);

  const open = mine.find((x) => get(x.r, cols, "출근시각") && !get(x.r, cols, "퇴근시각"));
  if (open) throw new Error("아직 퇴근을 찍지 않았습니다. 퇴근을 먼저 찍어주세요.");

  const stamp = now();
  const time = stamp.slice(11, 16);
  const worked = mine.filter((x) => get(x.r, cols, "출근시각"));
  const round = worked.length + 1;
  const first = round === 1;
  const { kind, late } = first ? judge(time, baseline) : { kind: "정상" as WorkKind, late: 0 };

  const data: Record<string, string> = {
    사번: staffId,
    지점코드: branchCode,
    날짜: day,
    회차: String(round),
    출근시각: time,
    수정일시: stamp,
    수정자: staffId,
  };
  // 그날 판정은 첫 줄에만 적는다
  if (first) {
    data.근무구분 = kind;
    data.지각분 = late > 0 ? String(late) : "";
  }

  // 점장이 미리 만들어둔 빈 줄이 있으면 거기에 채운다
  const blank = mine.find((x) => !get(x.r, cols, "출근시각"));
  if (first && blank) {
    await updateRow(SHEET_T, blank.n, headers, { ...blank.r, ...toSheetRow(data, cols) });
  } else {
    await appendRow(SHEET_T, headers, {
      ...toSheetRow(
        {
          ...data,
          근태번호: nextId(rows.map((r) => get(r, cols, "근태번호"))),
          등록일시: stamp,
          등록자: staffId,
        },
        cols
      ),
    });
  }
  return { time, kind, late, round };
}

/**
 * 퇴근 찍기 — 아직 안 끝난 구간이 있어야 한다
 *
 * 조퇴는 그날 마지막 퇴근으로 판단해야 한다. 그런데 찍는 순간에는
 * 그게 마지막인지 알 수 없다. 그래서 퇴근을 찍을 때마다 첫 줄의 조퇴 값을
 * 다시 계산해 덮어쓴다. 저녁에 다시 와서 늦게 퇴근하면 조퇴가 저절로 지워진다.
 *
 * 휴게 중이면 먼저 휴게를 끝낸 것으로 쳐서 시간을 채워 넣는다.
 * 안 그러면 휴게가 열린 채로 남아 근무시간이 부풀려진다.
 */
export async function punchOut(
  staffId: string,
  outBaseline: string,
  restOverride = 0
): Promise<{ time: string; early: number }> {
  const { headers, rows, rowNumbers } = await readSheet(SHEET_T);
  const cols = resolve(SHEET_T, headers, T_COLS);
  const day = today();
  const mine = findDay(rows, rowNumbers, cols, staffId, day);

  const open = mine.find((x) => get(x.r, cols, "출근시각") && !get(x.r, cols, "퇴근시각"));
  if (!open) throw new Error("오늘 출근 기록이 없습니다. 출근을 먼저 찍어주세요.");

  const stamp = now();
  const time = stamp.slice(11, 16);

  // 휴게가 열려 있으면 여기서 닫는다
  const started = get(open.r, cols, "휴게시작");
  let rest = Number(get(open.r, cols, "휴게분")) || 0;
  let spans = get(open.r, cols, "휴게내역");
  if (started) {
    const a = toMinutes(started);
    const b = toMinutes(time);
    if (a !== null && b !== null && b > a) rest += b - a;
    spans = joinSpan(spans, started, time);
  }
  // 화면에서 "휴게 30분 적고 퇴근"을 고른 경우 — 찍은 휴게가 없을 때만 받는다
  if (restOverride && restOverride > 0 && rest === 0) rest = restOverride;

  await updateRow(SHEET_T, open.n, headers, {
    ...open.r,
    ...toSheetRow(
      {
        퇴근시각: time,
        휴게시작: "",
        휴게분: rest > 0 ? String(rest) : "",
        휴게내역: spans,
        수정일시: stamp,
        수정자: staffId,
      },
      cols
    ),
  });

  // 그날 첫 줄의 조퇴 값을 다시 계산한다
  const early = judgeOut(time, outBaseline);
  const head = mine[0];
  if (head) {
    const wasLate = get(head.r, cols, "근무구분") === "지각";
    const isHead = head.n === open.n;
    await updateRow(SHEET_T, head.n, headers, {
      // 방금 고친 줄이 첫 줄이면 그 값을 이어서 쓴다
      ...(isHead
        ? { ...head.r, ...toSheetRow({ 퇴근시각: time, 휴게시작: "", 휴게분: rest > 0 ? String(rest) : "" }, cols) }
        : head.r),
      ...toSheetRow(
        {
          조퇴분: early > 0 ? String(early) : "",
          근무구분: wasLate ? "지각" : early > 0 ? "조퇴" : "정상",
          수정일시: stamp,
          수정자: staffId,
        },
        cols
      ),
    });
  }
  return { time, early };
}

/**
 * 휴게 시작·끝
 *
 * 시작 시각을 적어두었다가, 끝낼 때 그 차이를 휴게분에 더한다.
 * 하루에 여러 번 쉬어도 분이 쌓인다.
 */
/**
 * 휴게 칸이 시트에 없으면 만들어 준다
 *
 * 휴게 관련 칸은 「있으면 쓰고 없으면 넘어가는」 칸으로 두었다. 그래서 시트에
 * 그 칸이 없으면 휴게 시작을 눌러도 쓸 자리가 없어 조용히 아무 일도 안 일어났다.
 * 오류도 안 나고 화면만 그대로라, 누른 사람은 고장인지 자기가 잘못 눌렀는지 모른다.
 * 쓰려는 순간에 칸을 만든다.
 */
const BREAK_COLUMNS = ["휴게시작", "휴게분", "휴게내역"];

async function ensureBreakColumns(headers: string[]): Promise<boolean> {
  const missing = BREAK_COLUMNS.filter(
    (c) => !headers.some((h) => (h ?? "").replace(/\s/g, "") === c)
  );
  if (missing.length === 0) return false;
  await addColumns(SHEET_T, missing);
  return true;
}

export async function breakToggle(
  staffId: string,
  start: boolean
): Promise<{ time: string; total: number }> {
  let sheet = await readSheet(SHEET_T);
  if (await ensureBreakColumns(sheet.headers)) sheet = await readSheet(SHEET_T);
  const { headers, rows, rowNumbers } = sheet;
  const cols = resolve(SHEET_T, headers, T_COLS);

  /* 칸을 만들었는데도 못 찾으면, 쓴 척하고 넘어가지 않는다.
     조용히 성공한 것처럼 구는 것이 제일 나쁘다 — 눌러도 안 되는 이유를 알 수 없다. */
  if (!cols["휴게시작"]) {
    throw new Error(
      "「근태」 시트에 휴게시작 칸을 만들지 못했습니다. 시트 권한을 확인해주세요."
    );
  }
  const day = today();
  const mine = findDay(rows, rowNumbers, cols, staffId, day);

  const open = mine.find((x) => get(x.r, cols, "출근시각") && !get(x.r, cols, "퇴근시각"));
  if (!open) throw new Error("근무 중이 아닙니다. 출근을 먼저 찍어주세요.");

  const stamp = now();
  const time = stamp.slice(11, 16);
  const started = get(open.r, cols, "휴게시작");
  let total = Number(get(open.r, cols, "휴게분")) || 0;

  if (start) {
    if (started) throw new Error("이미 휴게 중입니다.");
    await updateRow(SHEET_T, open.n, headers, {
      ...open.r,
      ...toSheetRow({ 휴게시작: time, 수정일시: stamp, 수정자: staffId }, cols),
    });
    return { time, total };
  }

  if (!started) throw new Error("휴게 중이 아닙니다.");
  const a = toMinutes(started);
  const b = toMinutes(time);
  if (a !== null && b !== null && b > a) total += b - a;

  await updateRow(SHEET_T, open.n, headers, {
    ...open.r,
    ...toSheetRow(
      {
        휴게시작: "",
        휴게분: total > 0 ? String(total) : "",
        휴게내역: joinSpan(get(open.r, cols, "휴게내역"), started, time),
        수정일시: stamp,
        수정자: staffId,
      },
      cols
    ),
  });
  return { time, total };
}

/**
 * 점장·대표가 고치기
 *
 * 직원 것을 대신 적거나, 잘못 찍힌 것을 바로잡는 자리다.
 * 회차를 집어 고치고, 그 회차가 없으면 새로 만든다.
 */
export async function patchAttendance(
  target: { 사번: string; 날짜: string; 지점코드: string; 회차?: number },
  changes: Record<string, string>,
  byStaffId: string
): Promise<void> {
  const { headers, rows, rowNumbers } = await readSheet(SHEET_T);
  const cols = resolve(SHEET_T, headers, T_COLS);
  const stamp = now();
  const day = target.날짜.slice(0, 10);
  const round = target.회차 ?? 1;
  const mine = findDay(rows, rowNumbers, cols, target.사번, day);

  const hit = mine.find((x) => (Number(get(x.r, cols, "회차")) || 1) === round);
  const next = { ...changes, 수정일시: stamp, 수정자: byStaffId };

  if (hit) {
    await updateRow(SHEET_T, hit.n, headers, { ...hit.r, ...toSheetRow(next, cols) });
    return;
  }

  await appendRow(SHEET_T, headers, {
    ...toSheetRow(
      {
        ...next,
        근태번호: nextId(rows.map((r) => get(r, cols, "근태번호"))),
        사번: target.사번,
        지점코드: target.지점코드,
        날짜: day,
        회차: String(round),
        등록일시: stamp,
        등록자: byStaffId,
      },
      cols
    ),
  });
}
