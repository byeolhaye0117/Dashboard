/**
 * 퇴근 보고
 *
 * 하루를 닫으면서 남기는 한 줄이다 — 오늘 몇 분과 상담했고, 몇 분이 등록했고,
 * 몇 분을 놓쳤는가. 놓친 분은 이름과 번호까지 적어 둔다.
 *
 * ── 왜 실패를 사람 단위로 적나 ──────────────────────────────
 * 「실패 3명」이라는 숫자만 남으면 다음 달에 할 수 있는 일이 없다. 이름과
 * 번호가 있어야 다시 연락을 드릴 수 있고, 사유가 있어야 무엇을 고쳐야 하는지
 * 안다. 실패는 세는 것이 아니라 되찾는 명단이다.
 *
 * 문의 시트와 따로 두는 까닭은, 문의로 접수되지 않은 분이 훨씬 많기 때문이다 —
 * 걸어 들어와 둘러보고 그냥 가신 분은 어느 시트에도 안 남는다. 그분들이
 * 여기 남는다.
 */
import {
  readSheet, appendRow, appendRows, createSheet, listSheetNames, type Row,
} from "./sheets";
import { resolve, toSheetRow, get, type ColumnSpec } from "./columns";
import { now, today } from "./time";

export const SHEET_R = "퇴근보고";
export const SHEET_RF = "퇴근보고실패";

const R_COLS: ColumnSpec = {
  보고번호: { names: [], required: true },
  날짜: { names: [] },
  사번: { names: ["직원사번"] },
  지점코드: { names: ["지점"] },
  상담수: { names: [] },
  성공수: { names: ["등록수"] },
  실패수: { names: ["미등록수"] },
  문제사항: { names: ["문제사항및해결", "문제"] },
  등록일시: { names: [] },
  등록자: { names: [] },
  삭제여부: { names: [] },
};

const RF_COLS: ColumnSpec = {
  번호: { names: [], required: true },
  보고번호: { names: [] },
  날짜: { names: [] },
  지점코드: { names: ["지점"] },
  사번: { names: ["직원사번"] },
  이름: { names: [] },
  전화번호: { names: ["연락처"] },
  사유: { names: ["실패사유"] },
  등록일시: { names: [] },
  삭제여부: { names: [] },
};

const 머리 = (spec: ColumnSpec) => Object.keys(spec);

/** 탭이 없으면 만든다 — 대표님이 시트를 직접 여시지 않아도 되게 */
async function 탭준비(): Promise<void> {
  const names = await listSheetNames();
  if (!names.includes(SHEET_R)) await createSheet(SHEET_R, 머리(R_COLS));
  if (!names.includes(SHEET_RF)) await createSheet(SHEET_RF, 머리(RF_COLS));
}

function nextId(existing: string[], prefix: string, width: number): string {
  let max = 0;
  existing.forEach((v) => {
    const n = Number(String(v ?? "").replace(prefix, "").replace(/[^0-9]/g, ""));
    if (Number.isFinite(n) && n > max) max = n;
  });
  return prefix + String(max + 1).padStart(width, "0");
}

export type NewReport = {
  지점코드: string;
  상담수: string;
  성공수: string;
  문제사항: string;
  실패: { 이름: string; 전화번호: string; 사유: string }[];
};

export async function saveShiftReport(input: NewReport, staffId: string): Promise<string> {
  await 탭준비();

  const r = await readSheet(SHEET_R);
  const cols = resolve(SHEET_R, r.headers, R_COLS);
  const id = nextId(r.rows.map((x) => get(x, cols, "보고번호")), "RP", 5);
  const stamp = now();
  const day = today();

  /* 실패 수는 적어 주신 명단에서 센다 — 손으로 적은 수와 명단이 어긋나면
     어느 쪽이 맞는지 아무도 모른다 */
  const 실패 = (input.실패 ?? []).filter((x) => (x.이름 ?? "").trim() || (x.전화번호 ?? "").trim());

  await appendRow(SHEET_R, r.headers, toSheetRow({
    보고번호: id,
    날짜: day,
    사번: staffId,
    지점코드: input.지점코드,
    상담수: String(Number(input.상담수) || 0),
    성공수: String(Number(input.성공수) || 0),
    실패수: String(실패.length),
    문제사항: input.문제사항 ?? "",
    등록일시: stamp,
    등록자: staffId,
    삭제여부: "",
  }, cols));

  if (실패.length > 0) {
    const f = await readSheet(SHEET_RF);
    const fCols = resolve(SHEET_RF, f.headers, RF_COLS);
    let n = Number(nextId(f.rows.map((x) => get(x, fCols, "번호")), "", 1)) || 1;
    await appendRows(
      SHEET_RF,
      f.headers,
      실패.map((x) =>
        toSheetRow({
          번호: `RF${String(n++).padStart(6, "0")}`,
          보고번호: id,
          날짜: day,
          지점코드: input.지점코드,
          사번: staffId,
          이름: (x.이름 ?? "").trim(),
          전화번호: (x.전화번호 ?? "").trim(),
          사유: (x.사유 ?? "").trim(),
          등록일시: stamp,
          삭제여부: "",
        }, fCols)
      )
    );
  }

  return id;
}

export type FailRow = {
  id: string; 날짜: string; 지점코드: string; 사번: string;
  이름: string; 전화번호: string; 사유: string;
};

/**
 * 놓친 분 명단 — 매출 화면의 등록성공률이 이것을 쓴다
 *
 * 탭이 아직 없을 수 있다. 없다고 매출 화면이 안 열려서는 안 되므로 빈 목록을
 * 돌려준다.
 */
export async function listShiftFails(): Promise<FailRow[]> {
  try {
    const f = await readSheet(SHEET_RF);
    const cols = resolve(SHEET_RF, f.headers, RF_COLS);
    const out: FailRow[] = [];
    f.rows.forEach((r) => {
      if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
      const id = get(r, cols, "번호");
      if (!id) return;
      out.push({
        id,
        날짜: (get(r, cols, "날짜") ?? "").slice(0, 10),
        지점코드: get(r, cols, "지점코드"),
        사번: get(r, cols, "사번"),
        이름: get(r, cols, "이름"),
        전화번호: get(r, cols, "전화번호"),
        사유: get(r, cols, "사유"),
      });
    });
    return out;
  } catch {
    return [];
  }
}
