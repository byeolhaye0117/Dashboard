/**
 * 구글 스프레드시트 읽기·쓰기
 *
 * 시트 한 장을 "표"로 다룬다. 첫 줄이 제목 줄이고, 그 아래가 데이터다.
 * 제목 줄 위에 ※ 로 시작하는 안내 줄이 있을 수 있으므로 건너뛴다.
 */
import { cache } from "react";
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

/**
 * 잠깐 바쁜 것과 정말 안 되는 것은 다르다
 *
 * 구글은 1분에 받아주는 요청 수가 정해져 있다. 넘으면 429 를 보낸다.
 * 그건 고장이 아니라 「지금 말고 조금 뒤에」라는 뜻인데, 지금까지는 그대로
 * 화면에 오류로 띄웠다. 대표님이 「이 화면 자주 뜬다」고 하신 것이 이것이다.
 *
 * 세 번까지 기다렸다 다시 묻는다. 기다리는 시간은 갑절씩 늘린다 —
 * 다 같이 같은 순간에 다시 몰려가면 또 막힌다.
 * 권한 문제(403)나 없는 탭(400)은 기다려도 달라지지 않으므로 바로 알린다.
 */
const RETRY_ON = new Set([429, 500, 502, 503, 504]);
const nap = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(path: string, init?: RequestInit) {
  let last = "";
  for (let tries = 0; tries < 4; tries++) {
    if (tries > 0) await nap(400 * 2 ** (tries - 1) + Math.floor(Math.random() * 200));
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
    if (res.ok) return res.json();

    const body = await res.text();
    last = explain(res.status, body);
    if (!RETRY_ON.has(res.status)) throw new Error(last);
  }
  throw new Error(last);
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
    /* 여기까지 왔다는 것은 이미 세 번 기다렸다 다시 물어본 뒤다.
       그래서 「몇 초 뒤」가 아니라 「잠시 뒤」라고 적는다 */
    return (
      "구글 시트가 계속 바쁩니다. 여러 번 다시 물어봤는데도 안 받아줬습니다. " +
      "잠시 뒤 「다시 시도」를 눌러주세요."
    );
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

/**
 * 한 요청 안에서는 같은 탭을 한 번만 읽는다
 *
 * 화면 하나를 그리는 데 시트를 열몇 번 읽는다. 그런데 같은 탭을 여러 곳에서
 * 따로 읽고 있었다 — 권한 판정이 직급을 읽고, 지점 범위가 또 읽고, 메뉴가
 * 또 읽는 식이다. 요청 수가 그만큼 늘고, 구글이 1분 한도에 걸려 「잠시
 * 바쁩니다」를 뱉는다.
 *
 * react 의 cache 는 요청 하나 안에서만 산다. 다음 새로고침에는 새로 읽으므로
 * 낡은 값이 남지 않는다. 다만 같은 요청 안에서 쓰고 나서 다시 읽는 자리가
 * 있으므로(칸을 만들고 바로 읽는 것처럼), 쓸 때는 그 탭의 기억을 지운다.
 */
const memo = cache(() => new Map<string, SheetData>());

/**
 * 요청이 끝나도 잠깐 남는 기억 (선반)
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────
 * 지금까지 기억은 요청 하나 안에서만 살았다. 화면을 열 때마다 시트를 처음부터
 * 다시 읽는다는 뜻이다. 한 사람이 쓸 때는 버텼지만, 여러 대에서 같이 쓰면
 * 1분 한도에 금방 걸려 「화면을 열지 못했습니다」가 뜬다.
 *
 * 그래서 읽은 것을 잠깐 선반에 올려 둔다. 같은 탭을 몇 초 안에 또 찾으면
 * 구글에 안 묻고 선반에서 꺼낸다.
 *
 * ── 얼마나 오래 두는가 ──────────────────────────────────────
 * 지점 · 직급 · 권한 · 상품처럼 하루에 몇 번 바뀔까 말까 한 것은 넉넉히 둔다.
 * 회원 · 결제처럼 방금 저장한 것이 바로 보여야 하는 것은 아주 짧게 둔다.
 * 저장하면 그 탭의 선반은 바로 비운다(forget) — 내가 방금 넣은 것이 안 보이는
 * 일은 없어야 한다.
 *
 * ── 구글이 안 받아줄 때 ─────────────────────────────────────
 * 선반에 오래된 값이라도 있으면 그것을 내준다. 몇 초 낡은 숫자를 보는 것과
 * 화면이 아예 안 열리는 것은 무게가 다르다. 낡았다는 사실은 화면 위에
 * 적어 준다(staleAt).
 */
type Shelf = { at: number; data: SheetData };
const shelf = new Map<string, Shelf>();

/*
 * ── 선반을 얼마나 믿을 것인가 ────────────────────────────────
 * 처음에는 여러 탭을 몇십 초씩 두었다. 그랬더니 상품에서 「두정점」을 켜고
 * 저장했는데 한 번에 안 바뀌었다. 저장한 서버에서는 선반을 비우지만,
 * 새로고침이 다른 서버로 가면 그쪽 선반에는 옛 값이 남아 있어서다.
 *
 * 그래서 평소에는 선반을 거의 안 쓴다. 이미 여러 탭을 한 번에 읽고 있어서
 * (batchGet) 화면 하나가 쓰는 요청은 한두 번뿐이고, 선반으로 더 줄여 봐야
 * 몇 초 낡은 값을 보는 위험만 커진다.
 *
 * 선반이 진짜로 일하는 자리는 따로 있다 — 구글이 안 받아줄 때다. 그때는
 * 화면을 오류로 막지 않고 마지막으로 읽어 둔 값을 내준다.
 *
 * 지점 · 직급만 15초 둔다. 화면을 열 때마다 읽는데 한 달에 한 번 바뀔까
 * 말까 한 것들이고, 바뀌어도 15초 뒤에는 맞다.
 */
const 잠깐두기 = new Set(["지점", "직급"]);
const SHORT_MS = 15_000;
/* 구글이 안 받아줄 때 대신 내줄 수 있는 한계. 이보다 낡으면 차라리 오류다 */
const GRACE_MS = 10 * 60_000;

const shelfMs = (name: string) => (잠깐두기.has(name) ? SHORT_MS : 0);

/**
 * 이 화면이 선반에서 꺼낸 낡은 값을 쓰고 있는가
 *
 * 요청마다 따로 센다. 한 서버가 여러 사람의 화면을 같이 그리므로, 전역에
 * 두면 남의 화면에서 난 일이 내 화면에 뜬다.
 */
const staleMark = cache(() => ({ at: 0 }));

/** 낡은 값을 쓴 화면이면 그 값을 읽어 온 시각(ms). 아니면 0 */
export function usedStale(): number {
  try {
    return staleMark().at;
  } catch {
    return 0;
  }
}

/**
 * 이 탭에 뭔가 썼다 — 기억을 버린다
 *
 * 쓰기 「전」에만 버리면 모자란다. 칸을 만드는 일(addColumns)은 스스로 한 번
 * 읽는데, 그 읽기가 옛 제목 줄을 다시 기억에 담는다. 그러면 칸을 만든 직후에
 * 읽어도 새 칸이 안 보이고, 거기 적은 값이 조용히 사라진다 —
 * 이용권 금액이 저장해도 「기록 없음」으로 남던 이유가 이것이다.
 * 그래서 쓰기가 끝난 뒤에도 한 번 더 버린다.
 */
function forget(sheetName: string): void {
  /* 선반은 요청 밖에 있으므로 늘 지울 수 있다 — 방금 쓴 것이 안 보이면 안 된다 */
  shelf.delete(sheetName);
  try {
    memo().delete(sheetName);
    pending().delete(sheetName);
  } catch {
    /* 요청 밖에서 부르면 cache 가 없다. 그때는 기억할 것도 없다 */
  }
}

/**
 * 같은 순간에 몰린 읽기를 한 번에 묶는다
 *
 * ── 왜 이렇게까지 하나 ────────────────────────────────────────
 * 구글은 1분에 받아주는 읽기 요청 수가 정해져 있다(계정당 60번쯤).
 * 화면 하나가 탭을 열몇 개 읽으니 몇 번만 오가도 한도에 걸려
 * 「화면을 열지 못했습니다」가 떴다. 기다렸다 다시 묻는 것으로는 모자랐다 —
 * 요청 수 자체를 줄여야 한다.
 *
 * 구글에는 여러 범위를 한 번에 읽는 창구(batchGet)가 있다. 탭 열 개를
 * 읽어도 요청은 한 번이다. 그래서 부르는 쪽 코드는 그대로 두고,
 * 같은 순간에 들어온 읽기를 잠깐 모았다가 한 번에 보낸다.
 *
 * 모으는 시간은 5밀리초다. 사람은 못 느끼고, Promise.all 로 한꺼번에
 * 부르는 자리는 전부 한 묶음이 된다.
 * ──────────────────────────────────────────────────────── */
type Waiting = {
  name: string;
  ok: (d: SheetData) => void;
  no: (e: any) => void;
};

/** 지금 모으는 중인 읽기들 — 요청 하나 안에서만 산다 */
const queue = cache(() => ({ list: [] as Waiting[], timer: null as any }));

const RANGE = (name: string) => `${name}!A1:BZ`;

function flush(q: { list: Waiting[]; timer: any }): void {
  const batch = q.list;
  q.list = [];
  q.timer = null;
  if (batch.length === 0) return;

  /* 같은 탭을 여러 곳에서 기다리고 있을 수 있다. 범위는 한 번만 보낸다 */
  const names = [...new Set(batch.map((w) => w.name))];
  const qs = names.map((n) => `ranges=${encodeURIComponent(RANGE(n))}`).join("&");

  call(`/values:batchGet?${qs}&majorDimension=ROWS`)
    .then((data: any) => {
      const got = new Map<string, SheetData>();
      (data?.valueRanges ?? []).forEach((v: any, i: number) => {
        got.set(names[i], shape(v?.values ?? []));
      });
      batch.forEach((w) => {
        const d = got.get(w.name);
        if (d) w.ok(d);
        else w.no(new Error(`시트에서 ${w.name} 탭을 읽지 못했습니다.`));
      });
    })
    .catch((e) => {
      /*
       * 묶어 읽다 막히면 하나씩 다시 읽는다
       *
       * 탭 하나가 없으면 구글은 묶음 전체를 물린다. 그러면 멀쩡한 탭까지
       * 같이 실패하고, 무엇이 없는지도 알 수 없다. 하나씩 물어보면
       * 없는 탭만 정확히 짚어 준다.
       */
      batch.forEach((w) => {
        readSheetFresh(w.name).then(w.ok).catch(() => w.no(e));
      });
    });
}

function readQueued(sheetName: string): Promise<SheetData> {
  let q: { list: Waiting[]; timer: any };
  try {
    q = queue();
  } catch {
    /* 요청 밖(스크립트 등)에서 부르면 모을 자리가 없다. 그냥 하나 읽는다 */
    return readSheetFresh(sheetName);
  }
  return new Promise<SheetData>((ok, no) => {
    q.list.push({ name: sheetName, ok, no });
    if (!q.timer) q.timer = setTimeout(() => flush(q), 5);
  });
}

export async function readSheet(sheetName: string): Promise<SheetData> {
  let hit: SheetData | undefined;
  try {
    hit = memo().get(sheetName);
  } catch {
    hit = undefined;
  }
  if (hit) return hit;

  /* 선반에 갓 올려 둔 것이 있으면 구글에 안 묻는다 */
  const 선반 = shelf.get(sheetName);
  if (선반 && Date.now() - 선반.at < shelfMs(sheetName)) {
    try {
      memo().set(sheetName, 선반.data);
    } catch {
      /* 못 담아도 값은 있다 */
    }
    return 선반.data;
  }

  /* 같은 탭을 두 곳에서 동시에 기다릴 때, 각각 따로 담지 않도록
     읽는 약속 자체를 기억해 둔다 */
  let busy: Map<string, Promise<SheetData>>;
  try {
    busy = pending();
  } catch {
    return readSheetFresh(sheetName);
  }
  const already = busy.get(sheetName);
  if (already) return already;

  const job = readQueued(sheetName)
    .then((d) => {
      shelf.set(sheetName, { at: Date.now(), data: d });
      try {
        memo().set(sheetName, d);
        busy.delete(sheetName);
      } catch {
        /* 못 담아도 읽기는 끝났다 */
      }
      return d;
    })
    .catch((e) => {
      try {
        busy.delete(sheetName);
      } catch {
        /* 지울 자리가 없으면 그만이다 */
      }
      /*
        구글이 안 받아줬다 — 선반에 있던 값이라도 내준다

        몇 분 낡은 숫자를 보는 것과 화면이 아예 안 열리는 것은 무게가 다르다.
        여러 대에서 같이 쓰면 1분 한도에 걸리는 일이 생기는데, 그때마다
        일을 멈추게 할 수는 없다. 낡았다는 사실은 화면 위에 적어 준다.
      */
      const 낡은것 = shelf.get(sheetName);
      if (낡은것 && Date.now() - 낡은것.at < GRACE_MS) {
        try {
          const m = staleMark();
          m.at = m.at ? Math.min(m.at, 낡은것.at) : 낡은것.at;
        } catch {
          /* 요청 밖이면 알릴 화면도 없다 */
        }
        try {
          memo().set(sheetName, 낡은것.data);
        } catch {
          /* 못 담아도 값은 있다 */
        }
        return 낡은것.data;
      }
      throw e;
    });

  busy.set(sheetName, job);
  return job;
}

/** 읽는 중인 약속 — 같은 탭을 두 번 부르지 않게 한다 */
const pending = cache(() => new Map<string, Promise<SheetData>>());

/** 구글이 준 값 뭉치를 표로 만든다 */
function shape(values: string[][]): SheetData {
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

async function readSheetFresh(sheetName: string): Promise<SheetData> {
  const range = encodeURIComponent(RANGE(sheetName));
  const data = await call(`/values/${range}?majorDimension=ROWS`);
  return shape(data.values ?? []);
}

/** 삭제 표시가 없는 줄만 */
export function alive(rows: Row[]): Row[] {
  return rows.filter((r) => (r["삭제여부"] ?? "").toUpperCase() !== "Y");
}

/** 맨 아래에 새 줄을 덧붙인다 (여러 명이 동시에 저장해도 덮어쓰지 않는다) */
export async function appendRow(sheetName: string, headers: string[], row: Row) {
  forget(sheetName);
  const values = [headers.map((h) => row[h] ?? "")];
  const range = encodeURIComponent(`${sheetName}!A1`);
  await call(
    `/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values }) }
  );
  forget(sheetName);
}

/**
 * 여러 줄을 한 번에 덧붙인다
 *
 * 줄마다 따로 부르면 100줄에 100번을 요청하게 되어 느리고 중간에 끊긴다.
 * 한 번에 보내면 요청 한 번으로 끝난다.
 */
export async function appendRows(sheetName: string, headers: string[], rows: Row[]) {
  forget(sheetName);
  if (rows.length === 0) return;
  const values = rows.map((r) => headers.map((h) => r[h] ?? ""));
  const range = encodeURIComponent(`${sheetName}!A1`);
  await call(
    `/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values }) }
  );
  forget(sheetName);
}

