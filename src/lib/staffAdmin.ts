/**
 * 직원 관리 (계정 발급 · 담당 지점 배정)
 *
 * 여기는 서버에서만 돈다. 비밀번호는 어떤 경우에도 화면으로 나가지 않는다.
 * 나가는 것은 "비밀번호가 정해져 있는가" 라는 예/아니오뿐이다.
 */
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { readSheet, appendRow, updateRow, updateCell, addColumns, type Row } from "./sheets";
import { SHEET } from "./data";
import { now } from "./time";
import { formatPhone } from "./phone";
import { normalizeTime } from "./attendanceMeta";

/** 시트 칸 이름 */
export const PW_COLUMN = "비밀번호(자동암호화)";
/** 임시 비밀번호로 들어온 사람에게 변경을 강제하기 위한 칸 (없어도 동작한다) */
export const TEMP_COLUMN = "비밀번호임시";

/**
 * 지점 하나에서의 근무 조건
 *
 * 비어 있는 값은 「따로 안 정함」이다 — 직원 줄에 적힌 값을 그대로 쓴다.
 */
export type BranchWork = { baseTime: string; outTime: string; workDays: string };

export type AdminStaff = {
  id: string;
  name: string;
  phone: string;
  roleCode: string;
  mainBranch: string;
  branches: string[];
  /** 지점코드 → 그 지점에서만 쓰는 근무 조건. 없으면 직원 줄 값을 쓴다 */
  branchWork: Record<string, BranchWork>;
  status: string;
  accountOn: boolean;
  /** 비밀번호가 정해져 있는가 — 비밀번호 자체는 절대 내보내지 않는다 */
  hasPassword: boolean;
  /** 임시 비밀번호 상태인가 */
  temp: boolean;
  /** 근태 기준 시각 — 비어 있으면 지각·조퇴를 판정하지 않는다 */
  baseTime: string;
  outTime: string;
  restMin: string;
  restVary: boolean;
  workDays: string;
  trainer: boolean;
  groupSlots: string;
  rowNumber: number;
};

const yes = (v: string) => (v ?? "").trim().toUpperCase() === "Y";

/**
 * 직원 목록 (관리 화면용)
 *
 * 퇴사자도 보여준다. 계정을 되살리거나 기록을 확인할 일이 있기 때문이다.
 */
export async function listStaffAdmin(): Promise<{
  items: AdminStaff[];
  /** 임시 비밀번호 칸이 시트에 있는가 */
  hasTempColumn: boolean;
}> {
  const [staffSheet, branchRows] = await Promise.all([
    readSheet(SHEET.직원),
    readSheet(SHEET.직원담당지점),
  ]);

  /*
   * 지점마다 출퇴근 시각과 근무 요일이 다를 수 있다
   *
   * 여러 지점을 도는 분은 「월·수·금은 쌍용점 07:30~22:00, 화·목은 용곡점
   * 13:00~21:00」처럼 다닌다. 사람마다 하나로 두면 어느 쪽에 맞춰도 다른
   * 쪽이 지각으로 찍힌다.
   *
   * 담당 지점 줄에 매단다. 안 적어 두면 직원 줄에 적힌 값을 그대로 쓴다 —
   * 한 지점만 다니는 분은 지금까지대로 아무것도 안 하셔도 된다.
   */
  const byStaff = new Map<string, string[]>();
  const perBranch = new Map<string, Record<string, BranchWork>>();
  branchRows.rows.forEach((r) => {
    if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
    const id = r["사번"];
    const code = r["지점코드"];
    if (!id || !code) return;
    const list = byStaff.get(id) ?? [];
    list.push(code);
    byStaff.set(id, list);

    const 시작 = normalizeTime(r["출근기준시각"] ?? "");
    const 끝 = normalizeTime(r["퇴근기준시각"] ?? "");
    const 요일 = (r["근무요일"] ?? "").replace(/[^월화수목금토일]/g, "");
    if (시작 || 끝 || 요일) {
      const mine = perBranch.get(id) ?? {};
      mine[code] = { baseTime: 시작, outTime: 끝, workDays: 요일 };
      perBranch.set(id, mine);
    }
  });

  const items: AdminStaff[] = [];
  staffSheet.rows.forEach((r, i) => {
    if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
    if (!r["사번"]) return;
    items.push({
      id: r["사번"],
      name: r["이름"] ?? "",
      phone: r["휴대폰(로그인ID)"] ?? "",
      roleCode: r["직급코드"] ?? "",
      mainBranch: r["주소속지점"] ?? "",
      branches: byStaff.get(r["사번"]) ?? [],
      branchWork: perBranch.get(r["사번"]) ?? {},
      status: r["재직상태"] || "재직중",
      accountOn: yes(r["계정사용"] || "Y"),
      hasPassword: Boolean((r[PW_COLUMN] ?? "").trim()),
      temp: yes(r[TEMP_COLUMN] ?? ""),
      baseTime: normalizeTime(r["출근기준시각"] ?? ""),
      outTime: normalizeTime(r["퇴근기준시각"] ?? ""),
      restMin: (r["휴게분"] ?? "").trim(),
      restVary: yes(r["휴게변동"] ?? ""),
      workDays: (r["근무요일"] ?? "").replace(/[^월화수목금토일]/g, ""),
      trainer: yes(r["트레이너"] ?? ""),
      groupSlots: (r["그룹수업시간"] ?? "").trim(),
      rowNumber: staffSheet.rowNumbers[i],
    });
  });

  items.sort((a, b) => a.id.localeCompare(b.id));
  return { items, hasTempColumn: staffSheet.headers.includes(TEMP_COLUMN) };
}

