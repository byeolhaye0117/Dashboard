/**
 * 리뷰 답글 (서버 전용)
 *
 * 손님이 남긴 리뷰를 붙여넣으면 AI 가 답글 초안을 써 준다. 초안이지 완성본이 아니다.
 * 사람이 읽고 고쳐서 올리는 것을 전제로 만든다.
 *
 * 만든 답글은 전부 시트에 남긴다. 두 가지 이유다.
 *  - 같은 손님에게 두 번 다른 말을 하지 않으려면 지난 답글이 보여야 한다.
 *  - 오늘 몇 번 불렀는지를 세야 요금이 튀지 않는다.
 */
import { readSheet, appendRow, updateRow, createSheet, type Row } from "./sheets";
import { resolve, toSheetRow, get, type ColumnSpec } from "./columns";
import { now, today } from "./time";
import { SHEET_RV, RV_HEADERS, SHEET_RVS, RVS_HEADERS } from "./reviewMeta";

export { SHEET_RV, SHEET_RVS } from "./reviewMeta";

const RV_COLS: ColumnSpec = {
  답글번호: { names: ["답글 번호"], required: true },
  지점코드: { names: ["지점"], required: true },
  별점: { names: ["평점", "별"] },
  리뷰내용: { names: ["리뷰", "원문"] },
  주제: { names: ["읽어낸 주제", "태그"] },
  답글: { names: ["답글내용", "본문"] },
  키워드: { names: ["심은 키워드"] },
  말투: { names: ["톤"] },
  길이: { names: [] },
  끝인사: { names: [] },
  모델: { names: ["AI모델"] },
  등록일시: { names: ["만든일시"] },
  등록자: { names: ["만든이"] },
  삭제여부: { names: [] },
};

export type Reply = {
  id: string;
  지점코드: string;
  별점: number;
  리뷰내용: string;
  주제: string[];
  답글: string;
  키워드: string[];
  말투: string;
  길이: string;
  모델: string;
  등록일시: string;
  등록자: string;
};

