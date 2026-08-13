/**
 * 상담 (문의 접수 → 방문 약속 → 등록 전환)
 *
 * 시트의 `상담` `상담활동` 탭을 다룬다.
 * 화면 코드가 칸 이름을 직접 알 필요가 없도록 여기서만 다룬다.
 */
import { readSheet, alive, appendRow, updateRow, addColumns, type Row } from "./sheets";
import { now } from "./time";
import { formatPhone } from "./phone";

export const SHEET_C = "상담";
export const SHEET_A = "상담활동";

/**
 * 진행 상태 — 뒤로 갈수록 등록에 가깝다
 *
 * 예약    : 예약이 들어온 것 (네이버 플레이스 예약 등). 아직 우리가 한 일은 없다
 * 약속전환: 우리가 연락해서 방문 약속을 잡은 것. 이게 핵심 지표다
 */
export const STAGES = ["예약", "약속전환", "등록", "미등록"] as const;
export type Stage = (typeof STAGES)[number];

/**
 * 예전에 쓰던 상태값을 지금 4단계로 맞춘다.
 * 시트에 이미 들어간 값을 고치지 않아도 화면이 제대로 나오게 하기 위해서다.
 */
const OLD_STAGE: Record<string, Stage> = {
  신규: "예약",
  연락중: "예약",
  약속대기: "예약",
  예약확정: "약속전환",
  방문완료: "약속전환",
  등록완료: "등록",
};

export function normalizeStage(v: string): Stage {
  const t = (v ?? "").trim();
  if ((STAGES as readonly string[]).includes(t)) return t as Stage;
  return OLD_STAGE[t] ?? "예약";
}

/** 문의가 들어오는 통로 */
export const CHANNELS = [
  "전화문의",
  "네이버톡톡",
  "카카오채널",
  "네이버플레이스예약",
  "문자",
] as const;

/**
 * 문의 채널이 시트의 어느 칸에 들어 있는지
 *
 * 시트 제목 줄이 아직 "방문경로" 인 경우가 있어 둘 다 받아준다.
 * 저장할 때도 두 이름에 같이 넣어두면, 실제로 있는 칸에만 들어간다.
 */
export function readChannel(r: Row): string {
  return (r["문의채널"] || r["방문경로"] || "").trim();
}

/** 등록으로 이어진 상태 */
export const DONE_STAGE: Stage = "등록";
/** 더 이상 진행하지 않는 상태 */
export const CLOSED: Stage[] = ["등록", "미등록"];

export type Consultation = Row & { id: string };

export type Activity = Row & { id: string };

export async function listConsultations(): Promise<{
  headers: string[];
  items: Consultation[];
  /** 상담번호 → 시트에서 몇 번째 줄인지 */
  rowOf: Record<string, number>;
}> {
  const { headers, rows, rowNumbers } = await readSheet(SHEET_C);
  const items: Consultation[] = [];
  const rowOf: Record<string, number> = {};
  rows.forEach((r, i) => {
    if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
    const id = r["상담번호"];
    items.push({ ...r, id });
    rowOf[id] = rowNumbers[i];
  });
  items.sort((a, b) => (b["접수일시"] ?? "").localeCompare(a["접수일시"] ?? ""));
  return { headers, items, rowOf };
}

export async function listActivities(): Promise<Activity[]> {
  const { rows } = await readSheet(SHEET_A);
  return alive(rows).map((r) => ({ ...r, id: r["활동번호"] }));
}

/**
 * 상담과 회원을 잇는 칸이 실제로 있는지 확인한다
 *
 * 시트에 없는 칸에 적으면 조용히 사라진다. 「전환회원번호」 칸이 없는 시트에서
 * 등록으로 바꾸면, 회원은 만들어지는데 이어 둔 자국이 안 남는다. 그러면
 * 나중에 등록을 되돌려도 어느 회원을 내려야 할지 알 수가 없다.
 * 실제로 그렇게 됐다 — 되돌렸는데 회원이 안 사라졌다.
 *
 * 없으면 여기서 만든다. 사람이 시트를 열어 칸을 만들 일이 아니다.
 */
export async function ensureLinkColumns(): Promise<void> {
  await addColumns(SHEET_C, ["전환회원번호", "등록여부"]);
}

/** 다음 번호를 만든다 (C00001 형태) */
function nextId(existing: string[], prefix: string, width: number): string {
  let max = 0;
  existing.forEach((v) => {
    const n = Number((v ?? "").replace(prefix, ""));
    if (Number.isFinite(n) && n > max) max = n;
  });
  return prefix + String(max + 1).padStart(width, "0");
}

export type NewConsultation = {
  상담날짜: string;
  이름: string;
  전화번호: string;
  성별?: string;
  나이대?: string;
  지점코드: string;
  문의유형?: string;
  문의내용?: string;
  문의채널?: string;
  상담자사번?: string;
  약속일시?: string;
  다음연락예정일?: string;
  메모?: string;
  진행상태?: string;
  미등록사유?: string;
};