/**
 * 다음 사번을 만든다
 *
 * 이미 쓰고 있는 사번의 자릿수를 그대로 따라간다 (E01 이면 E02).
 */
function nextStaffId(existing: string[]): string {
  let max = 0;
  let width = 2;
  existing.forEach((v) => {
    const m = (v ?? "").match(/^E(\d+)$/);
    if (!m) return;
    width = Math.max(width, m[1].length);
    const n = Number(m[1]);
    if (n > max) max = n;
  });
  return "E" + String(max + 1).padStart(width, "0");
}

/**
 * 임시 비밀번호를 만든다
 *
 * 전화로 불러주거나 문자로 보낼 것이므로 헷갈리는 글자는 뺀다.
 * (숫자 0/1 과 알파벳 O/o/l/I 는 쓰지 않는다)
 */
const SAFE = "abcdefghijkmnpqrstuvwxyz23456789";
export function makeTempPassword(len = 8): string {
  let s = "";
  for (let i = 0; i < len; i++) s += SAFE[randomInt(SAFE.length)];
  return s;
}

export type NewStaff = {
  이름: string;
  휴대폰: string;
  직급코드: string;
  주소속지점: string;
  담당지점: string[];
  /** 지점마다 다른 출퇴근 시각 · 근무 요일 */
  지점근무?: Record<string, BranchWork>;
  재직상태?: string;
};

/** 직원을 새로 추가한다. 비밀번호는 따로 발급한다 */
export async function createStaff(input: NewStaff, byId: string): Promise<string> {
  const { headers, rows } = await readSheet(SHEET.직원);
  const id = nextStaffId(rows.map((r) => r["사번"]));
  const stamp = now();

  const row: Row = {
    사번: id,
    이름: input.이름.trim(),
    "휴대폰(로그인ID)": formatPhone(input.휴대폰),
    직급코드: input.직급코드,
    주소속지점: input.주소속지점,
    재직상태: input.재직상태 || "재직중",
    계정사용: "Y",
    [PW_COLUMN]: "",
    등록일시: stamp,
    등록자: byId,
    수정일시: stamp,
    수정자: byId,
    삭제여부: "",
  };

  await appendRow(SHEET.직원, headers, row);
  await syncBranches(id, input.담당지점, byId, input.지점근무);
  return id;
}

