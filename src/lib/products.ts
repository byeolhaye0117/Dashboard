/**
 * 상품 원장 (서버 전용)
 *
 * 회원에게 파는 것들의 정의다. 여기서 정한 갈래·기간·가격이 회원 화면의
 * 이용권 줄과 매출 계산에 그대로 쓰인다.
 *
 * 상품 한 줄을 고치면 그 상품으로 판 이용권 전부의 성격이 바뀐다.
 * 회원 한 명을 고치는 것과 무게가 다르다.
 */
import { readSheet, appendRow, updateRow, createSheet, type Row } from "./sheets";
import { resolve, toSheetRow, get, type ColumnSpec } from "./columns";
import { now } from "./time";

export const SHEET_PR = "상품";
export const SHEET_PRB = "상품판매지점";

/** 상품판매지점 탭이 없을 수도 있다 — 없으면 만들 때 쓴다 */
const PRB_HEADERS = ["상품코드", "지점코드", "등록일시", "등록자", "삭제여부"];

const PR_COLS: ColumnSpec = {
  상품코드: { names: ["상품 코드", "상품번호"], required: true },
  상품명: { names: ["상품 이름", "이름"], required: true },
  상품분류: { names: ["분류", "구분"] },
  판매상태: { names: ["상태", "판매"] },
  결제개월: { names: [] },
  서비스개월: { names: [] },
  총이용개월: { names: ["총개월", "이용개월"] },
  결제횟수: { names: [] },
  서비스횟수: { names: [] },
  총횟수: { names: ["총이용횟수"] },
  현금가: { names: ["현금(계좌)가", "현금계좌가", "현금"] },
  카드가: { names: ["카드"] },
  서비스상품: { names: ["무료서비스상품여부", "서비스"] },
  옵션상품: { names: ["옵션상품여부", "옵션"] },
  등록일시: { names: [] },
  등록자: { names: [] },
  수정일시: { names: [] },
  수정자: { names: [] },
  삭제여부: { names: [] },
};

const PRB_COLS: ColumnSpec = {
  상품코드: { names: ["상품 코드"], required: true },
  지점코드: { names: ["지점"], required: true },
  등록일시: { names: [] },
  등록자: { names: [] },
  삭제여부: { names: [] },
};

/** 갈래는 이 넷뿐이다. 오타 하나로 갈래가 다섯 개가 되면 안 된다 */
export const KINDS = ["회원권", "수강권", "케어권", "부가상품권"] as const;

export type AdminProduct = {
  code: string;
  name: string;
  kind: string;
  판매중: boolean;
  결제개월: string;
  서비스개월: string;
  총이용개월: string;
  결제횟수: string;
  서비스횟수: string;
  총횟수: string;
  현금가: string;
  카드가: string;
  서비스상품: boolean;
  옵션상품: boolean;
  /** 이 상품을 파는 지점들. 비어 있으면 "아직 아무 지점에도 안 걸림" */
  지점들: string[];
};

const yes = (v: string) =>
  ["y", "yes", "예", "o", "true", "✅"].includes((v ?? "").trim().toLowerCase());

/**
 * 판매중지·삭제된 것까지 전부 읽는다
 *
 * 파는 화면(getProducts)은 판매중인 것만 보면 되지만, 관리 화면은 꺼둔 것도
 * 보여야 다시 켤 수 있다.
 */
