/**
 * 근태 — 출퇴근 기록
 *
 * 직원이 스스로 「출근」·「퇴근」을 누른다. 시각은 서버가 적으므로 직원이 고칠 수 없다.
 * 잘못 찍힌 건은 점장·대표가 고친다. 고친 사람과 시각이 시트에 남는다.
 *
 * 지각 판정은 직원 탭의 `출근기준시각` 칸을 쓴다.
 * 그 칸이 비어 있으면 판정하지 않고 시각만 남긴다. 사람이 보고 판단하면 된다.
 */
import { readSheet, appendRow, updateRow } from "./sheets";
import { resolve, toSheetRow, get, type ColumnSpec } from "./columns";
import { now, today } from "./time";
import { SHEET_T, type WorkKind } from "./attendanceMeta";

export { SHEET_T, WORK_KINDS, T_HEADERS } from "./attendanceMeta";


const T_COLS: ColumnSpec = {
  근태번호: { names: ["근태 번호", "근태ID"], required: true },
  사번: { names: ["직원사번", "직원"], required: true },
  지점코드: { names: ["지점"], required: true },
  날짜: { names: ["근무일", "근무날짜"], required: true },
  출근시각: { names: ["출근"] },
  퇴근시각: { names: ["퇴근"] },
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
  출근시각: string;
  퇴근시각: string;
  근무구분: string;
  지각분: string;
  조퇴분: string;
  메모: string;
  수정자: string;
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
      출근시각: get(r, cols, "출근시각"),
      퇴근시각: get(r, cols, "퇴근시각"),
      근무구분: get(r, cols, "근무구분"),
      지각분: get(r, cols, "지각분"),
      조퇴분: get(r, cols, "조퇴분"),
      메모: get(r, cols, "메모"),
      수정자: get(r, cols, "수정자"),
    });
  });
  return out;
}