/** 직원 정보를 고친다 */
export async function patchStaff(
  id: string,
  changes: {
    이름?: string;
    휴대폰?: string;
    직급코드?: string;
    주소속지점?: string;
    재직상태?: string;
    계정사용?: boolean;
    담당지점?: string[];
    지점근무?: Record<string, BranchWork>;
    출근기준시각?: string;
    퇴근기준시각?: string;
    휴게분?: string;
    휴게변동?: boolean;
    근무요일?: string;
    트레이너?: boolean;
    그룹수업시간?: string;
  },
  byId: string
): Promise<void> {
  /*
   * 근태 기준 시각·휴게 칸은 뒤늦게 생긴 것이라, 예전에 만든 시트에는 없다.
   * 없다고 저장을 막으면 쓰는 사람이 "어느 버튼을 눌러야 하는지"를 알아야 한다.
   * 그건 우리 사정이지 그분 사정이 아니다. 값을 적어야 할 때 칸을 직접 만든다.
   */
  const wanted = [
    ["출근기준시각", changes.출근기준시각],
    ["퇴근기준시각", changes.퇴근기준시각],
    ["휴게분", changes.휴게분],
    ["휴게변동", changes.휴게변동 === undefined ? undefined : changes.휴게변동 ? "Y" : ""],
    ["근무요일", changes.근무요일],
    ["트레이너", changes.트레이너 === undefined ? undefined : changes.트레이너 ? "Y" : ""],
    ["그룹수업시간", changes.그룹수업시간],
  ] as const;

  const pre = await readSheet(SHEET.직원);
  const missing = wanted
    .filter(([col, v]) => v !== undefined && !pre.headers.includes(col))
    .map(([col]) => col);
  if (missing.length > 0) await addColumns(SHEET.직원, missing);

  const { headers, rows, rowNumbers } =
    missing.length > 0 ? await readSheet(SHEET.직원) : pre;
  const i = rows.findIndex((r) => r["사번"] === id);
  if (i < 0) throw new Error("해당 직원을 찾지 못했습니다.");

  // 모르는 칸까지 지우지 않도록 원래 줄 위에 덮어쓴다
  const merged: Row = { ...rows[i], 수정일시: now(), 수정자: byId };
  if (changes.이름 !== undefined) merged["이름"] = changes.이름.trim();
  if (changes.휴대폰 !== undefined) merged["휴대폰(로그인ID)"] = formatPhone(changes.휴대폰);
  if (changes.직급코드 !== undefined) merged["직급코드"] = changes.직급코드;
  if (changes.주소속지점 !== undefined) merged["주소속지점"] = changes.주소속지점;
  if (changes.재직상태 !== undefined) merged["재직상태"] = changes.재직상태;
  if (changes.계정사용 !== undefined) merged["계정사용"] = changes.계정사용 ? "Y" : "N";

  // 근태 기준 시각 — 빈 값으로 지우는 것도 뜻이 있으므로 그대로 쓴다
  wanted.forEach(([col, v]) => {
    if (v !== undefined && headers.includes(col)) merged[col] = v.trim();
  });

  await updateRow(SHEET.직원, rowNumbers[i], headers, merged);
  if (changes.담당지점) await syncBranches(id, changes.담당지점, byId, changes.지점근무);
}

/**
 * 직원 삭제
 *
 * 줄을 지우지 않고 삭제 표시만 남긴다. 지난 상담·매출 기록이 이 사번을 가리키고 있어서,
 * 실제로 지우면 "누가 했는지"를 알 수 없게 된다.
 */
export async function softDeleteStaff(id: string, byId: string): Promise<void> {
  const { headers, rows, rowNumbers } = await readSheet(SHEET.직원);
  const i = rows.findIndex((r) => r["사번"] === id);
  if (i < 0) throw new Error("해당 직원을 찾지 못했습니다.");

  await updateRow(SHEET.직원, rowNumbers[i], headers, {
    ...rows[i],
    계정사용: "N",
    삭제여부: "Y",
    수정일시: now(),
    수정자: byId,
  });
}

/**
 * 비밀번호를 정한다
 *
 * temp 가 true 면 "임시"로 표시해서, 그 사람이 처음 로그인할 때
 * 새 비밀번호를 반드시 정하게 만든다.
 */
export async function setPassword(
  id: string,
  plain: string,
  temp: boolean
): Promise<void> {
  const { headers, rows, rowNumbers } = await readSheet(SHEET.직원);
  const i = rows.findIndex((r) => r["사번"] === id);
  if (i < 0) throw new Error("해당 직원을 찾지 못했습니다.");

  const pwCol = headers.indexOf(PW_COLUMN);
  if (pwCol < 0) {
    throw new Error(`직원 시트에 "${PW_COLUMN}" 칸이 없습니다. 시트 제목 줄을 확인해주세요.`);
  }

  const hash = await bcrypt.hash(plain, 10);
  await updateCell(SHEET.직원, rowNumbers[i], pwCol, hash);

  // 임시 비밀번호 칸은 없어도 된다. 있으면 변경 강제까지 되는 것뿐이다
  const tempCol = headers.indexOf(TEMP_COLUMN);
  if (tempCol >= 0) {
    await updateCell(SHEET.직원, rowNumbers[i], tempCol, temp ? "Y" : "");
  }
}

/**
 * 담당 지점을 맞춘다
 *
 * 빠진 지점은 새로 넣고, 없어진 지점은 삭제 표시만 한다.
 */