export async function listProductsAdmin(): Promise<AdminProduct[]> {
  const p = await readSheet(SHEET_PR);
  const cols = resolve(SHEET_PR, p.headers, PR_COLS);

  // 지점 연결은 없을 수도 있다. 없다고 상품 목록이 안 나와서는 안 된다
  const byCode = new Map<string, string[]>();
  try {
    const b = await readSheet(SHEET_PRB);
    const bc = resolve(SHEET_PRB, b.headers, PRB_COLS);
    b.rows.forEach((r) => {
      if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
      const code = get(r, bc, "상품코드");
      const br = get(r, bc, "지점코드");
      if (!code || !br) return;
      byCode.set(code, [...(byCode.get(code) ?? []), br]);
    });
  } catch {
    /* 탭이 없으면 지점 연결이 없는 것으로 본다 */
  }

  const out: AdminProduct[] = [];
  p.rows.forEach((r) => {
    if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
    const code = get(r, cols, "상품코드");
    if (!code) return;
    out.push({
      code,
      name: get(r, cols, "상품명"),
      kind: get(r, cols, "상품분류"),
      판매중: (get(r, cols, "판매상태") || "판매중") === "판매중",
      결제개월: get(r, cols, "결제개월"),
      서비스개월: get(r, cols, "서비스개월"),
      총이용개월: get(r, cols, "총이용개월"),
      결제횟수: get(r, cols, "결제횟수"),
      서비스횟수: get(r, cols, "서비스횟수"),
      총횟수: get(r, cols, "총횟수"),
      현금가: get(r, cols, "현금가"),
      카드가: get(r, cols, "카드가"),
      서비스상품: yes(get(r, cols, "서비스상품")),
      옵션상품: yes(get(r, cols, "옵션상품")),
      지점들: byCode.get(code) ?? [],
    });
  });

  out.sort((a, b) => a.kind.localeCompare(b.kind, "ko") || a.name.localeCompare(b.name, "ko"));
  return out;
}

/**
 * 다음 상품코드
 *
 * 이미 쓰던 코드 모양을 흉내 낸다. P0001 로 쓰고 있으면 그대로 이어 가고,
 * 아무 규칙이 없으면 PRD001 로 시작한다 — 코드 모양을 내 맘대로 바꾸면
 * 시트를 눈으로 보던 사람이 헷갈린다.
 */
function nextCode(existing: string[]): string {
  let prefix = "PRD";
  let width = 3;
  let max = 0;
  existing.forEach((v) => {
    const m = (v ?? "").trim().match(/^([A-Za-z가-힣_-]*)(\d+)$/);
    if (!m) return;
    max = Math.max(max, Number(m[2]));
    prefix = m[1] || prefix;
    width = Math.max(width, m[2].length);
  });
  return prefix + String(max + 1).padStart(width, "0");
}

export type NewProduct = {
  상품명: string;
  상품분류: string;
  결제개월: string;
  서비스개월: string;
  결제횟수: string;
  서비스횟수: string;
  현금가: string;
  카드가: string;
  서비스상품: boolean;
  옵션상품: boolean;
  판매중: boolean;
  지점들: string[];
};

export async function createProduct(input: NewProduct, staffId: string): Promise<string> {
  const name = (input.상품명 ?? "").trim();
  if (!name) throw new Error("상품 이름을 적어주세요.");
  if (!KINDS.includes(input.상품분류 as any)) throw new Error("갈래를 골라주세요.");

  const p = await readSheet(SHEET_PR);
  const cols = resolve(SHEET_PR, p.headers, PR_COLS);
  const code = nextCode(p.rows.map((r) => get(r, cols, "상품코드")));
  const stamp = now();

  const 개월 = num(input.결제개월) + num(input.서비스개월);
  const 횟수 = num(input.결제횟수) + num(input.서비스횟수);

  await appendRow(SHEET_PR, p.headers, toSheetRow({
    상품코드: code,
    상품명: name,
    상품분류: input.상품분류,
    판매상태: input.판매중 ? "판매중" : "판매중지",
    결제개월: input.결제개월 ?? "",
    서비스개월: input.서비스개월 ?? "",
    총이용개월: 개월 > 0 ? String(개월) : "",
    결제횟수: input.결제횟수 ?? "",
    서비스횟수: input.서비스횟수 ?? "",
    총횟수: 횟수 > 0 ? String(횟수) : "",
    현금가: String(num(input.현금가) || ""),
    카드가: String(num(input.카드가) || ""),
    서비스상품: input.서비스상품 ? "Y" : "",
    옵션상품: input.옵션상품 ? "Y" : "",
    등록일시: stamp,
    등록자: staffId,
    수정일시: stamp,
    수정자: staffId,
    삭제여부: "",
  }, cols));

  await setBranches(code, input.지점들 ?? [], staffId);
  return code;
}

