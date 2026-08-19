/**
 * 고르는 목록 (서버 전용)
 *
 * 성별 · 나이대 · 거주 동네 · 상담 활동 종류 · 미등록 사유처럼 화면에서
 * 고르게 되어 있는 값들이다. 「선택목록」 탭 한 장에 구분별로 모여 있다.
 *
 * 지금까지 이걸 고치려면 구글 시트를 직접 열어야 했다. 「쌍정동」 오타 하나를
 * 고치려고 시트를 여시게 만들었고, 그동안 화면에서는 그 오타밖에 고를 수가
 * 없었다. 자주 하는 일은 아니지만, 해야 할 때 갈 곳이 없으면 안 된다.
 */
import { readSheet, appendRow, updateRow, createSheet, type Row } from "./sheets";
import { resolve, toSheetRow, get, type ColumnSpec } from "./columns";
import { now } from "./time";
import { SHEET } from "./data";

export const OPT_HEADERS = [
  "구분", "값", "정렬순서", "사용여부", "수정일시", "수정자", "삭제여부",
];

const OPT_COLS: ColumnSpec = {
  구분: { names: ["분류", "그룹"], required: true },
  값: { names: ["항목", "이름"], required: true },
  정렬순서: { names: ["순서", "정렬"] },
  사용여부: { names: ["사용"] },
  수정일시: { names: [] },
  수정자: { names: [] },
  삭제여부: { names: [] },
};

export type OptionRow = {
  /** 시트에서 몇 번째 줄인지 — 고칠 때 이걸로 찾는다 */
  줄: number;
  구분: string;
  값: string;
  정렬순서: number;
  씀: boolean;
};

/**
 * 어떤 구분이 어디에 쓰이는지
 *
 * 「상담활동종류」가 무엇인지 화면 이름만 보고는 모른다. 목록을 고치는 사람이
 * 어느 화면이 바뀌는지 알아야 함부로 지우지 않는다.
 */
export const OPTION_USED: Record<string, string> = {
  성별: "회원 · 상담에서 고르는 성별",
  나이대: "회원 · 상담에서 고르는 나이대",
  거주동네: "회원 정보의 거주 동네",
  직업: "회원 정보의 직업 (직접 쳐도 됩니다)",
  문의유형: "상담 접수의 문의유형",
  상담활동종류: "상담 상세의 연락 기록 종류",
  미등록사유: "상담을 미등록으로 닫을 때 고르는 사유",
  매출유형: "결제의 매출 유형 (신규 · 재등록 …)",
  결제수단: "결제할 때 고르는 수단",
  문의채널: "상담 · 회원의 방문 경로",

};

export async function listOptions(): Promise<OptionRow[]> {
  let data;
  try {
    data = await readSheet(SHEET.선택목록);
  } catch {
    return [];
  }
  const c = resolve(SHEET.선택목록, data.headers, OPT_COLS);
  const out: OptionRow[] = [];
  data.rows.forEach((r, i) => {
    if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
    const 구분 = get(r, c, "구분");
    const 값 = get(r, c, "값");
    if (!구분 || !값) return;
    out.push({
      줄: data.rowNumbers[i],
      구분,
      값,
      정렬순서: Number(get(r, c, "정렬순서")) || 999,
      씀: (get(r, c, "사용여부") || "Y").toUpperCase() !== "N",
    });
  });
  out.sort(
    (a, b) => a.구분.localeCompare(b.구분, "ko") || a.정렬순서 - b.정렬순서 ||
      a.값.localeCompare(b.값, "ko")
  );
  return out;
}

/** 새 값을 하나 더한다 */
export async function addOption(구분: string, 값: string, byId: string): Promise<void> {
  const k = (구분 ?? "").trim();
  const v = (값 ?? "").trim();
  if (!k) throw new Error("어느 목록에 넣을지 골라주세요.");
  if (!v) throw new Error("넣을 값을 적어주세요.");

  await createSheet(SHEET.선택목록, OPT_HEADERS);
  const data = await readSheet(SHEET.선택목록);
  const c = resolve(SHEET.선택목록, data.headers, OPT_COLS);

  /* 같은 값이 두 번 뜨면 고르는 사람이 어느 쪽인지 알 수 없다 */
  const 이미 = data.rows.some(
    (r) =>
      (r["삭제여부"] ?? "").toUpperCase() !== "Y" &&
      get(r, c, "구분") === k &&
      get(r, c, "값").replace(/\s/g, "") === v.replace(/\s/g, "")
  );
  if (이미) throw new Error(`「${v}」는 이미 ${k} 목록에 있습니다.`);

  /* 맨 뒤에 붙인다 — 새로 넣은 것이 위로 튀어 오르면 놀란다 */
  const 뒤 =
    Math.max(
      0,
      ...data.rows
        .filter((r) => get(r, c, "구분") === k)
        .map((r) => Number(get(r, c, "정렬순서")) || 0)
    ) + 1;

  const stamp = now();
  await appendRow(
    SHEET.선택목록,
    data.headers,
    toSheetRow(
      {
        구분: k, 값: v, 정렬순서: String(뒤), 사용여부: "Y",
        수정일시: stamp, 수정자: byId, 삭제여부: "",
      },
      c
    ) as Row
  );
}

/**
 * 값 하나를 고친다 — 이름을 바꾸거나, 안 쓰게 하거나, 지운다
 *
 * 지우는 것은 줄을 없애지 않고 표시만 남긴다. 이미 그 값으로 저장된 회원이
 * 있는데 줄이 사라지면 「이 값이 뭐였지」를 되짚을 수가 없다.
 */
export async function patchOption(
  줄: number,
  patch: { 값?: string; 씀?: boolean; 지움?: boolean; 정렬순서?: number },
  byId: string
): Promise<void> {
  if (!줄) throw new Error("고칠 줄을 찾지 못했습니다.");

  const data = await readSheet(SHEET.선택목록);
  const c = resolve(SHEET.선택목록, data.headers, OPT_COLS);
  const i = data.rowNumbers.indexOf(줄);
  if (i < 0) throw new Error("해당 줄을 찾지 못했습니다.");

  const fields: Record<string, string> = { 수정일시: now(), 수정자: byId };
  if (patch.값 !== undefined) {
    const v = patch.값.trim();
    if (!v) throw new Error("값을 비울 수는 없습니다.");
    fields.값 = v;
  }
  if (patch.씀 !== undefined) fields.사용여부 = patch.씀 ? "Y" : "N";
  if (patch.정렬순서 !== undefined) fields.정렬순서 = String(patch.정렬순서);
  if (patch.지움) fields.삭제여부 = "Y";

  await updateRow(SHEET.선택목록, 줄, data.headers, {
    ...data.rows[i],
    ...(toSheetRow(fields, c) as Row),
  });
}