async function syncBranches(
  id: string,
  want: string[],
  byId: string,
  work?: Record<string, BranchWork>
): Promise<void> {
  /* 뒤늦게 생긴 칸이다. 없는 칸에 적으면 조용히 사라진다 */
  if (work) {
    await addColumns(SHEET.직원담당지점, ["출근기준시각", "퇴근기준시각", "근무요일"]);
  }
  const { headers, rows, rowNumbers } = await readSheet(SHEET.직원담당지점);
  const stamp = now();
  const target = new Set(want.filter(Boolean));
  const 근무 = (code: string) => {
    const w = work?.[code];
    return w
      ? {
          출근기준시각: normalizeTime(w.baseTime ?? ""),
          퇴근기준시각: normalizeTime(w.outTime ?? ""),
          근무요일: (w.workDays ?? "").replace(/[^월화수목금토일]/g, ""),
        }
      : {};
  };

  const live = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r["사번"] !== id) continue;
    const dead = (r["삭제여부"] ?? "").toUpperCase() === "Y";
    const code = r["지점코드"];

    if (target.has(code)) {
      live.add(code);
      // 예전에 뺐던 지점을 다시 넣는 경우 되살린다
      await updateRow(SHEET.직원담당지점, rowNumbers[i], headers, {
        ...r,
        ...근무(code),
        // 예전에 뺐던 지점을 다시 넣는 경우 되살린다
        삭제여부: "",
        수정일시: stamp,
        수정자: byId,
      });
    } else if (!dead) {
      await updateRow(SHEET.직원담당지점, rowNumbers[i], headers, {
        ...r, 삭제여부: "Y", 수정일시: stamp, 수정자: byId,
      });
    }
  }

  for (const code of target) {
    if (live.has(code)) continue;
    await appendRow(SHEET.직원담당지점, headers, {
      사번: id,
      지점코드: code,
      ...근무(code),
      등록일시: stamp,
      등록자: byId,
      수정일시: stamp,
      수정자: byId,
      삭제여부: "",
    });
  }
}

/**
 * 로그인 실패 기록 (비밀번호 무한 시도 막기)
 *
 * 서버가 여러 대로 나뉘어 돌기 때문에, 서버 안 기억에만 세면 소용이 없다.
 * 다른 서버로 넘어가는 순간 처음부터 다시 셀 수 있다. 그래서 시트에 적는다.
 *
 * 칸이 없으면 만든다. 없다고 로그인을 막아버리면 아무도 못 들어온다.
 */
const LOCK_COLUMNS = ["로그인실패", "잠금해제시각"];

async function writeLoginState(id: string, fail: string, until: string): Promise<void> {
  const pre = await readSheet(SHEET.직원);
  const missing = LOCK_COLUMNS.filter((c) => !pre.headers.includes(c));
  if (missing.length > 0) await addColumns(SHEET.직원, missing);

  const { headers, rows, rowNumbers } = missing.length > 0 ? await readSheet(SHEET.직원) : pre;
  const i = rows.findIndex((r) => r["사번"] === id);
  if (i < 0) return;

  await updateRow(SHEET.직원, rowNumbers[i], headers, {
    ...rows[i],
    로그인실패: fail,
    잠금해제시각: until,
  });
}

/** 몇 번까지 봐주는가 · 얼마나 잠그는가 */
export const FAIL_LIMIT = 5;
export const LOCK_MINUTES = 10;

/** 틀렸다. 한도를 넘으면 잠근다. 잠갔으면 풀리는 시각을 돌려준다 */
export async function noteLoginFail(id: string, was: number): Promise<string> {
  const next = was + 1;
  if (next < FAIL_LIMIT) {
    await writeLoginState(id, String(next), "");
    return "";
  }
  const until = new Date(Date.now() + LOCK_MINUTES * 60_000);
  const text = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(until).replace("T", " ");
  await writeLoginState(id, "0", text);
  return text;
}

/** 잘 들어왔다. 센 것을 지운다 */
export async function clearLoginFail(id: string): Promise<void> {
  await writeLoginState(id, "", "");
}

/** 아직 잠겨 있으면 남은 분, 아니면 0 */
export function lockLeft(until: string): number {
  const t = (until ?? "").trim();
  if (!t) return 0;
  const end = new Date(t.replace(" ", "T") + "+09:00").getTime();
  if (Number.isNaN(end)) return 0;
  const left = Math.ceil((end - Date.now()) / 60_000);
  return left > 0 ? left : 0;
}