/** 한 줄을 통째로 다시 쓴다 */
export async function updateRow(
  sheetName: string,
  rowNumber: number,
  headers: string[],
  row: Row
) {
  forget(sheetName);
  const last = columnLetter(headers.length - 1);
  const range = encodeURIComponent(`${sheetName}!A${rowNumber}:${last}${rowNumber}`);
  await call(`/values/${range}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: [headers.map((h) => row[h] ?? "")] }),
  });
  forget(sheetName);
}

/**
 * 여러 줄을 한 번에 다시 쓴다
 *
 * 줄마다 따로 부르면 8명짜리 수업 하나를 완료 처리하는 데 요청이 열몇 번 나간다.
 * 화면이 멈춘 것처럼 느려지고, 중간에 끊기면 절반만 처리된 채로 남는다.
 * 한 번에 보내면 요청 한 번이고, 되거나 안 되거나 둘 중 하나다.
 */
export async function updateRows(
  sheetName: string,
  headers: string[],
  items: { rowNumber: number; row: Row }[]
) {
  forget(sheetName);
  if (items.length === 0) return;
  const last = columnLetter(headers.length - 1);
  await call(`/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: items.map(({ rowNumber, row }) => ({
        range: `${sheetName}!A${rowNumber}:${last}${rowNumber}`,
        values: [headers.map((h) => row[h] ?? "")],
      })),
    }),
  });
  forget(sheetName);
}

