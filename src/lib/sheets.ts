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
    throw new Error(explain(res.status, body));
  }
  return res.json();
}

/** 구글이 보낸 오류를 사람이 읽을 수 있는 말로 바꾼다 */
function explain(status: number, body: string): string {
  if (status === 403) {
    return (
      "구글 시트에 저장할 권한이 없습니다. " +
      "시트 오른쪽 위 공유에서 대시보드 계정(dashboard-bot@...)의 권한을 " +
      "뷰어가 아니라 편집자로 바꿔주세요."
    );
  }
  if (status === 404) {
    return "구글 시트를 찾지 못했습니다. 환경변수 GOOGLE_SHEET_ID 를 확인해주세요.";
  }
  if (status === 400 && body.includes("Unable to parse range")) {
    return "시트에 해당 탭이 없습니다. 탭 이름을 바꾸거나 지우지 않았는지 확인해주세요.";
  }
  if (status === 429 || status === 503) {
    return "구글 시트가 잠시 바쁩니다. 몇 초 뒤 다시 시도해주세요.";
  }
  return `구글 시트 요청 실패 (${status}): ${body.slice(0, 200)}`;
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

/**
 * 여러 줄을 한 번에 덧붙인다
 *
 * 줄마다 따로 부르면 100줄에 100번을 요청하게 되어 느리고 중간에 끊긴다.
 * 한 번에 보내면 요청 한 번으로 끝난다.
 */
export async function appendRows(sheetName: string, headers: string[], rows: Row[]) {
  if (rows.length === 0) return;
  const values = rows.map((r) => headers.map((h) => r[h] ?? ""));
  const range = encodeURIComponent(`${sheetName}!A1`);
  await call(
    `/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values }) }
  );
}

/** 한 줄을 통째로 다시 쓴다 */
export async function updateRow(
  sheetName: string,
  rowNumber: number,
  headers: string[],
  row: Row
) {
  const last = columnLetter(headers.length - 1);
  const range = encodeURIComponent(`${sheetName}!A${rowNumber}:${last}${rowNumber}`);
  await call(`/values/${range}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: [headers.map((h) => row[h] ?? "")] }),
  });
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

/**
 * 제목 줄 오른쪽 끝에 칸을 덧붙인다
 *
 * 이미 있는 이름은 건너뛴다. 두 번 눌러도 칸이 겹쳐 생기지 않는다.
 * 자료가 든 칸은 건드리지 않고 제목 줄만 고치므로, 기존 줄들은 그대로다.
 * 만든 칸 이름을 돌려준다. (아무것도 안 만들었으면 빈 배열)
 */
export async function addColumns(sheetName: string, names: string[]): Promise<string[]> {
  const { headers, headerRow } = await readSheet(sheetName);
  if (headers.length === 0) {
    throw new Error(`${sheetName} 탭에 제목 줄이 없습니다. 먼저 제목 줄을 만들어주세요.`);
  }
  const have = new Set(headers.map((h) => h.replace(/\s/g, "")));
  const add = names.filter((n) => !have.has(n.replace(/\s/g, "")));
  if (add.length === 0) return [];

  const from = columnLetter(headers.length);
  const to = columnLetter(headers.length + add.length - 1);
  const range = encodeURIComponent(`${sheetName}!${from}${headerRow}:${to}${headerRow}`);
  await call(`/values/${range}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: [add] }),
  });
  return add;
}

/** 시트 탭 이름 목록 */
export async function listSheetNames(): Promise<string[]> {
  const data = await call(`?fields=sheets.properties.title`);
  return (data.sheets ?? []).map((s: any) => s.properties.title);
}