export async function createConsultation(
  input: NewConsultation,
  staffId: string
): Promise<string> {
  const { headers, items } = await listConsultations();
  const id = nextId(items.map((i) => i.id), "C", 5);
  const stamp = now();

  const picked = (input.진행상태 ?? "").trim();
  const stage: Stage = (STAGES as readonly string[]).includes(picked)
    ? (picked as Stage)
    : input.약속일시
      ? "약속전환"
      : "예약";

  const row: Row = {
    상담번호: id,
    접수일시: stamp,
    상담날짜: input.상담날짜,
    이름: input.이름,
    전화번호: formatPhone(input.전화번호),
    성별: input.성별 ?? "",
    나이대: input.나이대 ?? "",
    지점코드: input.지점코드,
    문의유형: input.문의유형 ?? "",
    문의내용: input.문의내용 ?? "",
    // 시트 제목 줄이 문의채널이든 방문경로든 들어가도록 둘 다 채운다
    문의채널: input.문의채널 ?? "",
    방문경로: input.문의채널 ?? "",
    상담자사번: input.상담자사번 || staffId,
    접수자사번: staffId,
    약속일시: input.약속일시 ?? "",
    // 접수하는 사람이 고른 상태를 그대로 쓴다. 안 고르면 약속 유무로 정한다
    진행상태: stage,
    등록여부: stage === DONE_STAGE ? "Y" : "N",
    전환회원번호: "",
    미등록사유: stage === "미등록" ? (input.미등록사유 ?? "") : "",
    다음연락예정일: input.다음연락예정일 ?? "",
    메모: input.메모 ?? "",
    등록일시: stamp,
    등록자: staffId,
    수정일시: stamp,
    수정자: staffId,
    삭제여부: "",
  };

  await appendRow(SHEET_C, headers, row);
  return id;
}

/** 상담 한 건의 일부 칸만 고친다 */
export async function patchConsultation(
  id: string,
  changes: Row,
  staffId: string
): Promise<void> {
  const { headers, items, rowOf } = await listConsultations();
  const target = items.find((i) => i.id === id);
  if (!target || !rowOf[id]) throw new Error("해당 상담을 찾지 못했습니다.");

  const stamp = now();
  const merged: Row = { ...target, ...changes, 수정일시: stamp, 수정자: staffId };
  if (merged["전화번호"]) merged["전화번호"] = formatPhone(merged["전화번호"]);
  // 문의 채널은 시트 제목 줄이 어느 쪽이든 맞도록 두 칸에 같이 넣는다
  if (changes["문의채널"] !== undefined) {
    merged["문의채널"] = changes["문의채널"];
    merged["방문경로"] = changes["문의채널"];
  }

  /* 등록여부는 진행상태를 따라간다
     예전에는 「미등록」으로 갈 때만 N 으로 되돌렸다. 그래서 등록을 약속전환으로
     되돌리면 상태만 바뀌고 등록여부는 Y 로 남았다 — 화면과 시트가 어긋났다. */
  if (changes["진행상태"] !== undefined || merged["등록여부"] !== undefined) {
    merged["등록여부"] = merged["진행상태"] === DONE_STAGE ? "Y" : "N";
  }

  await updateRow(SHEET_C, rowOf[id], headers, merged);
}

/**
 * 상담 삭제
 *
 * 시트에서 줄을 실제로 지우지 않고 "삭제됨" 표시만 남긴다.
 * 실수로 지워도 시트에서 삭제여부 칸을 비우면 되살아난다.
 */
export async function softDeleteConsultation(id: string, staffId: string): Promise<void> {
  const { headers, items, rowOf } = await listConsultations();
  const target = items.find((i) => i.id === id);
  if (!target || !rowOf[id]) throw new Error("해당 상담을 찾지 못했습니다.");

  const stamp = now();
  await updateRow(SHEET_C, rowOf[id], headers, {
    ...target,
    삭제여부: "Y",
    수정일시: stamp,
    수정자: staffId,
  });
}

export async function addActivity(
  consultationId: string,
  kind: string,
  content: string,
  staffId: string
): Promise<void> {
  const { headers } = await readSheet(SHEET_A);
  const existing = await listActivities();
  const id = nextId(existing.map((a) => a.id), "CA", 4);
  const stamp = now();

  await appendRow(SHEET_A, headers, {
    활동번호: id,
    상담번호: consultationId,
    일시: stamp,
    처리직원사번: staffId,
    활동종류: kind,
    내용: content,
    등록일시: stamp,
    등록자: staffId,
    수정일시: stamp,
    수정자: staffId,
    삭제여부: "",
  });
}