function nextId(existing: string[]): string {
  let max = 0;
  existing.forEach((v) => {
    const m = (v ?? "").match(/^T(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return "T" + String(max + 1).padStart(6, "0");
}

/** "09:30" → 570분. 못 읽으면 null */
export function toMinutes(hhmm: string): number | null {
  const m = (hhmm ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const i = Number(m[2]);
  if (h > 23 || i > 59) return null;
  return h * 60 + i;
}

/**
 * 지각인지 본다
 *
 * 기준 시각이 없으면 판정하지 않는다. 없는 규칙을 지어내지 않는다.
 */
export function judge(punchIn: string, baseline: string): { kind: WorkKind; late: number } {
  const a = toMinutes(punchIn);
  const b = toMinutes(baseline);
  if (a === null || b === null || a <= b) return { kind: "정상", late: 0 };
  return { kind: "지각", late: a - b };
}

/**
 * 출근 찍기
 *
 * 시각은 서버가 정한다. 화면에서 보낸 시각은 믿지 않는다.
 * 오늘 이미 찍었으면 덮어쓰지 않는다 — 처음 온 시각이 진짜다.
 */
export async function punchIn(
  staffId: string,
  branchCode: string,
  baseline: string
): Promise<{ time: string; kind: WorkKind; late: number }> {
  const { headers, rows, rowNumbers } = await readSheet(SHEET_T);
  const cols = resolve(SHEET_T, headers, T_COLS);
  const day = today();

  const i = rows.findIndex(
    (r) =>
      get(r, cols, "사번") === staffId &&
      get(r, cols, "날짜").slice(0, 10) === day &&
      (r["삭제여부"] ?? "").toUpperCase() !== "Y"
  );
  if (i >= 0 && get(rows[i], cols, "출근시각")) {
    throw new Error("오늘 출근은 이미 찍혀 있습니다.");
  }

  const stamp = now();
  const time = stamp.slice(11, 16);
  const { kind, late } = judge(time, baseline);

  const data: Record<string, string> = {
    사번: staffId,
    지점코드: branchCode,
    날짜: day,
    출근시각: time,
    근무구분: kind,
    지각분: late > 0 ? String(late) : "",
    수정일시: stamp,
    수정자: staffId,
  };

  if (i >= 0) {
    // 점장이 미리 만들어둔 줄이 있으면 거기에 채운다
    await updateRow(SHEET_T, rowNumbers[i], headers, {
      ...rows[i],
      ...toSheetRow(data, cols),
    });
  } else {
    await appendRow(SHEET_T, headers, {
      ...toSheetRow(
        { ...data, 근태번호: nextId(rows.map((r) => get(r, cols, "근태번호"))), 등록일시: stamp, 등록자: staffId },
        cols
      ),
    });
  }
  return { time, kind, late };
}

/**
 * 일찍 갔는지 본다
 *
 * 기준 시각이 없으면 판정하지 않는다.
 */
export function judgeOut(punchOut: string, baseline: string): number {
  const a = toMinutes(punchOut);
  const b = toMinutes(baseline);
  if (a === null || b === null || a >= b) return 0;
  return b - a;
}

/**
 * 퇴근 찍기 — 출근 기록이 있어야 한다
 *
 * 지각과 조퇴가 같은 날 겹칠 수 있다. 근무구분 칸은 하나뿐이라
 * 더 무거운 쪽(지각)을 남기고, 분 단위는 두 칸에 각각 적어 둔다.
 * 그래야 나중에 "지각이었는데 조퇴까지 했다"를 알 수 있다.
 */
export async function punchOut(
  staffId: string,
  outBaseline: string
): Promise<{ time: string; early: number }> {
  const { headers, rows, rowNumbers } = await readSheet(SHEET_T);
  const cols = resolve(SHEET_T, headers, T_COLS);
  const day = today();

  const i = rows.findIndex(
    (r) =>
      get(r, cols, "사번") === staffId &&
      get(r, cols, "날짜").slice(0, 10) === day &&
      (r["삭제여부"] ?? "").toUpperCase() !== "Y"
  );
  if (i < 0 || !get(rows[i], cols, "출근시각")) {
    throw new Error("오늘 출근 기록이 없습니다. 출근을 먼저 찍어주세요.");
  }

  const stamp = now();
  const time = stamp.slice(11, 16);
  const early = judgeOut(time, outBaseline);
  const wasLate = get(rows[i], cols, "근무구분") === "지각";

  await updateRow(SHEET_T, rowNumbers[i], headers, {
    ...rows[i],
    ...toSheetRow(
      {
        퇴근시각: time,
        조퇴분: early > 0 ? String(early) : "",
        근무구분: early > 0 && !wasLate ? "조퇴" : get(rows[i], cols, "근무구분"),
        수정일시: stamp,
        수정자: staffId,
      },
      cols
    ),
  });
  return { time, early };
}

/**
 * 점장·대표가 고치기
 *
 * 직원 것을 대신 적거나, 잘못 찍힌 것을 바로잡는 자리다.
 * 없는 날짜면 새로 만든다.
 */
export async function patchAttendance(
  target: { 사번: string; 날짜: string; 지점코드: string },
  changes: Record<string, string>,
  byStaffId: string
): Promise<void> {
  const { headers, rows, rowNumbers } = await readSheet(SHEET_T);
  const cols = resolve(SHEET_T, headers, T_COLS);
  const stamp = now();

  const i = rows.findIndex(
    (r) =>
      get(r, cols, "사번") === target.사번 &&
      get(r, cols, "날짜").slice(0, 10) === target.날짜.slice(0, 10) &&
      (r["삭제여부"] ?? "").toUpperCase() !== "Y"
  );

  const next = { ...changes, 수정일시: stamp, 수정자: byStaffId };

  if (i >= 0) {
    await updateRow(SHEET_T, rowNumbers[i], headers, {
      ...rows[i],
      ...toSheetRow(next, cols),
    });
    return;
  }

  await appendRow(SHEET_T, headers, {
    ...toSheetRow(
      {
        ...next,
        근태번호: nextId(rows.map((r) => get(r, cols, "근태번호"))),
        사번: target.사번,
        지점코드: target.지점코드,
        날짜: target.날짜.slice(0, 10),
        등록일시: stamp,
        등록자: byStaffId,
      },
      cols
    ),
  });
}
