/**
 * 상담 (문의 접수 → 방문 약속 → 등록 전환)
 *
 * 시트의 `상담` `상담활동` 탭을 다룬다.
 * 화면 코드가 칸 이름을 직접 알 필요가 없도록 여기서만 다룬다.
 */
import { readSheet, alive, appendRow, updateRow, type Row } from "./sheets";
import { now } from "./time";

export const SHEET_C = "상담";
export const SHEET_A = "상담활동";

/** 진행 상태는 순서가 있다. 뒤로 갈수록 등록에 가깝다 */
export const STAGES = [
  "신규",
  "연락중",
  "약속대기",
  "예약확정",
  "방문완료",
  "등록완료",
  "미등록",
] as const;
export type Stage = (typeof STAGES)[number];

/** 등록으로 이어진 상태 */
export const DONE_STAGE: Stage = "등록완료";
/** 더 이상 진행하지 않는 상태 */
export const CLOSED: Stage[] = ["등록완료", "미등록"];

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
  방문경로?: string;
  거주동네?: string;
  직업?: string;
  상담자사번?: string;
  약속일시?: string;
  다음연락예정일?: string;
  메모?: string;
};

export async function createConsultation(
  input: NewConsultation,
  staffId: string
): Promise<string> {
  const { headers, items } = await listConsultations();
  const id = nextId(items.map((i) => i.id), "C", 5);
  const stamp = now();

  const row: Row = {
    상담번호: id,
    접수일시: stamp,
    상담날짜: input.상담날짜,
    이름: input.이름,
    전화번호: input.전화번호,
    성별: input.성별 ?? "",
    나이대: input.나이대 ?? "",
    지점코드: input.지점코드,
    문의유형: input.문의유형 ?? "",
    문의내용: input.문의내용 ?? "",
    방문경로: input.방문경로 ?? "",
    거주동네: input.거주동네 ?? "",
    직업: input.직업 ?? "",
    상담자사번: input.상담자사번 || staffId,
    접수자사번: staffId,
    약속일시: input.약속일시 ?? "",
    진행상태: input.약속일시 ? "예약확정" : "신규",
    등록여부: "N",
    전환회원번호: "",
    미등록사유: "",
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

  // 등록완료로 바뀌면 등록여부도 같이 맞춘다
  if (merged["진행상태"] === DONE_STAGE) merged["등록여부"] = "Y";
  else if (merged["진행상태"] === "미등록") merged["등록여부"] = "N";

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
