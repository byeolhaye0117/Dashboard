/**
 * 시트 칸 이름 맞추기
 *
 * 시트 제목 줄은 사람이 만든 것이라 이름이 조금씩 다를 수 있다.
 * (전화번호 / 휴대폰 / 연락처 처럼)
 *
 * 그래서 코드가 쓰는 이름과 시트에 실제로 있는 이름을 여기서 이어준다.
 * 못 찾으면 조용히 넘어가지 않고 무엇이 없는지 한국어로 알려준다.
 * 조용히 넘어가면 저장은 된 것처럼 보이는데 값이 사라진다.
 */

/** 공백·괄호를 무시하고 비교한다 */
function norm(s: string): string {
  return (s ?? "").replace(/[\s()（）]/g, "").toLowerCase();
}

/** 후보 이름 중 시트에 실제로 있는 것을 찾는다 */
export function pick(headers: string[], candidates: string[]): string | null {
  const map = new Map(headers.map((h) => [norm(h), h]));
  for (const c of candidates) {
    const hit = map.get(norm(c));
    if (hit) return hit;
  }
  // 부분 일치까지 본다 (휴대폰(로그인ID) 처럼 뒤에 설명이 붙은 경우)
  for (const c of candidates) {
    const n = norm(c);
    for (const h of headers) {
      if (norm(h).startsWith(n)) return h;
    }
  }
  return null;
}

export type ColumnSpec = Record<string, { names: string[]; required?: boolean }>;

/** 코드가 쓰는 이름 → 시트에 있는 이름 */
export type ColumnMap = Record<string, string>;

/**
 * 필요한 칸을 한 번에 찾는다
 *
 * 꼭 있어야 하는 칸이 없으면 여기서 멈춘다. 저장이 반쯤 되는 것보다 낫다.
 */
export function resolve(sheetName: string, headers: string[], spec: ColumnSpec): ColumnMap {
  const out: ColumnMap = {};
  const missing: string[] = [];

  Object.entries(spec).forEach(([key, { names, required }]) => {
    const hit = pick(headers, [key, ...names]);
    if (hit) out[key] = hit;
    else if (required) missing.push(key);
  });

  if (missing.length > 0) {
    throw new Error(
      `${sheetName} 탭에 필요한 칸이 없습니다: ${missing.join(" · ")}. ` +
        `시트 제목 줄을 확인해주세요. (지금 있는 칸: ${headers.filter(Boolean).join(" · ")})`
    );
  }
  return out;
}

/** 코드가 쓰는 이름으로 담은 값을, 시트에 있는 이름으로 바꿔 담는다 */
export function toSheetRow(
  data: Record<string, string>,
  cols: ColumnMap
): Record<string, string> {
  const out: Record<string, string> = {};
  Object.entries(data).forEach(([key, v]) => {
    const col = cols[key];
    if (col) out[col] = v;
  });
  return out;
}

/** 시트에서 읽은 줄에서 값을 꺼낸다 */
export function get(row: Record<string, string>, cols: ColumnMap, key: string): string {
  const col = cols[key];
  return col ? (row[col] ?? "").trim() : "";
}
