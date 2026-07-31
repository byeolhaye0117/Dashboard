/**
 * 구글 스프레드시트 읽기·쓰기
 *
 * 시트 한 장을 "표"로 다룬다. 첫 줄이 제목 줄이고, 그 아래가 데이터다.
 * 제목 줄 위에 ※ 로 시작하는 안내 줄이 있을 수 있으므로 건너뛴다.
 */
import { JWT } from "google-auth-library";
import { normalizePrivateKey } from "./privateKey";

const API = "https://sheets.googleapis.com/v4/spreadsheets";

export type Row = Record<string, string>;

/** 시트 한 장을 통째로 읽은 결과 */
export type SheetData = {
  headers: string[];
  /** 제목 줄이 시트의 몇 번째 줄인지 (1부터) */
  headerRow: number;
  rows: Row[];
  /** rows[i] 가 시트의 몇 번째 줄인지 (1부터) */
  rowNumbers: number[];
};

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 가 설정되어 있지 않습니다.`);
  return v;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const client = new JWT({
    email: env("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    // 따옴표·쉼표가 딸려오거나 \n 이 글자로 들어와도 알아서 바로잡는다
    key: normalizePrivateKey(env("GOOGLE_PRIVATE_KEY")),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const { access_token, expiry_date } = await client.authorize();
  if (!access_token) throw new Error("구글 인증에 실패했습니다. 서비스 계정 정보를 확인하세요.");
  cachedToken = { token: access_token, expiresAt: expiry_date ?? Date.now() + 3_000_000 };
  return access_token;
}

async function call(path: string, init?: RequestInit) {
  const token = await accessToken();
  const res = await fetch(`${API}/${env("GOOGLE_SHEET_ID")}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`구글 시트 요청 실패 (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

/** 안내 줄(※)을 건너뛰고 제목 줄을 찾는다 */
function findHeaderRow(values: string[][]): number {
  for (let i = 0; i < values.length; i++) {
    const first = (values[i]?.[0] ?? "").trim();
    if (!first) continue;
    if (first.startsWith("※")) continue;
    return i;
  }
  return 0;
}

/** 시트 한 장을 통째로 읽는다 */
export async function readSheet(sheetName: string): Promise<SheetData> {
  const range = encodeURIComponent(`${sheetName}!A1:BZ`);
  const data = await call(`/values/${range}?majorDimension=ROWS`);
  const values: string[][] = data.values ?? [];
  if (values.length === 0) {
    return { headers: [], headerRow: 1, rows: [], rowNumbers: [] };
  }
  const h = findHeaderRow(values);
  const headers = (values[h] ?? []).map((x) => (x ?? "").trim());
  const rows: Row[] = [];
  const rowNumbers: number[] = [];
  for (let i = h + 1; i < values.length; i++) {
    const raw = values[i] ?? [];
    if (raw.every((c) => (c ?? "").trim() === "")) continue;
    const obj: Row = {};
    headers.forEach((key, c) => {
      if (key) obj[key] = (raw[c] ?? "").toString().trim();
    });
    rows.push(obj);
    rowNumbers.push(i + 1);
  }
  return { headers, headerRow: h + 1, rows, rowNumbers };
}

/** 삭제 표시가 없는 줄만 */
export function alive(rows: Row[]): Row[] {
  return rows.filter((r) => (r["삭제여부"] ?? "").toUpperCase() !== "Y");
}

/** 맨 아래에 새 줄을 덧붙인다 (여러 명이 동시에 저장해도 덮어쓰지 않는다) */
export async function appendRow(sheetName: string, headers: string[], row: Row) {
  const values = [headers.map((h) => row[h] ?? "")];
  const range = encodeURIComponent(`${sheetName}!A1`);
  await call(
    `/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values }) }
  );
}

/** 특정 줄의 특정 칸 하나를 고친다 */
export async function updateCell(
  sheetName: string,
  rowNumber: number,
  columnIndex: number,
  value: string
) {
  const col = columnLetter(columnIndex);
  const range = encodeURIComponent(`${sheetName}!${col}${rowNumber}`);
  await call(`/values/${range}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: [[value]] }),
  });
}

function columnLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** 시트 탭 이름 목록 */
export async function listSheetNames(): Promise<string[]> {
  const data = await call(`?fields=sheets.properties.title`);
  return (data.sheets ?? []).map((s: any) => s.properties.title);
}