const num = (v?: string) => Number((v ?? "").toString().replace(/[^0-9]/g, "")) || 0;

/** 고칠 수 있는 칸만 받는다 — 화면이 보낸 이름을 그대로 시트에 쓰지 않는다 */
const EDITABLE = [
  "상품명", "상품분류", "판매상태",
  "결제개월", "서비스개월", "총이용개월",
  "결제횟수", "서비스횟수", "총횟수",
  "현금가", "카드가", "서비스상품", "옵션상품", "삭제여부",
];

export async function patchProduct(
  code: string,
  changes: Record<string, string>,
  staffId: string
): Promise<void> {
  const p = await readSheet(SHEET_PR);
  const cols = resolve(SHEET_PR, p.headers, PR_COLS);
  const i = p.rows.findIndex((r) => get(r, cols, "상품코드") === code);
  if (i < 0) throw new Error("해당 상품을 찾지 못했습니다.");

  const safe: Record<string, string> = {};
  Object.entries(changes).forEach(([k, v]) => {
    if (EDITABLE.includes(k)) safe[k] = String(v ?? "");
  });
  if (Object.keys(safe).length === 0) throw new Error("바꿀 내용이 없습니다.");

  await updateRow(SHEET_PR, p.rowNumbers[i], p.headers, {
    ...p.rows[i],
    ...toSheetRow({ ...safe, 수정일시: now(), 수정자: staffId }, cols),
  });
}

/**
 * 이 상품을 어느 지점에서 파는가
 *
 * 줄을 지우지 않고 삭제 표시만 한다. 지점을 껐다 켰다 하는 일이 흔한데
 * 그때마다 줄이 사라지면 언제부터 팔았는지가 남지 않는다.
 */
export async function setBranches(
  code: string,
  지점들: string[],
  staffId: string
): Promise<void> {
  await createSheet(SHEET_PRB, PRB_HEADERS);
  const b = await readSheet(SHEET_PRB);
  const cols = resolve(SHEET_PRB, b.headers, PRB_COLS);
  const want = new Set(지점들.filter(Boolean));
  const stamp = now();

  const seen = new Set<string>();
  for (let i = 0; i < b.rows.length; i++) {
    const r = b.rows[i];
    if (get(r, cols, "상품코드") !== code) continue;
    const br = get(r, cols, "지점코드");
    if (!br) continue;
    const gone = (r["삭제여부"] ?? "").toUpperCase() === "Y";
    seen.add(br);

    if (want.has(br) && gone) {
      await updateRow(SHEET_PRB, b.rowNumbers[i], b.headers, {
        ...r, ...toSheetRow({ 삭제여부: "" }, cols),
      });
    } else if (!want.has(br) && !gone) {
      await updateRow(SHEET_PRB, b.rowNumbers[i], b.headers, {
        ...r, ...toSheetRow({ 삭제여부: "Y" }, cols),
      });
    }
  }

  for (const br of want) {
    if (seen.has(br)) continue;
    await appendRow(SHEET_PRB, b.headers, toSheetRow({
      상품코드: code, 지점코드: br,
      등록일시: stamp, 등록자: staffId, 삭제여부: "",
    }, cols));
  }
}

/** 상품 지우기 — 판 기록은 그대로 두고 목록에서만 뺀다 */
export async function softDeleteProduct(code: string, staffId: string): Promise<void> {
  await patchProduct(code, { 삭제여부: "Y" }, staffId);
}

/** 이 상품으로 판 이용권이 몇 건인가 — 지우기 전에 알려주려고 센다 */
export async function countSold(code: string): Promise<number> {
  const v = await readSheet("이용권");
  const key = v.headers.find((h) => h.replace(/\s/g, "") === "상품코드");
  if (!key) return 0;
  return v.rows.filter(
    (r) => (r[key] ?? "").trim() === code && (r["삭제여부"] ?? "").toUpperCase() !== "Y"
  ).length;
}