/** 특정 줄의 특정 칸 하나를 고친다 */
export async function updateCell(
  sheetName: string,
  rowNumber: number,
  columnIndex: number,
  value: string
) {
  forget(sheetName);
  const col = columnLetter(columnIndex);
  const range = encodeURIComponent(`${sheetName}!${col}${rowNumber}`);
  await call(`/values/${range}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: [[value]] }),
  });
  forget(sheetName);
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

/** 탭 하나의 속성 — 칸을 늘리려면 시트 번호와 지금 칸 수가 필요하다 */
async function sheetInfo(sheetName: string): Promise<{ id: number; columnCount: number }> {
  const data = await call(`?fields=sheets.properties(sheetId,title,gridProperties/columnCount)`);
  const found = (data.sheets ?? []).find((s: any) => s.properties?.title === sheetName);
  if (!found) throw new Error(`시트에 "${sheetName}" 탭이 없습니다.`);
  return {
    id: found.properties.sheetId,
    columnCount: found.properties.gridProperties?.columnCount ?? 26,
  };
}

/**
 * 제목 줄 오른쪽 끝에 칸을 덧붙인다
 *
 * 구글 시트는 표가 가진 칸 수가 정해져 있어서, 그 밖에 글을 쓰면 거부한다.
 * (새 시트는 보통 26칸이다) 그래서 모자라면 칸 수부터 늘리고 제목을 쓴다.
 *
 * 이미 있는 이름은 건너뛴다. 두 번 눌러도 칸이 겹쳐 생기지 않는다.
 * 자료가 든 칸은 건드리지 않고 제목 줄만 고치므로, 기존 줄들은 그대로다.
 * 만든 칸 이름을 돌려준다. (아무것도 안 만들었으면 빈 배열)
 */
export async function addColumns(sheetName: string, names: string[]): Promise<string[]> {
  forget(sheetName);
  const { headers, headerRow } = await readSheet(sheetName);
  if (headers.length === 0) {
    throw new Error(`${sheetName} 탭에 제목 줄이 없습니다. 먼저 제목 줄을 만들어주세요.`);
  }
  const have = new Set(headers.map((h) => h.replace(/\s/g, "")));
  const add = names.filter((n) => !have.has(n.replace(/\s/g, "")));
  if (add.length === 0) return [];   /* 더할 것이 없으면 기억도 그대로 옳다 */

  const need = headers.length + add.length;
  const info = await sheetInfo(sheetName);
  if (info.columnCount < need) {
    await call(`:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            appendDimension: {
              sheetId: info.id,
              dimension: "COLUMNS",
              length: need - info.columnCount,
            },
          },
        ],
      }),
    });
  }

  const from = columnLetter(headers.length);
  const to = columnLetter(need - 1);
  const range = encodeURIComponent(`${sheetName}!${from}${headerRow}:${to}${headerRow}`);
  await call(`/values/${range}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: [add] }),
  });
  /* 제목 줄이 방금 바뀌었다. 위에서 담아 둔 옛 제목 줄을 버려야
     바로 뒤에 읽는 쪽이 새 칸을 본다 */
  forget(sheetName);
  return add;
}

/**
 * 탭을 새로 만들고 제목 줄을 넣는다
 *
 * 이미 있으면 아무것도 하지 않고 false 를 돌려준다.
 * 두 번 눌러도 탭이 겹쳐 생기지 않는다.
 */
export async function createSheet(sheetName: string, headers: string[]): Promise<boolean> {
  forget(sheetName);
  const names = await listSheetNames();
  if (names.includes(sheetName)) return false;

  await call(`:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          addSheet: {
            properties: {
              title: sheetName,
              gridProperties: { rowCount: 1000, columnCount: Math.max(26, headers.length + 4) },
            },
          },
        },
      ],
    }),
  });

  const to = columnLetter(headers.length - 1);
  const range = encodeURIComponent(`${sheetName}!A1:${to}1`);
  await call(`/values/${range}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: [headers] }),
  });
  forget(sheetName);
  return true;
}

/** 시트 탭 이름 목록 */
export async function listSheetNames(): Promise<string[]> {
  const data = await call(`?fields=sheets.properties.title`);
  return (data.sheets ?? []).map((s: any) => s.properties.title);
}