function splitList(s: string): string[] {
  return (s ?? "")
    .split(/[,·]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * 탭이 없어도 화면은 열려야 한다
 *
 * 처음 쓰는 지점은 「리뷰답글」 탭이 아직 없다. 그때 화면이 통째로 깨지면
 * 무엇을 해야 하는지 알 수가 없다. 없으면 빈 목록으로 열고, 답글을 처음
 * 만드는 순간에 탭을 만든다.
 */
export async function listReplies(): Promise<Reply[]> {
  let data;
  try {
    data = await readSheet(SHEET_RV);
  } catch {
    return [];
  }

  const c = resolve(SHEET_RV, data.headers, RV_COLS);
  const out: Reply[] = [];
  data.rows.forEach((r) => {
    if ((r["삭제여부"] ?? "").toUpperCase() === "Y") return;
    const id = get(r, c, "답글번호");
    if (!id) return;
    out.push({
      id,
      지점코드: get(r, c, "지점코드"),
      별점: Number(get(r, c, "별점")) || 0,
      리뷰내용: get(r, c, "리뷰내용"),
      주제: splitList(get(r, c, "주제")),
      답글: get(r, c, "답글"),
      키워드: splitList(get(r, c, "키워드")),
      말투: get(r, c, "말투"),
      길이: get(r, c, "길이"),
      모델: get(r, c, "모델"),
      등록일시: get(r, c, "등록일시"),
      등록자: get(r, c, "등록자"),
    });
  });
  // 최근 것이 위로 — 방금 만든 답글을 찾으러 스크롤하게 두지 않는다
  out.sort((a, b) => b.등록일시.localeCompare(a.등록일시));
  return out;
}

/** 오늘 이 지점에서 몇 번 불렀는지 — 요금 한도를 세는 데 쓴다 */
export async function countToday(branch: string): Promise<number> {
  const day = today();
  const list = await listReplies();
  return list.filter(
    (r) => r.등록일시.startsWith(day) && (!branch || r.지점코드 === branch)
  ).length;
}

function nextId(existing: string[]): string {
  let max = 0;
  existing.forEach((v) => {
    const n = Number(String(v ?? "").replace(/\D/g, ""));
    if (Number.isFinite(n) && n > max) max = n;
  });
  return "RV" + String(max + 1).padStart(5, "0");
}

export async function saveReply(r: {
  지점코드: string;
  별점: number;
  리뷰내용: string;
  주제: string[];
  답글: string;
  키워드: string[];
  말투: string;
  길이: string;
  끝인사: string;
  모델: string;
}, byId: string): Promise<string> {
  // 저장하려는 순간이 곧 탭이 필요해진 순간이다
  await createSheet(SHEET_RV, RV_HEADERS);

  const data = await readSheet(SHEET_RV);
  const c = resolve(SHEET_RV, data.headers, RV_COLS);
  const id = nextId(data.rows.map((row) => get(row, c, "답글번호")));

  await appendRow(
    SHEET_RV,
    data.headers,
    toSheetRow(
      {
        답글번호: id,
        지점코드: r.지점코드,
        별점: String(r.별점 || ""),
        리뷰내용: r.리뷰내용,
        주제: r.주제.join(", "),
        답글: r.답글,
        키워드: r.키워드.join(", "),
        말투: r.말투,
        길이: r.길이,
        끝인사: r.끝인사,
        모델: r.모델,
        등록일시: now(),
        등록자: byId,
        삭제여부: "",
      },
      c
    ) as Row
  );
  return id;
}

/* ── 지점마다 다른 것들 ──────────────────────────────────
 *
 * 플레이스 주소는 지점마다 다르고, 늘 쓰는 키워드와 끝인사도 다르다.
 * 브라우저에만 담아두면 다른 직원이 열었을 때 텅 비어 있다. 시트에 둔다.
 * ──────────────────────────────────────────────────── */

const RVS_COLS: ColumnSpec = {
  지점코드: { names: ["지점"], required: true },
  플레이스ID: { names: ["플레이스", "플레이스주소", "place"] },
  키워드: { names: [] },
  끝인사: { names: [] },
  수정일시: { names: [] },
  수정자: { names: [] },
};

export type ReviewSetting = { 지점코드: string; 플레이스ID: string; 키워드: string[]; 끝인사: string };

export async function listSettings(): Promise<ReviewSetting[]> {
  let data;
  try {
    data = await readSheet(SHEET_RVS);
  } catch {
    return [];
  }
  const c = resolve(SHEET_RVS, data.headers, RVS_COLS);
  const out: ReviewSetting[] = [];
  data.rows.forEach((r) => {
    const code = get(r, c, "지점코드");
    if (!code) return;
    out.push({
      지점코드: code,
      플레이스ID: get(r, c, "플레이스ID"),
      키워드: splitList(get(r, c, "키워드")),
      끝인사: get(r, c, "끝인사"),
    });
  });
  return out;
}

/** 지점 한 줄을 고치거나, 없으면 새로 만든다 */
export async function saveSetting(
  지점코드: string,
  patch: { 플레이스ID?: string; 키워드?: string[]; 끝인사?: string },
  byId: string
): Promise<void> {
  if (!지점코드) throw new Error("지점을 고르지 않았습니다.");
  await createSheet(SHEET_RVS, RVS_HEADERS);

  const data = await readSheet(SHEET_RVS);
  const c = resolve(SHEET_RVS, data.headers, RVS_COLS);
  const stamp = now();

  const fields: Record<string, string> = { 수정일시: stamp, 수정자: byId };
  if (patch.플레이스ID !== undefined) fields.플레이스ID = patch.플레이스ID.trim();
  if (patch.키워드 !== undefined) fields.키워드 = patch.키워드.join(", ");
  if (patch.끝인사 !== undefined) fields.끝인사 = patch.끝인사;

  const i = data.rows.findIndex((r) => get(r, c, "지점코드") === 지점코드);
  if (i >= 0) {
    await updateRow(SHEET_RVS, data.rowNumbers[i], data.headers, {
      ...data.rows[i],
      ...(toSheetRow(fields, c) as Row),
    });
    return;
  }
  await appendRow(
    SHEET_RVS,
    data.headers,
    toSheetRow({ 지점코드, 플레이스ID: "", 키워드: "", 끝인사: "", ...fields }, c) as Row
  );
}

/** 마음에 안 드는 답글은 지운다 — 줄은 남기고 표시만 한다 */
export async function softDeleteReply(id: string, byId: string): Promise<void> {
  const data = await readSheet(SHEET_RV);
  const c = resolve(SHEET_RV, data.headers, RV_COLS);
  const i = data.rows.findIndex((r) => get(r, c, "답글번호") === id);
  if (i < 0) throw new Error("해당 답글을 찾지 못했습니다.");

  await updateRow(SHEET_RV, data.rowNumbers[i], data.headers, {
    ...data.rows[i],
    ...(toSheetRow({ 삭제여부: "Y" }, c) as Row),
  });
}
